/**
 * Current Location Data Interface
 */
export interface CurrentLocationData {
  stage_id: string | null;
  step_id: string | null;
  behavior_id: string | null;
  behavior_iteration: number | null;
  behavior?: {
    agent: string;
    task: string;
    acceptance: string;
  };
}

export class CurrentLocation {
  private _data: CurrentLocationData;

  constructor(data: CurrentLocationData) {
    this._data = data;
  }

  public get stageId(): string | null {
    return this._data.stage_id;
  }

  public get stepId(): string | null {
    return this._data.step_id;
  }

  public get behaviorId(): string | null {
    return this._data.behavior_id;
  }

  public get behaviorIteration(): number | null {
    return this._data.behavior_iteration;
  }

  public get behavior(): CurrentLocationData['behavior'] | undefined {
    return this._data.behavior;
  }

  public update(data: Partial<CurrentLocationData>): void {
    this._data = { ...this._data, ...data };
  }

  public setStageId(id: string | null): void {
    this._data.stage_id = id;
  }

  public setStepId(id: string | null): void {
    this._data.step_id = id;
  }

  public setBehaviorId(id: string | null): void {
    this._data.behavior_id = id;
  }

  public setBehaviorIteration(iteration: number | null): void {
    this._data.behavior_iteration = iteration;
  }

  public setBehavior(behavior: CurrentLocationData['behavior']): void {
    this._data.behavior = behavior;
  }

  public clearStep(): void {
    this._data.step_id = null;
  }

  public clearBehavior(): void {
    this._data.behavior_id = null;
    this._data.behavior_iteration = null;
    this._data.behavior = undefined;
  }

  public toJSON(): CurrentLocationData {
    return JSON.parse(JSON.stringify(this._data));
  }
}
