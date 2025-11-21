# Actions Module - Refactored Architecture

Ported from: `ref/Notebook-BCC/actions/`

## Overview

The actions module has been completely refactored from function-based handlers to a clean, object-oriented class-based system using the decorator pattern.

## Architecture

```
actions/
├── index.ts                    # Main module with automatic registration
├── base.ts                     # ActionBase class and @action decorator
├── README.md                   # This file
├── content/                    # Content creation actions
│   ├── index.ts
│   ├── AddAction.ts           # AddAction, AddTextAction
│   ├── NewChapterAction.ts    # NewChapterAction
│   ├── NewSectionAction.ts    # NewSectionAction
│   ├── NewStepAction.ts       # NewStepAction
│   └── CommentResultAction.ts # CommentResultAction
├── code/                       # Code execution actions
│   ├── index.ts
│   ├── ExecCodeAction.ts      # ExecCodeAction
│   └── SetEffectThinkingAction.ts  # SetEffectThinkingAction
├── thinking/                   # Thinking visualization actions
│   ├── index.ts
│   ├── IsThinkingAction.ts    # IsThinkingAction
│   └── FinishThinkingAction.ts # FinishThinkingAction
└── workflow/                   # Workflow metadata actions
    ├── index.ts
    ├── UpdateTitleAction.ts   # UpdateTitleAction
    └── UpdateLastTextAction.ts # UpdateLastTextAction
```

## Key Improvements

### 1. **Object-Oriented Design**
- Each action is now a class inheriting from `ActionBase`
- Clear separation of concerns
- Better code organization and readability

### 2. **Decorator-Based Registration**
```typescript
@action('add')
export class AddAction extends ActionBase {
  execute(step: ExecutionStep): any {
    // Implementation
  }
}
```

### 3. **Automatic Discovery**
- Actions are automatically registered when imported
- No manual registration needed
- Simply import the module to register all actions

### 4. **Category Organization**
- Actions are grouped by functionality
- Each category has its own folder with `index.ts`
- Easy to find and maintain

### 5. **Type Safety**
- Full TypeScript support
- Clear interfaces and type hints
- Better IDE autocomplete

## How It Works

### Registration Flow

1. **Define an Action**:
   ```typescript
   @action('my_action')
   export class MyAction extends ActionBase {
     execute(step: ExecutionStep): any {
       // Your implementation
       return result;
     }
   }
   ```

2. **Automatic Registration**:
   - The `@action` decorator registers the class in `_actionRegistry`
   - When `actions` module is imported, all actions are registered

3. **ScriptStore Integration**:
   - `useScriptStore` initializes action instances
   - Actions are executed via `getActionClass(actionType)`

4. **Action Execution**:
   ```typescript
   const ActionClass = getActionClass('add');
   const actionInstance = new ActionClass(scriptStore);
   const result = await actionInstance.execute(step);
   ```

## Registered Actions

### Content Actions (content/)
| Action Type      | Class              | Description                    |
|------------------|--------------------|--------------------------------|
| `add`            | AddAction          | Adds text or code cells        |
| `add-text`       | AddTextAction      | Alias for add action           |
| `new_chapter`    | NewChapterAction   | Creates level 1 heading (##)   |
| `new_section`    | NewSectionAction   | Creates level 2 heading (###)  |
| `new_step`       | NewStepAction      | Creates level 3 heading (###)  |
| `comment-result` | CommentResultAction| Adds content + moves to history|

### Code Actions (code/)
| Action Type              | Class                    | Description                      |
|--------------------------|--------------------------|----------------------------------|
| `exec`                   | ExecCodeAction           | Executes code cells              |
| `set_effect_as_thinking` | SetEffectThinkingAction  | Marks code as finished thinking  |

### Thinking Actions (thinking/)
| Action Type       | Class                | Description                 |
|-------------------|----------------------|-----------------------------|
| `is_thinking`     | IsThinkingAction     | Shows thinking indicator    |
| `finish_thinking` | FinishThinkingAction | Removes thinking indicator  |

### Workflow Actions (workflow/)
| Action Type        | Class                | Description                   |
|--------------------|----------------------|-------------------------------|
| `update_title`     | UpdateTitleAction    | Updates notebook title        |
| `update_last_text` | UpdateLastTextAction | Updates last text cell content|

## Usage Examples

### Using an Action
```typescript
import { getActionClass } from './actions';
import { ExecutionStep } from './store/useScriptStore';

// Get action class
const AddAction = getActionClass('add');

// Create instance
const action = new AddAction(scriptStore);

// Create execution step
const step: ExecutionStep = {
  action: 'add',
  content: 'Hello, World!',
  shotType: 'markdown'
};

// Execute action
const result = await action.execute(step);
```

### Creating a Custom Action
```typescript
import { ActionBase, action } from './actions';
import { ExecutionStep } from './store/useScriptStore';

@action('my_custom_action')
export class MyCustomAction extends ActionBase {
  /**
   * Custom action for special processing.
   */
  async execute(step: ExecutionStep): Promise<string> {
    // Access scriptStore
    console.log('[MyCustomAction] Executing...');

    // Your implementation here
    return "Success";
  }
}
```

### Querying Registered Actions
```typescript
import { getAllActionTypes, getActionClass } from './actions';

// Get all registered action types
const actionTypes = getAllActionTypes();
console.log(`Total actions: ${actionTypes.length}`);

// Get specific action class
const AddActionClass = getActionClass('add');
console.log(`Action class: ${AddActionClass?.name}`);
```

## Benefits

1. **Better Organization**: Actions grouped by category
2. **Cleaner Code**: Minimal boilerplate
3. **Easier Testing**: Each action is an independent class
4. **Better Extensibility**: Simple to add new actions
5. **Type Safety**: Full TypeScript support with type hints
6. **Self-Documenting**: Decorator pattern makes registration obvious
7. **Match Backend**: 1:1 correspondence with Python backend actions

## Migration from Old System

The old `useScriptStore.execAction()` switch statement is now replaced by the action registry system. Instead of:

```typescript
// Old
switch (actionType) {
  case 'add':
    // Implementation
    break;
}
```

We now have:

```typescript
// New
const ActionClass = getActionClass(actionType);
if (ActionClass) {
  const action = new ActionClass(scriptStore);
  return await action.execute(step);
}
```

This provides better separation of concerns and easier maintenance.
