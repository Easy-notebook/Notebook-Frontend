/**
 * IsThinkingAction - Shows thinking indicator
 * Ported from: ref/Notebook-BCC/actions/thinking/is_thinking_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class IsThinkingAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const cellId = this.scriptStore.addCell(
      'thinking',
      '',
      {},
      {
        textArray: step.textArray || ['AI is thinking...'],
        agentName: step.agentName || 'AI',
        customText: step.customText || null,
      }
    );

    console.log(`[IsThinkingAction] Created thinking cell: ${cellId}`);
    return cellId;
  }
}

registerAction('is_thinking', IsThinkingAction);
