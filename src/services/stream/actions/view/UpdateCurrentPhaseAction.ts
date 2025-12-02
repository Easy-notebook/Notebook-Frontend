/**
 * Update Current Phase Action - Handles update_current_phase stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import useStore from '@Store/notebookStore';
import { agentLog } from '@/utils/logger';

export class UpdateCurrentPhaseAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { data, payload, showToast } = context;

    const rawPhaseId = payload.phaseId || (data as any)?.phaseId;
    const phaseName = payload.phaseName || (data as any)?.phaseName;

    if (rawPhaseId || phaseName) {
      const requested = rawPhaseId || phaseName!;
      const state = useStore.getState();
      const allPhases = (state.tasks || []).flatMap((t: any) => t.phases || []);

      const matched =
        allPhases.find((p: any) => p.id === requested) ||
        allPhases.find((p: any) => p.title === requested || p.title === phaseName);

      const resolvedId = matched?.id || requested;

      agentLog.debug('[update_current_phase]', {
        requested,
        phaseName,
        resolvedId,
        phases: allPhases.map((p: any) => ({ id: p.id, title: p.title })),
      });

      await globalUpdateInterface.setCurrentPhase(resolvedId);
      await globalUpdateInterface.setCurrentStepIndex(0);
      await showToast({
        message: `当前阶段已更新: ${matched?.title || resolvedId}`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('update_current_phase', UpdateCurrentPhaseAction);
