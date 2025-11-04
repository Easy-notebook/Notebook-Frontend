# CodeCell Quick Reference Guide

## 📁 File Structure

```
CodeCell/
├── hooks/           # Business logic & state management
├── components/      # UI components
└── utils/          # Utilities & types
```

## 🎣 Hooks Usage

### Import Hooks
```typescript
import {
    useCellState,
    useCodeExecution,
    useCellNavigation,
    useOutputProcessing,
    useCodeExpansion,
} from './CodeCell/hooks';
```

### Example Usage
```typescript
// Cell state & execution
const { isExecuting, cellMode, isDetached } = useCellState(cell, isDemoMode);
const { handleExecute, handleCancel } = useCodeExecution(cell, dslcMode, isDslcCommand);

// Navigation
const { handleKeyDown } = useCellNavigation(cell, editorRef, isCurrentCell, dslcMode);

// Outputs
const { processedOutputs, outputVisible } = useOutputProcessing(cell, isExecuting, dslcMode);

// Code expansion
const { isExpanded, handleExpand, handleCollapse } = useCodeExpansion(cell, outputs, isInDetachedView);
```

## 🎨 Components Usage

### Import Components
```typescript
import {
    CellToolbar,
    CodeEditor,
    OutputDisplay,
    CompactModeView,
    ExecuteButton,
    DisplayModeButton,
} from './CodeCell/components';
```

### Example Usage
```typescript
// Toolbar
<CellToolbar
    isExecuting={isExecuting}
    cellMode={cellMode}
    onExecute={handleExecute}
    onCancel={handleCancel}
    {...otherProps}
/>

// Editor
<CodeEditor
    cell={cell}
    isExecuting={isExecuting}
    onChange={handleChange}
    onKeyDown={handleKeyDown}
    {...otherProps}
/>

// Output Display
<OutputDisplay
    outputs={processedOutputs}
    isExecuting={isExecuting}
    outputVisible={outputVisible}
    {...otherProps}
/>
```

## 🔧 Utilities

### Import Utilities
```typescript
import { processOutput, formatElapsedTime, EXPAND_THRESHOLD } from './CodeCell/utils';
```

### Example Usage
```typescript
// Process output
const validOutput = processOutput(rawOutput);

// Format time
const timeString = formatElapsedTime(120); // "2:00"

// Check threshold
if (height > EXPAND_THRESHOLD) {
    // Code is large, show expand/collapse
}
```

## 📝 Types

### Import Types
```typescript
import type {
    Cell,
    Output,
    CodeCellProps,
    CellToolbarProps,
    CodeEditorProps,
    OutputDisplayProps,
} from './CodeCell/utils/types';
```

## 🔑 Key Features

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute cell |
| `Alt+↑/↓` | Navigate cells |
| `↑/↓` | Cross-cell at line boundaries |
| `←/→` | Cross-cell at doc boundaries |

### Display Modes
1. **Complete** - Code + Output (Layout icon)
2. **Code Only** - Just code (Code icon)
3. **Output Only** - Just output (Monitor icon)

### Cell States
- **Idle** - Ready to execute
- **Executing** - Running code (yellow border)
- **Cancelling** - Stopping execution
- **Detached** - Opened in split view

## 🎯 Common Tasks

### Add New Feature to Toolbar
1. Create button component in `components/`
2. Import in `CellToolbar.tsx`
3. Add to toolbar render

### Add New Hook
1. Create hook file in `hooks/`
2. Export from `hooks/index.ts`
3. Use in `CodeCell.tsx`

### Add New Output Type
1. Add renderer in `OutputRenderers.tsx`
2. Update `Output` type in `types.ts`
3. Add case in `OutputRenderer`

### Modify Navigation Behavior
1. Edit `useCellNavigation.ts`
2. Update `handleKeyDown` function
3. Test with different cell types

## 🐛 Debugging

### Enable Logging
```typescript
// In useOutputProcessing.ts
console.log('Outputs:', processedOutputs);

// In useCellNavigation.ts
editorLogger.logNavigationAttempt(cell.id, 'code', direction, cursorInfo);
```

### Check State
```typescript
// Cell execution state
const cellExec = getCellExecState(cell.id);
console.log('Execution state:', cellExec);

// Display mode
console.log('Cell mode:', cellMode);
```

### Monitor Outputs
```typescript
useEffect(() => {
    console.log('Outputs updated:', processedOutputs);
}, [processedOutputs]);
```

## 🧪 Testing Guide

### Test Hooks
```typescript
import { renderHook } from '@testing-library/react';
import { useCellState } from './hooks';

test('useCellState returns correct state', () => {
    const { result } = renderHook(() => useCellState(cell, false));
    expect(result.current.isExecuting).toBe(false);
});
```

### Test Components
```typescript
import { render, screen } from '@testing-library/react';
import { ExecuteButton } from './components';

test('ExecuteButton shows play icon when not executing', () => {
    render(<ExecuteButton isExecuting={false} {...props} />);
    expect(screen.getByTitle('Execute cell')).toBeInTheDocument();
});
```

## 📊 Performance Tips

1. **Use React.memo** for child components
2. **Memoize callbacks** with useCallback
3. **Cache computed values** with useMemo
4. **Avoid inline functions** in render
5. **Use key prop** for list items

## 🔄 State Flow

```
User Input
    ↓
Event Handler (CodeCell.tsx)
    ↓
Hook (business logic)
    ↓
Store Update (Zustand)
    ↓
Component Re-render
    ↓
UI Update
```

## 📦 Exports

### From `hooks/index.ts`
- useCellState
- useCodeExecution
- useCellNavigation
- useOutputProcessing
- useCodeExpansion

### From `components/index.ts`
- CellToolbar
- CodeEditor
- OutputDisplay
- CompactModeView
- ExecuteButton
- DisplayModeButton
- OutputRenderer
- ImageOutput
- HtmlOutput
- TextOutput

### From `utils/index.ts`
- processOutput
- formatElapsedTime
- EXPAND_THRESHOLD
- All types

## 🔗 Related Files

- `/store/notebookStore.ts` - Cell data
- `/store/codeStore.ts` - Execution state
- `/utils/logger/editor_logger.ts` - Logging

---

**Quick Start:** Import what you need from `@Editor/Cells/CodeCell/*`
