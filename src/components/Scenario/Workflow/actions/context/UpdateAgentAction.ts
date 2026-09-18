/**
 * UpdateAgentAction - Updates agent content in the state
 * Action Type: update_agent
 *
 * Updates the content (task, thinking, conclusion) for a specific agent.
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

interface UpdateAgentPayload {
  agent_id: string;
  section: 'task' | 'thinking' | 'conclusion';
  content: string;
  archive?: boolean;
}

export class UpdateAgentAction extends ActionBase {
  /**
   * Handle update_agent action
   *
   * @param step - Execution step containing payload with:
   *   - agent_id: ID of the agent to update
   *   - section: 'task' | 'thinking' | 'conclusion'
   *   - content: New content string
   *   - archive: Boolean, if true moves current content to history
   */
  execute(step: ExecutionStep): void {
    // Cast the step to include our payload properties since ExecutionStep is generic
    const payload = step as unknown as UpdateAgentPayload;
    const { agent_id, section, content, archive } = payload;

    if (!agent_id || !section || content === undefined) {
      console.warn('[UpdateAgentAction] Missing required fields:', { agent_id, section });
      return;
    }

    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Ensure agents object exists
    if (!stateJSON.agents) {
      stateJSON.agents = {};
    }

    // Ensure specific agent exists
    if (!stateJSON.agents[agent_id]) {
      stateJSON.agents[agent_id] = {
        task: { current: null, history: [] },
        thinking: { current: null, history: [] },
        conclusion: { current: null, history: [] },
      };
    }

    const agent = stateJSON.agents[agent_id];
    const targetSection = agent[section];

    if (!targetSection) {
      console.warn(`[UpdateAgentAction] Invalid section: ${section}`);
      return;
    }

    let changed = false;

    // Handle archiving
    if (archive && targetSection.current) {
      targetSection.history.push(targetSection.current);
      changed = true;
    }

    // Update content
    if (targetSection.current !== content) {
      targetSection.current = content;
      changed = true;
    }

    if (changed) {
      console.log(`[UpdateAgentAction] ✅ Updated agent ${agent_id} ${section}`, {
        contentLength: content.length,
        archived: archive,
      });
      stateMachine.setState(stateJSON);
    }
  }
}

registerAction('update_agent', UpdateAgentAction);
