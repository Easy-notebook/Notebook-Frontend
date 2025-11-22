// src/store/models/task.ts
import type { Cell } from './cell';

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'error';

export interface Step {
  id: string;
  title: string;
  status?: StepStatus;
  startIndex?: number | null;
  endIndex?: number | null;
  content?: Cell[];
  cellIds?: string[];
}

export interface Phase {
  id: string;
  title: string;
  steps: Step[];
  icon?: any;
  status?: PhaseStatus;
  intro?: Cell[];
}

export interface Task {
  id: string;
  title: string;
  phases: Phase[];
}

export class StepModel implements Step {
  id: string;
  title: string;
  status: StepStatus;
  startIndex: number | null;
  endIndex: number | null;
  content?: Cell[];
  cellIds?: string[];

  constructor(init: Step) {
    this.id = init.id;
    this.title = init.title;
    this.status = init.status ?? 'pending';
    this.startIndex = init.startIndex ?? null;
    this.endIndex = init.endIndex ?? null;
    this.content = init.content ? [...init.content] : undefined;
    this.cellIds = init.cellIds ? [...init.cellIds] : undefined;
  }

  toJSON(): Step {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      startIndex: this.startIndex,
      endIndex: this.endIndex,
      content: this.content ? [...this.content] : undefined,
      cellIds: this.cellIds ? [...this.cellIds] : undefined,
    };
  }
}

export class PhaseModel implements Phase {
  id: string;
  title: string;
  steps: Step[];
  icon?: any;
  status?: PhaseStatus;
  intro?: Cell[];

  constructor(init: Phase) {
    this.id = init.id;
    this.title = init.title;
    this.steps = Array.isArray(init.steps) ? init.steps.map((s) => ({ ...s })) : [];
    this.icon = init.icon;
    this.status = init.status ?? 'pending';
    this.intro = init.intro ? [...init.intro] : undefined;
  }

  toJSON(): Phase {
    return {
      id: this.id,
      title: this.title,
      steps: this.steps.map((s) => ({ ...s })),
      icon: this.icon,
      status: this.status,
      intro: this.intro ? [...this.intro] : undefined,
    };
  }
}

export class TaskModel implements Task {
  id: string;
  title: string;
  phases: Phase[];

  constructor(init: Task) {
    this.id = init.id;
    this.title = init.title;
    this.phases = Array.isArray(init.phases) ? init.phases.map((p) => ({ ...p })) : [];
  }

  toJSON(): Task {
    return {
      id: this.id,
      title: this.title,
      phases: this.phases.map((p) => ({ ...p })),
    };
  }
}
