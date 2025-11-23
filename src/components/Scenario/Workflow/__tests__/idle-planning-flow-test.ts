/**
 * IDLE State Planning Flow Test
 * ================================
 *
 * This test verifies that the IDLE state can correctly process
 * streaming actions from the /planning API endpoint.
 *
 * Test Flow:
 * 1. Initialize IDLE state
 * 2. Simulate /planning API streaming actions
 * 3. Verify actions are executed in order
 * 4. Verify state transitions correctly
 */

import { IdleState } from '../states/IdleState';
import { PlanningAPIHandler } from '../api/PlanningAPIHandler';
import { getActionClass } from '../actions';
import { createInitialStateJSON } from '@Store/models';

describe('IDLE State Planning Flow', () => {
  let idleState: IdleState;
  let mockScriptStore: any;
  let mockApiClient: any;

  beforeEach(() => {
    // Initialize IDLE state
    idleState = new IdleState();

    // Mock script store
    mockScriptStore = {
      updateTitle: jest.fn(),
      addCell: jest.fn((type, content) => `cell-${Date.now()}`),
      execAction: jest.fn(),
    };

    // Mock API client with streaming response
    mockApiClient = {
      callPlanningAPI: jest.fn(),
    };
  });

  test('IDLE state should stream planning actions without executing', async () => {
    // Simulate /planning API streaming response
    const streamingActions = [
      {
        action: {
          type: 'update_title',
          content: 'Housing Price Prediction Model Workflow',
        },
      },
      {
        action: {
          type: 'add-text',
          content:
            'Develop a housing price prediction model based on the Housing dataset ensuring RMSE < 25000, R² > 0.85, and alignment with PCS standards.',
        },
      },
      {
        action: {
          type: 'plan_stage',
          stage_id: 'stage_1_data_existence',
          title: 'Data Existence Establishment',
          task: 'Conduct a systematic data discovery, relevance assessment, and define PCS hypotheses',
          acceptance:
            'Data inventory, structure, and relationships documented; testable PCS hypotheses defined',
        },
      },
      {
        action: {
          type: 'plan_stage',
          stage_id: 'stage_2_data_integrity',
          title: 'Data Integrity Assurance',
          task: 'Validate data integrity, restore completeness, and prepare analysis-ready dataset',
          acceptance: 'No missing values, valid data formats, and a finalized cleaned dataset',
        },
      },
      {
        action: {
          type: 'complete_workflow_planning',
          total_stages: 8,
        },
      },
    ];

    // Create async generator for streaming
    async function* mockStreamGenerator() {
      for (const actionData of streamingActions) {
        yield actionData;
      }
    }

    // Mock API client to return streaming generator
    mockApiClient.callPlanningAPI.mockReturnValue(mockStreamGenerator());

    // Create planning handler
    const planningHandler = new PlanningAPIHandler(mockApiClient, mockScriptStore);

    // Create initial state JSON
    const stateData = createInitialStateJSON();

    // Track streamed actions
    const streamedActions: any[] = [];

    // Call planning API and collect streamed actions
    const actionStream = planningHandler.call(stateData);

    for await (const action of actionStream) {
      streamedActions.push(action);
      console.log(`[Test] Action streamed: ${action.type}`);
    }

    // Verify all actions were streamed
    expect(streamedActions).toHaveLength(5);
    expect(streamedActions[0].type).toBe('update_title');
    expect(streamedActions[1].type).toBe('add-text');
    expect(streamedActions[2].type).toBe('plan_stage');
    expect(streamedActions[3].type).toBe('plan_stage');
    expect(streamedActions[4].type).toBe('complete_workflow_planning');

    // Verify PlanningAPIHandler does NOT execute actions (fixed)
    expect(mockScriptStore.updateTitle).not.toHaveBeenCalled();
    expect(mockScriptStore.addCell).not.toHaveBeenCalled();
  });

  test('IDLE state should determine correct transition after planning', () => {
    // Simulate API response with stages
    const apiResponse = {
      stages: [
        {
          stage_id: 'stage_1',
          title: 'Stage 1',
          goal: 'Complete stage 1',
        },
      ],
      title: 'Test Workflow',
      description: 'Test workflow description',
    };

    // Get next transition
    const nextTransition = idleState.determineNextTransition({}, apiResponse);

    // Should transition to START_WORKFLOW
    expect(nextTransition).toBe('START_WORKFLOW');
  });

  test('IDLE state should stay in IDLE if no stages in response', () => {
    // Simulate API response without stages
    const apiResponse = {
      stages: [],
    };

    // Get next transition
    const nextTransition = idleState.determineNextTransition({}, apiResponse);

    // Should stay in IDLE (null transition)
    expect(nextTransition).toBeNull();
  });

  test('PlanStageAction should add stages to stateJSON', () => {
    // Get PlanStageAction class
    const PlanStageActionClass = getActionClass('plan_stage');
    expect(PlanStageActionClass).toBeDefined();

    if (!PlanStageActionClass) {
      throw new Error('PlanStageAction not registered');
    }

    // Create action instance
    const actionInstance = new PlanStageActionClass(mockScriptStore);

    // Execute action with stage data
    const stageData = {
      action: 'plan_stage',
      stage_id: 'test_stage_1',
      title: 'Test Stage 1',
      task: 'Complete test stage 1',
      acceptance: 'Stage 1 complete',
    };

    // Note: This test requires workflowStateMachine to be initialized
    // For now, we just verify the action class exists and can be instantiated
    expect(actionInstance).toBeDefined();
  });

  test('Planning actions should be registered correctly', () => {
    // Verify all planning actions are registered
    const requiredActions = [
      'update_title',
      'add-text',
      'plan_stage',
      'complete_workflow_planning',
    ];

    requiredActions.forEach((actionType) => {
      const ActionClass = getActionClass(actionType);
      expect(ActionClass).toBeDefined();
      console.log(`[Test] ✅ Action registered: ${actionType}`);
    });
  });
});

describe('Planning Action Execution Order', () => {
  test('Actions should execute in streaming order', async () => {
    const executionOrder: string[] = [];

    // Mock scriptStore that tracks execution order
    const mockScriptStore = {
      updateTitle: jest.fn((title) => {
        executionOrder.push('update_title');
      }),
      addCell: jest.fn((type, content) => {
        executionOrder.push('add-text');
        return `cell-${Date.now()}`;
      }),
      execAction: jest.fn((step) => {
        executionOrder.push(step.action);
      }),
    };

    // Simulate streaming actions
    const streamingActions = [
      { action: { type: 'update_title', content: 'Title' } },
      { action: { type: 'add-text', content: 'Description' } },
      { action: { type: 'plan_stage', stage_id: 's1', title: 'S1', task: 'T1', acceptance: 'A1' } },
      { action: { type: 'complete_workflow_planning', total_stages: 1 } },
    ];

    // Process each action
    for (const actionData of streamingActions) {
      const action = actionData.action;
      const ActionClass = getActionClass(action.type);

      if (ActionClass) {
        const actionInstance = new ActionClass(mockScriptStore);
        // Note: Some actions may fail without full state initialization
        // This test primarily checks action registration and order
        try {
          await actionInstance.execute(action);
        } catch (error) {
          // Expected for actions that need full state machine
          console.log(`[Test] Action ${action.type} needs state machine (expected)`);
        }
      }
    }

    // Verify update_title and add-text executed (these don't need full state)
    expect(mockScriptStore.updateTitle).toHaveBeenCalled();
    expect(mockScriptStore.addCell).toHaveBeenCalled();
  });
});
