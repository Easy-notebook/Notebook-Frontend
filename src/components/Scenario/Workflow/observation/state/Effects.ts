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

export class Effects {
  private _current: Effect[];
  private _history: Effect[];

  constructor(data: { current: Effect[]; history: Effect[] }) {
    this._current = data.current;
    this._history = data.history;
  }

  public get current(): Effect[] {
    return this._current;
  }

  public get history(): Effect[] {
    return this._history;
  }

  public addCurrentEffect(effect: Effect): void {
    this._current.push(effect);
  }

  public clearCurrentEffects(): void {
    this._current = [];
  }

  public moveCurrentToHistory(): void {
    this._history.push(...this._current);
    this._current = [];
  }

  public addHistoryEffect(effect: Effect): void {
    this._history.push(effect);
  }

  public clearHistory(): void {
    this._history = [];
  }

  public toJSON(): { current: Effect[]; history: Effect[] } {
    return {
      current: JSON.parse(JSON.stringify(this._current)),
      history: JSON.parse(JSON.stringify(this._history)),
    };
  }
}
