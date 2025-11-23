/**
 * Stream Actions Module - Decorator-Based Action Registration System
 *
 * This module provides a clean, extensible action system for handling stream responses.
 * All actions are automatically discovered and registered when this module is imported.
 *
 * Architecture:
 * -----------
 *     actions/
 *     ├── base.ts                          # StreamAction class and registration
 *     ├── cell/                            # Cell management actions
 *     │   ├── AddCellAction.ts
 *     │   ├── UpdateCellAction.ts
 *     │   └── UpdateCellMetadataAction.ts
 *     ├── qa/                              # QA streaming actions
 *     │   ├── InitStreamingAnswerAction.ts
 *     │   ├── AddContentToAnswerAction.ts
 *     │   └── FinishStreamingAnswerAction.ts
 *     ├── generation/                      # Content generation actions
 *     │   ├── TriggerVideoGenerationAction.ts
 *     │   ├── VideoGenerationTaskStartedAction.ts
 *     │   └── VideoGenerationStatusUpdateAction.ts
 *     ├── view/                            # View/UI actions (to be implemented)
 *     └── workflow/                        # Workflow actions (to be implemented)
 *
 * Usage:
 * -----
 *     // Get all registered action types
 *     import { getAllStreamActionTypes } from './actions';
 *     console.log(getAllStreamActionTypes());
 *
 *     // Get a specific action class
 *     import { getStreamActionClass } from './actions';
 *     const AddCellAction = getStreamActionClass('addCell2EndWithContent');
 *
 * Registered Actions:
 * ------------------
 * Cell Actions:
 *     - addCell2EndWithContent: Create new cell with content
 *     - updateCurrentCellWithContent: Update cell content
 *     - updateCurrentCellMetadata: Update cell metadata
 *
 * QA Actions:
 *     - initStreamingAnswer: Initialize streaming QA response
 *     - addContentToAnswer: Add content chunk to streaming answer
 *     - finishStreamingAnswer: Complete streaming answer
 *
 * Generation Actions:
 *     - trigger_video_generation: Trigger video generation
 *     - video_generation_task_started: Handle video task start
 *     - video_generation_status_update: Handle video status update
 */

import { getAllStreamActionTypes as _getAllStreamActionTypes } from './base';

export {
  StreamAction,
  registerStreamAction,
  getStreamActionClass,
  getAllStreamActionTypes,
  clearStreamRegistry,
  getStreamRegistry,
} from './base';

// Import all action category modules to trigger registration
// Each import automatically registers all actions in that category
import * as cell from './cell';
import * as qa from './qa';
import * as generation from './generation';

// Export all action classes for direct access if needed
export { cell, qa, generation };

// Log all registered actions
console.log('[StreamActions] All actions registered:', _getAllStreamActionTypes());
