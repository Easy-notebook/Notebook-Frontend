import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowRight, PlusCircle } from 'lucide-react';

import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';

import AICommandInput from './AICommandInput';
import Header from './Header';
import { UploadFile, AddCellFn, EmptyStateProps } from './types';
import { navigateToLibrary } from '@Utils/navigation';
import { uiLog } from '@Utils/logger';

function isTypedAddCell(fn: AddCellFn): fn is (type: 'markdown' | 'code') => void {
  return fn.length >= 1;
}

// Removed console-based logging - using structured logger instead

// ---- 手势/滚轮参数（改为右滑）----
const ANGLE_DEG_THRESHOLD = 30; // 水平 ±30°
const LOCK_MIN_MOVEMENT = 6; // 锁定最小像素
const RIGHT_LOCK_FALLBACK_DX = 24; // 兜底：累计 dx 大于该值锁 right
const RIGHT_VELOCITY_PX_PER_MS = 0.4; // 兜底：水平速度阈值（向右为正）
const RIGHT_TRIGGER_THRESHOLD = 72; // 右滑触发阈值
const UP_TRIGGER_THRESHOLD = 80; // 上滑创建阈值
const EDGE_GUARD_PX = 16; // iOS 左缘返回保护（与右滑无冲突，保留）
const WHEEL_DOWN_TRIGGER = 220; // 竖向滚轮触发阈值
const WHEEL_RIGHT_DECAY_MS = 140; // 横向滚轮“结束”判定间隔

const EmptyState: React.FC<EmptyStateProps> = ({ onAddCell }) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [swipeDistance, setSwipeDistance] = useState(0); // 上滑视觉
  const [rightSwipeDistance, setRightSwipeDistance] = useState(0); // 右滑视觉
  const [showLibraryState, setShowLibraryState] = useState(false);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ====== 手势状态 ======
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastXRef = useRef<number | null>(null);
  const lastTRef = useRef<number>(0);
  const dxAccumRef = useRef<number>(0);
  const isSwipeInProgress = useRef(false);
  const isRightSwipeInProgress = useRef(false);
  const directionLock = useRef<'none' | 'right' | 'up'>('none');
  const edgeSwipeLock = useRef(false);

  // 鼠标长按（保留）
  const longPressTimerRef = useRef<number | null>(null);
  const longPressActiveRef = useRef(false);

  // ====== 滚轮状态 ======
  const wheelDownAccumRef = useRef<number>(0); // 纵向滚动累计
  const wheelRightAccumRef = useRef<number>(0); // 横向右滚累计
  const wheelEndTimerRef = useRef<number | null>(null); // 横向滚“结束”判定

  const lastTriggerAtRef = useRef<number>(0);

  const safeTrigger = useCallback(async () => {
    const now = Date.now();
    if (now - lastTriggerAtRef.current < 1000) return;
    lastTriggerAtRef.current = now;
    await createNewNotebook();
  }, [createNewNotebook]);

  const createNewNotebook = useCallback(async () => {
    if (isCreatingNotebook) return;
    setIsCreatingNotebook(true);
    try {
      console.log('🔍 [EmptyState] Creating new notebook - START');
      const newNotebookId = await NotebookLifecycleService.initializeNotebook();
      console.log('🔍 [EmptyState] Received new notebookId from backend', { newNotebookId });

      console.log('🔍 [EmptyState] Setting notebookId in store (NO LOAD)', { newNotebookId });
      useStore.getState().setNotebookId(newNotebookId);

      useCodeStore.getState().setKernelReady(true);

      console.log('🔍 [EmptyState] Adding first cell');
      if (isTypedAddCell(onAddCell)) onAddCell('markdown');

      console.log('🔍 [EmptyState] New notebook created successfully', {
        notebookId: newNotebookId,
        currentCells: useStore.getState().cells.length,
      });
      uiLog.info('Created notebook successfully', { notebookId: newNotebookId });
    } catch (error) {
      console.error('❌ [EmptyState] Failed to create new notebook:', error);
      alert('Failed to create new notebook. Please try again.');
    } finally {
      setIsCreatingNotebook(false);
      wheelDownAccumRef.current = 0;
    }
  }, [isCreatingNotebook, onAddCell]);

  // ====== 手势：开始/移动/结束 ======
  const beginGesture = (x: number, y: number) => {
    touchStartY.current = y;
    touchStartX.current = x;
    directionLock.current = 'none';
    // iOS 左缘返回手势保护：右滑与该保护不冲突，可保留以避免误触系统返回
    edgeSwipeLock.current = x <= EDGE_GUARD_PX;
    startTimeRef.current = performance.now();
    lastTRef.current = startTimeRef.current;
    lastXRef.current = x;
    dxAccumRef.current = 0;

    setSwipeDistance(0);
    setRightSwipeDistance(0);

    // Begin gesture tracking
  };

  const updateGesture = (x: number, y: number) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (edgeSwipeLock.current) return;

    const dx = x - touchStartX.current;
    const dy = y - touchStartY.current;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const absAngleFromH = Math.min(Math.abs(angle), Math.abs(180 - Math.abs(angle)));

    const t = performance.now();
    const dt = Math.max(1, t - lastTRef.current);
    const vx = lastXRef.current != null ? (x - lastXRef.current) / dt : 0;
    lastXRef.current = x;
    lastTRef.current = t;
    if (dx > 0) dxAccumRef.current += dx;

    if (
      directionLock.current === 'none' &&
      (absX > LOCK_MIN_MOVEMENT || absY > LOCK_MIN_MOVEMENT)
    ) {
      if (absAngleFromH <= ANGLE_DEG_THRESHOLD || absX > absY) {
        directionLock.current = 'right';
      } else {
        directionLock.current = 'up';
      }
      // Direction locked
    }

    if (directionLock.current === 'none') {
      if (vx > RIGHT_VELOCITY_PX_PER_MS || dxAccumRef.current >= RIGHT_LOCK_FALLBACK_DX) {
        directionLock.current = 'right';
        // Fallback lock RIGHT based on velocity
      }
    }

    if (directionLock.current === 'right') {
      if (dx > 0) {
        const distance = Math.min(dx, 160);
        setRightSwipeDistance(distance);
      } else {
        setRightSwipeDistance(0);
      }
      setSwipeDistance(0);
      return;
    }

    if (directionLock.current === 'up') {
      if (dy < 0) setSwipeDistance(Math.min(-dy, 160));
      else setSwipeDistance(0);
      setRightSwipeDistance(0);
      return;
    }
  };

  const endGesture = () => {
    const dir = directionLock.current;
    const rightDist = rightSwipeDistance;
    const upDist = swipeDistance;

    // Gesture ended

    if (dir === 'right' && rightDist > RIGHT_TRIGGER_THRESHOLD) {
      if (!isRightSwipeInProgress.current) {
        isRightSwipeInProgress.current = true;
        uiLog.info('Right swipe triggered library navigation');
        setShowLibraryState(true);
      }
    } else if (dir === 'up' && upDist > UP_TRIGGER_THRESHOLD) {
      if (!isSwipeInProgress.current) {
        isSwipeInProgress.current = true;
        uiLog.info('Up swipe triggered notebook creation');
        void safeTrigger();
      }
    }

    touchStartY.current = null;
    touchStartX.current = null;
    directionLock.current = 'none';
    edgeSwipeLock.current = false;

    window.setTimeout(() => {
      setSwipeDistance(0);
      setRightSwipeDistance(0);
      isSwipeInProgress.current = false;
      isRightSwipeInProgress.current = false;
    }, 300);
  };

  // ====== Touch ======
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isCreatingNotebook || isSwipeInProgress.current || isRightSwipeInProgress.current) return;
      const t = e.touches[0];
      beginGesture(t.clientX, t.clientY);
    },
    [isCreatingNotebook]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isCreatingNotebook || isSwipeInProgress.current || isRightSwipeInProgress.current) return;
      if (touchStartX.current === null || touchStartY.current === null) return;
      if (edgeSwipeLock.current) return;

      updateGesture(e.touches[0].clientX, e.touches[0].clientY);
      if (directionLock.current === 'right') e.preventDefault();
    },
    [isCreatingNotebook]
  );

  const handleTouchEnd = useCallback(() => {
    if (isCreatingNotebook) return;
    endGesture();
  }, [isCreatingNotebook, endGesture]);

  // ====== Pointer（推荐路径）======
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pointerActive = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isCreatingNotebook || isSwipeInProgress.current || isRightSwipeInProgress.current) return;
      pointerActive = true;
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore pointer capture errors
      }
      beginGesture(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerActive) return;
      if (isCreatingNotebook || isSwipeInProgress.current || isRightSwipeInProgress.current) return;
      if (touchStartX.current === null || touchStartY.current === null) return;
      if (edgeSwipeLock.current) return;

      updateGesture(e.clientX, e.clientY);
      if (directionLock.current === 'right') e.preventDefault?.();
    };

    const onPointerUp = () => {
      if (!pointerActive) return;
      pointerActive = false;
      endGesture();
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp, { passive: false });
    el.addEventListener('pointercancel', onPointerUp, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as any);
      el.removeEventListener('pointermove', onPointerMove as any);
      el.removeEventListener('pointerup', onPointerUp as any);
      el.removeEventListener('pointercancel', onPointerUp as any);
    };
  }, [isCreatingNotebook, endGesture]);

  // ====== 横向/纵向滚轮（改为右滚触发） ======
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // 1) 横向主导 & 向右滚动（触控板两指右滑）
      if (absX > absY && e.deltaX > 0) {
        const dx = e.deltaX; // 取正累计
        wheelRightAccumRef.current += dx;

        // 可视反馈：映射到 rightSwipeDistance（上限 160）
        const vis = Math.min(wheelRightAccumRef.current, 160);
        setRightSwipeDistance(vis);
        setSwipeDistance(0);

        // Removed excessive horizontal wheel logging

        // 触发阈值
        if (
          wheelRightAccumRef.current >= RIGHT_TRIGGER_THRESHOLD &&
          !isRightSwipeInProgress.current
        ) {
          isRightSwipeInProgress.current = true;
          uiLog.info('Horizontal wheel scroll triggered library navigation');
          setShowLibraryState(true);
          // 重置累计与视觉
          wheelRightAccumRef.current = 0;
          setTimeout(() => setRightSwipeDistance(0), 300);
          return;
        }

        // “滚轮结束”判定
        if (wheelEndTimerRef.current) window.clearTimeout(wheelEndTimerRef.current);
        wheelEndTimerRef.current = window.setTimeout(() => {
          wheelRightAccumRef.current = 0;
          setRightSwipeDistance(0);
        }, WHEEL_RIGHT_DECAY_MS);

        e.preventDefault();
        return;
      }

      // 2) 纵向滚动（保留创建逻辑）
      if (e.deltaY > 0) {
        wheelDownAccumRef.current += e.deltaY;
        // Removed excessive wheel logging
        if (wheelDownAccumRef.current >= WHEEL_DOWN_TRIGGER) {
          wheelDownAccumRef.current = 0;
          uiLog.info('Vertical wheel scroll triggered notebook creation');
          void safeTrigger();
        }
      } else {
        wheelDownAccumRef.current = Math.max(0, wheelDownAccumRef.current + e.deltaY);
      }
    },
    [safeTrigger]
  );

  // ====== 鼠标长按上滑（保留） ======
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isCreatingNotebook || isSwipeInProgress.current) return;
      if (e.button !== 0) return;

      touchStartY.current = e.clientY;
      setSwipeDistance(0);
      longPressActiveRef.current = false;

      longPressTimerRef.current = window.setTimeout(() => {
        longPressActiveRef.current = true;
        // Long press detected
      }, 300);

      const handleMouseMove = (event: MouseEvent) => {
        if (touchStartY.current === null || isSwipeInProgress.current) return;
        if (!longPressActiveRef.current) return;
        const dy = event.clientY - touchStartY.current;
        if (dy < 0) setSwipeDistance(Math.min(Math.abs(dy), 120));
      };

      const handleMouseUp = () => {
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (
          longPressActiveRef.current &&
          swipeDistance > UP_TRIGGER_THRESHOLD &&
          !isSwipeInProgress.current
        ) {
          isSwipeInProgress.current = true;
          uiLog.info('Long press triggered notebook creation');
          void safeTrigger();
        }
        touchStartY.current = null;
        setSwipeDistance(0);
        longPressActiveRef.current = false;
        window.setTimeout(() => {
          isSwipeInProgress.current = false;
        }, 300);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [swipeDistance, safeTrigger, isCreatingNotebook]
  );

  // 处理 Library 导航
  useEffect(() => {
    if (showLibraryState) {
      navigateToLibrary();
      setShowLibraryState(false);
    }
  }, [showLibraryState]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-start overflow-hidden"
      style={{
        height: 'calc(100vh - 96px)',
        paddingTop: 'calc((100vh - 96px) * 0.35)',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorX: 'contain',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      {/* 右滑提示：fixed，不随内容移动 */}
      {rightSwipeDistance > 0 && (
        <div
          className="fixed right-2 top-1/2 -translate-y-1/2 z-40 pointer-events-none transition-opacity"
          style={{ opacity: rightSwipeDistance > 12 ? 1 : rightSwipeDistance / 12 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-full shadow-lg">
            <ArrowRight className="w-4 h-4" />
            <span className="text-sm whitespace-nowrap">
              {rightSwipeDistance > RIGHT_TRIGGER_THRESHOLD
                ? '松开进入 Library'
                : '右滑查看 Library'}
            </span>
          </div>
        </div>
      )}

      {/* 内层内容：用 rightSwipeDistance/swapDistance 做轻微位移（可选） */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `translateY(${-swipeDistance * 0.4}px) translateX(${rightSwipeDistance * 0.3}px)`,
          transition:
            swipeDistance === 0 && rightSwipeDistance === 0
              ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              : 'none',
        }}
      >
        {/* 上滑提示/创建按钮（保留） */}
        {(swipeDistance > 0 || isCreatingNotebook) && (
          <button
            type="button"
            onClick={() => {
              if (!isCreatingNotebook) void safeTrigger();
            }}
            className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center transition-all duration-300 ease-out cursor-pointer select-none hover:scale-105 active:scale-95"
            style={{
              height: `${Math.max(swipeDistance, isCreatingNotebook ? 120 : 0)}px`,
              opacity: swipeDistance > 20 || isCreatingNotebook ? 1 : swipeDistance / 20,
            }}
            aria-live="polite"
            aria-label="Create a new Notebook"
          >
            {!isCreatingNotebook ? (
              <>
                <div
                  className="w-8 h-8 border-2 border-theme-600 rounded-full flex items-center justify-center transition-all duration-300 ease-out mb-2"
                  style={{
                    transform: `scale(${Math.min(swipeDistance / 70, 1.3)}) rotate(${swipeDistance * 2}deg)`,
                    backgroundColor: swipeDistance > 60 ? '#3b82f6' : 'transparent',
                    boxShadow: swipeDistance > 40 ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                  }}
                >
                  <PlusCircle
                    className={`w-4 h-4 transition-colors duration-200 ${swipeDistance > 60 ? 'text-white' : 'text-theme-600'}`}
                  />
                </div>
                <div className="text-theme-600 text-sm font-medium transition-all duration-300">
                  {swipeDistance > 60
                    ? '✨ 松开或点击创建新的 Notebook'
                    : '👆 上滑 / 点击创建新的 Notebook（滚轮下滑也可触发）'}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-theme-600 rounded-full animate-spin border-t-transparent mb-2" />
                <div className="text-theme-600 text-sm">正在创建新的 Notebook...</div>
              </div>
            )}
          </button>
        )}

        {/* 主体 */}
        <div
          className="w-full max-w-4xl mx-auto px-4 py-6 text-center transition-all duration-500 ease-out"
          style={{
            transform: `translateY(${-Math.min(swipeDistance * 0.2, 20)}px)`,
            marginTop: '0',
          }}
        >
          <Header />
          <AICommandInput files={files} setFiles={setFiles} />
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
