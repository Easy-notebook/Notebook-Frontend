import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import DraggableCell from './DraggableCell';
import { getCellIndexById } from '@Store/models/cellIndex';

interface Cell {
  id: string;
  type: string;
  content: string;
  outputs?: unknown[];
  [key: string]: unknown;
}

interface DraggableCellListProps {
  cells: Cell[];
  onCellsReorder: (newCells: Cell[]) => void;
  renderCell: (cell: Cell, isDragging?: boolean) => React.ReactNode;
  className?: string;
  disabled?: boolean;
  onAddCell?: (type: string, afterIndex: number) => void;
}

const SortableCellList: React.FC<DraggableCellListProps> = ({
  cells,
  onCellsReorder,
  renderCell,
  className = '',
  onAddCell,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeDrag = useRef<string | null>(null);
  const committed = useRef({ cells, onCellsReorder });
  useLayoutEffect(() => {
    committed.current = { cells, onCellsReorder };
    if (activeDrag.current !== null && getCellIndexById(cells, activeDrag.current) === undefined) {
      activeDrag.current = null;
      setActiveId(null);
    }
  }, [cells, onCellsReorder]);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeDrag.current = null;
    };
  }, []);
  const ids = useMemo(() => cells.map((cell) => cell.id), [cells]);
  const activePosition = activeId === null ? undefined : getCellIndexById(cells, activeId);
  const draggedCell = activePosition === undefined ? null : cells[activePosition];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖拽8px才开始拖拽，避免误触
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (!mounted.current) return;
    const { active } = event;
    if (
      typeof active.id !== 'string' ||
      getCellIndexById(committed.current.cells, active.id) === undefined
    )
      return;
    activeDrag.current = active.id;
    setActiveId(active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!mounted.current || activeDrag.current === null || activeDrag.current !== event.active.id)
      return;
    // Consume ownership before publishing: duplicate/reentrant end events are no-ops.
    activeDrag.current = null;
    setActiveId(null);
    // Sensor callbacks can outlive a render. Reorder current objects, never a
    // snapshot captured before streaming/editor updates were committed.
    const { cells, onCellsReorder } = committed.current;
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = getCellIndexById(cells, active.id as string);
      const newIndex = over ? getCellIndexById(cells, over.id as string) : undefined;

      if (oldIndex !== undefined && newIndex !== undefined) {
        const newCells = arrayMove(cells, oldIndex, newIndex);
        onCellsReorder(newCells);
      }
    }
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    if (!mounted.current || activeDrag.current !== event.active.id) return;
    activeDrag.current = null;
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {cells.map((cell, index) => (
            <DraggableCell
              key={cell.id}
              cell={cell}
              isActive={activeId === cell.id}
              className=""
              onAddCell={onAddCell}
              cellIndex={index}
            >
              {renderCell(cell, activeId === cell.id)}
            </DraggableCell>
          ))}
        </div>
      </SortableContext>

      {/* 拖拽覆盖层 - 显示正在被拖拽的元素 */}
      <DragOverlay>
        {activeId && draggedCell ? (
          <div className="bg-white rounded-lg shadow-2xl border-2 border-theme-300 transform rotate-2 opacity-95">
            {renderCell(draggedCell, true)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const DraggableCellList: React.FC<DraggableCellListProps> = (props) => {
  if (props.disabled) {
    return (
      <div className={props.className}>
        {props.cells.map((cell) => (
          <div key={cell.id}>{props.renderCell(cell)}</div>
        ))}
      </div>
    );
  }
  // Disabling unmounts the sensor/session owner, so re-enabling starts idle.
  return <SortableCellList {...props} />;
};

export default DraggableCellList;
