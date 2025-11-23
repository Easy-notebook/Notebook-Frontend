/**
 * Stream Service - Main exports
 */

// Main handler
export { StreamHandler, handleStreamResponse } from './StreamHandler';

// Types
export type {
  StreamData,
  StreamPayload,
  ShowToastFunction,
  StreamActionContext,
  ToastMessage,
} from './types';

// Actions (for direct access if needed)
export { getStreamActionClass, getAllStreamActionTypes } from './actions';

// Managers (for advanced usage)
export { GenerationTracker, generationTracker } from './managers/GenerationTracker';
export { VideoPollingManager, videoPollingManager } from './managers/VideoPollingManager';
export { QAStreamManager, qaStreamManager } from './managers/QAStreamManager';
