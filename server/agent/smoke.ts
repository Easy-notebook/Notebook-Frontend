import { CodexRuntime } from './providers/CodexRuntime';
import { ClaudeRuntime } from './providers/ClaudeRuntime';
import type { ProviderSession } from './providers/types';
const provider = process.argv[2];
if (provider !== 'codex' && provider !== 'claude')
  throw new Error('Usage: npm run agent:smoke -- codex|claude');
const runtime = provider === 'codex' ? new CodexRuntime() : new ClaudeRuntime();
const session: ProviderSession = {};
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 120_000);
try {
  await runtime.run({
    session,
    signal: controller.signal,
    prompt:
      'Integration smoke test with a synthetic notebook, no real user data. Call list_cells once, then call summary with text "Smoke test passed" and empty cellIds. Reply only OK. Do not use other tools.',
    emit: (event) => console.log(JSON.stringify(event)),
    call: async (name, args) => {
      console.log(JSON.stringify({ tool: name, args }));
      return { ok: true, data: name === 'list_cells' ? [] : { saved: true } };
    },
  });
  const threadId = session.threadId;
  if (!threadId) throw new Error('Provider did not establish a session');
  let followup = '';
  await runtime.run({
    session,
    signal: controller.signal,
    prompt:
      'Continue the previous smoke test. What exact summary text did you just save? Reply with that text only; do not call tools.',
    emit: (event) => {
      if (event.type === 'text') followup += event.text;
    },
    call: async () => ({ ok: false, error: 'Follow-up requires no tools' }),
  });
  if (session.threadId !== threadId || !followup.includes('Smoke test passed'))
    throw new Error('Provider did not preserve conversation context');
  console.log('SMOKE_PASSED (tools, streaming, summary, session resume)');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
