// utils/markdownParser.ts
import { MarkdownStructureIndex } from './markdown/structureIndex';
import { resolvePhaseOwnership } from './markdown/phaseOwnership';
import {
    Book,
    LucideIcon
} from 'lucide-react';

const structureIndex = new MarkdownStructureIndex();

export const hasSameMarkdownStructure = (
    previous: readonly { id: string; type: string; content: string }[],
    next: readonly { id: string; type: string; content: string }[],
): boolean => structureIndex.hasSameStructure(previous, next);

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
    if (!cells || cells.length === 0) return;
    const assignments = resolvePhaseOwnership(cells.length, tasks || []);
    // Assign final values once: clearing first would dirty every Immer cell even
    // when its derived phase ultimately stayed the same.
    cells.forEach((cell, index) => {
        if (cell && cell.phaseId !== assignments[index]) cell.phaseId = assignments[index];
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

    const appendContent = (cell: Cell): void => {
        const step = currentStep || currentPhase?.currentIntroStep || currentTask?.introPhase?.currentIntroStep;
        if (!step) return;
        step.content ??= [];
        // A cell may contain many Markdown blocks, but owns one content reference per step.
        if (step.content[step.content.length - 1]?.id !== cell.id) step.content.push(cell);
    };

    const structures = structureIndex.project(cells);
    // Process cells
    cells.forEach((cell, index) => {
        if (cell.type !== 'markdown') {
            appendContent(cell);
            return;
        }

        // Process markdown content
        // Only top-level block headings own notebook structure. Code, quotes,
        // lists and tables remain content regardless of heading-like text inside.
        for (const token of structures[index]) {
            const heading = token.type === 'heading' ? token : null;

            // Handle H1 (Task)
            if (heading?.depth === 1) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);

                const taskTitle: string = heading.text.trim();
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
            if (heading?.depth === 2 && currentTask) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);

                const phaseTitle: string = heading.text.trim();
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
            if (heading?.depth === 3 && currentPhase) {
                // End any current steps or intro steps
                endcurrentStep(index);
                endCurrentIntroStep(index);
                
                const stepTitle: string = heading.text.trim();
                const stepIndex: number = currentPhase.steps.length;
                currentStep = createStep(stepTitle, stepIndex, currentPhase.id);
                currentStep.startIndex = index;
                currentPhase.steps.push(currentStep);
                continue;
            }

            appendContent(cell);
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
            // Construction cursors are not part of the published task model.
            delete phase.currentIntroStep;
        });
        delete task.introPhase;
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
