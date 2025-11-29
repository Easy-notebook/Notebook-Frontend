import { Variables } from './Variables';
import { Effects, Effect } from './Effects';
import { Notebook, NotebookState } from './Notebook';
import { FSM, FSMState } from './FSM';

/**
 * State - Internal state
 */
export interface InternalStateData {
  variables: Record<string, any>; // User variables (problem, files, etc.)
  effects: {
    current: Effect[]; // Current execution outputs
    history: Effect[]; // Historical outputs
  };
  notebook: NotebookState;
  FSM: FSMState;
}

export class InternalState {
  private _variables: Variables;
  private _effects: Effects;
  private _notebook: Notebook;
  private _fsm: FSM;

  constructor(data: InternalStateData) {
    this._variables = new Variables(data.variables);
    this._effects = new Effects(data.effects);
    this._notebook = new Notebook(data.notebook);
    this._fsm = new FSM(data.FSM);
  }

  public get variables(): Variables {
    return this._variables;
  }

  public get effects(): Effects {
    return this._effects;
  }

  public get notebook(): Notebook {
    return this._notebook;
  }

  public get FSM(): FSM {
    return this._fsm;
  }

  public toJSON(): InternalStateData {
    return {
      variables: this._variables.toJSON(),
      effects: this._effects.toJSON(),
      notebook: this._notebook.toJSON(),
      FSM: this._fsm.toJSON(),
    };
  }
}
