import { useAIAgentStore } from '@Store/AIAgentStore';
import type { QAEvent } from '@Store/models/agent';

/** Captures event ownership before notifications or other asynchronous work can change it. */
export class CapturedQAEvent {
  private readonly qaId: string | undefined;
  private readonly event: QAEvent;

  constructor(event: QAEvent, explicitId?: string | number) {
    const { qaList } = useAIAgentStore.getState();
    this.qaId =
      explicitId !== undefined
        ? String(explicitId)
        : (qaList.find((qa) => qa.onProcess) ?? qaList[0])?.id;
    this.event = structuredClone(event);
  }

  record(): void {
    if (this.qaId === undefined) return;
    // Store append only updates an existing QA: a removed owner is never recreated.
    useAIAgentStore.getState().addToolCallToQA(this.qaId, this.event);
  }
}
