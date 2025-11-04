import { useState, useCallback, useRef, useEffect } from 'react';
import useStore from '../../../store/notebookStore';

interface CellManagerOptions {
  onCellFocus?: (cellId: string) => void;
  onCellBlur?: (cellId: string) => void;
  onCellSelect?: (cellId: string) => void;
  onCellDeselect?: () => void;
}

export const useCellManager = (options: CellManagerOptions = {}) => {
  const { cells, setCells } = useStore();
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // 生成唯一的cell ID
  const generateCellId = useCallback(() => {
    return `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 获取cell的索引
  const getCellIndex = useCallback((cellId: string) => {
    return cells.findIndex(cell => cell.id === cellId);
  }, [cells]);

  // 选中cell
  const selectCell = useCallback((cellId: string) => {
    setSelectedCellId(cellId);
    options.onCellSelect?.(cellId);
  }, [options]);

  // 取消选中
  const deselectCell = useCallback(() => {
    setSelectedCellId(null);
    options.onCellDeselect?.();
  }, [options]);

  // 聚焦cell
  const focusCell = useCallback((cellId: string) => {
    setFocusedCellId(cellId);
    setSelectedCellId(cellId);
    
    // 滚动到cell
    const cellElement = cellRefs.current.get(cellId);
    if (cellElement) {
      cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    options.onCellFocus?.(cellId);
  }, [options]);

  // 失焦cell
  const blurCell = useCallback((cellId: string) => {
    if (focusedCellId === cellId) {
      setFocusedCellId(null);
    }
    options.onCellBlur?.(cellId);
  }, [focusedCellId, options]);

  // 开始编辑cell
  const startEditingCell = useCallback((cellId: string) => {
    setEditingCellId(cellId);
    focusCell(cellId);
  }, [focusCell]);

  // 停止编辑cell
  const stopEditingCell = useCallback(() => {
    setEditingCellId(null);
  }, []);

  // 在指定位置插入新cell
  const insertCell = useCallback((type: string, index?: number, content: string = '') => {
    const newCell = {
      id: generateCellId(),
      type,
      content,
      outputs: [],
      enableEdit: true,
      language: type === 'code' || type === 'Hybrid' ? 'python' : undefined,
      ...(type === 'thinking' && {
        agentName: 'AI',
        customText: null,
        textArray: [],
        useWorkflowThinking: false,
        enableEdit: false,
      })
    };

    const insertIndex = index !== undefined ? index : cells.length;
    const newCells = [...cells];
    newCells.splice(insertIndex, 0, newCell);
    setCells(newCells);

    // 自动选中并聚焦新cell
    setTimeout(() => {
      focusCell(newCell.id);
      if (type !== 'thinking') {
        startEditingCell(newCell.id);
      }
    }, 100);

    return newCell.id;
  }, [cells, setCells, generateCellId, focusCell, startEditingCell]);

  // 在当前选中cell之后插入新cell
  const insertCellAfterCurrent = useCallback((type: string, content: string = '') => {
    if (selectedCellId) {
      const currentIndex = getCellIndex(selectedCellId);
      return insertCell(type, currentIndex + 1, content);
    } else {
      return insertCell(type, cells.length, content);
    }
  }, [selectedCellId, getCellIndex, insertCell, cells.length]);

  // 在当前选中cell之前插入新cell
  const insertCellBeforeCurrent = useCallback((type: string, content: string = '') => {
    if (selectedCellId) {
      const currentIndex = getCellIndex(selectedCellId);
      return insertCell(type, currentIndex, content);
    } else {
      return insertCell(type, 0, content);
    }
  }, [selectedCellId, getCellIndex, insertCell]);

  // 删除cell
  const deleteCell = useCallback((cellId: string) => {
    const cellIndex = getCellIndex(cellId);
    if (cellIndex === -1) return;

    const newCells = cells.filter(cell => cell.id !== cellId);
    setCells(newCells);

    // 清理状态
    if (selectedCellId === cellId) {
      setSelectedCellId(null);
    }
    if (focusedCellId === cellId) {
      setFocusedCellId(null);
    }
    if (editingCellId === cellId) {
      setEditingCellId(null);
    }

    // 选中相邻的cell
    if (newCells.length > 0) {
      const nextIndex = Math.min(cellIndex, newCells.length - 1);
      const nextCell = newCells[nextIndex];
      if (nextCell) {
        setTimeout(() => focusCell(nextCell.id), 100);
      }
    }
  }, [cells, setCells, getCellIndex, selectedCellId, focusedCellId, editingCellId, focusCell]);

  // 移动cell
  const moveCell = useCallback((cellId: string, direction: 'up' | 'down') => {
    const currentIndex = getCellIndex(cellId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= cells.length) return;

    const newCells = [...cells];
    const [movedCell] = newCells.splice(currentIndex, 1);
    newCells.splice(newIndex, 0, movedCell);
    setCells(newCells);
  }, [cells, setCells, getCellIndex]);

  // 复制cell
  const duplicateCell = useCallback((cellId: string) => {
    const cellIndex = getCellIndex(cellId);
    if (cellIndex === -1) return;

    const originalCell = cells[cellIndex];
    const newCell = {
      ...originalCell,
      id: generateCellId(),
    };

    const newCells = [...cells];
    newCells.splice(cellIndex + 1, 0, newCell);
    setCells(newCells);

    setTimeout(() => focusCell(newCell.id), 100);
    return newCell.id;
  }, [cells, setCells, getCellIndex, generateCellId, focusCell]);

  // 更新cell内容
  const updateCellContent = useCallback((cellId: string, content: string) => {
    const newCells = cells.map(cell => 
      cell.id === cellId ? { ...cell, content } : cell
    );
    setCells(newCells);
  }, [cells, setCells]);

  // 注册cell DOM元素
  const registerCellRef = useCallback((cellId: string, element: HTMLElement | null) => {
    if (element) {
      cellRefs.current.set(cellId, element);
    } else {
      cellRefs.current.delete(cellId);
    }
  }, []);

  // 键盘导航
  const navigateToCell = useCallback((direction: 'up' | 'down') => {
    if (!selectedCellId) {
      if (cells.length > 0) {
        focusCell(cells[0].id);
      }
      return;
    }

    const currentIndex = getCellIndex(selectedCellId);
    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === 'up') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    } else {
      nextIndex = currentIndex < cells.length - 1 ? currentIndex + 1 : cells.length - 1;
    }

    const nextCell = cells[nextIndex];
    if (nextCell) {
      focusCell(nextCell.id);
    }
  }, [selectedCellId, cells, getCellIndex, focusCell]);

  // 清理函数
  useEffect(() => {
    return () => {
      cellRefs.current.clear();
    };
  }, []);

  return {
    // 状态
    cells,
    selectedCellId,
    focusedCellId,
    editingCellId,

    // 基本操作
    selectCell,
    deselectCell,
    focusCell,
    blurCell,
    startEditingCell,
    stopEditingCell,

    // Cell CRUD操作
    insertCell,
    insertCellAfterCurrent,
    insertCellBeforeCurrent,
    deleteCell,
    moveCell,
    duplicateCell,
    updateCellContent,

    // 导航
    navigateToCell,

    // 工具函数
    getCellIndex,
    registerCellRef,

    // 便捷方法
    addCodeCell: () => insertCellAfterCurrent('code'),
    addMarkdownCell: () => insertCellAfterCurrent('markdown'),
    addImageCell: () => insertCellAfterCurrent('image'),
    addThinkingCell: () => insertCellAfterCurrent('thinking'),

    // Store操作
    setCells,
  };
};
