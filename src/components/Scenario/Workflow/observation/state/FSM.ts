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

export class FSM {
  private _data: FSMState;

  constructor(data: FSMState) {
    this._data = data;
  }

  public get state(): string {
    return this._data.state;
  }

  public get lastTransition(): string | null {
    return this._data.last_transition;
  }

  public get previousState(): string | undefined {
    return this._data.previous_state;
  }

  public get timestamp(): string {
    return this._data.timestamp;
  }

  public get transitionData(): Record<string, any> | undefined {
    return this._data.transition_data;
  }

  public setState(state: string): void {
    this._data.previous_state = this._data.state;
    this._data.state = state;
    this._data.timestamp = new Date().toISOString();
  }

  public setLastTransition(transition: string | null): void {
    this._data.last_transition = transition;
  }

  public setTransitionData(data: Record<string, any> | undefined): void {
    this._data.transition_data = data;
  }

  public toJSON(): FSMState {
    return JSON.parse(JSON.stringify(this._data));
  }
}
