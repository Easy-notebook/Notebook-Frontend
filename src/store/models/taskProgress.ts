import type { Task, Phase, Step } from './task';

/** Derived structure owns titles/ranges/content; existing identities own user progress. */
export function preserveTaskProgress<T extends Task>(next: T[], previous: readonly Task[]): T[] {
  const phases = new Map<string, Phase>();
  for (const task of previous) for (const phase of task.phases) phases.set(phase.id, phase);
  for (const task of next) {
    for (const phase of task.phases) {
      const old = phases.get(phase.id);
      if (!old) continue;
      if (old.status !== undefined) phase.status = old.status;
      if (old.icon !== undefined) phase.icon = old.icon;
      const steps = new Map<string, Step>();
      for (const step of old.steps) steps.set(step.id, step);
      for (const step of phase.steps) {
        const status = steps.get(step.id)?.status;
        if (status !== undefined) step.status = status;
      }
    }
  }
  return next;
}
