import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

export class AIThinkingCellViewModel extends BaseCellViewModel {
  // Local state
  public isExpanded = false;
  public seconds = 0;
  public rotation = 0;
  public opacity = 1;
  public textIndex = 0;
  public workflowThinkingTexts: string[] = [];
  public showToolbar = false;
  public gradientPosition = 0;

  // Animation refs (managed internally, not exposed as state)
  private animationRef: number | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private textSwitchTimer: ReturnType<typeof setInterval> | null = null;
  private animationFrameRef: number | null = null;
  private lastTimeRef = 0;
  private speedRef = 0.05;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(cell: StoreCell) {
    super(cell);
    this.initializeTimers();
  }

  private initializeTimers() {
    // Timer
    this.timer = setInterval(() => {
      this.seconds += 1;
      this.notify();
    }, 1000);

    // Rotation Animation
    const animateRotation = () => {
      this.rotation = (this.rotation + 1) % 360;
      this.notify(); // This might be too frequent for React state updates if not handled carefully, but let's try
      this.animationRef = requestAnimationFrame(animateRotation);
    };
    this.animationRef = requestAnimationFrame(animateRotation);

    // Pulse Effect
    this.pulseTimer = setInterval(() => {
      this.opacity = this.opacity === 1 ? 0.8 : 1;
      this.notify();
    }, 800);

    // Background Gradient Animation
    const animateGradient = (timestamp: number) => {
      if (!this.lastTimeRef) this.lastTimeRef = timestamp;
      const deltaTime = timestamp - this.lastTimeRef;
      this.lastTimeRef = timestamp;

      const newPosition = this.gradientPosition - this.speedRef * deltaTime;
      this.gradientPosition = ((newPosition % 200) + 200) % 200;
      this.notify();

      this.animationFrameRef = requestAnimationFrame(animateGradient);
    };
    this.animationFrameRef = requestAnimationFrame(animateGradient);
  }

  public updateProps(cell: StoreCell) {
    super.updateProps(cell);

    // Handle text array updates
    const textArray = cell.textArray || [];
    if (
      textArray.length > 0 &&
      JSON.stringify(textArray) !== JSON.stringify(this.workflowThinkingTexts)
    ) {
      this.workflowThinkingTexts = textArray;
      this.setupTextSwitchTimer();
      this.notify();
    }
  }

  private setupTextSwitchTimer() {
    if (this.textSwitchTimer) clearInterval(this.textSwitchTimer);

    if (this.workflowThinkingTexts.length > 1) {
      this.textSwitchTimer = setInterval(() => {
        this.textIndex = (this.textIndex + 1) % this.workflowThinkingTexts.length;
        this.notify();
      }, 3000);
    }
  }

  public dispose() {
    if (this.timer) clearInterval(this.timer);
    if (this.animationRef) cancelAnimationFrame(this.animationRef);
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    if (this.textSwitchTimer) clearInterval(this.textSwitchTimer);
    if (this.animationFrameRef) cancelAnimationFrame(this.animationFrameRef);
  }

  // Getters
  get displayText() {
    const agentName = this.cell.agentName || 'AI';
    const customText = this.cell.customText || null;
    const textArray = this.cell.textArray || [];

    if (customText) {
      return customText;
    } else if (this.workflowThinkingTexts.length > 0) {
      return this.workflowThinkingTexts[this.textIndex % this.workflowThinkingTexts.length];
    } else if (textArray.length > 0) {
      return textArray[this.textIndex % textArray.length];
    } else {
      return `${agentName} agent is thinking`;
    }
  }

  get isDetached() {
    return useStore.getState().detachedCellId === this.cell.id;
  }

  // Actions
  public setIsExpanded(expanded: boolean) {
    this.isExpanded = expanded;
    this.notify();
  }

  public setShowToolbar(show: boolean) {
    this.showToolbar = show;
    this.notify();
  }

  public setDetachedCellId(id: string | null) {
    useStore.getState().setDetachedCellId(id);
  }
}
