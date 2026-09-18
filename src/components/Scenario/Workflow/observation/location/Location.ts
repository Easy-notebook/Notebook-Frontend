import { CurrentLocation, CurrentLocationData } from './Current';
import { Progress, ProgressData } from './Progress';

/**
 * Location - Current position in workflow hierarchy
 */
export interface LocationData {
  current: CurrentLocationData;
  progress: ProgressData;
  goals: string; // User's problem description with placeholders
}

export class Location {
  private _current: CurrentLocation;
  private _progress: Progress;
  private _goals: string;

  constructor(data: LocationData) {
    this._current = new CurrentLocation(data.current);
    this._progress = new Progress(data.progress);
    this._goals = data.goals;
  }

  public get current(): CurrentLocation {
    return this._current;
  }

  public get progress(): Progress {
    return this._progress;
  }

  public get goals(): string {
    return this._goals;
  }

  public setGoals(goals: string): void {
    this._goals = goals;
  }

  public toJSON(): LocationData {
    return {
      current: this._current.toJSON(),
      progress: this._progress.toJSON(),
      goals: this._goals,
    };
  }
}
