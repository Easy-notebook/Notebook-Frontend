import { WorkflowState, WorkflowEvent } from '@Store/models';

/**
 * FSM State
 */
export interface FSMState {
  state: WorkflowState;
  last_transition: WorkflowEvent | null;
  previous_state?: WorkflowState;
  timestamp: string;
  transition_data?: Record<string, any>;
}

export class FSM {
  private _data: FSMState;

  constructor(data: FSMState) {
    this._data = data;
  }

  public get state(): WorkflowState {
    return this._data.state;
  }

  public get lastTransition(): WorkflowEvent | null {
    return this._data.last_transition;
  }

  public get previousState(): WorkflowState | undefined {
    return this._data.previous_state;
  }

  public get timestamp(): string {
    return this._data.timestamp;
  }

  public get transitionData(): Record<string, any> | undefined {
    return this._data.transition_data;
  }

  public setState(state: WorkflowState): void {
    this._data.previous_state = this._data.state;
    this._data.state = state;
    this._data.timestamp = new Date().toISOString();
  }

  public setLastTransition(transition: WorkflowEvent | null): void {
    this._data.last_transition = transition;
  }

  public setTransitionData(data: Record<string, any> | undefined): void {
    this._data.transition_data = data;
  }

  public toJSON(): FSMState {
    return JSON.parse(JSON.stringify(this._data));
  }
}
