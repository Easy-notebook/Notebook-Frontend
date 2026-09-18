/**
 * View Actions - Handles view mode and UI state operations
 */

export * from './UpdateViewModeAction';
export * from './ToggleCellIdVisibilityAction';
export { UpdatePaginationAction } from './UpdatePaginationAction';

// Auto-register all actions
import './UpdateViewModeAction';
import './UpdatePaginationAction';
