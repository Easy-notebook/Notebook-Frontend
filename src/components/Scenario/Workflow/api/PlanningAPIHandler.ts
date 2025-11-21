/** Planning API Handler - Calls VDSAgents /planning endpoint */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '../types/StateJSON';
import { parseStagesXML, parseStepsXML, parseBehaviorXML } from '../utils/XMLParser';

export class PlanningAPIHandler extends BaseAPIHandler {
  async call(
    stateData: Record<string, any>,
    stageId?: string,
    stepId?: string,
    kwargs?: Record<string, any>
  ): Promise<any> {
    if (!stageId || !stepId) {
      [stageId, stepId] = this.extractLocationInfo(stateData);
    }

    console.log(`[PlanningAPI] Calling (stage=${stageId}, step=${stepId})`);

    let xmlResponse = '';
    try {
      // Call WorkflowAPIClient's callPlanningAPI method
      xmlResponse = await this.apiClient.callPlanningAPI(stateData as StateJSON);

      console.log(`[PlanningAPI] XML response received (${xmlResponse.length} chars)`);
      console.log(`[PlanningAPI] XML preview:`, xmlResponse.substring(0, 300));

      // Parse XML based on current FSM state
      const fsmState = stateData.state?.FSM?.state || 'UNKNOWN';
      let parsedResponse;

      if (fsmState === 'IDLE') {
        // IDLE state → stages list
        parsedResponse = parseStagesXML(xmlResponse);
      } else if (fsmState.includes('STAGE') && fsmState.includes('RUNNING')) {
        // STAGE_RUNNING → steps list
        parsedResponse = parseStepsXML(xmlResponse);
      } else if (fsmState.includes('STEP') && fsmState.includes('RUNNING')) {
        // STEP_RUNNING → behavior context
        parsedResponse = parseBehaviorXML(xmlResponse);
      } else {
        console.warn(
          `[PlanningAPI] Unknown state for parsing: ${fsmState}, attempting auto-detect`
        );
        // Auto-detect XML type
        const { parseWorkflowXML } = await import('../utils/XMLParser');
        parsedResponse = parseWorkflowXML(xmlResponse);
      }

      console.log(`[PlanningAPI] Parsed response:`, Object.keys(parsedResponse));
      return parsedResponse;
    } catch (error) {
      console.error(`[PlanningAPI] Failed:`, error);
      if (xmlResponse) {
        console.error(`[PlanningAPI] Full XML that caused error:\n`, xmlResponse);
      }
      throw error;
    }
  }
}
