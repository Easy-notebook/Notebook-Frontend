import { describe, it, expect } from 'vitest';
import { AalRuntime } from './AalRuntime';
import type { AgentEvent } from '../../../src/services/agent-cell/protocol';
const worker = process.env.AAL_AGENT_WORKER;
describe.skipIf(!worker)('real AAL compiler/kernel with a controlled model Host', () => {
  it('executes the native ability and preserves causal span IDs', async () => {
    const events: AgentEvent[] = [];
    await new AalRuntime(
      {
        run: async (run) => {
          run.emit({ type: 'text', text: 'host reply' });
        },
      },
      worker
    ).run({
      prompt: 'input',
      session: {},
      signal: new AbortController().signal,
      emit: (e) => events.push(e),
      call: async () => ({ ok: true }),
    });
    const spans = events.filter((e) => e.type === 'span').map((e) => e.span);
    expect(spans.map((s) => s.status)).toEqual(['running', 'running', 'done', 'done']);
    expect(spans[1].parentId).toBe(spans[0].id);
    expect(spans[3].runtime).toBe('aal');
    expect(events.some((e) => e.type === 'text' && e.text === 'host reply')).toBe(true);
  });
  it('propagates model failure through the AAL kernel', async () => {
    await expect(
      new AalRuntime(
        {
          run: async () => {
            throw new Error('controlled failure');
          },
        },
        worker
      ).run({
        prompt: 'input',
        session: {},
        signal: new AbortController().signal,
        emit: () => {},
        call: async () => ({ ok: true }),
      })
    ).rejects.toThrow('E_MODEL');
  });
  it('cancels the Host and native process without a success event', async () => {
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const runtime = new AalRuntime(
      {
        run: (run) =>
          new Promise((_resolve, reject) => {
            run.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
              once: true,
            });
            controller.abort();
          }),
      },
      worker
    );
    await expect(
      runtime.run({
        prompt: 'input',
        session: {},
        signal: controller.signal,
        emit: (e) => events.push(e),
        call: async () => ({ ok: true }),
      })
    ).rejects.toThrow();
    expect(events.some((e) => e.type === 'span' && e.span.status === 'done')).toBe(false);
  });
});

describe.skipIf(!worker)('standard-library Codex extension', () => {
  it('runs CodexAgent through skill.codex in the actual kernel', async () => {
    const events: AgentEvent[] = [];
    await new AalRuntime(
      {
        run: async (run) => {
          run.emit({ type: 'text', text: 'codex host reply' });
        },
      },
      worker,
      'CodexAgent'
    ).run({
      prompt: 'input',
      session: {},
      signal: new AbortController().signal,
      emit: (e) => events.push(e),
      call: async () => ({ ok: true }),
    });
    const spans = events.filter((e) => e.type === 'span').map((e) => e.span);
    expect(spans[0].name).toBe('CodexAgent.run');
    expect(spans.some((s) => s.name === 'skill.codex')).toBe(true);
    expect(spans.at(-1)?.status).toBe('done');
  });
});
