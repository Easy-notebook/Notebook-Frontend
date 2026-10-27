import { AutoSaveStatus } from './types';

type Activity = AutoSaveStatus.LOADING | AutoSaveStatus.SYNCING;

/** Projects active I/O ownership; completing one operation cannot hide another. */
export class AutoSaveActivity {
  private readonly owners = new Map<symbol, Activity>();

  begin(activity: Activity): () => void {
    const owner = Symbol(activity);
    this.owners.set(owner, activity);
    return () => {
      this.owners.delete(owner);
    };
  }

  get status(): Activity | null {
    if ([...this.owners.values()].includes(AutoSaveStatus.SYNCING)) return AutoSaveStatus.SYNCING;
    return this.owners.size ? AutoSaveStatus.LOADING : null;
  }
}
