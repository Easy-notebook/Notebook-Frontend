import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhaseSection } from './PhaseSection';
import { renderNotebookMarkdown } from '@Editor/utils/notebookMarkdownParser';

let editor: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  editor = document.createElement('div');
  editor.className = 'tiptap-notebook-editor';
  document.body.appendChild(editor);
});
afterEach(() => {
  cleanup();
  editor.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([
  ['Repeat', 'Repeat'],
  ['Repeat', 'repeat!'],
  ['中文', '另一标题'],
])('clicks the second normalized heading without a delayed redirect: %j', async (first, second) => {
  const onStepSelect = vi.fn();
  editor.innerHTML = renderNotebookMarkdown(
    `## ${first}\n\n### ${first}\n\n### ${second}`,
    { id: 'phase' },
    new Map()
  );
  const headings = Array.from(editor.querySelectorAll('h3'));
  for (const heading of headings) heading.scrollIntoView = vi.fn();
  render(
    <PhaseSection
      phase={{
        id: 'phase',
        title: 'Phase summary',
        icon: '',
        steps: [
          { id: 'intro', title: first },
          { id: 'first', title: first },
          { id: 'second', title: second },
        ],
      }}
      isExpanded
      onToggle={vi.fn()}
      onStepSelect={onStepSelect}
      isActive={false}
      currentStepId="intro"
      isTitle
    />
  );
  const buttons = screen.getAllByRole('button', { name: second });
  fireEvent.click(buttons[buttons.length - 1]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(onStepSelect).toHaveBeenCalledExactlyOnceWith('phase', 'second');
  expect(headings[0].scrollIntoView).not.toHaveBeenCalled();
  expect(headings[1].scrollIntoView).toHaveBeenCalledExactlyOnceWith({
    behavior: 'instant',
    block: 'start',
  });
});
