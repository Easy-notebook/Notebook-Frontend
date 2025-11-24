# StateJSON Architecture & Maintenance Guide

This document defines the unified architecture for `StateJSON`, specifically focusing on how the `observation` section is maintained throughout the workflow lifecycle.

## 1. Core Structure

The `StateJSON` is the single source of truth for the workflow state.

```typescript
interface StateJSON {
  observation: {
    location: {
      current: {
        stage_id: string | null;
        step_id: string | null;
        behavior_id: string | null;
        behavior_iteration: number | null;
      };
      progress: {
        stages: StageProgress;
        steps: StepProgress;
        behaviors: BehaviorProgress;
      };
      goals: string;
    };
  };
  state: {
    FSM: {
      state: string; // IDLE, STAGE_RUNNING, etc.
    };
    // ... variables, notebook, effects
  };
}
```

## 2. Progress Tracking (`observation.location.progress`)

Each level (stages, steps, behaviors) follows a consistent pattern:

*   **`planned`**: The master list of all items planned for this level. This is the **ONLY** source of truth for what needs to be done.
*   **`current`**: The item currently being executed.
*   **`completed`**: List of items successfully finished.

### Invariant Rule
> At any point in time: `planned` = `completed` + `current` + `planed`
> 
> Where `planed` is **DERIVED DYNAMICALLY** as: `planned.filter(item => !completed.includes(item) && item !== current)`

**IMPORTANT**: There is NO `planed` property stored in the state. It is always calculated on-demand from `planned`, `completed`, and `current`.

## 3. Maintenance Lifecycle

### Phase 1: Planning (Initialization)

**Responsibility**: `CompleteWorkflowPlanningAction` (for stages) / `CompleteStagePlanningAction` (for steps)

When planning is complete, the action **MUST**:
1.  Set `planned` = full list of items.
2.  Set `current` = `planned[0]` (with proper type mapping: `goal`, `verified_artifacts`).
3.  Set `completed` = `[]`.

**What NOT to do**: Do not populate a `planed` array. It doesn't exist.

### Phase 2: Execution (Transitions)

**Responsibility**: `NextStageHandler` / `NextStepHandler`

When moving to the next item:
1.  Move `current` to `completed`.
2.  Calculate `planed` from `planned - completed - current`.
3.  Take `planed[0]` and make it `current` (with proper type mapping).

### Phase 3: Completion Check

**Responsibility**: `StageCompletedState` / `StepCompletedState`

To determine if work is complete:
1.  Calculate `planed` from `planned - completed - current`.
2.  If `planed.length === 0`, trigger completion event.
3.  Otherwise, trigger next item event.

## 4. Unified State Management Rules

1.  **Single Source of Truth**: `planned` is the only source of truth. All other lists (`completed`, `current`) are derived from it.
2.  **Dynamic Calculation**: Always calculate `planed` on-demand. Never store it.
3.  **Type Consistency**: When moving items from `planned` to `current`, map properties correctly (e.g., `task` → `goal`, add `verified_artifacts`).
4.  **Atomic Updates**: Updates to `current` and `completed` should happen in the same atomic operation.

## 5. Debugging Checklist

If the workflow gets stuck or behaves unexpectedly:

- [ ] **Check `planned`**: Does it contain all expected items?
- [ ] **Check `current`**: Is it correctly set?
- [ ] **Check `completed`**: Are completed items being added correctly?
- [ ] **Verify Calculation**: Is `planed` being calculated correctly from `planned - completed - current`?
- [ ] **Verify Type Mapping**: Are properties being mapped correctly when moving from `planned` to `current`?

