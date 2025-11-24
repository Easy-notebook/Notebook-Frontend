/** REFLECTING_AGAIN Handler - BEHAVIOR_COMPLETED → BEHAVIOR_COMPLETED */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { ClearEffectCurrentAction } from '../actions/reflecting/ClearEffectCurrent';

export class ReflectingAgainHandler extends BaseTransitionHandler {
  constructor() {
    super('BEHAVIOR_COMPLETED', 'BEHAVIOR_COMPLETED', 'REFLECTING_AGAIN');
  }

  canHandle(r: any): boolean {
    // This handler is triggered when BehaviorCompletedState returns REFLECTING_AGAIN
    // The coordinator finds it by transition name match if auto-triggered,
    // or we can check response if needed.
    // Given the flow, it's the default fallback when no other transition is determined.
    return true;
  }

  async apply(state: Record<string, any>, _r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);

    // Use the action's logic to clear effects
    // This ensures that when we reflect again, we don't see the same effects as "new"
    ClearEffectCurrentAction.processState(ns);

    // Stay in BEHAVIOR_COMPLETED to trigger another reflection cycle
    this.updateFSMState(ns, 'BEHAVIOR_COMPLETED', 'REFLECTING_AGAIN');
    return ns;
  }
}
