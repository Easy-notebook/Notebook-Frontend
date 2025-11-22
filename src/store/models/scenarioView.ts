// src/store/models/scenarioView.ts
import type React from 'react';

export interface CreateModeProps {
  className?: string;
  readOnly?: boolean;
}

export interface DemoModeProps {
  className?: string;
  readOnly?: boolean;
  tasks?: any[];
  currentPhaseId?: string;
  currentStepIndex?: number;
  cells?: any[];
  findCellsByStep?: (tasks: any[], phaseId: string, stepId: string, cells: any[]) => any[];
  renderCell?: (cell: any) => React.ReactNode;
  // Navigation handlers for StepNavigation
  onPrevious?: () => void;
  onNext?: () => void;
  onPreviousPhase?: () => void;
  onNextPhase?: () => void;
  isFirstPhase?: boolean;
  isLastPhase?: boolean;
}

export type StepRef = { id: string };
export type PhaseRef = { id: string; steps: StepRef[] };
export type TaskRef = { phases: PhaseRef[] };
