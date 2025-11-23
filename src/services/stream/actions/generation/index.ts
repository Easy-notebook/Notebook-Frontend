/**
 * Generation Actions - Actions related to content generation (image/video/webpage)
 */

export * from './TriggerVideoGenerationAction';
export * from './TriggerImageGenerationAction';
export * from './TriggerWebpageGenerationAction';
export * from './VideoGenerationTaskStartedAction';
export * from './VideoGenerationStatusUpdateAction';

// Auto-import to trigger registration
import './TriggerVideoGenerationAction';
import './TriggerImageGenerationAction';
import './TriggerWebpageGenerationAction';
import './VideoGenerationTaskStartedAction';
import './VideoGenerationStatusUpdateAction';
