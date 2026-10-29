import React from 'react';
import type { LexicalEditor } from 'lexical';
import {
  $readTableToolbarState,
  sameTableToolbarState,
  TableEditingController,
  type TableToolbarState,
} from '../interaction/TableEditingController';

export function useTableToolbar(editor: LexicalEditor | null) {
  const controller = React.useMemo(
    () => (editor ? new TableEditingController(editor) : null),
    [editor]
  );
  const [state, setState] = React.useState<TableToolbarState | null>(
    () => controller?.readState() || null
  );

  React.useEffect(() => {
    if (!editor || !controller) {
      setState(null);
      return;
    }
    const update = (next: TableToolbarState | null) => {
      setState((current) => (sameTableToolbarState(current, next) ? current : next));
    };
    update(controller.readState());
    return editor.registerUpdateListener(() => {
      update(editor.read(() => $readTableToolbarState()));
    });
  }, [controller, editor]);

  return { controller, state };
}
