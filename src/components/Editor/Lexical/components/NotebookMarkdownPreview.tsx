import { useLayoutEffect, useMemo, useRef } from 'react';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { ReactExtension } from '@lexical/react/ReactExtension';
import { configExtension, defineExtension, SKIP_DOM_SELECTION_TAG } from 'lexical';
import { $createCellNode, createNotebookExtension } from '../model/NotebookDocument';
import { $getRoot, $setSelection } from 'lexical';
import { notebookContent } from '../model/NotebookContent';
import { EditorReadOnlyContext } from '../../EditorAccessContext';

function PreviewContent({
  source,
  active,
  title,
  className,
}: {
  source: string;
  active: boolean;
  title: boolean;
  className: string;
}) {
  const [editor] = useLexicalComposerContext();
  const shineOrigin = useRef(performance.now());
  useLayoutEffect(() => {
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createCellNode({ id: 'markdown-preview', type: 'markdown', content: source }, title)
          );
        $setSelection(null);
      },
      { discrete: true, tag: SKIP_DOM_SELECTION_TAG }
    );
    // Animate text leaves, not the containing block: tables, code backgrounds and
    // scientific decorators retain the document's own rendering and typography.
    editor
      .getRootElement()
      ?.querySelectorAll('[data-lexical-text]')
      .forEach((element) => {
        // Re-parsing a growing draft replaces text DOM nodes. Preserve the animation
        // timeline instead of restarting its highlight on every character.
        (element as HTMLElement).style.animationDelay =
          `-${(performance.now() - shineOrigin.current) / 1000}s`;
        element.classList.toggle(
          'agent-shiny-text',
          active &&
            !element.closest('.notebook-text-code') &&
            !element.querySelector('.notebook-text-code')
        );
      });
  }, [editor, source, active, title]);
  return (
    <ContentEditable
      className={`${className} agent-markdown-preview`}
      aria-label="Agent Markdown preview"
      tabIndex={-1}
    />
  );
}

/** Same Lexical schema/theme as the document, without a NotebookEditorSession or store writes. */
export function NotebookMarkdownPreview({
  source,
  active = false,
  title = false,
  className = 'notebook-rich-editor text-base font-normal leading-relaxed',
}: {
  source: string;
  active?: boolean;
  title?: boolean;
  className?: string;
}) {
  const extension = useMemo(
    () =>
      defineExtension({
        name: 'notebook/markdown-preview',
        dependencies: [
          createNotebookExtension([], true, notebookContent),
          configExtension(ReactExtension, { contentEditable: null }),
        ],
      }),
    []
  );
  return (
    <EditorReadOnlyContext.Provider value={true}>
      <LexicalExtensionComposer extension={extension}>
        <PreviewContent source={source} active={active} title={title} className={className} />
      </LexicalExtensionComposer>
    </EditorReadOnlyContext.Provider>
  );
}
