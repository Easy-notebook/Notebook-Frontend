import { TableToolbarPlugin } from './plugins/TableToolbarPlugin';
import { NotebookMarkdownInputPlugin } from './writing/NotebookMarkdownInputPlugin';
import { MarkdownRevealPlugin } from './writing/MarkdownRevealPlugin';
import { WritingCompletionPlugin } from './writing/WritingCompletionPlugin';
import { useMemo, useLayoutEffect, forwardRef, type ForwardedRef } from 'react';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { ReactExtension, type EditorChildrenComponentProps } from '@lexical/react/ReactExtension';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { configExtension, defineExtension } from 'lexical';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';

import { NotebookHistoryPlugin } from './plugins/NotebookHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import useStore from '@Store/notebookStore';
import { EditorReadOnlyContext, useEditorReadOnly } from '../EditorAccessContext';
import { NotebookPluginRegistry } from './extensionPoints';
import { createNotebookExtension } from './model/NotebookDocument';
import { NotebookSessionPlugin } from './plugins/NotebookSessionPlugin';
import { EditorHandlePlugin, type NotebookEditorRef } from './plugins/EditorHandlePlugin';
export type { NotebookEditorRef } from './plugins/EditorHandlePlugin';
import { WritingAssistantPlugin } from './writing/WritingAssistantPlugin';
import { WritingInputPlugin } from './writing/WritingInputPlugin';
import { LinkEditingPlugin } from './writing/LinkEditingPlugin';
import { FindPlugin } from './writing/FindPlugin';
import { WritingModesPlugin } from './writing/WritingModesPlugin';
import { BlockToolsPlugin } from './plugins/BlockToolsPlugin';
import { PersistentBlockExtension } from './blocks/PersistentBlockExtension';
import { ColumnsExtension } from './columns/ColumnsExtension';
import { TextFormattingExtension } from './model/TextFormatting';
import { NotebookHtmlExtension } from './model/NotebookHtml';
import { TableResizePlugin } from './plugins/TableResizePlugin';
import { TableInputExtension } from './interaction/TableInput';
import { MarkdownTableSemanticsExtension } from './model/MarkdownTable';
import { FencedCodeSourceExtension } from './model/FencedCodeSource';
import { FenceInputPlugin } from './plugins/FenceInputPlugin';
import { NavigationPlugin } from './plugins/NavigationPlugin';
import { ImageExtension } from './model/ImageNode';
import { ScientificExtension } from './model/ScientificNode';
import { AssetInputPlugin } from './plugins/AssetInputPlugin';
import { FormattingPlugin } from './plugins/FormattingPlugin';
import { SlashCommandsPlugin } from './plugins/SlashCommandsPlugin';
import { DocumentBehaviorPlugin } from './plugins/DocumentBehaviorPlugin';
import { EditorCover } from './components/EditorCover';
import { TitleControls } from './components/TitleControls';
import '../editor.css';
import '../editorLayout.css';
import './notebook.css';

function SessionLayout({ contentEditable, children }: EditorChildrenComponentProps) {
  return (
    <NotebookSessionPlugin>
      {contentEditable}
      {children}
    </NotebookSessionPlugin>
  );
}
function EditabilityPlugin() {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  useLayoutEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);
  return null;
}
const registry = new NotebookPluginRegistry([
  { id: 'writing-completion', Component: WritingCompletionPlugin },
  { id: 'writing-assistant', Component: WritingAssistantPlugin },
  { id: 'notebook-markdown-input', Component: NotebookMarkdownInputPlugin },
  { id: 'markdown-reveal', Component: MarkdownRevealPlugin },
  { id: 'writing-input', Component: WritingInputPlugin },
  { id: 'link-editing', Component: LinkEditingPlugin },
  { id: 'find-replace', Component: FindPlugin },
  { id: 'writing-modes', Component: WritingModesPlugin },
  {
    id: 'block-tools',
    extensions: [PersistentBlockExtension, ColumnsExtension],
    Component: BlockToolsPlugin,
  },
  { id: 'text-formatting', extensions: [TextFormattingExtension] },
  { id: 'html', extensions: [NotebookHtmlExtension] },
  { id: 'table-resize', Component: TableResizePlugin },
  { id: 'table-toolbar', Component: TableToolbarPlugin },
  { id: 'fence-input', Component: FenceInputPlugin },
  { id: 'fences', extensions: [FencedCodeSourceExtension] },
  { id: 'tables', extensions: [MarkdownTableSemanticsExtension, TableInputExtension] },
  { id: 'navigation', Component: NavigationPlugin },
  { id: 'images', extensions: [ImageExtension] },
  { id: 'scientific', extensions: [ScientificExtension] },
  { id: 'asset-input', Component: AssetInputPlugin },
  { id: 'document-behavior', Component: DocumentBehaviorPlugin },
  { id: 'formatting', Component: FormattingPlugin },
  { id: 'slash-commands', Component: SlashCommandsPlugin },
]);
const NotebookEditor = forwardRef<
  NotebookEditorRef,
  { className?: string; readOnly?: boolean; placeholder?: string }
>(function NotebookEditor(
  { className = 'text-base font-normal leading-relaxed', readOnly = false },
  ref
) {
  const notebookId = useStore((state) => state.notebookId);
  return (
    <NotebookDocumentHost
      key={notebookId}
      notebookId={notebookId}
      className={className}
      readOnly={readOnly}
      editorRef={ref}
    />
  );
});
export default NotebookEditor;
function NotebookDocumentHost({
  notebookId,
  className,
  readOnly,
  editorRef,
}: {
  notebookId: string | null;
  className: string;
  readOnly: boolean;
  editorRef: ForwardedRef<NotebookEditorRef>;
}) {
  const extension = useMemo(
    () =>
      defineExtension({
        name: 'notebook/react',
        dependencies: [
          createNotebookExtension(useStore.getState().cells, false, registry),
          configExtension(ReactExtension, {
            EditorChildrenComponent: SessionLayout,
            contentEditable: null,
          }),
        ],
      }),
    []
  );
  return (
    <EditorReadOnlyContext.Provider value={readOnly}>
      <div
        className="notebook-editor-container w-full h-full bg-transparent flex flex-col"
        data-notebook-id={notebookId || ''}
        style={{ minHeight: 500 }}
      >
        <EditorCover readOnly={readOnly} />
        <div className="notebook-document-frame mx-auto flex flex-col flex-1">
          <LexicalExtensionComposer extension={extension}>
            <>
              <TitleControls />
              <ContentEditable
                className={`notebook-rich-editor max-w-none focus:outline-none ${className}`}
                aria-label="Notebook editor"
                spellCheck={false}
              />
              <EditabilityPlugin />
              <EditorHandlePlugin editorRef={editorRef} />
              <NotebookHistoryPlugin />
              <ListPlugin />
              <CheckListPlugin />
              <LinkPlugin />
              <TablePlugin />
              <TabIndentationPlugin maxIndent={6} />
              {registry.plugins.map(({ id, Component }) => Component && <Component key={id} />)}
            </>
          </LexicalExtensionComposer>
          <div className="h-20 w-full flex-shrink-0" />
        </div>
      </div>
    </EditorReadOnlyContext.Provider>
  );
}
