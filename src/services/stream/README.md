# Stream Service Architecture

## Overview

The Stream Service is a refactored, OOP-based system for handling real-time stream responses in the Notebook Frontend. It replaces the monolithic `streamHandler.ts` with a modular, extensible architecture following the action pattern used in Workflow actions.

## Architecture

### Directory Structure

```
services/stream/
├── StreamHandler.ts              # Main orchestrator
├── types.ts                      # Shared type definitions
├── actions/                      # Stream action handlers
│   ├── base.ts                   # StreamAction base class & registry
│   ├── index.ts                  # Action registration & exports
│   ├── cell/                     # Cell management actions
│   │   ├── AddCellAction.ts
│   │   ├── UpdateCellAction.ts
│   │   ├── UpdateCellMetadataAction.ts
│   │   └── index.ts
│   ├── qa/                       # QA streaming actions
│   │   ├── InitStreamingAnswerAction.ts
│   │   ├── AddContentToAnswerAction.ts
│   │   ├── FinishStreamingAnswerAction.ts
│   │   └── index.ts
│   └── generation/               # Content generation actions
│       ├── TriggerVideoGenerationAction.ts
│       ├── VideoGenerationTaskStartedAction.ts
│       ├── VideoGenerationStatusUpdateAction.ts
│       └── index.ts
└── managers/                     # State managers
    ├── GenerationTracker.ts      # Manages cell generation tracking
    ├── VideoPollingManager.ts    # Manages video polling
    └── QAStreamManager.ts        # Manages QA streaming state
```

## Core Concepts

### 1. Stream Actions

Each stream type is handled by a dedicated action class that extends `StreamAction`:

```typescript
export class AddCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    // Handle addCell2EndWithContent logic
  }
}

registerStreamAction('addCell2EndWithContent', AddCellAction);
```

**Benefits:**
- Single Responsibility: Each action handles one stream type
- Easy to test: Actions are isolated and mockable
- Easy to extend: Just add new action classes
- Type-safe: Full TypeScript support

### 2. State Managers

Managers encapsulate related state and operations:

#### GenerationTracker
```typescript
// Replaces global generationCellTracker Map
const tracker = GenerationTracker.getInstance();
tracker.trackCell('commandId', 'cellId');
const cellId = tracker.getCellId('commandId');
```

#### VideoPollingManager
```typescript
// Replaces global activeVideoPolls Map
const manager = VideoPollingManager.getInstance();
await manager.startPolling({ taskId, uniqueIdentifier, commandId, prompt });
manager.stopPolling(taskId);
```

#### QAStreamManager
```typescript
// Replaces global lastStreamingQaId
const manager = QAStreamManager.getInstance();
manager.setStreamingQaId('qa-123');
const qaId = manager.getStreamingQaId();
```

**Benefits:**
- Encapsulation: State is private, only accessed through methods
- Testability: Easy to mock for tests
- Singleton pattern: Single source of truth
- Type-safe: Full TypeScript support

### 3. StreamHandler

The main orchestrator that dispatches stream events to actions:

```typescript
const handler = StreamHandler.getInstance();
await handler.handleStream(streamData, showToast);
```

**Flow:**
1. Normalize incoming stream data
2. Create action context
3. Look up registered action for stream type
4. Execute action with context
5. Handle errors gracefully

## Migrating from Old to New

### Old Code (streamHandler.ts)
```typescript
export const handleStreamResponse = async (data: StreamData, showToast: ShowToastFunction) => {
  switch (data.type) {
    case 'addCell2EndWithContent':
      // 150 lines of logic here...
      break;
    case 'updateCurrentCellWithContent':
      // 100 lines of logic here...
      break;
    // ... 40+ more cases
  }
};
```

### New Code (StreamHandler.ts)
```typescript
export const handleStreamResponse = async (data: StreamData, showToast: ShowToastFunction) => {
  const handler = StreamHandler.getInstance();
  await handler.handleStream(data, showToast);
};
```

The old 1569-line switch statement is replaced with a clean action dispatch system.

## Adding New Actions

### Step 1: Create Action Class

```typescript
// actions/myCategory/MyNewAction.ts
import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class MyNewAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    // Your logic here
    console.log('Handling my_new_stream_type:', payload);

    await showToast({
      message: 'Action completed!',
      type: 'success',
    });
  }
}

registerStreamAction('my_new_stream_type', MyNewAction);
```

### Step 2: Export from Category Index

```typescript
// actions/myCategory/index.ts
export * from './MyNewAction';
```

### Step 3: Import in Main Index

```typescript
// actions/index.ts
import * as myCategory from './myCategory';
export { myCategory };
```

That's it! The action is now automatically registered and will be called when `my_new_stream_type` is received.

## Registered Actions

### Cell Actions
- `addCell2EndWithContent` - Create new cell with content
- `updateCurrentCellWithContent` - Update cell content
- `updateCurrentCellMetadata` - Update cell metadata

### QA Actions
- `initStreamingAnswer` - Initialize streaming QA response
- `addContentToAnswer` - Add content chunk to streaming answer
- `finishStreamingAnswer` - Complete streaming answer

### Generation Actions
- `trigger_video_generation` - Trigger video generation
- `video_generation_task_started` - Handle video task start
- `video_generation_status_update` - Handle video status update

## Testing

### Unit Testing Actions

```typescript
import { AddCellAction } from './actions/cell/AddCellAction';
import type { StreamActionContext } from './types';

describe('AddCellAction', () => {
  it('should create a new cell', async () => {
    const mockContext: StreamActionContext = {
      data: { type: 'addCell2EndWithContent', payload: { ... } },
      payload: { type: 'markdown', description: 'Test' },
      showToast: jest.fn(),
    };

    const action = new AddCellAction();
    await action.execute(mockContext);

    // Assertions...
  });
});
```

### Integration Testing

```typescript
import { StreamHandler } from './StreamHandler';

describe('StreamHandler', () => {
  it('should dispatch to correct action', async () => {
    const handler = StreamHandler.getInstance();
    const mockToast = jest.fn();

    await handler.handleStream({
      type: 'addCell2EndWithContent',
      payload: { type: 'markdown', description: 'Test' }
    }, mockToast);

    // Assertions...
  });
});
```

## Benefits of New Architecture

### 1. Maintainability
- Each action is in its own file (50-150 lines vs 1569-line switch)
- Easy to find and modify specific functionality
- Clear separation of concerns

### 2. Extensibility
- Add new stream types by creating new action classes
- No need to modify core handler code
- Plugin-like architecture

### 3. Testability
- Actions can be tested in isolation
- Managers can be mocked easily
- Clear dependencies and interfaces

### 4. Type Safety
- Full TypeScript support throughout
- Compile-time checking for action parameters
- IDE autocomplete and refactoring support

### 5. Debugging
- Clear action execution logs
- Easy to trace which action handled which stream
- Isolated error handling per action

## Migration Strategy

The old `streamHandler.ts` has been preserved (can be renamed to `streamHandler.legacy.ts`). The new system is backward compatible through the same export signature:

```typescript
export const handleStreamResponse = async (data, showToast) => { ... }
```

**Migration Steps:**
1. ✅ Create new action-based architecture
2. ✅ Implement core actions (cell, QA, generation)
3. ⏳ Implement remaining actions from old handler
4. ⏳ Update all imports to use new handler
5. ⏳ Remove old handler after full migration

## Future Enhancements

- [ ] Add remaining stream action types from old handler
- [ ] Add view/UI actions
- [ ] Add workflow actions
- [ ] Add comprehensive test coverage
- [ ] Add action middleware support (logging, analytics, etc.)
- [ ] Add action composition/chaining support
- [ ] Performance monitoring and metrics

## Related Documentation

- [Workflow Actions](../../components/Scenario/Workflow/actions/README.md)
- [Service Layer Architecture](../README.md)
- [Agent Memory Service](../agentMemoryService.ts)
