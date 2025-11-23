/**
 * Verification script to check all stream actions are registered
 * Run this in browser console after app loads
 */

// Expected stream action types that should be registered
const expectedActions = [
  // Cell Actions (11)
  'addCell2EndWithContent',
  'updateCurrentCellWithContent',
  'updateCurrentCellMetadata',
  'update_cell',
  'add_cell',
  'delete_cell',
  'clear_cells',
  'set_current_cell',
  'clear_outputs',
  'addNewContent2CurrentCell',
  'addNewContent2CurrentCellDescription',

  // QA Actions (3)
  'initStreamingAnswer',
  'addContentToAnswer',
  'finishStreamingAnswer',

  // Generation Actions (5)
  'trigger_video_generation',
  'video_generation_task_started',
  'video_generation_status_update',
  'trigger_image_generation',
  'trigger_webpage_generation',

  // Notebook Actions (1)
  'update_notebook_title',

  // View Actions (2)
  'update_view_mode',
  'update_allow_pagination',

  // Phase Actions (4)
  'update_current_phase',
  'update_current_step_index',
  'set_running_phase',
  'addNewPhase2Next',

  // Editor Actions (1)
  'tiptap_update',

  // Code Actions (4)
  'runCurrentCodeCell',
  'setCurrentCellMode_complete',
  'setCurrentCellMode_onlyCode',
  'setCurrentCellMode_onlyOutput',

  // Convert Actions (2)
  'convertCurrentCodeCellToHybridCell',
  'convertCurrentHybridCellToLinkCell',

  // Error Actions (2)
  'error',
  'set_error',

  // Agent Actions (3)
  'ask_agent_for_help',
  'communicate_with_agent',
  'remember_information',

  // Workflow Actions (3)
  'workflow_stage_changed',
  'task_completed',
  'task_failed',

  // Link Actions (1)
  'open_link_in_split',

  // Misc Actions (1)
  'ok',
];

async function verifyActions() {
  try {
    const { getAllStreamActionTypes } = await import('./src/services/stream/actions');
    const registeredActions = getAllStreamActionTypes();

    console.log('=== Stream Actions Verification ===');
    console.log(`Expected: ${expectedActions.length} actions`);
    console.log(`Registered: ${registeredActions.length} actions`);
    console.log('');

    const missing = expectedActions.filter((action) => !registeredActions.includes(action));
    const unexpected = registeredActions.filter((action) => !expectedActions.includes(action));

    if (missing.length === 0 && unexpected.length === 0) {
      console.log('✅ SUCCESS! All actions are properly registered.');
      console.log('');
      console.log('Registered actions by category:');
      console.log('- Cell: 11');
      console.log('- QA: 3');
      console.log('- Generation: 5');
      console.log('- Notebook: 1');
      console.log('- View: 2');
      console.log('- Phase: 4');
      console.log('- Editor: 1');
      console.log('- Code: 4');
      console.log('- Convert: 2');
      console.log('- Error: 2');
      console.log('- Agent: 3');
      console.log('- Workflow: 3');
      console.log('- Link: 1');
      console.log('- Misc: 1');
      console.log('');
      console.log('Total: 44 actions');
    } else {
      if (missing.length > 0) {
        console.error('❌ Missing actions:', missing);
      }
      if (unexpected.length > 0) {
        console.warn('⚠️ Unexpected actions:', unexpected);
      }
    }

    return {
      expected: expectedActions.length,
      registered: registeredActions.length,
      missing,
      unexpected,
      success: missing.length === 0 && unexpected.length === 0,
    };
  } catch (error) {
    console.error('Failed to verify actions:', error);
    return { success: false, error };
  }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  verifyActions();
}

// Export for manual usage
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { verifyActions, expectedActions };
}
/* eslint-enable no-undef */
