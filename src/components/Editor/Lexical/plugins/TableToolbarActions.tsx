import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns3,
  Rows3,
  Grid2X2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  type TableEditingController,
  type TableToolbarAction,
  type TableToolbarState,
} from '../interaction/TableEditingController';

type TableToolbarButton = {
  action: TableToolbarAction;
  alignment?: 'left' | 'center' | 'right';
  icon: LucideIcon;
  label: string;
  danger?: boolean;
};

const buttons: TableToolbarButton[] = [
  { action: 'align-left', alignment: 'left', icon: AlignLeft, label: 'Align column left' },
  { action: 'align-center', alignment: 'center', icon: AlignCenter, label: 'Align column center' },
  { action: 'align-right', alignment: 'right', icon: AlignRight, label: 'Align column right' },
  {
    action: 'insert-row-above',
    icon: ArrowUpToLine,
    label: 'Insert row above',
  },
  { action: 'insert-row-below', icon: ArrowDownToLine, label: 'Insert row below' },
  { action: 'insert-column-before', icon: ArrowLeftToLine, label: 'Insert column before' },
  { action: 'insert-column-after', icon: ArrowRightToLine, label: 'Insert column after' },
  {
    action: 'delete-row',
    icon: Rows3,
    label: 'Delete selected row',
    danger: true,
  },
  { action: 'delete-column', icon: Columns3, label: 'Delete selected column', danger: true },
  { action: 'delete-table', icon: Trash2, label: 'Delete table', danger: true },
];

/** The top surface delegates every mutation to the existing table controller. */
export function TableToolbarActions({
  controller,
  state,
}: {
  controller: TableEditingController;
  state: TableToolbarState;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [state.tableKey]);
  const actionButton = ({ action, alignment, icon: Icon, label, danger }: TableToolbarButton) => (
    <button
      key={action}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={alignment ? (state.columnAlignment ?? 'left') === alignment : undefined}
      data-danger={danger || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        controller.run(action);
        setOpen(false);
      }}
    >
      <Icon size={18} />
      {open && !alignment && action !== 'delete-table' && <span>{label}</span>}
    </button>
  );
  return (
    <>
      <div className="notebook-table-topbar__menu-anchor">
        <button
          type="button"
          aria-label="Table operations"
          title="Table operations"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
        >
          <Grid2X2 size={18} />
        </button>
        {open && (
          <div className="notebook-table-topbar__menu" role="group" aria-label="Rows and columns">
            {buttons
              .filter((button) => !button.alignment && button.action !== 'delete-table')
              .map(actionButton)}
          </div>
        )}
      </div>
      {buttons.filter((button) => button.alignment).map(actionButton)}
      <span className="notebook-table-topbar__spacer" />
      {buttons.filter((button) => button.action === 'delete-table').map(actionButton)}
    </>
  );
}
