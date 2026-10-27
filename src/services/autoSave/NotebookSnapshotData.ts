import type { NotebookSnapshot } from './types';

/** Canonical snapshot data excludes phase renderers; serializable icon descriptors remain data. */
export class NotebookSnapshotData {
  static capture(snapshot: NotebookSnapshot): NotebookSnapshot {
    const tasks = snapshot.tasks.map((task) => ({
      ...task,
      phases: task.phases.map(({ icon, ...phase }) => ({
        ...phase,
        ...(typeof icon === 'function' ||
        (icon !== null && typeof icon === 'object' && '$$typeof' in icon)
          ? {}
          : { icon }),
      })),
    }));
    // Other non-cloneable content remains an error; never silently discard notebook data.
    return structuredClone({ ...snapshot, tasks });
  }
}
