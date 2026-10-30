import { describe, expect, it, vi } from 'vitest';
import { acceptNotebookSkill, notebookTools } from './NotebookSkill';
import { notebookSkillFixture } from './NotebookSkill.fixture';
import { NotebookModelHost } from '../providers/NotebookModelHost';
import { toolSchemas } from '../../../src/services/agent-cell/protocol';

describe('AAL-loaded Notebook skill', () => {
  it('declares every supported Notebook tool, including cell insertion/proposal lifecycle', () => {
    expect([...notebookSkillFixture().allowedTools].sort()).toEqual(
      Object.keys(toolSchemas).sort()
    );
  });
  it('fails closed without an imported skill or on a mismatched deployment', () => {
    expect(() =>
      notebookTools({
        session: {},
        prompt: '',
        signal: new AbortController().signal,
        emit: vi.fn(),
        call: vi.fn(),
      })
    ).toThrow('not loaded by AAL');
    const skill = notebookSkillFixture();
    expect(() => acceptNotebookSkill({ ...skill, document: skill.document + '\n' })).toThrow(
      'deployment mismatch'
    );
  });
  it('intersects the imported tool declarations with instance role and checks dispatch', async () => {
    const call = vi.fn();
    const run = {
      role: 'curator' as const,
      notebookSkill: notebookSkillFixture(),
      session: {},
      prompt: 'curate',
      signal: new AbortController().signal,
      emit: vi.fn(),
      call,
    };
    expect(notebookTools(run)).not.toHaveProperty('update_cell');
    expect(notebookTools(run)).toHaveProperty('curate_context');
    await new NotebookModelHost({
      run: async (model) => {
        expect((await model.call('update_cell', {})).error).toContain('TOOL_NOT_GRANTED');
      },
    }).execute(run, {
      id: 'root',
      runtime: 'aal',
      name: 'NotebookAgent.run',
      status: 'running',
      startedAt: 0,
    });
    expect(call).not.toHaveBeenCalled();
  });
});
