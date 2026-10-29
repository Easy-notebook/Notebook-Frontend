import { getSessionInfo, getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { CodexConnection } from './providers/CodexConnection';
export const sourceSchema = z.object({
  provider: z.enum(['codex', 'claude']),
  sessionId: z.string().uuid(),
});
export type SessionSource = z.infer<typeof sourceSchema>;
export interface SessionInfo extends SessionSource {
  title: string;
  cwd: string;
  updatedAt: number;
}
export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  raw?: unknown;
}
/** Discovery is read-only. No resume/start or model prompt is issued here. */
export class ProviderSessions {
  private async codex<T>(action: (rpc: CodexConnection) => Promise<T>) {
    const rpc = new CodexConnection();
    try {
      await rpc.initialize();
      return await action(rpc);
    } finally {
      rpc.close();
    }
  }
  async list(provider: 'codex' | 'claude', cursor?: string) {
    if (provider === 'claude') {
      const offset = cursor ? Number(cursor) : 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
        throw new Error('Invalid session cursor');
      const entries = await listSessions({ limit: 30, offset });
      return {
        entries: entries.map((s) => ({
          provider,
          sessionId: s.sessionId,
          title: s.summary.slice(0, 200),
          cwd: s.cwd || '',
          updatedAt: s.lastModified,
        })),
        nextCursor: entries.length === 30 ? String(offset + 30) : null,
      };
    }
    return this.codex(async (rpc) => {
      const page = await rpc.request('thread/list', { limit: 30, cursor, sortKey: 'updated_at' });
      return {
        entries: page.data.map((t: any) => ({
          provider,
          sessionId: t.id,
          title: (t.name || t.preview || t.id).slice(0, 200),
          cwd: t.cwd,
          updatedAt: t.updatedAt * 1000,
        })),
        nextCursor: page.nextCursor,
      };
    });
  }
  async inspect(source: SessionSource): Promise<SessionInfo> {
    if (source.provider === 'claude') {
      const s = await getSessionInfo(source.sessionId);
      if (!s?.cwd) throw new Error('Claude session or its working directory is unavailable');
      if (s.fileSize && s.fileSize > 32 * 1024 * 1024)
        throw new Error('Session exceeds the 32 MB import limit');
      await this.directory(s.cwd);
      return { ...source, title: s.summary.slice(0, 200), cwd: s.cwd, updatedAt: s.lastModified };
    }
    return this.codex(async (rpc) => {
      const { thread: t } = await rpc.request('thread/read', {
        threadId: source.sessionId,
        includeTurns: false,
      });
      if (t.id !== source.sessionId || t.ephemeral) throw new Error('Session is not durable');
      if (t.status.type === 'active')
        throw new Error('This session is currently running; wait before importing');
      await this.directory(t.cwd);
      return {
        ...source,
        title: (t.name || t.preview || t.id).slice(0, 200),
        cwd: t.cwd,
        updatedAt: t.updatedAt * 1000,
      };
    });
  }
  private async directory(cwd: string) {
    if (!(await stat(cwd)).isDirectory())
      throw new Error('Session working directory is unavailable');
  }
  async history(source: SessionSource) {
    const info = await this.inspect(source);
    const messages: SessionMessage[] = [];
    let bytes = 0;
    const add = (message: SessionMessage) => {
      bytes += Buffer.byteLength(JSON.stringify(message));
      if (messages.length >= 2000 || bytes > 1_500_000)
        throw new Error(
          'Session history is too large for this import (2000 items / 1.5 MB); no partial history was imported'
        );
      messages.push(message);
    };
    if (source.provider === 'claude') {
      const all = await getSessionMessages(source.sessionId, {
        dir: info.cwd,
        limit: 2001,
        includeSystemMessages: true,
      });
      if (all.length > 2000) throw new Error('Session exceeds 2000 messages; no partial import');
      for (const message of all) {
        const body = message.message as any;
        const content = body?.content;
        if (typeof content === 'string')
          add({ id: message.uuid, role: message.type, text: content });
        else if (Array.isArray(content))
          for (let i = 0; i < content.length; i++) {
            const block = content[i];
            const tool = block.type === 'tool_use' || block.type === 'tool_result';
            add({
              id: `${message.uuid}-${i}`,
              role: tool ? 'tool' : message.type,
              text:
                block.text ||
                (tool ? JSON.stringify(block, null, 2) : `[${block.type || 'unknown'}]`),
              ...(tool ? { raw: block } : {}),
            });
          }
      }
    } else
      await this.codex(async (rpc) => {
        let cursor: string | undefined;
        const seen = new Set<string>();
        do {
          const page = await rpc.request('thread/items/list', {
            threadId: source.sessionId,
            limit: 100,
            sortDirection: 'asc',
            cursor,
          });
          for (const { item } of page.data) {
            if (item.type === 'userMessage')
              add({
                id: item.id,
                role: 'user',
                text: item.content.map((c: any) => c.text || `[${c.type}]`).join('\n'),
              });
            else if (item.type === 'agentMessage')
              add({ id: item.id, role: 'assistant', text: item.text });
            else if (item.type !== 'reasoning')
              add({ id: item.id, role: 'tool', text: JSON.stringify(item, null, 2), raw: item });
          }
          cursor = page.nextCursor || undefined;
          if (cursor && seen.has(cursor)) throw new Error('Session pagination did not advance');
          if (cursor) seen.add(cursor);
          if (seen.size > 50) throw new Error('Session history exceeds the page limit');
        } while (cursor);
      });
    return { info, messages };
  }
}
