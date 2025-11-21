# Action Execution Testing Guide

This guide explains how to test action execution at the component/function level.

## 📋 Overview

We've created several utilities to test and verify that actions from the backend can be properly executed:

1. **`action-execution-test.ts`** - Core testing utilities
2. **`workflowInitializer.ts`** - System initialization and verification
3. **`ActionExecutionDemo.tsx`** - Visual UI component for testing

## 🚀 Quick Start

### Option 1: Visual Component Testing

1. Import the demo component in your app:

```tsx
import ActionExecutionDemo from '@/components/Scenario/Workflow/__tests__/ActionExecutionDemo';

function TestPage() {
  return (
    <div>
      <ActionExecutionDemo />
    </div>
  );
}
```

2. Navigate to the test page in your browser
3. Click buttons to test different action types
4. Check console and notebook cells to verify execution

### Option 2: Browser Console Testing

Open your browser console and use the global utilities:

```javascript
// Test single action
await window.actionTest.testActionExecution({
  action: 'add',
  shotType: 'text',
  content: '# Hello World',
  metadata: {}
});

// Test action flow
await window.actionTest.testActionFlow([
  { action: 'add', shotType: 'text', content: '# Chapter 1' },
  { action: 'add', shotType: 'action', content: 'print("Hello")' }
]);

// Verify system initialization
window.workflowInit.verify();

// Test execution
await window.workflowInit.testExecution();
```

### Option 3: Programmatic Testing

```typescript
import { testActionExecution, testActionFlow } from './action-execution-test';
import workflowInit from '../utils/workflowInitializer';

// Initialize system first
workflowInit.initializeWorkflowSystem(apiClient);

// Test single action
await testActionExecution({
  action: 'add',
  shotType: 'text',
  content: '# Test Cell',
  metadata: {}
});

// Test action flow
await testActionFlow([
  { action: 'new_chapter', content: 'Chapter 1' },
  { action: 'add', shotType: 'text', content: 'Introduction' },
  { action: 'add', shotType: 'action', content: 'import pandas as pd' }
]);
```

## 🧪 Available Action Types

### Core Actions

- **`add`** - Add cell (text or code based on `shotType`)
- **`new_chapter`** - Add chapter heading
- **`new_section`** - Add section heading
- **`new_step`** - Add step heading
- **`is_thinking`** - Add thinking cell
- **`finish_thinking`** - Remove thinking cell
- **`exec`** - Execute code cell
- **`update_last_text`** - Update last text cell
- **`update_title`** - Update notebook title
- **`set_effect_as_thinking`** - Mark last code cell as thinking
- **`comment-result`** - Add comment on result

### Action Structure

```typescript
interface ExecutionStep {
  action: string;          // Required: action type
  storeId?: string;        // Optional: unique ID
  content?: string;        // Content for text/code cells
  metadata?: object;       // Metadata (isChapter, isSection, etc.)

  // Type-specific fields
  shotType?: string;       // 'text' or 'action' for add
  codecell_id?: string;    // For exec action
  textArray?: string[];    // For thinking action
  agentName?: string;      // For thinking action
  title?: string;          // For update_title action
  // ... more fields
}
```

## 🔧 System Initialization

The workflow system requires proper initialization before actions can execute:

```typescript
import workflowInit from './utils/workflowInitializer';

// Initialize with API client (optional)
const adapter = workflowInit.initializeWorkflowSystem(apiClient);

// Verify initialization
const status = workflowInit.verifyWorkflowSystemInit();
console.log('System Status:', status);
// {
//   initialized: true,
//   hasAsyncAdapter: true,
//   hasScriptStore: true,
//   hasCoordinator: true,
//   issues: []
// }
```

### What Gets Initialized

1. **ScriptStore** - Executes actions (add cells, run code, etc.)
2. **WorkflowStateMachine** - Tracks FSM state
3. **TransitionCoordinator** - Handles state transitions
4. **AsyncStateMachineAdapter** - Coordinates API calls and action execution

## 📊 Verification & Debugging

### Verify System Status

```javascript
// In browser console
const status = window.workflowInit.verify();
console.table(status);
```

### Test Action Execution

```javascript
// Test a simple action
await window.workflowInit.testExecution({
  action: 'add',
  shotType: 'text',
  content: '# Test from Console'
});
```

### Verify All Action Types

```javascript
// Run comprehensive test
await window.actionTest.verifyActionExecutionCapabilities();
```

## 🐛 Common Issues

### Issue: "AsyncStateMachineAdapter not initialized"

**Solution:** Call `workflowInit.initializeWorkflowSystem()` first

```typescript
workflowInit.initializeWorkflowSystem();
```

### Issue: "ScriptStore not properly initialized"

**Solution:** Make sure Zustand stores are properly set up

```typescript
import { useScriptStore } from './store/useScriptStore';

const scriptStore = useScriptStore.getState();
console.log('ScriptStore:', scriptStore);
```

### Issue: "No scriptStore available"

**Solution:** Verify TransitionCoordinator has scriptStore in context

```typescript
import { getTransitionCoordinator } from './transitions/TransitionCoordinator';

const coordinator = getTransitionCoordinator();
const context = coordinator.getContext();
console.log('Context:', context);
```

## 📝 Example: Testing Backend Action Stream

Simulate how actions would come from the backend:

```typescript
import { testBackendActionStream } from './action-execution-test';

// This will execute a realistic sequence of actions
await testBackendActionStream();

// Output in console:
// 🧪 Testing Backend-like Action Stream
// [1/5] Executing: new_chapter
// [2/5] Executing: add
// [3/5] Executing: new_section
// [4/5] Executing: add
// [5/5] Executing: add
// 📊 Flow Summary:
//   ✅ Successful: 5
//   ❌ Failed: 0
```

## 🎯 Integration with Real Backend

Once actions are working in tests, integrate with real backend:

```typescript
import { AsyncStateMachineAdapter } from './core/AsyncStateMachineAdapter';
import { useScriptStore } from './store/useScriptStore';

// Initialize with real API client
const apiClient = new WorkflowAPIClient(BACKEND_URL);
const scriptStore = useScriptStore.getState();
const adapter = new AsyncStateMachineAdapter(apiClient, scriptStore);

// Actions from backend will now execute automatically
// through AsyncStateMachineAdapter.step() method
```

## 📚 File Reference

- **`action-execution-test.ts`** - Testing utilities
  - `testActionExecution()` - Test single action
  - `testActionFlow()` - Test action sequence
  - `createMockAction()` - Create test actions
  - `verifyActionExecutionCapabilities()` - Comprehensive test

- **`workflowInitializer.ts`** - System initialization
  - `initializeWorkflowSystem()` - Initialize everything
  - `verifyWorkflowSystemInit()` - Check status
  - `testWorkflowActionExecution()` - Test execution

- **`ActionExecutionDemo.tsx`** - Visual testing component
  - UI buttons for testing
  - Real-time status display
  - Result visualization

## ✅ Success Criteria

Action execution is working correctly when:

1. ✅ System verification shows all components initialized
2. ✅ Individual actions execute without errors
3. ✅ Cells appear in the notebook
4. ✅ Action flows complete successfully
5. ✅ Console shows proper logging
6. ✅ No errors in browser console

## 🔄 Next Steps

Once action execution is verified:

1. Test with real backend API responses
2. Test streaming action execution
3. Verify state machine transitions
4. Test error handling and recovery
5. Performance testing with many actions

---

**Questions or issues?** Check the console logs and use `window.workflowInit.verify()` to diagnose problems.
