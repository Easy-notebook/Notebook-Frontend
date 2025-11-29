/**
 * Output tracking - tracks variables at each hierarchical level
 */
export interface OutputTracking {
  expected: Array<{ name: string; description: string }>; // Variables this level should produce
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
    completion_status?: string; // 'success' | 'failed'
    steps?: {
      planned: Array<{
        step_id: string;
        title: string;
        task: string;
        acceptance: string;
      }>;
      completed: Array<{
        step_id: string;
        title: string;
        goal: string;
        verified_artifacts: Record<string, any>;
      }>;
    };
  }>;
  current: {
    stage_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
    completion_status?: string;
  } | null;
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
    completion_status?: string;
  }>;
  current: {
    step_id: string;
    title: string;
    goal: string;
    verified_artifacts: Record<string, any>;
    completion_status?: string;
  } | null;
  planned?: Array<{
    step_id: string;
    title: string;
    task: string;
    acceptance: string;
    planning_complete: boolean;
    delegated_to?: string;
    detailed_task?: string;
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
    completion_status?: string;
  }>;
  current: {
    behavior_id: string;
    title: string;
    verified_artifacts: Record<string, any>;
    iteration?: number; // Current iteration count for this behavior (防止无限循环)
    max_iterations?: number; // Maximum allowed iterations (default: 5)
    completion_status?: string;
  } | null;
  iteration: number | null;
  focus: string;
  current_outputs: OutputTracking;
}

export interface ProgressData {
  stages: StageProgress;
  steps: StepProgress;
  behaviors: BehaviorProgress;
}

export class Progress {
  private _stages: StageProgress;
  private _steps: StepProgress;
  private _behaviors: BehaviorProgress;

  constructor(data: ProgressData) {
    this._stages = data.stages;
    this._steps = data.steps;
    this._behaviors = data.behaviors;
  }

  public get stages(): StageProgress {
    return this._stages;
  }

  public get steps(): StepProgress {
    return this._steps;
  }

  public get behaviors(): BehaviorProgress {
    return this._behaviors;
  }

  // Stage Operations
  public updateStageCurrent(current: StageProgress['current']): void {
    this._stages.current = current;
  }

  public addCompletedStage(stage: StageProgress['completed'][0]): void {
    this._stages.completed.push(stage);
  }

  public setPlannedStages(planned: StageProgress['planned']): void {
    this._stages.planned = planned;
  }

  public setStageFocus(focus: string): void {
    this._stages.focus = focus;
  }

  // Step Operations
  public updateStepCurrent(current: StepProgress['current']): void {
    this._steps.current = current;
  }

  public addCompletedStep(step: StepProgress['completed'][0]): void {
    this._steps.completed.push(step);
  }

  public setPlannedSteps(planned: StepProgress['planned']): void {
    this._steps.planned = planned;
  }

  public setStepFocus(focus: string): void {
    this._steps.focus = focus;
  }

  // Behavior Operations
  public updateBehaviorCurrent(current: BehaviorProgress['current']): void {
    this._behaviors.current = current;
  }

  public addCompletedBehavior(behavior: BehaviorProgress['completed'][0]): void {
    this._behaviors.completed.push(behavior);
  }

  public setBehaviorIteration(iteration: number | null): void {
    this._behaviors.iteration = iteration;
  }

  public setBehaviorFocus(focus: string): void {
    this._behaviors.focus = focus;
  }

  public completeCurrentBehavior(status = 'success'): void {
    if (this._behaviors.current) {
      if (!this._behaviors.completed) {
        this._behaviors.completed = [];
      }
      this._behaviors.completed.push({
        ...this._behaviors.current,
        ...this._behaviors.current,
        completion_status: status,
      });
      this._behaviors.current = null;
    }
  }

  public setStepCompletionStatus(status: string): void {
    if (this._steps.current) {
      this._steps.current.completion_status = status;
    }
  }

  public setStageCompletionStatus(status: string): void {
    if (this._stages.current) {
      this._stages.current.completion_status = status;
    }
  }

  public toJSON(): ProgressData {
    return {
      stages: JSON.parse(JSON.stringify(this._stages)),
      steps: JSON.parse(JSON.stringify(this._steps)),
      behaviors: JSON.parse(JSON.stringify(this._behaviors)),
    };
  }
}
