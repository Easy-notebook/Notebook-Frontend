/**
 * Workflow Actions - Handles workflow and task management events
 */

export { WorkflowStageChangedAction } from './WorkflowStageChangedAction';
export { TaskCompletedAction } from './TaskCompletedAction';
export { TaskFailedAction } from './TaskFailedAction';

// Auto-register all actions
import './WorkflowStageChangedAction';
import './TaskCompletedAction';
import './TaskFailedAction';
