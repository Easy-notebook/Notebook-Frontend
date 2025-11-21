/**
 * SetEffectThinkingAction - Marks code as finished thinking
 * Ported from: ref/Notebook-BCC/actions/code/set_effect_thinking_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class SetEffectThinkingAction extends ActionBase {
  execute(step: ExecutionStep): void {
    const thinkingText = step.thinkingText || 'finished thinking';
    this.scriptStore.setEffectAsThinking(thinkingText);
    console.log(`[SetEffectThinkingAction] Set thinking text: ${thinkingText}`);
  }
}

registerAction('set_effect_as_thinking', SetEffectThinkingAction);
