/** Submits the selected code cell's output for analysis. */
import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import {
  CodeOutputSubmissionService,
  type CodeOutputSubmissionResult,
} from '@Services/notebook/CodeOutputSubmissionService';
export type { CodeOutputPayload } from '@Services/notebook/CodeOutputSubmissionService';

export class SendCodeOutputAction extends ActionBase {
  async execute(_step: ExecutionStep): Promise<CodeOutputSubmissionResult> {
    return CodeOutputSubmissionService.submitCurrentCell();
  }
}

registerAction('send_code_output', SendCodeOutputAction);
