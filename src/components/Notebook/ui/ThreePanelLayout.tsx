// src/components/Notebook/components/ThreePanelLayout.tsx
// Unified three-panel layout system using react-resizable-panels

import { ReactNode, useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Card } from '@/components/UI/card';

// Inject global styles for react-resizable-panels
const injectPanelStyles = () => {
  const styleId = 'three-panel-layout-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Ensure the group takes full space */
    [data-panel-group] {
      box-sizing: border-box !important;
      overflow: hidden !important;
      width: 100% !important;
      max-width: 100% !important;
      display: flex !important;
    }
    /* Let the library manage panel sizing via inline styles (flex-basis). */
    [data-panel] {
      box-sizing: border-box !important;
      overflow: hidden !important;
      /* Do NOT force width here; it breaks sizing */
    }
    [data-panel] > * {
      box-sizing: border-box !important;
      /* Children can fill naturally; avoid width overrides */
    }
    [data-panel-resize-handle] {
      flex-shrink: 0 !important;
      width: 6px !important;
    }
  `;
  document.head.appendChild(style);
};

interface ThreePanelLayoutProps {
  // Panel visibility
  showLeft: boolean;
  showRight: boolean;

  // Panel content (centerPanel is optional - use for left+right only layouts)
  leftPanel?: ReactNode;
  centerPanel?: ReactNode;
  rightPanel?: ReactNode;

  // Panel size constraints
  leftMinSize?: number;
  leftMaxSize?: number;
  leftDefaultSize?: number;

  rightMinSize?: number;
  rightMaxSize?: number;
  rightDefaultSize?: number;

  centerMinSize?: number;

  // Storage key for persistence
  storageKey?: string;

  // Custom class names
  className?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;

  // Wrapper options
  wrapPanelsInCard?: boolean;
  centerOverflowHidden?: boolean;
}

export const ThreePanelLayout = ({
  showLeft,
  showRight,
  leftPanel,
  centerPanel,
  rightPanel,
  leftMinSize = 15,
  leftMaxSize = 50,
  leftDefaultSize = 25,
  rightMinSize = 15,
  rightMaxSize = 50,
  rightDefaultSize = 25,
  centerMinSize = 30,
  storageKey = 'three-panel-layout',
  className = '',
  leftClassName = '',
  centerClassName = '',
  rightClassName = '',
  wrapPanelsInCard = true,
  centerOverflowHidden = false,
}: ThreePanelLayoutProps) => {
  // Calculate default sizes based on visible panels
  const getDefaultSizes = () => {
    const hasCenter = centerPanel !== null && centerPanel !== undefined;

    if (showLeft && showRight && hasCenter) {
      // All three panels visible
      return {
        left: leftDefaultSize,
        center: 100 - leftDefaultSize - rightDefaultSize,
        right: rightDefaultSize,
      };
    } else if (showLeft && showRight && !hasCenter) {
      // Only left and right (no center) - two panel layout
      return {
        left: leftDefaultSize,
        center: 0,
        right: 100 - leftDefaultSize,
      };
    } else if (showLeft && hasCenter) {
      // Only left and center
      return {
        left: leftDefaultSize,
        center: 100 - leftDefaultSize,
        right: 0,
      };
    } else if (showRight && hasCenter) {
      // Only center and right
      return {
        left: 0,
        center: 100 - rightDefaultSize,
        right: rightDefaultSize,
      };
    } else if (hasCenter) {
      // Only center
      return {
        left: 0,
        center: 100,
        right: 0,
      };
    } else if (showLeft) {
      // Only left
      return {
        left: 100,
        center: 0,
        right: 0,
      };
    } else if (showRight) {
      // Only right
      return {
        left: 0,
        center: 0,
        right: 100,
      };
    } else {
      // Nothing visible
      return {
        left: 0,
        center: 0,
        right: 0,
      };
    }
  };

  const sizes = getDefaultSizes();
  const hasCenter = centerPanel !== null && centerPanel !== undefined;

  // Inject styles on mount
  useEffect(() => {
    injectPanelStyles();
  }, []);

  const wrapContent = (
    content: ReactNode,
    panelClassName: string,
    isCenter = false,
    isRight = false
  ) => {
    // For center panel, respect centerOverflowHidden parameter
    // For right panel, always enforce overflow-x-hidden to prevent width issues
    const overflowClass =
      isCenter && !centerOverflowHidden
        ? ''
        : isRight
          ? 'overflow-x-hidden overflow-y-auto'
          : 'overflow-hidden';

    // For right panel, add strict width constraints to prevent internal components from breaking layout
    const strictWidthStyle = isRight
      ? {
          maxWidth: '100%',
          minWidth: 0,
          width: '100%',
        }
      : {};

    if (wrapPanelsInCard) {
      return (
        <Card
          className={`h-full flex flex-col ${overflowClass} ${panelClassName}`}
          style={{ boxSizing: 'border-box', ...strictWidthStyle }}
        >
          {content}
        </Card>
      );
    }
    return (
      <div
        className={`h-full ${overflowClass} ${panelClassName}`}
        style={{ boxSizing: 'border-box', ...strictWidthStyle }}
      >
        {content}
      </div>
    );
  };

  return (
    <div
      className={`h-full w-full overflow-hidden ${className}`}
      style={{ boxSizing: 'border-box', maxWidth: '100%', position: 'relative' }}
    >
      <PanelGroup
        key={`${storageKey}-${showLeft ? 'L' : ''}${hasCenter ? 'C' : ''}${showRight ? 'R' : ''}`}
        direction="horizontal"
        id={storageKey}
        autoSaveId={storageKey}
        className="h-full w-full"
        style={{
          boxSizing: 'border-box',
          maxWidth: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
        }}
      >
        {/* Left Panel */}
        {showLeft && leftPanel && (
          <Panel
            id={`${storageKey}-left`}
            defaultSize={sizes.left}
            minSize={leftMinSize}
            maxSize={leftMaxSize}
            order={1}
          >
            {wrapContent(leftPanel, leftClassName)}
          </Panel>
        )}

        {/* Center Panel - only render if centerPanel is provided */}
        {hasCenter && (
          <>
            {showLeft && leftPanel && (
              <PanelResizeHandle className="w-1.5 bg-transparent hover:bg-primary/50 transition-all duration-150 rounded-full cursor-col-resize" />
            )}
            <Panel
              id={`${storageKey}-center`}
              defaultSize={sizes.center}
              minSize={centerMinSize}
              order={2}
            >
              {wrapContent(centerPanel, centerClassName, true)}
            </Panel>
          </>
        )}

        {/* Right Panel */}
        {showRight && rightPanel && (
          <>
            {(showLeft && leftPanel) || (hasCenter && centerPanel) ? (
              <PanelResizeHandle className="w-1.5 bg-transparent hover:bg-primary/50 transition-all duration-150 rounded-full cursor-col-resize" />
            ) : null}
            <Panel
              id={`${storageKey}-right`}
              defaultSize={sizes.right}
              minSize={rightMinSize}
              maxSize={rightMaxSize}
              order={3}
              style={{ overflow: 'hidden' }}
            >
              {wrapContent(rightPanel, rightClassName, false, true)}
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
};
