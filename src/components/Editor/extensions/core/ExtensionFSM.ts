export interface State<TContext> {
  name: string;
  onEnter?: (context: TContext) => void;
  onExit?: (context: TContext) => void;
  handleEvent?: (event: string, payload: any, context: TContext) => string | null; // Returns new state name or null
}

export class ExtensionFSM<TContext> {
  private states: Record<string, State<TContext>> = {};
  private currentState: State<TContext> | null = null;
  private context: TContext;
  private onStateChange?: (newState: string) => void;

  constructor(context: TContext, onStateChange?: (newState: string) => void) {
    this.context = context;
    this.onStateChange = onStateChange;
  }

  updateContext(context: TContext) {
    this.context = context;
  }

  addState(state: State<TContext>) {
    this.states[state.name] = state;
  }

  transitionTo(stateName: string) {
    const nextState = this.states[stateName];
    if (!nextState) throw new Error(`State ${stateName} not found`);

    if (this.currentState?.onExit) {
      this.currentState.onExit(this.context);
    }

    this.currentState = nextState;
    if (this.onStateChange) {
      this.onStateChange(stateName);
    }

    if (this.currentState.onEnter) {
      this.currentState.onEnter(this.context);
    }
  }

  send(event: string, payload?: any) {
    if (this.currentState?.handleEvent) {
      const nextStateName = this.currentState.handleEvent(event, payload, this.context);
      if (nextStateName) {
        this.transitionTo(nextStateName);
      }
    }
  }

  getCurrentState(): string | null {
    return this.currentState ? this.currentState.name : null;
  }
}
