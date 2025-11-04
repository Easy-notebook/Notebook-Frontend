import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from '@dnd-kit/modifiers';
import DraggableCell from './DraggableCell';

interface Cell {
  id: string;
  type: string;
  content: string;
  outputs?: any[];
  [key: string]: any;
}

interface DraggableCellListProps {
  cells: Cell[];
  onCellsReorder: (newCells: Cell[]) => void;
  renderCell: (cell: Cell, isDragging?: boolean) => React.ReactNode;
  className?: string;
  disabled?: boolean;
  onAddCell?: (type: string, afterIndex: number) => void;
}

const DraggableCellList: React.FC<DraggableCellListProps> = ({
  cells,
  onCellsReorder,
  renderCell,
  className = '',
  disabled = false,
  onAddCell
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedCell, setDraggedCell] = useState<Cell | null>(null);

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
    const { active } = event;
    setActiveId(active.id as string);
    
    // 找到被拖拽的cell
    const cell = cells.find(c => c.id === active.id);
    setDraggedCell(cell || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // 可以在这里添加拖拽过程中的视觉反馈
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = cells.findIndex(cell => cell.id === active.id);
      const newIndex = cells.findIndex(cell => cell.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newCells = arrayMove(cells, oldIndex, newIndex);
        onCellsReorder(newCells);
      }
    }

    setActiveId(null);
    setDraggedCell(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDraggedCell(null);
  };

  if (disabled) {
    // 如果禁用拖拽，直接渲染普通列表
    return (
      <div className={className}>
        {cells.map((cell) => (
          <div key={cell.id}>
            {renderCell(cell)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext items={cells.map(cell => cell.id)} strategy={verticalListSortingStrategy}>
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

export default DraggableCellList;
