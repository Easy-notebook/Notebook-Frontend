/**
 * StateJSON Type Definitions
 * ==========================
 *
 * Complete type definitions for the workflow state JSON structure.
 * Ported from: ref/Notebook-BCC (Python backend)
 *
 * This matches the structure in VDSAgents/docs/examples/housing/payloads/00_STATE_IDLE.json
 */

// Re-export types from the observation module where they are now defined
export type {
  LocationData as Location, // Renamed to Location to match original export
} from '../observation/location/Location';

export type {
  StageProgress,
  StepProgress,
  BehaviorProgress,
  OutputTracking,
} from '../observation/location/Progress';

export type { NotebookCell, NotebookState } from '../observation/state/Notebook';

export type { Effect } from '../observation/state/Effects';

export type { FSMState } from '../observation/state/FSM';

export type {
  InternalStateData as State, // Renamed to State to match original export
} from '../observation/state/InternalState';

export type { Observation, StateJSON } from '../observation/WorkflowState';

export { createInitialStateJSON, cloneStateJSON } from '../observation/WorkflowState';
