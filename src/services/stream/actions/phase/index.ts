/**
 * Phase Actions - Handles workflow phase operations
 */

export { UpdateCurrentPhaseAction } from './UpdateCurrentPhaseAction';
export { UpdateStepIndexAction } from './UpdateStepIndexAction';
export { SetRunningPhaseAction } from './SetRunningPhaseAction';
export { AddPhaseAction } from './AddPhaseAction';

// Auto-register all actions
import './UpdateCurrentPhaseAction';
import './UpdateStepIndexAction';
import './SetRunningPhaseAction';
import './AddPhaseAction';
