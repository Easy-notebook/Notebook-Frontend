# Migration Guide: Old streamHandler.ts → New Stream Service

## Overview

This guide helps you migrate code from the old monolithic `streamHandler.ts` to the new modular stream service architecture.

## Quick Migration

### For Consumers (99% of cases)

If you're just importing and using the handler:

**Before:**
```typescript
import { handleStreamResponse } from '@Services/streamHandler';
```

**After:**
```typescript
import { handleStreamResponse } from '@Services/stream';
```

That's it! The API is 100% backward compatible.

## For Contributors: Adding New Stream Types

### Old Way (streamHandler.ts)

Adding a new stream type required:
1. Finding the giant switch statement (1569 lines)
2. Adding a new case
3. Implementing logic inline (50-200 lines)
4. Hoping you didn't break anything

**Example:**
```typescript
// In streamHandler.ts line 1234
export const handleStreamResponse = async (data, showToast) => {
  switch (data.type) {
    // ... 40+ existing cases ...

    case 'my_new_type': {  // New case added here
      const payload = data.payload;
      // 100+ lines of logic...
      break;
    }

    // ... more cases ...
  }
};
```

### New Way (Stream Service)

Adding a new stream type:
1. Create a new action class file
2. Implement execute() method
3. Register the action
4. Done!

**Example:**
```typescript
// In services/stream/actions/myCategory/MyAction.ts
import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class MyAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    // Your logic here (well-organized, isolated)
    console.log('Handling my_new_type:', payload);

    await showToast({
      message: 'Success!',
      type: 'success',
    });
  }
}

registerStreamAction('my_new_type', MyAction);

// Export in index.ts
export * from './MyAction';
```

## Detailed Migration Examples

### Example 1: Simple Stream Type

**Old Code (in streamHandler.ts):**
```typescript
case 'update_view_mode': {
  const mode = normalizedData.payload?.mode;
  if (mode) {
    await globalUpdateInterface.setViewMode(mode as any);
    await showToast({
      message: `切换到 ${mode === 'create' ? 'Create' : 'Step'} Mode 成功`,
      type: 'success',
    });
  }
  break;
}
```

**New Code:**
```typescript
// services/stream/actions/view/UpdateViewModeAction.ts
import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateViewModeAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const mode = payload.mode;

    if (mode) {
      await globalUpdateInterface.setViewMode(mode as any);
      await showToast({
        message: `切换到 ${mode === 'create' ? 'Create' : 'Step'} Mode 成功`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('update_view_mode', UpdateViewModeAction);
```

### Example 2: Using Global State (Generation Tracker)

**Old Code:**
```typescript
// At top of file
const generationCellTracker = new Map<string, string>();

// In a case
case 'addCell2EndWithContent': {
  // ... create cell logic ...
  if (newCellId && commandId) {
    generationCellTracker.set(commandId, newCellId);
  }
  break;
}
```

**New Code:**
```typescript
// services/stream/actions/cell/AddCellAction.ts
import { generationTracker } from '../../managers/GenerationTracker';

export class AddCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    // ... create cell logic ...
    if (newCellId && commandId) {
      generationTracker.trackCell(commandId, newCellId);
    }
  }
}
```

### Example 3: Using Video Polling

**Old Code:**
```typescript
// At top of file
const activeVideoPolls = new Map<string, number>();

const startVideoGenerationPolling = async (taskId, uniqueIdentifier, ...) => {
  // Polling logic...
  const pollInterval = setInterval(() => { ... }, 10000);
  activeVideoPolls.set(taskId, pollInterval);
};

// In a case
case 'video_generation_task_started': {
  startVideoGenerationPolling(taskId, uniqueIdentifier, commandId, prompt);
  break;
}
```

**New Code:**
```typescript
// services/stream/actions/generation/VideoGenerationTaskStartedAction.ts
import { videoPollingManager } from '../../managers/VideoPollingManager';

export class VideoGenerationTaskStartedAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    await videoPollingManager.startPolling({
      taskId: payload.taskId,
      uniqueIdentifier: payload.uniqueIdentifier,
      commandId: payload.commandId,
      prompt: payload.prompt,
    });
  }
}
```

## Common Patterns

### Pattern 1: Accessing Payload

**Old:**
```typescript
const payload = normalizedData.payload || data.data?.payload;
const content = payload?.content;
```

**New:**
```typescript
const { payload } = context;
const content = payload.content;
```
*(Normalization is done in StreamHandler)*

### Pattern 2: Showing Toasts

**Old:**
```typescript
await showToast({ message: 'Success', type: 'success' });
```

**New:**
```typescript
const { showToast } = context;
await showToast({ message: 'Success', type: 'success' });
```

### Pattern 3: Accessing Stores

**Old:**
```typescript
const notebookState = useStore.getState();
```

**New:**
```typescript
import useStore from '@Store/notebookStore';
const notebookState = useStore.getState();
```
*(Same - no change needed)*

## Testing Your Migration

### Step 1: Create a Test File

```typescript
// services/stream/actions/__tests__/MyAction.test.ts
import { MyAction } from '../myCategory/MyAction';

describe('MyAction', () => {
  it('should handle stream correctly', async () => {
    const mockContext = {
      data: { type: 'my_type', payload: {} },
      payload: { /* test data */ },
      showToast: jest.fn(),
    };

    const action = new MyAction();
    await action.execute(mockContext);

    expect(mockContext.showToast).toHaveBeenCalled();
  });
});
```

### Step 2: Run Tests

```bash
npm test -- MyAction.test.ts
```

## Migration Checklist

When migrating a stream type from old to new:

- [ ] Create new action class file
- [ ] Implement `execute()` method with same logic
- [ ] Replace global state access with managers
- [ ] Use `context.payload` instead of manual normalization
- [ ] Use `context.showToast` for notifications
- [ ] Register action with `registerStreamAction()`
- [ ] Export from category index
- [ ] Import in main actions index
- [ ] Write unit test
- [ ] Test in development environment
- [ ] Remove old case from streamHandler.ts (if applicable)

## Rollback Plan

If issues arise, you can quickly rollback:

1. Revert imports back to old handler:
   ```typescript
   import { handleStreamResponse } from '@Services/streamHandler';
   ```

2. Keep both handlers during transition period

3. Use feature flag to switch between handlers:
   ```typescript
   const handler = USE_NEW_STREAM_HANDLER
     ? handleStreamResponse  // from @Services/stream
     : handleStreamResponseLegacy;  // from @Services/streamHandler
   ```

## Support

For questions or issues during migration:
1. Check the [README.md](./README.md) for architecture details
2. Look at existing actions for examples
3. Review the old streamHandler.ts for comparison
4. Ask the team for help!
