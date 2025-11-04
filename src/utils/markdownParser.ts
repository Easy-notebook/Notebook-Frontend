// utils/markdownParser.ts
import {
    Book,
    LucideIcon
} from 'lucide-react';

// Type definitions for markdown parser
interface Cell {
    id: string;
    type: 'markdown' | 'code' | 'hybrid';
    content: string;
    [key: string]: any;
}

interface Step {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    startIndex: number | null;
    endIndex: number | null;
    content?: Cell[];
}

interface Phase {
    id: string;
    title: string;
    icon: LucideIcon;
    status: 'pending' | 'running' | 'completed' | 'error';
    steps: Step[];
    intro?: Cell[];
    currentIntroStep?: Step | null;
}

interface Task {
    id: string;
    title: string;
    phases: Phase[];
    introPhase?: Phase;
}

interface PhaseResult {
    intro: Cell[];
    steps: Step[];
}

type IconType = LucideIcon;

const DEFAULT_ICONS: IconType[] = [
    Book // 这里只保留一个图标，您可以根据需要添加更多
];

/**
 * 更新 cells 的 phaseId 以确保与 tasks 中的 phase ID 一致
 * @param cells - 单元格数组
 * @param tasks - 任务数组
 */
export function updateCellsPhaseId(cells: Cell[], tasks: Task[]): void {
    if (!cells || cells.length === 0 || !tasks || tasks.length === 0) return;

    // 为每个 phase 的范围内所有 cell 统一写入 phaseId
    tasks.forEach(task => {
        task.phases.forEach(phase => {
            const phaseId = phase.id;
            // 遍历该 phase 下的所有 steps（包含 intro step），按 startIndex..endIndex 覆盖 phaseId
            (phase.steps || []).forEach(step => {
                const start = typeof step.startIndex === 'number' ? step.startIndex : null;
                const end = typeof step.endIndex === 'number' ? step.endIndex : null;
                if (start !== null && end !== null) {
                    for (let i = start; i <= end && i < cells.length; i++) {
                        const cell = cells[i];
                        if (!cell) continue;
                        const prev = (cell as any).phaseId;
                        (cell as any).phaseId = phaseId;
                        if (prev !== phaseId) {
                            // 仅在调试需要时打印
                            // console.log('🔄 覆盖cell.phaseId:', { index: i, cellId: cell.id, phaseId });
                        }
                    }
                }
            });
        });
    });
}

/**
 * 解析 Markdown 单元格并构建任务、阶段和步骤的结构。
 * @param cells - 单元格数组
 * @returns 解析后的任务数组
 */
export function parseMarkdownCells(cells: Cell[]): Task[] {
    let currentTask: Task | null = null;
    let currentPhase: Phase | null = null;
    let currentStep: Step | null = null;
    const tasks: Task[] = [];

    // Helper to create new task
    const createTask = (title: string, index: number): Task => ({
        id: `task-${index}-${title}`,
        title,
        phases: []
    });

    // Helper to create new phase - 现在直接使用cellId作为phase.id
    const createPhase = (title: string, cellId: string, icon: IconType | null = null): Phase => ({
        id: cellId,  // 直接使用cellId，与标题cell的id一致
        title,
        icon: icon || DEFAULT_ICONS[0],
        status: 'pending',
        steps: []
    });

    // Helper to create new step
    const createStep = (title: string, stepIndex: number, phaseId: string): Step => ({
        id: `step-${phaseId}-${stepIndex}-${title}`,
        title,
        status: 'pending',
        startIndex: null,
        endIndex: null
    });

    // Helper to end current step if exists
    const endcurrentStep = (index: number): void => {
        if (currentStep) {
            currentStep.endIndex = index - 1;
            currentStep = null;
        }
    };

    // Helper to end current intro step if exists
    const endCurrentIntroStep = (index: number): void => {
        if (currentPhase?.currentIntroStep) {
            currentPhase.currentIntroStep.endIndex = index - 1;
            currentPhase.currentIntroStep = null;
        }
        if (currentTask?.introPhase?.currentIntroStep) {
            currentTask.introPhase.currentIntroStep.endIndex = index - 1;
            currentTask.introPhase.currentIntroStep = null;
        }
    };

    // Process cells
    cells.forEach((cell, index) => {
        if (cell.type !== 'markdown') {
            // Add non-markdown cells to appropriate content array
            if (currentStep) {
                currentStep.content = currentStep.content || [];
                currentStep.content.push(cell);
            } else if (currentPhase?.currentIntroStep) {
                currentPhase.currentIntroStep.content = currentPhase.currentIntroStep.content || [];
                currentPhase.currentIntroStep.content.push(cell);
            } else if (currentTask?.introPhase?.currentIntroStep) {
                currentTask.introPhase.currentIntroStep.content = currentTask.introPhase.currentIntroStep.content || [];
                currentTask.introPhase.currentIntroStep.content.push(cell);
            }
            return;
        }

        // Process markdown content
        const lines: string[] = cell.content.split('\n');
        for (const line of lines) {
            const h1Match: RegExpMatchArray | null = line.match(/^# (.+)/);
            const h2Match: RegExpMatchArray | null = line.match(/^## (.+)/);
            const h3Match: RegExpMatchArray | null = line.match(/^### (.+)/);

            // Handle H1 (Task)
            if (h1Match) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);

                const taskTitle: string = h1Match[1].trim();
                currentTask = createTask(taskTitle, tasks.length);
                tasks.push(currentTask);

                // Create project intro phase
                const introPhase: Phase = createPhase(taskTitle, cell.id, Book);
                const introStep: Step = createStep(taskTitle, 0, introPhase.id);
                introStep.startIndex = index;
                introPhase.steps.push(introStep);
                introPhase.currentIntroStep = introStep;



                currentTask.phases.push(introPhase);
                currentTask.introPhase = introPhase;
                currentPhase = introPhase;
                continue;
            }

            // Handle H2 (Phase)
            if (h2Match && currentTask) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);

                const phaseTitle: string = h2Match[1].trim();
                currentPhase = createPhase(phaseTitle, cell.id);
                currentTask.phases.push(currentPhase);



                // Create stage intro step
                const introStep: Step = createStep('Stage Intro & Input', 0, currentPhase.id);
                introStep.startIndex = index;
                currentPhase.steps.push(introStep);
                currentPhase.currentIntroStep = introStep;
                continue;
            }

            // Handle H3 (Step)
            if (h3Match && currentPhase) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);
                
                const stepTitle: string = h3Match[1].trim();
                const stepIndex: number = currentPhase.steps.length;
                currentStep = createStep(stepTitle, stepIndex, currentPhase.id);
                currentStep.startIndex = index;
                currentPhase.steps.push(currentStep);
                continue;
            }

            // Handle content lines
            if (!line.match(/^#{1,3}/)) {
                if (currentStep) {
                    currentStep.content = currentStep.content || [];
                    currentStep.content.push(cell);
                } else if (currentPhase?.currentIntroStep) {
                    currentPhase.currentIntroStep.content = currentPhase.currentIntroStep.content || [];
                    currentPhase.currentIntroStep.content.push(cell);
                } else if (currentTask?.introPhase?.currentIntroStep) {
                    currentTask.introPhase.currentIntroStep.content = currentTask.introPhase.currentIntroStep.content || [];
                    currentTask.introPhase.currentIntroStep.content.push(cell);
                }
            }
        }
    });

    // Set end index for the last steps
    tasks.forEach(task => {
        task.phases.forEach(phase => {
            if (phase.currentIntroStep) {
                phase.currentIntroStep.endIndex = cells.length - 1;
            }
            phase.steps.forEach(step => {
                if (step.endIndex === null) {
                    step.endIndex = cells.length - 1;
                }
            });
        });
    });

    return tasks;
}

/**
 * 根据阶段 ID 获取对应的单元格。
 * @param tasks - 任务数组
 * @param phaseId - 阶段 ID
 * @returns 包含阶段介绍和步骤的单元格数组
 */
export function findCellsByPhase(tasks: Task[], phaseId: string): PhaseResult {
    if (!phaseId || !tasks || tasks.length === 0) {
        return { intro: [], steps: [] };
    }

    for (const task of tasks) {
        const phase: Phase | undefined = task.phases.find((p: Phase) => p.id === phaseId);
        if (phase) {
            return {
                intro: phase.intro || [],
                steps: phase.steps
            };
        }
    }

    return { intro: [], steps: [] };
}

/**
 * 根据阶段 ID 和步骤 ID 获取对应的单元格。
 * @param tasks - 任务数组
 * @param phaseId - 阶段 ID
 * @param stepId - 步骤 ID
 * @param cells - 所有单元格数组
 * @returns 对应步骤的单元格数组
 */
export function findCellsByStep(tasks: Task[], phaseId: string, stepId: string, cells: Cell[]): Cell[] {
    if (!phaseId || !stepId || !tasks) {
        return [];
    }

    for (const task of tasks) {
        const phase: Phase | undefined = task.phases.find((p: Phase) => p.id === phaseId);
        if (phase) {
            const step: Step | undefined = phase.steps.find((s: Step) => s.id === stepId);
            if (step) {
                const start: number | null = step.startIndex;
                const end: number = step.endIndex !== null ? step.endIndex : cells.length - 1;
                if (start !== null) {
                    return cells.slice(start, end + 1);
                }
            }
        }
    }

    return [];
}
