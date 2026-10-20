// moved to sections/LeftSideBar/Main/Workspace/OutlineView
import { useCallback, memo, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import iconMapping from '@Utils/iconMapping';
import { SHARED_STYLES } from '@LeftSidebar/shared/constants';
import { StatusIcon, StatusDot, SidebarButton } from '@LeftSidebar/shared/components';
import { useHeadingNavigation } from './useHeadingNavigation';
import { indexHeadingTargets } from '@Utils/markdown/headingIdentity';

/* ----------------------------- Types ------------------------------ */

interface Step {
  id: string;
  title: string;
}

interface Phase {
  id: string;
  title: string;
  icon: string;
  steps: Step[];
}

/* -------------------------- Constants ------------------------------ */

// 统一样式常量，支持文本换行而不是截断
const NB_TEXT_CLASS =
  'text-[14px] leading-[20px] font-normal text-theme-800 dark:text-gray-200 break-words';
const NB_ICON_SIZE = 16;
const NB_TRANSITION = 'transition-all duration-300';
const NB_SHADOW = 'shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]';

// 使用共享的样式常量
const StatusStyles = SHARED_STYLES.status;

/* -------------------------- Helpers ------------------------------- */

/* --------------------------- Components --------------------------- */

interface StepButtonProps {
  step: Step;
  isActive: boolean;
  onClick: () => void;
}

export const StepButton = memo(({ step, isActive, onClick }: StepButtonProps) => (
  <SidebarButton
    isActive={isActive}
    onClick={onClick}
    className={`${NB_TEXT_CLASS} ${NB_TRANSITION}`}
  >
    <StatusDot status={isActive ? 'in-progress' : 'pending'} size="sm" />
    <span className="font-normal text-theme-800 dark:!text-gray-100">{step.title}</span>
  </SidebarButton>
));

interface PhaseSectionProps {
  phase: Phase;
  isExpanded: boolean;
  onToggle: () => void;
  onStepSelect: (phaseId: string, stepId: string) => void;
  isActive: boolean;
  currentStepId: string;
  isTitle: boolean;
}

export const PhaseSection = memo(
  ({
    phase,
    isExpanded,
    onToggle,
    onStepSelect,
    isActive,
    currentStepId,
    isTitle,
  }: PhaseSectionProps) => {
    const scrollToTarget = useHeadingNavigation();
    // 使用 useMemo 缓存计算值，提升性能
    const IconComponent = useMemo(
      () => iconMapping[phase.icon as keyof typeof iconMapping] || CheckCircle2,
      [phase.icon]
    );

    const { introStep, regularSteps } = useMemo(
      () => ({
        introStep: phase.steps[0],
        regularSteps: phase.steps.slice(1),
      }),
      [phase.steps]
    );

    const { isCurrentStep, hasSubSteps } = useMemo(
      () => ({
        isCurrentStep: currentStepId === introStep?.id,
        hasSubSteps: regularSteps.length > 0,
      }),
      [currentStepId, introStep?.id, regularSteps.length]
    );

    const headingTargets = useMemo(
      () => indexHeadingTargets(phase.id, regularSteps),
      [phase.id, regularSteps]
    );

    const handleStepClick = useCallback(
      (stepId: string) => {
        onStepSelect(phase.id, stepId);

        // 生成唯一的元素 ID 并滚动
        const elementId = headingTargets.get(stepId) ?? phase.id;
        scrollToTarget(elementId);
      },
      [phase.id, onStepSelect, headingTargets, scrollToTarget]
    );

    const handleTitleClick = useCallback(() => {
      if (!introStep) return;

      onStepSelect(phase.id, introStep.id);
      if (hasSubSteps) {
        onToggle();
      }

      // 滚动到对应元素
      scrollToTarget(phase.id);
    }, [phase.id, introStep, onStepSelect, onToggle, hasSubSteps, scrollToTarget]);

    // 计算动态样式类
    const buttonClasses = useMemo(
      () => `
    w-full flex items-center p-2.5 rounded-lg
    ${SHARED_STYLES.button.base} ${SHARED_STYLES.button.hover}
    ${isActive ? SHARED_STYLES.button.active : ''}
    ${isCurrentStep ? `border-2 border-theme-500 dark:border-theme-400 ${NB_SHADOW}` : ''}
    ${NB_TRANSITION}
  `,
      [isActive, isCurrentStep]
    );

    const iconWrapperClasses = useMemo(
      () => `
    w-10 h-10 flex items-center justify-center
    ${StatusStyles.colors[isActive ? 'in-progress' : 'pending']}
    ${NB_TRANSITION}
    relative
    before:absolute before:inset-0 
  `,
      [isActive]
    );

    const stepsContainerClasses = useMemo(
      () => `
    pl-8 mt-1.5 overflow-hidden ${NB_TRANSITION}
    ${isExpanded ? 'max-h-screen' : 'max-h-0'}
  `,
      [isExpanded]
    );

    if (!introStep) {
      console.warn('PhaseSection: introStep is undefined for phase', phase.id);
      return null;
    }

    return (
      <div className="px-2.5">
        <div className={`rounded-xl ${NB_TRANSITION}`}>
          <button
            onClick={handleTitleClick}
            className={buttonClasses}
            aria-expanded={hasSubSteps ? isExpanded : undefined}
            aria-controls={hasSubSteps ? `steps-${phase.id}` : undefined}
          >
            {!isTitle && (
              <>
                <div className={iconWrapperClasses}>
                  <IconComponent size={NB_ICON_SIZE} />
                </div>
                <div className="flex-1 min-w-0 flex items-start ml-2">
                  <h3
                    className={`font-bold tracking-wide text-base text-black dark:!text-white ${NB_TRANSITION} break-words`}
                  >
                    {phase.title}
                  </h3>
                </div>
              </>
            )}

            {isTitle && (
              <h2
                className={`pl-2 text-lg font-semibold text-theme-800 dark:!text-white ${NB_TRANSITION} break-words`}
              >
                {phase.title}
              </h2>
            )}

            {hasSubSteps && (
              <div className="relative px-1.5">
                {isExpanded ? (
                  <ChevronDown
                    size={NB_ICON_SIZE}
                    className={`text-gray-600 dark:text-gray-400 ${NB_TRANSITION}`}
                  />
                ) : (
                  <ChevronRight
                    size={NB_ICON_SIZE}
                    className={`text-gray-600 dark:text-gray-400 ${NB_TRANSITION}`}
                  />
                )}
              </div>
            )}

            {isActive && <StatusIcon status="in-progress" />}
          </button>

          {hasSubSteps && (
            <div
              id={`steps-${phase.id}`}
              className={stepsContainerClasses}
              role="region"
              aria-labelledby={`phase-title-${phase.id}`}
            >
              {regularSteps.map((step) => (
                <StepButton
                  key={step.id}
                  step={step}
                  isActive={currentStepId === step.id}
                  onClick={() => handleStepClick(step.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default PhaseSection;
