# EasyNotebook Package Contract

The package entry in this repository exposes the notebook as a portable React runtime:

```tsx
import { EasyNotebookContainer } from '@easynotebook/notebook';
import '@easynotebook/notebook/styles.css';

export function NotebookHost() {
  return (
    <div style={{ height: '100vh' }}>
      <EasyNotebookContainer layout="container" routerMode="hash" />
    </div>
  );
}
```

For non-React hosts, mount it imperatively:

```ts
import { mountEasyNotebook } from '@easynotebook/notebook';
import '@easynotebook/notebook/styles.css';

const notebook = mountEasyNotebook('#notebook-root', {
  layout: 'container',
  routerMode: 'hash',
});

notebook.unmount();
```

## Controlled Pure Editor

Use `ControlledNotebookEditor` when the host application owns the notebook store. This component is stateless with respect to notebook data: it renders the `value` document and reports all mutations through `onChange`.

```tsx
import { useState } from 'react';
import {
  ControlledNotebookEditor,
  EasyNotebookDocumentModel,
  createNotebookCell,
  type EasyNotebookDocument,
  type EasyNotebookExecutor,
} from '@easynotebook/notebook/controlled';
import '@easynotebook/notebook/styles.css';

const initialNotebook = EasyNotebookDocumentModel.empty({
  title: 'External Notebook',
  cells: [
    createNotebookCell('markdown', {
      content: '## Notebook managed by the host store',
    }),
    createNotebookCell('code', {
      content: 'print("hello")',
    }),
  ],
}).toJSON();

export function HostManagedNotebook() {
  const [notebook, setNotebook] = useState<EasyNotebookDocument>(initialNotebook);

  const executor: EasyNotebookExecutor = async ({ cell }) => {
    const result = await runCodeInHostRuntime(cell.content);
    return {
      outputs: [{ type: 'text', content: result }],
    };
  };

  return (
    <ControlledNotebookEditor
      value={notebook}
      onChange={setNotebook}
      displayMode="split"
      executor={executor}
    />
  );
}
```

For Zustand, Redux, Jotai, RxJS, or any external OOP document store, keep `EasyNotebookDocument` in the host store and dispatch the `next` document returned by `onChange`.

## Custom Cell Slots

The controlled editor accepts component slots for cell bodies, frames, toolbars, output rendering, and empty state rendering:

```tsx
<ControlledNotebookEditor
  value={notebook}
  onChange={setNotebook}
  components={{
    cells: {
      sql: SqlCell,
      chart: ChartCell,
    },
    OutputRenderer: HostOutputRenderer,
    CellToolbar: HostCellToolbar,
  }}
/>
```

Custom cell components receive `{ cell, index, notebook, readOnly, actions }`. Use `actions.updateContent`, `actions.updateCell`, `actions.setOutputs`, and `actions.executeCell` to emit controlled changes without touching internal project stores.

## Headless Document Model

Use the headless entry when no React UI is needed:

```ts
import {
  EasyNotebookDocumentModel,
  createNotebookCell,
  reduceEasyNotebookDocument,
} from '@easynotebook/notebook/headless';

const notebook = EasyNotebookDocumentModel.empty()
  .insertCell(createNotebookCell('markdown', { content: '# Analysis' }))
  .insertCell(createNotebookCell('code', { content: 'df.head()' }))
  .toJSON();

const next = reduceEasyNotebookDocument(notebook, {
  type: 'set_outputs',
  cellId: notebook.cells[1].id,
  outputs: [{ type: 'text', content: '5 rows' }],
});
```

## Public Runtime Boundary

- `src/notebook/index.ts` is the public package entry.
- `src/notebook/EasyNotebookContainer.tsx` is the embeddable React container.
- `src/notebook/mountEasyNotebook.tsx` is the imperative bootstrap API.
- `src/notebook/runtime/NotebookRuntimeProvider.tsx` owns providers required by the notebook shell.
- `src/notebook/controlled/ControlledNotebookEditor.tsx` is the host-store controlled editor.
- `src/notebook/headless/NotebookDocumentModel.ts` is the portable OOP document model and reducer.
- `src/components/Notebook/NotebookApp.tsx` remains the product-level notebook orchestrator.

## Layout Modes

- `layout="viewport"` keeps the existing SPA behavior and uses `h-screen`.
- `layout="container"` uses `h-full`; the host application must provide the parent height.

## Router Modes

- `routerMode="auto"` preserves the current app routing behavior.
- `routerMode="browser"` forces `BrowserRouter`.
- `routerMode="hash"` forces `HashRouter`, which is safer for embedded and static-hosted usage.
- `routerMode="none"` renders inside an existing React Router context.

## Build Outputs

Run:

```bash
npm run build
```

The library build is emitted to `dist/easynotebook`:

- `index.es.js`
- `index.umd.js`
- `controlled.es.js`
- `headless.es.js`
- `styles.css`
