// src/store/models/statejson.ts
// Re-export workflow StateJSON related types and helpers for centralized usage

export type {
  Location,
  OutputTracking,
  StageProgress,
  StepProgress,
  BehaviorProgress,
  Observation,
  NotebookCell,
  NotebookState,
  Effect,
  FSMState,
  State,
  StateJSON,
} from '../../components/Scenario/Workflow/types/StateJSON';

export {
  createInitialStateJSON,
  cloneStateJSON,
} from '../../components/Scenario/Workflow/types/StateJSON';
