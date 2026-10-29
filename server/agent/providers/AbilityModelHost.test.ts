import { CodexRuntime } from './CodexRuntime';
import { ClaudeRuntime } from './ClaudeRuntime';
import { it, expect, describe } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { AbilityModelHost } from './AbilityModelHost';
import type { AgentEvent } from '../../../src/services/agent-cell/protocol';
const executable = process.env.AAL_ABILITY_EXECUTABLE;
// This is an admitted-provider boundary test, not proof of daemon admission or signed receipts.
describe.skipIf(!executable)('packaged native AAL ability with local Host', () => {
  async function fixture(
    model: any,
    call: any = async () => ({ ok: true }),
    agent: 'NotebookAgent' | 'CodexAgent' = 'NotebookAgent'
  ) {
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const host = await AbilityModelHost.open(
      model,
      {
        prompt: 'Reply in one sentence: native AAL ability Host connected. Do not call tools.',
        session: {},
        signal: controller.signal,
        emit: (e) => events.push(e),
        call,
      },
      agent
    );
    const state = await mkdtemp('/tmp/aal-ability-state-');
    const frame = {
      type: 'invoke',
      call_id: 'provider-test',
      invocation: {
        caller_ura: 'easynet:///r/local/agent/alice.client',
        callee_ura: 'easynet:///r/local/service/test.notebook',
        ability_ura:
          'easynet:///r/local/ability/service.test.notebook.' +
          (agent === 'CodexAgent' ? 'notebook.codex' : 'notebook.agent'),
        subject_ura: 'easynet:///r/local/resource/user.alice/application/notebook',
        invocation_nonce: [...randomBytes(16)],
        causal_context: {},
        args: { connection: host.connection },
      },
    };
    const invoke = () => {
      const child = spawn(executable!, [], {
        env: { ...process.env, EASYNET_APPLICATION_STATE_DIR: state },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.stdin.end(JSON.stringify(frame) + '\n');
      return new Promise<any>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => {
          try {
            resolve({ code, frame: JSON.parse(stdout), stderr });
          } catch {
            reject(new Error(stderr || stdout));
          }
        });
      });
    };
    return {
      host,
      events,
      invoke,
      controller,
      close: async () => {
        await host.close();
        await rm(state, { recursive: true, force: true });
      },
    };
  }
  it('executes compiled AAL, streams Host output, and journals replay without rerunning model', async () => {
    let count = 0;
    const f = await fixture({
      run: async (run: any) => {
        count++;
        run.emit({ type: 'text', text: 'native host answer' });
      },
    });
    try {
      const first = await f.invoke();
      expect(first.frame).toMatchObject({
        type: 'result',
        value: { answer: 'native host answer' },
      });
      expect(await f.invoke()).toEqual(first);
      expect(count).toBe(1);
      expect(f.events.some((e) => e.type === 'text')).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('exports the standard-library Codex ability through its explicit binding', async () => {
    const f = await fixture(
      { run: async (run: any) => run.emit({ type: 'text', text: 'codex extension' }) },
      undefined,
      'CodexAgent'
    );
    try {
      expect((await f.invoke()).frame).toMatchObject({
        type: 'result',
        value: { answer: 'codex extension' },
      });
      expect(f.events.some((e) => e.type === 'span' && e.span.name === 'CodexAgent.run')).toBe(
        true
      );
      expect(f.events.some((e) => e.type === 'span' && e.span.name === 'skill.codex')).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('waits for the shared approval result and returns rejection to the model', async () => {
    let decision!: (value: any) => void;
    let observed: any;
    const f = await fixture(
      {
        run: async (run: any) => {
          observed = await run.call('update_cell', {
            cellId: 'note',
            version: '1',
            content: 'changed',
          });
          run.emit({ type: 'text', text: observed.error });
        },
      },
      () =>
        new Promise((resolve) => {
          decision = resolve;
        })
    );
    try {
      const pending = f.invoke();
      await expect.poll(() => !!decision, { timeout: 12000 }).toBe(true);
      expect(observed).toBeUndefined();
      decision({ ok: false, error: 'USER_REJECTED' });
      expect((await pending).frame.value.answer).toBe('USER_REJECTED');
    } finally {
      await f.close();
    }
  });
  it('cancels the model and fails the native ability instead of reporting success', async () => {
    let started = false;
    const f = await fixture({
      run: (run: any) =>
        new Promise((_resolve, reject) => {
          started = true;
          run.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          });
        }),
    });
    try {
      const pending = f.invoke();
      await expect.poll(() => started, { timeout: 12000 }).toBe(true);
      f.controller.abort();
      expect((await pending).frame.type).toBe('error');
      expect(f.events.some((e) => e.type === 'span' && e.span.status === 'done')).toBe(false);
    } finally {
      await f.close();
    }
  });
  for (const [name, model] of [
    ['Codex', new CodexRuntime()],
    ['Claude Code', new ClaudeRuntime()],
  ] as const) {
    it.skipIf(!process.env.AAL_REAL_MODELS)(
      `streams real ${name} through packaged AAL`,
      async () => {
        const f = await fixture(model);
        try {
          const result = await f.invoke();
          expect(result.frame.type).toBe('result');
          expect(result.frame.value.answer.length).toBeGreaterThan(0);
          expect(f.events.some((e) => e.type === 'text')).toBe(true);
          expect(f.events.some((e) => e.type === 'usage')).toBe(true);
        } finally {
          await f.close();
        }
      },
      120_000
    );
  }
});
