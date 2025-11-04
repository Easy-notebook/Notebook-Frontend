# TipTap Notebook Editor - Refactored Structure

This directory contains the refactored TipTap editor implementation, split into focused modules for better maintainability.

## Directory Structure

```
TipTap/
├── hooks/                          # Custom React hooks
│   ├── useBeforeUnload.ts         # Emergency save on page unload
│   ├── useCellManagement.ts       # Cell creation and management
│   ├── useEditorEvents.ts         # Editor lifecycle events
│   ├── useEditorSync.ts           # Bidirectional cell/editor sync
│   ├── useKeyboardHandlers.ts     # Keyboard shortcuts
│   └── useLinkHandler.ts          # Link click handling
├── config/                         # Configuration modules
│   ├── extensions.ts              # TipTap extensions setup
│   └── editorPlugins.ts           # ProseMirror plugins
├── components/                     # UI components
│   └── EditorStyles.tsx           # CSS styles
├── BlockManager/                   # Drag and drop functionality
│   └── SimpleDragManager.tsx
├── TipTapSlashCommands.tsx        # Slash command menu
├── useTipTapSlashCommands.ts      # Slash command logic
└── types.ts                        # TypeScript types
```

## Main Files

### TiptapNotebookEditor.tsx (214 lines, down from 1,579)
The main container component that orchestrates all functionality:
- Initializes editor with configuration
- Coordinates hooks and events
- Exposes imperative API via ref
- Minimal business logic, acts as thin wrapper

## Hooks

### useCellManagement.ts (86 lines)
Manages cell operations:
- `addCodeCell()` - Create new code cell
- `addMarkdownCell()` - Create new markdown cell
- `addHybridCell()` - Create new hybrid cell
- `addRawCell()` - Create new raw cell
- `addAIThinkingCell()` - Create new AI thinking cell

### useEditorEvents.ts (247 lines)
Handles TipTap editor lifecycle:
- `onCreate` - Editor initialization
- `onDestroy` - Cleanup and final save
- `onTransaction` - Code block input rules
- `onUpdate` - Content change detection and sync
- `onBlur` - Force save on focus loss

### useEditorSync.ts (157 lines)
Bidirectional synchronization:
- Syncs external cell changes to editor
- Handles thinking cell updates
- Smart change detection
- Prevents circular updates

### useKeyboardHandlers.ts (51 lines)
Keyboard shortcuts:
- Tab key handling
- Ctrl/Cmd+End - Jump to end
- Ctrl/Cmd+Home - Jump to start

### useLinkHandler.ts (120 lines)
Link interaction:
- Split preview for file links
- Cursor positioning in blank areas
- Fallback handling for missing files

### useBeforeUnload.ts (86 lines)
Emergency save:
- Detects unsaved changes
- Forces immediate save on page unload
- Integrates with auto-save system

## Configuration

### extensions.ts (139 lines)
TipTap extensions configuration:
- Core extensions (StarterKit, Link, Table)
- Custom cell extensions (Code, Thinking, Image, LaTeX)
- WikiLink input rules
- Heading with ID preservation

### editorPlugins.ts (208 lines)
ProseMirror plugins:
- `CursorStyleExtension` - Dynamic cursor colors
- `TrailingParagraphExtension` - Always end with paragraph
- `EnhancedCursorPositionExtension` - Smart click handling

## Components

### EditorStyles.tsx (273 lines)
All CSS styles:
- Editor base styles
- Cell type styles (code, thinking, tables)
- Cursor styles by node type
- LaTeX and image styles

## Benefits of Refactoring

### Before
- **1,579 lines** in a single file
- Mixed concerns (UI, logic, config)
- Hard to test individual pieces
- Difficult to navigate

### After
- **214 lines** in main component
- Clear separation of concerns
- Each hook/config testable independently
- Easy to find and modify specific functionality

## Usage

```tsx
import TiptapNotebookEditor, { TiptapNotebookEditorRef } from '@Editor/TiptapNotebookEditor'

function NotebookComponent() {
  const editorRef = useRef<TiptapNotebookEditorRef>(null)

  const handleAddCodeCell = () => {
    const cellId = editorRef.current?.addCodeCell()
    console.log('Created cell:', cellId)
  }

  return (
    <TiptapNotebookEditor
      ref={editorRef}
      placeholder="Start writing..."
      className="custom-class"
    />
  )
}
```

## API Reference

### Props
- `className?: string` - CSS class for editor
- `placeholder?: string` - Placeholder text
- `readOnly?: boolean` - Read-only mode

### Ref Methods
- `focus()` - Focus editor at end
- `getHTML()` - Get HTML content
- `setContent(html)` - Set HTML content
- `clearContent()` - Clear all content
- `isEmpty()` - Check if empty
- `getCells()` - Get cell array
- `setCells(cells)` - Set cell array
- `addCodeCell()` - Add code cell
- `addMarkdownCell()` - Add markdown cell
- `addHybridCell()` - Add hybrid cell
- `addRawCell()` - Add raw cell
- `addAIThinkingCell()` - Add AI thinking cell

## Path Aliases

The codebase uses path aliases for clean imports:
- `@Editor/` → `src/components/Editor/`
- `@Store/` → `src/store/`
- `@Services/` → `src/services/`
- `@Utils/` → `src/utils/`
- `@Config/` → `src/config/`

## Testing

Each hook can now be tested independently:

```typescript
import { renderHook } from '@testing-library/react-hooks'
import { useCellManagement } from './hooks/useCellManagement'

test('adds code cell', () => {
  const { result } = renderHook(() => useCellManagement({ cells: [], setCells: jest.fn() }))
  const cellId = result.current.addCodeCell()
  expect(cellId).toBeTruthy()
})
```

## Future Improvements

1. **Extract more specialized hooks**
   - `useAutoSave` - Auto-save logic
   - `useImageGeneration` - Image cell generation
   - `useThinkingCellUpdates` - Thinking cell state

2. **Add unit tests**
   - Test each hook independently
   - Test plugin behavior
   - Test sync logic

3. **Performance optimization**
   - Memoize expensive computations
   - Optimize re-render triggers
   - Profile and optimize hot paths

4. **Documentation**
   - Add JSDoc comments
   - Create usage examples
   - Document edge cases
