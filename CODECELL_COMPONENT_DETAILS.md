# CodeCell Component Details

## Component Breakdown

### Main Component
**CodeCell.tsx** (254 lines)
- Orchestrates all cell functionality
- Uses 5 custom hooks for state management
- Delegates rendering to 4 main UI components
- Handles high-level event coordination

## Custom Hooks

### 1. useCellState (80 lines)
**Purpose:** Manages cell execution state, display mode, and detached state

**Returns:**
- `isExecuting`, `isCancelling`, `elapsedTime` - Execution state
- `cellMode` - Display mode (Complete/Code Only/Output Only)
- `isDetached`, `isCurrentCell` - View state
- `isDslcCommand`, `showAIdebug` - Special states
- `setCellMode`, `setDetachedCellId` - State setters

### 2. useCodeExecution (85 lines)
**Purpose:** Handles all code execution logic

**Returns:**
- `handleExecute()` - Execute cell code
- `handleCancel()` - Cancel execution
- `handleClearOutput()` - Clear outputs
- `handleChange()` - Update cell content
- `handleRestart()` - Restart kernel
- `handleCopyCode()` - Copy code to clipboard

### 3. useCellNavigation (250 lines)
**Purpose:** Keyboard navigation and focus management

**Features:**
- Arrow key navigation between cells
- Cursor position tracking
- Cross-cell navigation at boundaries
- Focus management with direction memory

**Returns:**
- `handleKeyDown()` - Keyboard event handler
- Cursor position checkers

### 4. useOutputProcessing (58 lines)
**Purpose:** Process and monitor cell outputs

**Features:**
- Output validation and transformation
- Real-time output monitoring during execution
- Animation state management
- DSLC mode output logging

**Returns:**
- `processedOutputs` - Validated output array
- `outputVisible` - Animation state
- `outputUpdateKey` - Re-render trigger

### 5. useCodeExpansion (113 lines)
**Purpose:** Manage code block expand/collapse

**Features:**
- Auto-collapse for large code blocks
- ResizeObserver for height monitoring
- User toggle state tracking
- Smooth scroll on collapse

**Returns:**
- `isExpanded`, `contentHeight` - State
- `handleExpand()`, `handleCollapse()` - Actions
- `codeBlockWrapperRef` - Ref for monitoring

## UI Components

### 1. CellToolbar (221 lines)
**Purpose:** Complete toolbar with all cell controls

**Features:**
- Execute/Cancel button with timer
- Restart kernel button
- Clear outputs button
- Display mode toggle
- Detach/dock button
- Delete cell button
- AI Debug button
- Description tooltip

### 2. CodeEditor (143 lines)
**Purpose:** CodeMirror editor wrapper with controls

**Features:**
- Syntax highlighting (Python)
- Dark theme (Dracula)
- Copy code button (hover)
- Expand/collapse controls
- Height management
- Loading overlay during execution

### 3. OutputDisplay (122 lines)
**Purpose:** Output container and layout management

**Components:**
- ExecutingPlaceholder - Shows during execution
- ThinkingStatus - DSLC mode thinking display
- Output renderers wrapper

**Features:**
- Staggered animation for outputs
- Running indicator during execution
- Flexible layout for detached view

### 4. OutputRenderers (97 lines)
**Purpose:** Specialized output rendering

**Renderers:**
- `ImageOutput` - Displays images with error handling
- `HtmlOutput` - Renders HTML content safely
- `TextOutput` - Text/error with ANSI color support
- `OutputRenderer` - Router to specific renderers

### 5. ExecuteButton (52 lines)
**Purpose:** Execute/Cancel button with state

**States:**
- Play icon when idle
- Stop icon + timer when executing
- Spinner when cancelling

### 6. DisplayModeButton (50 lines)
**Purpose:** Toggle display mode

**Modes:**
- Complete (Layout icon) - Code + Output
- Code Only (Code icon)
- Output Only (Monitor icon)

### 7. CompactModeView (63 lines)
**Purpose:** Compact view for detached cells

**Features:**
- Shows cell is in split view
- Quick close/delete controls
- Description preview

## Utilities

### outputProcessing.ts (63 lines)
**Functions:**
- `processOutput()` - Validates and transforms output objects
- `formatElapsedTime()` - Formats seconds to HH:MM:SS or MM:SS

### types.ts (82 lines)
**Interfaces:**
- `Cell`, `Output` - Data structures
- `CodeCellProps` - Main component props
- `CellToolbarProps` - Toolbar props
- `CodeEditorProps` - Editor props
- `OutputDisplayProps` - Output display props

## Data Flow

```
User Action
    ↓
CodeCell (Main Component)
    ↓
Custom Hooks (State & Logic)
    ↓
UI Components (Rendering)
    ↓
Output to Screen
```

## Import Graph

```
CodeCell.tsx
├── Hooks
│   ├── useCellState → @Store/notebookStore, @Store/codeStore
│   ├── useCodeExecution → @Store/notebookStore, @Store/codeStore
│   ├── useCellNavigation → @Store/notebookStore, @Utils/logger
│   ├── useOutputProcessing → utils/outputProcessing
│   └── useCodeExpansion → (internal state only)
│
└── Components
    ├── CellToolbar → ExecuteButton, DisplayModeButton
    ├── CodeEditor → CodeMirror, lucide-react
    ├── OutputDisplay → OutputRenderers, lucide-react
    ├── OutputRenderers → ansi-up
    ├── ExecuteButton → lucide-react
    ├── DisplayModeButton → lucide-react, @Store/codeStore
    └── CompactModeView → lucide-react
```

## State Management

### Global State (Zustand)
- **notebookStore** - Cell data, current cell, detached state
- **codeStore** - Execution state, display modes, kernel state

### Local State (useState)
- `showThinking` - Thinking status visibility
- `showToolbar` - Toolbar hover state

### Refs (useRef)
- `editorRef` - CodeMirror instance
- `codeContainerRef` - Container for scrolling
- `codeBlockWrapperRef` - For ResizeObserver

## Event Handling

### Keyboard Events
- `Ctrl+Enter` - Execute cell
- `Alt+↑/↓` - Navigate cells
- `↑/↓` - Cross-cell navigation at boundaries
- `←/→` - Cross-cell at document edges

### Mouse Events
- `onMouseEnter/Leave` - Toolbar visibility
- `onClick` - All button actions
- `onChange` - Code content updates

### Custom Events
- `cell-navigation` - Cross-cell navigation coordination

## Performance Optimizations

1. **React.memo** - Prevents unnecessary re-renders
2. **useCallback** - Memoizes event handlers
3. **useMemo** - Caches expensive computations
4. **ResizeObserver** - Efficient height monitoring with debounce
5. **Staggered animations** - Smooth output rendering

## Accessibility

- Keyboard navigation support
- ARIA labels on buttons
- Semantic HTML structure
- Focus management
- Error states clearly indicated

## Browser Compatibility

- Modern browsers (ES2020+)
- CodeMirror v6 support
- ResizeObserver API
- CSS Grid/Flexbox

## Dependencies

### External
- `react` - Framework
- `@uiw/react-codemirror` - Code editor
- `@codemirror/lang-python` - Python syntax
- `@uiw/codemirror-theme-dracula` - Editor theme
- `lucide-react` - Icons
- `ansi-up` - ANSI color codes
- `react-markdown` - Markdown rendering

### Internal
- `@Store/notebookStore` - Cell data store
- `@Store/codeStore` - Execution state store
- `@Utils/logger` - Logging utilities

## Testing Recommendations

### Unit Tests
- Test each hook independently
- Test utility functions
- Test output renderers

### Component Tests
- Test button interactions
- Test keyboard navigation
- Test display mode changes

### Integration Tests
- Test full cell execution flow
- Test detached view interactions
- Test DSLC mode behavior

## Migration Notes

### Breaking Changes
None - All functionality preserved

### Upgrade Path
1. Update imports if using CodeCell internals
2. New exports available for reuse:
   ```typescript
   import { useCellState, OutputDisplay } from '@Editor/Cells';
   ```

### Backwards Compatibility
✅ 100% compatible with existing usage

---

**Last Updated:** November 4, 2025
