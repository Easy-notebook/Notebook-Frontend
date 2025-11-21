/**
 * Actions Module - Decorator-Based Action Registration System
 * Ported from: ref/Notebook-BCC/actions/__init__.py
 *
 * This module provides a clean, extensible action system using the decorator pattern.
 * All actions are automatically discovered and registered when this module is imported.
 *
 * Architecture:
 * -----------
 *     actions/
 *     ├── base.ts              # ActionBase class and @action decorator
 *     ├── content/             # Content creation and organization actions
 *     │   ├── AddAction.ts
 *     │   ├── NewChapterAction.ts
 *     │   ├── NewSectionAction.ts
 *     │   ├── NewStepAction.ts
 *     │   └── CommentResultAction.ts
 *     ├── code/                # Code execution actions
 *     │   ├── ExecCodeAction.ts
 *     │   └── SetEffectThinkingAction.ts
 *     ├── thinking/            # Thinking process visualization actions
 *     │   ├── IsThinkingAction.ts
 *     │   └── FinishThinkingAction.ts
 *     └── workflow/            # Workflow metadata actions
 *         ├── UpdateTitleAction.ts
 *         └── UpdateLastTextAction.ts
 *
 * Usage:
 * -----
 *     // Get all registered action types
 *     import { getAllActionTypes } from './actions';
 *     console.log(getAllActionTypes());
 *
 *     // Get a specific action class
 *     import { getActionClass } from './actions';
 *     const AddAction = getActionClass('add');
 *
 *     // Create custom action
 *     import { ActionBase, action } from './actions';
 *
 *     @action('custom_action')
 *     class CustomAction extends ActionBase {
 *       execute(step) {
 *         // Your implementation
 *       }
 *     }
 *
 * Registered Actions:
 * ------------------
 * Content Actions:
 *     - add: Adds text or code cells
 *     - add-text: Alias for add action
 *     - new_chapter: Creates level 1 heading (#)
 *     - new_section: Creates level 2 heading (##)
 *     - new_step: Creates level 3 heading (###)
 *     - comment-result: Adds content and moves effects to history
 *
 * Code Actions:
 *     - exec: Executes code cells
 *     - set_effect_as_thinking: Marks code as finished thinking
 *
 * Thinking Actions:
 *     - is_thinking: Shows thinking indicator
 *     - finish_thinking: Removes thinking indicator
 *
 * Workflow Actions:
 *     - update_title: Updates notebook title
 *     - update_last_text: Updates last text cell content
 */

import { getAllActionTypes as _getAllActionTypes } from './base';

export {
  ActionBase,
  registerAction,
  action,
  getActionClass,
  getAllActionTypes,
  clearRegistry,
  getRegistry,
} from './base';

// Import all action category modules to trigger registration
// Each import automatically registers all actions in that category
import * as content from './content';
import * as code from './code';
import * as thinking from './thinking';
import * as workflow from './workflow';

// Export all action classes for direct access if needed
export { content, code, thinking, workflow };

// Log all registered actions (use imported reference)
console.log('[Actions] All actions registered:', _getAllActionTypes());
