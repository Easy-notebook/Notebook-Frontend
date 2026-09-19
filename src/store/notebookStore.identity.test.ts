import { describe, expect, it, vi } from 'vitest';
import * as markdownParser from '@Utils/markdownParser';
import * as structure from '@Utils/markdown/structureIndex';
import useStore from './notebookStore';

describe('cell publication identity', () => {
  it.each([[null, 'title'], ['missing', 'title'], ['b', 'b']] as const)('reconciles phase %s after insertion', (currentPhaseId, expected) => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook' },
        { id: 'a', type: 'markdown', content: '## A' },
        { id: 'b', type: 'markdown', content: '## B' },
      ]);
      useStore.setState({ currentPhaseId, currentStepIndex: 999 });
      useStore.getState().addCell({ id: 'body', type: 'raw', content: 'body' });
      const state = useStore.getState();
      expect(state.currentPhaseId).toBe(expected);
      expect(state.currentStepIndex).toBe(0);
    } finally { useStore.setState(original, true); }
  });
  it.each(['addNewCell2End', 'addNewCell2Next'] as const)('keeps the published title identity through %s', method => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([{ id: 'placeholder', type: 'markdown', content: '# ', metadata: { isDefaultTitle: true } }]);
      useStore.setState({ currentCellId: 'placeholder' });
      const returned = useStore.getState()[method]('markdown', '# Real title', true);
      const state = useStore.getState();
      expect(state.cells).toHaveLength(1);
      expect(state.currentCellId).toBe('placeholder');
      expect(state.lastAddedCellId).toBe('placeholder');
      expect(state.editingCellId).toBe('placeholder');
      if (method === 'addNewCell2End') expect(returned).toBe('placeholder');
    } finally { useStore.setState(original, true); }
  });
  it.each([false, true])('skips title recognition for ordinary append (default title: %s)', isDefaultTitle => {
    const original = useStore.getState();
    const recognize = vi.spyOn(structure, 'startsWithNotebookTitle');
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook', metadata: { isDefaultTitle } },
        { id: 'body', type: 'raw', content: 'keep' },
      ]);
      useStore.getState().addCell({ id: 'appended', type: 'markdown', content: 'long prose\n'.repeat(1000) });
      expect(recognize).not.toHaveBeenCalled();
      const cells = useStore.getState().cells;
      expect(cells[cells.length - 1]?.id).toBe('appended');
    } finally {
      recognize.mockRestore();
      useStore.setState(original, true);
    }
  });
  it.each(['## Section', '#tag', '    # indented code', '> # quoted heading', '```\n# code\n```'])('does not replace the default title with %s', content => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([{ id: 'placeholder', type: 'markdown', content: '# ', metadata: { isDefaultTitle: true } }]);
      useStore.getState().addCell({ id: 'inserted', type: 'markdown', content }, 0);
      expect(useStore.getState().cells.map(cell => cell.id)).toEqual(['placeholder', 'inserted']);
      expect(useStore.getState().cells[0].content).toBe('# ');
    } finally { useStore.setState(original, true); }
  });
  it('recognizes a Setext H1 when replacing a default title', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([{ id: 'placeholder', type: 'markdown', content: '# ', metadata: { isDefaultTitle: true } }]);
      useStore.getState().addCell({ id: 'inserted', type: 'markdown', content: 'Real title\n===' }, 0);
      expect(useStore.getState().cells).toHaveLength(1);
      expect(useStore.getState().cells[0].content).toBe('Real title\n===');
    } finally { useStore.setState(original, true); }
  });
  it('selects the retained identity when a real title replaces the default title', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'placeholder', type: 'markdown', content: '# ', metadata: { isDefaultTitle: true } },
        { id: 'body', type: 'code', content: 'print(1)' },
      ]);
      const input = { id: 'incoming', type: 'markdown' as const, content: '# Real title' };
      useStore.getState().addCell(input, 0);
      const state = useStore.getState();
      expect(state.cells).toHaveLength(2);
      expect(state.cells[0]).toMatchObject({ id: 'placeholder', content: '# Real title', metadata: { isDefaultTitle: false } });
      expect(state.currentCellId).toBe(state.cells[0].id);
      expect(input.id).toBe('incoming');
    } finally { useStore.setState(original, true); }
  });
  it.each([
    ['code', undefined, 'python'],
    ['hybrid', undefined, 'python'],
    ['code', 'ts', 'typescript'],
    ['hybrid', 'javascript', 'javascript'],
    ['code', 'rust', 'rust'],
  ] as const)('preserves insertion language for %s / %s', (type, language, expected) => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([{ id: 'title', type: 'markdown', content: '# Notebook' }]);
      const title = useStore.getState().cells[0];
      useStore.getState().addCell({ id: 'language-cell', type, content: '', language });
      expect(useStore.getState().cells[0]).toBe(title);
      expect(useStore.getState().cells[1]).toMatchObject({ id: 'language-cell', type, language: expected });
    } finally { useStore.setState(original, true); }
  });
  it('reuses canonical cells and outputs in view and prefix queries', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'query-title', type: 'markdown', content: '# Notebook' },
        { id: 'query-code', type: 'code', content: 'x', outputs: [{ type: 'text', content: { value: 1 } } as any] },
        { id: 'query-tail', type: 'markdown', content: 'Tail' },
      ]);
      useStore.setState({ viewMode: 'create', currentCellId: 'query-tail' });
      const state = useStore.getState();
      expect(state.getCurrentViewCells()).toBe(state.cells);
      expect(state.getCurrentViewCells()[1].outputs).toBe(state.cells[1].outputs);
      expect(state.cells[1].outputs?.[0].content).toBe('{"value":1}');
      const prefix = state.getAllCellsBeforeCurrent();
      expect(prefix.map(cell => cell.id)).toEqual(['query-title', 'query-code']);
      expect(prefix[1]).toBe(state.cells[1]);
      expect(prefix[1].outputs).toBe(state.cells[1].outputs);
    } finally { useStore.setState(original); }
  });
  it('shares metadata and editability updates across views and skips identical patches', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'flags-title', type: 'markdown', content: '# Notebook' },
        { id: 'flags-code', type: 'code', content: 'x' },
      ]);
      useStore.getState().updateCellMetadata('flags-code', { label: 'kept' });
      useStore.getState().updateCellCanEdit('flags-code', false);
      const state = useStore.getState();
      const reference = state.tasks[0].phases[0].steps[0].content?.[0];
      expect(reference).toBe(state.cells[1]);
      expect(reference).toMatchObject({ metadata: { label: 'kept' }, enableEdit: false });
      state.updateCellMetadata('flags-code', { label: 'kept' });
      state.updateCellMetadata('flags-code', {});
      state.updateCellCanEdit('flags-code', false);
      expect(useStore.getState()).toBe(state);
      state.updateCellMetadata('flags-code', { label: undefined });
      expect(useStore.getState().cells[1].metadata).toHaveProperty('label', undefined);
    } finally { useStore.setState(original, true); }
  });
  it('does not inspect late output payloads for a removed cell', () => {
    const before = useStore.getState();
    const outputs = [{ type: 'text', get content(): string { throw new Error('Stale payload was read'); } }];
    expect(() => before.updateCellOutputs('definitely-removed-cell', outputs)).not.toThrow();
    expect(useStore.getState()).toBe(before);
  });
  it('publishes execution outputs into canonical task references without rebuilding headings', () => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'run-title', type: 'markdown', content: '# Notebook' },
        { id: 'run-code', type: 'code', content: 'print(1)', outputs: [] },
      ]);
      const before = useStore.getState();
      parse.mockClear();
      before.updateCellOutputs('run-code', [{ type: 'text', content: '1' }]);
      const after = useStore.getState();
      expect(after.tasks[0].phases[0].steps[0].content?.[0]).toBe(after.cells[1]);
      expect(after.cells[1].outputs).toEqual([{ type: 'text', content: '1' }]);
      expect(before.cells[1].outputs).toEqual([]);
      expect(after.cells[0]).toBe(before.cells[0]);
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); useStore.setState(original, true); }
  });
  it('skips repeated type assignments and derives structure for a real type change', () => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'type-title', type: 'markdown', content: '# Notebook' },
        { id: 'type-cell', type: 'code', content: '## Phase' },
      ]);
      const before = useStore.getState();
      parse.mockClear();
      before.updateCellType('type-cell', 'code');
      before.updateCellType('missing', 'markdown');
      expect(useStore.getState()).toBe(before);
      expect(parse).not.toHaveBeenCalled();
      before.updateCellType('type-cell', 'markdown');
      expect(parse).toHaveBeenCalledOnce();
      expect(useStore.getState().tasks[0].phases[1].title).toBe('Phase');
      expect(useStore.getState().cells[1].content).toBe('## Phase');
    } finally { parse.mockRestore(); useStore.setState(original, true); }
  });
  it('keeps rejected code conversions as no-ops and successful ones preserve outputs', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'reverse-title', type: 'markdown', content: '# Notebook' },
        { id: 'reverse-diagram', type: 'markdown', content: '```mermaid\ngraph TD; A-->B\n```' },
        { id: 'reverse-code', type: 'hybrid', content: '~~~typescript\n  x\n\n~~~', outputs: [{ type: 'text', content: 'kept' }] },
      ]);
      const before = useStore.getState();
      before.convertToCodeCell('reverse-diagram');
      expect(useStore.getState()).toBe(before);
      before.convertToCodeCell('reverse-code');
      const after = useStore.getState();
      expect(after.cells[2]).toMatchObject({ type: 'code', content: '  x\n', language: 'typescript' });
      expect(after.cells[2].outputs).toBe(before.cells[2].outputs);
      expect(after.tasks[0].phases[0].steps[0].content?.find(cell => cell.id === 'reverse-code')).toBe(after.cells[2]);
      after.convertToCodeCell('reverse-code');
      expect(useStore.getState()).toBe(after);
    } finally { useStore.setState(original, true); }
  });
  it('publishes object patches and hybrid conversion with canonical references and merged metadata', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'patch-title', type: 'markdown', content: '# Notebook' },
        { id: 'patch-code', type: 'code', content: '  print(1)', metadata: { keep: true } },
      ]);
      useStore.getState().updateCellObject('patch-code', { metadata: { added: true } });
      expect(useStore.getState().cells[1].metadata).toEqual({ keep: true, added: true });
      useStore.setState({ currentCellId: 'patch-code' });
      useStore.getState().convertCurrentCodeCellToHybridCell();
      const state = useStore.getState();
      expect(state.cells[1]).toMatchObject({ type: 'hybrid', content: '```python\n  print(1)\n```' });
      expect(state.tasks[0].phases[0].steps[0].content?.find(cell => cell.id === 'patch-code')).toBe(state.cells[1]);
      state.updateCellObject('patch-code', { type: 'markdown', content: '## New phase' });
      expect(useStore.getState().tasks[0].phases[1].title).toBe('New phase');
      const before = useStore.getState();
      before.updateCellObject('patch-code', { content: '## New phase' });
      expect(useStore.getState()).toBe(before);
    } finally { useStore.setState(original, true); }
  });
  it('rebuilds ownership for direct heading edits after reusing a body-edit structure', () => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'direct-title', type: 'markdown', content: '# Notebook' },
        { id: 'direct-body', type: 'markdown', content: 'body' },
        { id: 'direct-code', type: 'code', content: 'print(1)' },
      ]);
      parse.mockClear();
      useStore.getState().updateCell('direct-body', 'changed body');
      expect(parse).not.toHaveBeenCalled();
      expect(useStore.getState().cells[2].phaseId).toBe('direct-title');
      useStore.getState().updateCell('direct-body', '## Phase');
      expect(parse).toHaveBeenCalledTimes(1);
      expect(useStore.getState().cells[2].phaseId).toBe('direct-body');
      useStore.getState().updateCell('direct-body', '## Renamed');
      expect(useStore.getState().tasks[0].phases[1].title).toBe('Renamed');
      useStore.getState().updateCell('direct-body', 'plain body again');
      expect(useStore.getState().tasks[0].phases).toHaveLength(1);
      expect(useStore.getState().cells[2].phaseId).toBe('direct-title');
    } finally {
      parse.mockRestore();
      useStore.setState(original, true);
    }
  });
  it.each(['code', 'markdown'] as const)('updates only affected task branches for %s body edits', (type) => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'stable-title', type: 'markdown', content: '# Notebook' },
        { id: 'stable-a', type: 'markdown', content: '## A' },
        { id: 'code-a', type, content: 'before' },
        { id: 'stable-b', type: 'markdown', content: '## B' },
        { id: 'code-b', type: 'code', content: 'untouched' },
      ]);
      const before = useStore.getState();
      const phaseB = before.tasks[0].phases.find((phase) => phase.id === 'stable-b');
      parse.mockClear();
      before.setCells(
        before.cells.map((cell) => (cell.id === 'code-a' ? { ...cell, content: 'after' } : cell))
      );
      const after = useStore.getState();
      expect(parse).not.toHaveBeenCalled();
      expect(after.tasks[0].phases.find((phase) => phase.id === 'stable-b')).toBe(phaseB);
      const reference = after.tasks[0].phases
        .flatMap((phase) => phase.steps.flatMap((step) => step.content || []))
        .find((cell) => cell.id === 'code-a');
      expect(reference).toBe(after.cells[2]);
      expect(reference?.content).toBe('after');
      expect(before.cells[2].content).toBe('before');
    } finally {
      parse.mockRestore();
      useStore.setState(original, true);
    }
  });
  it('reuses published outputs while source content changes but normalizes replacement outputs', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'output-title', type: 'markdown', content: '# Notebook' },
        {
          id: 'output-code',
          type: 'code',
          content: 'print(1)',
          outputs: [{ type: 'text', content: '1' }],
        },
      ]);
      const before = useStore.getState().cells;
      const outputs = before[1].outputs!;
      const map = vi.spyOn(outputs, 'map');
      try {
        useStore
          .getState()
          .setCells([
            before[0],
            {
              ...before[1],
              type: 'markdown',
              content: '```python\nprint(2)\n```',
              metadata: { editorMode: 'source' },
            },
          ]);
        expect(useStore.getState().cells[1].outputs).toBe(outputs);
        expect(map).not.toHaveBeenCalled();
      } finally {
        map.mockRestore();
      }
      const current = useStore.getState().cells;
      const replacement = [{ type: 'text' as const, content: 'new output' }];
      useStore.getState().setCells([current[0], { ...current[1], outputs: replacement }]);
      expect(useStore.getState().cells[1].outputs).toEqual(replacement);
      expect(useStore.getState().cells[1].outputs).not.toBe(outputs);
    } finally {
      useStore.setState(original, true);
    }
  });
  it('copies only reassigned cells when publishing shared immutable inputs', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'cow-title', type: 'markdown', content: '# Notebook' },
        { id: 'cow-a', type: 'markdown', content: '## A' },
        { id: 'cow-code', type: 'code', content: 'print(1)' },
        { id: 'cow-b', type: 'markdown', content: '## B' },
      ]);
      const before = useStore.getState().cells;
      before.forEach(Object.freeze);
      useStore.getState().setCells([before[0], before[1], before[3], before[2]]);
      const after = useStore.getState().cells;
      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(after[3]).not.toBe(before[2]);
      expect(after[3].phaseId).toBe('cow-b');
      expect(before[2].phaseId).toBe('cow-a');
      expect(after[3].outputs).toBe(before[2].outputs);
    } finally {
      useStore.setState(original, true);
    }
  });
  it('skips normalization and task derivation for identical published cell sequences', () => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'no-op-title', type: 'markdown', content: '# Notebook' },
        { id: 'no-op-code', type: 'code', content: 'print(1)' },
      ]);
      const before = useStore.getState();
      parse.mockClear();
      before.setCells(before.cells);
      before.setCells([...before.cells]);
      expect(useStore.getState()).toBe(before);
      expect(parse).not.toHaveBeenCalled();
      before.setCells([before.cells[0], { ...before.cells[1], content: 'print(2)' }]);
      expect(useStore.getState().cells[1].content).toBe('print(2)');
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
      useStore.setState(original, true);
    }
  });
  it('publishes renamed and newly created titles with coherent derived tasks', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Before' },
        { id: 'phase', type: 'markdown', content: '## Work' },
      ]);
      useStore.getState().updateTitle('After');
      const renamed = useStore.getState();
      expect(renamed.notebookTitle).toBe('After');
      expect(renamed.tasks[0].title).toBe('After');
      expect(renamed.cells[0].content).toBe('# After');
      renamed.updateTitle('After');
      expect(useStore.getState()).toBe(renamed);
      renamed.setCells([]);
      useStore.getState().updateTitle('Created');
      expect(useStore.getState().tasks[0].title).toBe('Created');
      expect(useStore.getState().notebookTitle).toBe('Created');
    } finally {
      useStore.setState(original, true);
    }
  });
  it('recomputes ranges and ownership after ordinary insertion and cross-phase movement', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook' },
        { id: 'a', type: 'markdown', content: '## A' },
        { id: 'code', type: 'code', content: 'print(1)' },
        { id: 'b', type: 'markdown', content: '## B' },
      ]);
      useStore.getState().addCell({ id: 'inserted', type: 'raw', content: 'Raw' }, 2);
      let state = useStore.getState();
      expect(state.cells.find((cell) => cell.id === 'inserted')?.phaseId).toBe('a');
      expect(state.tasks[0].phases.find((phase) => phase.id === 'b')?.steps[0].startIndex).toBe(4);
      state.moveCellToIndex(2, state.cells.length);
      state = useStore.getState();
      expect(state.cells[state.cells.length - 1]?.id).toBe('inserted');
      expect(state.cells[state.cells.length - 1]?.phaseId).toBe('b');
      expect(
        state.tasks[0].phases
          .find((phase) => phase.id === 'b')
          ?.steps[0].content?.map((cell) => cell.id)
      ).toContain('inserted');
      state.addCell(
        { id: 'setext', type: 'markdown', content: 'New phase\n---' },
        state.cells.length
      );
      const phases = useStore.getState().tasks[0].phases;
      expect(phases[phases.length - 1]?.title).toBe('New phase');
    } finally {
      useStore.setState(original, true);
    }
  });
  it('preserves progress through Markdown edits and source-mode publication', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook' },
        { id: 'body', type: 'markdown', content: 'Before' },
      ]);
      useStore.setState({
        tasks: useStore.getState().tasks.map((task) => ({
          ...task,
          phases: task.phases.map((phase) => ({
            ...phase,
            status: 'completed' as const,
            steps: phase.steps.map((step) => ({ ...step, status: 'completed' as const })),
          })),
        })),
      });
      useStore.getState().updateCell('body', 'After');
      expect(useStore.getState().tasks[0].phases[0].steps[0].status).toBe('completed');
      useStore
        .getState()
        .setCells(
          useStore
            .getState()
            .cells.map((cell) =>
              cell.id === 'body' ? { ...cell, metadata: { editorMode: 'source' } } : cell
            )
        );
      expect(useStore.getState().tasks[0].phases[0].status).toBe('completed');
      expect(useStore.getState().tasks[0].phases[0].steps[0].status).toBe('completed');
    } finally {
      useStore.setState(original, true);
    }
  });
  it.each(['code', 'markdown'] as const)('refreshes %s body references without rebuilding tasks or resetting progress', (type) => {
    const original = useStore.getState();
    const parse = vi.spyOn(markdownParser, 'parseMarkdownCells');
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
        { id: 'code', type, content: 'before', outputs: [] },
      ]);
      const tasks = useStore.getState().tasks.map((task) => ({
        ...task,
        phases: task.phases.map((phase) => ({
          ...phase,
          status: 'running' as const,
          steps: phase.steps.map((step) => ({ ...step, status: 'completed' as const })),
        })),
      }));
      useStore.setState({ tasks });
      parse.mockClear();
      useStore.getState().updateCell('code', 'after');
      expect(parse).not.toHaveBeenCalled();
      const phase = useStore.getState().tasks[0].phases[0];
      expect(phase.status).toBe('running');
      expect(phase.steps[0].status).toBe('completed');
      expect(phase.steps[0].content?.find((cell) => cell.id === 'code')?.content).toBe('after');
      expect(phase.steps[0].content?.find((cell) => cell.id === 'code')).toBe(useStore.getState().cells[1]);
      expect(useStore.getState().tasks[0]).not.toHaveProperty('introPhase');
      expect(phase).not.toHaveProperty('currentIntroStep');
    } finally {
      parse.mockRestore();
      useStore.setState(original, true);
    }
  });
  it('does not republish cells or derived tasks for unchanged or missing content updates', () => {
    const original = useStore.getState();
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
        { id: 'code', type: 'code', content: 'print(1)', outputs: [] },
      ]);
      const before = useStore.getState();
      before.updateCell('code', 'print(1)');
      expect(useStore.getState()).toBe(before);
      before.updateCell('missing', 'ignored');
      expect(useStore.getState()).toBe(before);
      expect(useStore.getState().tasks).toBe(before.tasks);
      before.updateCell('code', 'print(2)');
      const after = useStore.getState();
      expect(after.cells[1].content).toBe('print(2)');
      expect(after.cells[0]).toBe(before.cells[0]);
      const taskCells = after.tasks.flatMap((task) =>
        task.phases.flatMap((phase) => phase.steps.flatMap((step) => step.content || []))
      );
      expect(taskCells.find((cell) => cell.id === 'code')?.content).toBe('print(2)');
    } finally {
      useStore.setState(original, true);
    }
  });
  it('retains unchanged cells and outputs when one Markdown cell changes', () => {
    const original = useStore.getState().cells;
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
        { id: 'body', type: 'markdown', content: 'Before', outputs: [] },
        { id: 'code', type: 'code', content: 'print(1)', outputs: [] },
      ]);
      const before = useStore.getState().cells;
      useStore
        .getState()
        .setCells(
          before.map((cell) => (cell.id === 'body' ? { ...cell, content: 'After' } : cell))
        );
      const after = useStore.getState().cells;
      expect(after[0]).toBe(before[0]);
      expect(after[1]).not.toBe(before[1]);
      expect(after[1].content).toBe('After');
      expect(after[2]).toBe(before[2]);
      expect(after[2].outputs).toBe(before[2].outputs);
      const referencedCells = useStore
        .getState()
        .tasks.flatMap((task) =>
          task.phases.flatMap((phase) => [
            ...(phase.intro || []),
            ...phase.steps.flatMap((step) => step.content || []),
          ])
        );
      expect(referencedCells.some((cell) => cell.id === 'code')).toBe(true);
      for (const cell of referencedCells) {
        expect(cell).toBe(after.find((published) => published.id === cell.id));
      }
    } finally {
      useStore.setState({ cells: original });
    }
  });
});
