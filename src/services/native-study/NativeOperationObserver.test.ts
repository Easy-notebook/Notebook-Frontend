import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeStudyClient } from './NativeStudyClient';
import { NativeOperationObserver, type CommandProgress } from './NativeOperationObserver';
import type { PendingCommand } from './contracts';

const command: PendingCommand = {
  workspace: 'native-a',
  ability: 'run_study',
  arguments: { expected_revision: 1 },
  invocation: '12345678-1234-4234-8234-123456789abc',
};
const observation = {
  attempt: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspace: 'native-a',
  ability: 'run_study',
  phase: 'running',
  completed_calls: 5,
  failed_calls: 0,
  active: { model: 1, skill: 0, other: 0 },
};
const envelope = () => ({ frontend_notebook_id: 'a', invocation: command.invocation, observation });
const response = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => vi.useRealTimers());
describe('native command observation', () => {
  it('checks owner, command identity, bounded counts and strict fields', async () => {
    const request = vi.fn<typeof fetch>();
    const client = new NativeStudyClient('a', request);
    request.mockResolvedValueOnce(response(envelope()));
    expect(await client.operation(command)).toEqual(observation);
    expect(request.mock.calls[0][0]).toBe(`/aal-api/workspaces/a/operations/${command.invocation}`);
    for (const body of [
      { ...envelope(), frontend_notebook_id: 'other' },
      { ...envelope(), invocation: 'other' },
      ...[
        { workspace: 'other' },
        { ability: 'communication' },
        { completed_calls: -1 },
        { completed_calls: Number.MAX_SAFE_INTEGER + 1 },
        { arguments: 'must not expose input' },
        { attempt: 'not-an-attempt' },
      ].map((fields) => ({ ...envelope(), observation: { ...observation, ...fields } })),
    ]) {
      request.mockResolvedValueOnce(response(body));
      await expect(client.operation(command)).rejects.toThrow();
    }
  });
  it('polls serially and never submits or clears a command on terminal observation', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response(envelope()));
    const seen: CommandProgress[] = [];
    const observer = new NativeOperationObserver(
      new NativeStudyClient('a', request),
      command,
      (progress) => seen.push(progress)
    );
    expect(seen[0].status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(500);
    expect(seen[seen.length - 1]?.status).toBe('observed');
    request.mockImplementation(async () =>
      response({
        ...envelope(),
        observation: {
          ...observation,
          phase: 'succeeded',
          active: { model: 0, skill: 0, other: 0 },
        },
      })
    );
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    observer.dispose();
  });
  it('clears stale running observations when unavailable, retries reads and reports unknown', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(envelope()))
      .mockRejectedValueOnce(new Error('service disconnected'))
      .mockResolvedValueOnce(response({ ...envelope(), observation: null }));
    const seen: CommandProgress[] = [];
    const observer = new NativeOperationObserver(
      new NativeStudyClient('a', request),
      command,
      (progress) => seen.push(progress)
    );
    await vi.advanceTimersByTimeAsync(1500);
    expect(seen[seen.length - 1]).toEqual({ status: 'unavailable', observation: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen[seen.length - 1]).toEqual({ status: 'unknown', observation: null });
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(3);
    observer.dispose();
  });
  it('aborts timed-out observation without overlapping reads and suppresses disposal results', async () => {
    vi.useFakeTimers();
    let complete!: (response: Response) => void;
    let signal: AbortSignal | undefined | null;
    const request = vi.fn<typeof fetch>((_, options) => {
      signal = options?.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const seen: CommandProgress[] = [];
    const observer = new NativeOperationObserver(
      new NativeStudyClient('a', request),
      command,
      (progress) => seen.push(progress)
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    observer.dispose();
    complete(response(envelope()));
    await vi.advanceTimersByTimeAsync(10000);
    expect(seen).toEqual([{ status: 'waiting', observation: null }]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
