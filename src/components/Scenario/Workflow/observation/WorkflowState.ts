import { Location, LocationData } from './location/Location';
import { InternalState, InternalStateData } from './state/InternalState';
import { WorkflowState as WorkflowStateEnum } from '@/store/models';

/**
 * Observation - What the system observes
 */
export interface Observation {
  location: LocationData;
}

/**
 * Agent Activity Tracking
 */
export interface AgentActivity {
  current: string | null;
  history: string[];
}

/**
 * Agent State Structure
 */
export interface AgentState {
  task: AgentActivity;
  thinking: AgentActivity;
  conclusion: AgentActivity;
}

/**
 * Complete StateJSON structure
 */
export interface StateJSON {
  observation: Observation;
  state: InternalStateData;
  agents?: Record<string, AgentState>;
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
          '用户提出了问题%user_requirement%，上传了文件%file_path%,需要对于用户的问题进行大目标拆分，以目标产物为导向，进行阶段拆分，每个阶段需要有明确的目标，并且需要有明确的目标产物',
      },
    },
    state: {
      variables: {
        user_requirement: '',
        file_path: '',
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
        state: WorkflowStateEnum.IDLE,
        last_transition: null,
        timestamp: new Date().toISOString(),
      },
    },
    agents: {},
    metadata: {},
  };
}

/**
 * Deep clone state JSON
 */
export function cloneStateJSON(state: StateJSON): StateJSON {
  return JSON.parse(JSON.stringify(state));
}

export class WorkflowState {
  private _location: Location;
  private _state: InternalState;
  private _metadata: Record<string, any>;
  private _extra: Record<string, unknown>;

  constructor(data: StateJSON) {
    this._location = new Location(data.observation.location);
    this._state = new InternalState(data.state);
    this._metadata = data.metadata || {};

    // Capture extra properties
    const { observation, state, metadata, ...rest } = data;
    this._extra = rest;
  }

  public static create(
    notebookId: string | null = null,
    variables: Record<string, any> = {}
  ): WorkflowState {
    return new WorkflowState(createInitialStateJSON(notebookId, variables));
  }

  public get location(): Location {
    return this._location;
  }

  public get state(): InternalState {
    return this._state;
  }

  public get metadata(): Record<string, any> {
    return this._metadata;
  }

  public setMetadata(key: string, value: any): void {
    this._metadata[key] = value;
  }

  public getExtra(key: string): unknown {
    return this._extra[key];
  }

  public setExtra(key: string, value: unknown): void {
    this._extra[key] = value;
  }

  public toJSON(): StateJSON {
    return {
      observation: {
        location: this._location.toJSON(),
      },
      state: this._state.toJSON(),
      metadata: JSON.parse(JSON.stringify(this._metadata)),
      ...this._extra,
    };
  }
}
