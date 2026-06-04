import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react';
import { SafeHtmlContent } from '@/components/Notebook/features/output-rendering/SafeHtmlContent';
import { defaultProseMirrorCells } from './cells';
import {
  EasyNotebookDocumentModel,
  createNotebookCell,
  type EasyNotebookCell,
  type EasyNotebookCellActions,
  type EasyNotebookCellFrameProps,
  type EasyNotebookCellComponentProps,
  type EasyNotebookCellPatch,
  type EasyNotebookCellToolbarProps,
  type EasyNotebookCellType,
  type EasyNotebookChangeEvent,
  type EasyNotebookDocument,
  type EasyNotebookEditorComponents,
  type EasyNotebookExecutor,
  type EasyNotebookOutput,
} from '../headless';

export type ControlledNotebookDisplayMode = 'edit' | 'preview' | 'split';

export interface ControlledNotebookEditorProps {
  value: EasyNotebookDocument;
  onChange: (next: EasyNotebookDocument, event: EasyNotebookChangeEvent) => void;
  className?: string;
  displayMode?: ControlledNotebookDisplayMode;
  readOnly?: boolean;
  executor?: EasyNotebookExecutor;
  components?: EasyNotebookEditorComponents;
  executingCellIds?: string[];
  onExecutionStart?: (cell: EasyNotebookCell) => void;
  onExecutionComplete?: (cell: EasyNotebookCell, outputs: EasyNotebookOutput[]) => void;
  onExecutionError?: (cell: EasyNotebookCell, error: unknown) => void;
}

const DEFAULT_CELL_TYPE: EasyNotebookCellType = 'markdown';

const isHtmlOutput = (output: EasyNotebookOutput): boolean =>
  ['html', 'ansi-html', 'markdown-html'].includes(output.type);

const serializeOutputContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (content == null) return '';

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
};

const DefaultOutputRenderer: React.FC<{
  output: EasyNotebookOutput;
  cell: EasyNotebookCell;
  index: number;
}> = ({ output }) => {
  const content = serializeOutputContent(output.content);

  if (isHtmlOutput(output)) {
    return <SafeHtmlContent html={content} className="notebook-controlled-output-html" />;
  }

  if (output.type === 'error') {
    return (
      <pre className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {content}
      </pre>
    );
  }

  return (
    <pre className="whitespace-pre-wrap rounded border border-border/70 bg-muted/40 p-3 text-sm text-foreground">
      {content}
    </pre>
  );
};

const DefaultCellToolbar: React.FC<
  EasyNotebookCellToolbarProps & {
    executor?: EasyNotebookExecutor;
  }
> = ({ cell, readOnly, actions, isExecuting, canMoveUp, canMoveDown, executor }) => (
  <div className="flex items-center gap-1">
    {executor && cell.type === 'code' && (
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-background hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => actions.executeCell(cell.id)}
        disabled={isExecuting}
        title="Run cell"
      >
        <Play className="h-4 w-4" />
      </button>
    )}
    {!readOnly && (
      <>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-background hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => actions.moveCell(cell.id, 'up')}
          disabled={!canMoveUp}
          title="Move up"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-background hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => actions.moveCell(cell.id, 'down')}
          disabled={!canMoveDown}
          title="Move down"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-background hover:bg-muted"
          onClick={() => actions.insertCellAfter(cell.id)}
          title="Insert cell"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 bg-background text-red-600 hover:bg-red-50"
          onClick={() => actions.deleteCell(cell.id)}
          title="Delete cell"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </>
    )}
  </div>
);

const DefaultCellFrame: React.FC<EasyNotebookCellFrameProps> = ({ cell, children, toolbar }) => (
  <section
    className="group rounded border border-border/70 bg-background/90 p-4 shadow-sm"
    data-cell-id={cell.id}
    data-cell-type={cell.type}
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {cell.type}
        </div>
        {cell.description && (
          <div className="truncate text-xs text-muted-foreground">{cell.description}</div>
        )}
      </div>
      {toolbar}
    </div>
    {children}
  </section>
);

const DefaultEmptyState: React.FC<{ onInsertCell: (type?: EasyNotebookCellType) => void }> = ({
  onInsertCell,
}) => (
  <div className="flex h-full min-h-48 items-center justify-center">
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded border border-border/70 bg-background px-4 py-2 text-sm hover:bg-muted"
      onClick={() => onInsertCell(DEFAULT_CELL_TYPE)}
    >
      <Plus className="h-4 w-4" />
      Add cell
    </button>
  </div>
);

const MarkdownEditor: React.FC<{
  cell: EasyNotebookCell;
  readOnly: boolean;
  displayMode: ControlledNotebookDisplayMode;
  onChange: (content: string) => void;
}> = ({ cell, readOnly, displayMode, onChange }) => {
  const preview = (
    <div className="prose max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.content || ' '}</ReactMarkdown>
    </div>
  );

  if (readOnly || displayMode === 'preview') return preview;

  const editor = (
    <textarea
      className="min-h-32 w-full resize-y rounded border border-border/70 bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/40"
      value={cell.content}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
    />
  );

  if (displayMode === 'split') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {editor}
        <div className="min-h-32 rounded border border-border/70 bg-muted/20 p-3">{preview}</div>
      </div>
    );
  }

  return editor;
};

const CodeEditor: React.FC<{
  cell: EasyNotebookCell;
  readOnly: boolean;
  onChange: (content: string) => void;
}> = ({ cell, readOnly, onChange }) => (
  <textarea
    className="min-h-40 w-full resize-y rounded border border-border/70 bg-[#0b1020] p-3 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-80"
    value={cell.content}
    onChange={(event) => onChange(event.target.value)}
    spellCheck={false}
    disabled={readOnly || cell.enableEdit === false}
  />
);

const DefaultCellBody: React.FC<
  EasyNotebookCellComponentProps & {
    displayMode: ControlledNotebookDisplayMode;
    OutputRenderer: NonNullable<EasyNotebookEditorComponents['OutputRenderer']>;
  }
> = ({ cell, index, notebook, readOnly, actions, displayMode, OutputRenderer }) => {
  const updateContent = (content: string) => actions.updateContent(cell.id, content);

  if (cell.type === 'markdown') {
    return (
      <MarkdownEditor
        cell={cell}
        readOnly={readOnly || cell.enableEdit === false}
        displayMode={displayMode}
        onChange={updateContent}
      />
    );
  }

  if (cell.type === 'code') {
    return (
      <div className="space-y-3">
        <CodeEditor cell={cell} readOnly={readOnly} onChange={updateContent} />
        {cell.outputs?.map((output, outputIndex) => (
          <OutputRenderer
            key={output.key ?? outputIndex}
            output={output}
            cell={cell}
            index={outputIndex}
          />
        ))}
      </div>
    );
  }

  if (cell.type === 'image') {
    return (
      <input
        className="w-full rounded border border-border/70 bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        value={cell.content}
        disabled={readOnly || cell.enableEdit === false}
        onChange={(event) => updateContent(event.target.value)}
        placeholder="Image URL or markdown image"
      />
    );
  }

  if (cell.type === 'link') {
    return (
      <input
        className="w-full rounded border border-border/70 bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        value={cell.content}
        disabled={readOnly || cell.enableEdit === false}
        onChange={(event) => updateContent(event.target.value)}
        placeholder="URL or file path"
      />
    );
  }

  return (
    <textarea
      className="min-h-24 w-full resize-y rounded border border-border/70 bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/40"
      value={cell.content}
      disabled={readOnly || cell.enableEdit === false}
      onChange={(event) => updateContent(event.target.value)}
    />
  );
};

export const ControlledNotebookEditor: React.FC<ControlledNotebookEditorProps> = ({
  value,
  onChange,
  className = '',
  displayMode = 'edit',
  readOnly = false,
  executor,
  components,
  executingCellIds = [],
  onExecutionStart,
  onExecutionComplete,
  onExecutionError,
}) => {
  const documentModel = useMemo(() => EasyNotebookDocumentModel.from(value), [value]);
  const notebook = useMemo(() => documentModel.toJSON(), [documentModel]);

  const emit = useCallback(
    (next: EasyNotebookDocument, event: EasyNotebookChangeEvent) => {
      onChange(next, event);
    },
    [onChange]
  );

  const updateDocument = useCallback(
    (nextModel: EasyNotebookDocumentModel, event: EasyNotebookChangeEvent) => {
      emit(nextModel.toJSON(), event);
    },
    [emit]
  );

  const actions = useMemo<EasyNotebookCellActions>(
    () => ({
      updateCell: (cellId: string, patch: EasyNotebookCellPatch) => {
        updateDocument(documentModel.updateCell(cellId, patch), {
          type: 'update_cell',
          cellId,
          patch,
        });
      },
      updateContent: (cellId: string, content: string) => {
        const patch = { content };
        updateDocument(documentModel.updateCell(cellId, patch), {
          type: 'update_cell',
          cellId,
          patch,
        });
      },
      deleteCell: (cellId: string) => {
        updateDocument(documentModel.deleteCell(cellId), {
          type: 'delete_cell',
          cellId,
        });
      },
      insertCellAfter: (cellId: string, type: EasyNotebookCellType = DEFAULT_CELL_TYPE) => {
        const cellIndex = notebook.cells.findIndex((cell) => cell.id === cellId);
        const nextCell = createNotebookCell(type);
        updateDocument(documentModel.insertCell(nextCell, cellIndex + 1), {
          type: 'insert_cell',
          cellId: nextCell.id,
          cell: nextCell,
        });
      },
      moveCell: (cellId: string, direction: 'up' | 'down') => {
        const fromIndex = notebook.cells.findIndex((cell) => cell.id === cellId);
        if (fromIndex < 0) return;

        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
        updateDocument(documentModel.moveCell(fromIndex, toIndex), {
          type: 'move_cell',
          cellId,
          fromIndex,
          toIndex,
        });
      },
      setOutputs: (cellId: string, outputs: EasyNotebookOutput[]) => {
        updateDocument(documentModel.setOutputs(cellId, outputs), {
          type: 'set_outputs',
          cellId,
        });
      },
      executeCell: async (cellId: string) => {
        const cell = documentModel.cellById(cellId);
        if (!cell || !executor) return;

        onExecutionStart?.(cell);
        try {
          const result = await executor({ cell, notebook });
          const outputs = Array.isArray(result) ? result : result?.outputs;
          const patch = Array.isArray(result) ? undefined : result?.patch;
          let nextModel = documentModel;

          if (patch) nextModel = nextModel.updateCell(cellId, patch);
          if (outputs) nextModel = nextModel.setOutputs(cellId, outputs);

          if (patch || outputs) {
            updateDocument(nextModel, {
              type: outputs ? 'set_outputs' : 'update_cell',
              cellId,
              patch,
            });
          }

          onExecutionComplete?.(cell, outputs ?? cell.outputs ?? []);
        } catch (error) {
          const errorOutput: EasyNotebookOutput = {
            type: 'error',
            content: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          };
          updateDocument(documentModel.setOutputs(cellId, [errorOutput]), {
            type: 'set_outputs',
            cellId,
          });
          onExecutionError?.(cell, error);
        }
      },
    }),
    [
      documentModel,
      executor,
      notebook,
      onExecutionComplete,
      onExecutionError,
      onExecutionStart,
      updateDocument,
    ]
  );

  const insertAtEnd = useCallback(
    (type: EasyNotebookCellType = DEFAULT_CELL_TYPE) => {
      const nextCell = createNotebookCell(type);
      updateDocument(documentModel.insertCell(nextCell), {
        type: 'insert_cell',
        cellId: nextCell.id,
        cell: nextCell,
      });
    },
    [documentModel, updateDocument]
  );

  const EmptyState = components?.EmptyState ?? DefaultEmptyState;
  const CellFrame = components?.CellFrame;
  const Toolbar = components?.CellToolbar;
  const OutputRenderer = components?.OutputRenderer ?? DefaultOutputRenderer;
  // Default to the ProseMirror-backed markdown body; caller-supplied cells win.
  const cellComponents = useMemo(
    () => ({ ...defaultProseMirrorCells, ...components?.cells }),
    [components?.cells]
  );

  if (notebook.cells.length === 0) {
    return (
      <div className={`easy-notebook-controlled h-full min-h-0 ${className}`}>
        <EmptyState onInsertCell={insertAtEnd} />
      </div>
    );
  }

  return (
    <div className={`easy-notebook-controlled h-full min-h-0 overflow-auto ${className}`}>
      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-6 py-6">
        {!readOnly && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-border/70 bg-background px-3 py-2 text-sm hover:bg-muted"
              onClick={() => insertAtEnd('markdown')}
            >
              <Plus className="h-4 w-4" />
              Markdown
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-border/70 bg-background px-3 py-2 text-sm hover:bg-muted"
              onClick={() => insertAtEnd('code')}
            >
              <Plus className="h-4 w-4" />
              Code
            </button>
          </div>
        )}

        {notebook.cells.map((cell, index) => {
          const cellProps: EasyNotebookCellComponentProps = {
            cell,
            index,
            notebook,
            readOnly,
            actions,
          };
          const CustomCell = cellComponents[cell.type];
          const isExecuting = executingCellIds.includes(cell.id);
          const toolbar = Toolbar ? (
            <Toolbar
              {...cellProps}
              isExecuting={isExecuting}
              canMoveUp={index > 0}
              canMoveDown={index < notebook.cells.length - 1}
              hasExecutor={Boolean(executor)}
            />
          ) : (
            <DefaultCellToolbar
              {...cellProps}
              isExecuting={isExecuting}
              canMoveUp={index > 0}
              canMoveDown={index < notebook.cells.length - 1}
              hasExecutor={Boolean(executor)}
              executor={executor}
            />
          );
          const body = CustomCell ? (
            <CustomCell {...cellProps} />
          ) : (
            <DefaultCellBody
              {...cellProps}
              displayMode={displayMode}
              OutputRenderer={OutputRenderer}
            />
          );

          if (CellFrame) {
            return (
              <CellFrame key={cell.id} {...cellProps} toolbar={toolbar}>
                {body}
              </CellFrame>
            );
          }

          return (
            <DefaultCellFrame key={cell.id} {...cellProps} toolbar={toolbar}>
              {body}
            </DefaultCellFrame>
          );
        })}
      </div>
    </div>
  );
};
