/**
 * StateJSON Type Definitions
 * ==========================
 *
 * Complete type definitions for the workflow state JSON structure.
 * Ported from: ref/Notebook-BCC (Python backend)
 *
 * This matches the structure in VDSAgents/docs/examples/housing/payloads/00_STATE_IDLE.json
 */

/**
 * Location - Current position in workflow hierarchy
 */
export interface Location {
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
  goals: string; // User's problem description with placeholders
}

/**
 * Output tracking - tracks variables at each hierarchical level
 */
export interface OutputTracking {
  expected: string[]; // Variables this level should produce
  produced: string[]; // Variables already completed and verified
  in_progress: string[]; // Variables currently being constructed
}

/**
 * Stage progress tracking
 */
export interface StageProgress {
  completed: Array<{
    stage_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
  }>;
  current: {
    stage_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
  } | null;
  remaining: Array<{
    stage_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
    required_variables?: string[];
  }>;
  planned?: Array<{
    stage_id: string;
    title: string;
    task: string;
    acceptance: string;
    planning_complete: boolean;
    focus?: string;
    notes?: string;
  }>;
  focus: string;
  current_outputs: OutputTracking;
}

/**
 * Step progress tracking
 */
export interface StepProgress {
  completed: Array<{
    step_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
  }>;
  current: {
    step_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
  } | null;
  remaining: Array<{
    step_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
    required_variables?: string[];
  }>;
  planned?: Array<{
    step_id: string;
    title: string;
    task: string;
    acceptance: string;
    planning_complete: boolean;
  }>;
  focus: string;
  current_outputs: OutputTracking;
}

/**
 * Behavior progress tracking
 */
export interface BehaviorProgress {
  completed: Array<{
    behavior_id: string;
    title: string;
    verified_artifacts: Record<string, any>;
  }>;
  current: {
    behavior_id: string;
    title: string;
    verified_artifacts: Record<string, any>;
    iteration?: number; // Current iteration count for this behavior (防止无限循环)
    max_iterations?: number; // Maximum allowed iterations (default: 5)
  } | null;
  iteration: number | null;
  focus: string;
  current_outputs: OutputTracking;
}

/**
 * Observation - What the system observes
 */
export interface Observation {
  location: Location;
}

/**
 * Notebook Cell (simplified from notebookStore Cell type)
 */
export interface NotebookCell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  outputs?: any[];
  enable_edit?: boolean;
  description?: string;
  metadata?: any;
  language?: string;
  could_visible_in_writing_mode?: boolean;
  execution_count?: number | null;
  isUpdate?: boolean;
}

/**
 * Notebook state
 */
export interface NotebookState {
  notebook_id: string | null;
  title: string | null;
  cell_count: number;
  last_cell_type: string | null;
  last_output: any;
  cells?: NotebookCell[];
  execution_count?: number;
}

/**
 * Effect - Execution result (output)
 */
export interface Effect {
  type: 'text' | 'image_url' | 'error';
  text?: string;
  image_url?: string;
  error?: {
    name: string;
    message: string;
    traceback: string[];
  };
  cell_ref?: string;
}

/**
 * FSM State
 */
export interface FSMState {
  state: string; // 'IDLE', 'STAGE_RUNNING', 'STEP_RUNNING', etc.
  last_transition: string | null;
  previous_state?: string;
  timestamp: string;
  transition_data?: Record<string, any>;
}

/**
 * State - Internal state
 */
export interface State {
  variables: Record<string, any>; // User variables (problem, files, etc.)
  effects: {
    current: Effect[]; // Current execution outputs
    history: Effect[]; // Historical outputs
  };
  notebook: NotebookState;
  FSM: FSMState;
}

/**
 * Complete StateJSON structure
 */
export interface StateJSON {
  observation: Observation;
  state: State;
  metadata?: Record<string, any>;
  [key: string]: unknown;
}

/**
 * Create initial empty state JSON (IDLE state)
 */
export function createInitialStateJSON(
  notebookId: string | null = null,
  variables: Record<string, any> = {}
): StateJSON {
  return {
    observation: {
      location: {
        current: {
          stage_id: null,
          step_id: null,
          behavior_id: null,
          behavior_iteration: null,
        },
        progress: {
          stages: {
            completed: [],
            current: null,
            remaining: [],
            focus: '',
            current_outputs: {
              expected: [],
              produced: [],
              in_progress: [],
            },
          },
          steps: {
            completed: [],
            current: null,
            remaining: [],
            focus: '',
            current_outputs: {
              expected: [],
              produced: [],
              in_progress: [],
            },
          },
          behaviors: {
            completed: [],
            current: null,
            iteration: null,
            focus: '',
            current_outputs: {
              expected: [],
              produced: [],
              in_progress: [],
            },
          },
        },
        goals:
          '用户提出了问题%user_problem%，上传了文件%user_submit_files%,需要对于用户的问题进行大目标拆分，以目标产物为导向，进行阶段拆分，每个阶段需要有明确的目标，并且需要有明确的目标产物',
      },
    },
    state: {
      variables: {
        user_problem: '',
        user_submit_files: [],
        ...variables,
      },
      effects: {
        current: [],
        history: [],
      },
      notebook: {
        notebook_id: notebookId,
        title: null,
        cell_count: 0,
        last_cell_type: null,
        last_output: null,
        cells: [],
        execution_count: 0,
      },
      FSM: {
        state: 'IDLE',
        last_transition: null,
        timestamp: new Date().toISOString(),
      },
    },
    metadata: {},
  };
}

/**
 * Deep clone state JSON
 */
export function cloneStateJSON(state: StateJSON): StateJSON {
  return JSON.parse(JSON.stringify(state));
}
