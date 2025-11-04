import { useCallback, memo, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import iconMapping from '@Utils/iconMapping';
import { SHARED_STYLES } from '@LeftSidebar/shared/constants';
import { StatusIcon, StatusDot, SidebarButton } from '@LeftSidebar/shared/components';

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
const NB_TEXT_CLASS = 'text-[14px] leading-[20px] font-normal text-theme-800 break-words';
const NB_ICON_SIZE = 16;
const NB_TRANSITION = 'transition-all duration-300';
const NB_SHADOW = 'shadow-[0_2px_8px_rgba(0,0,0,0.1)]';

// 使用共享的样式常量
const StatusStyles = SHARED_STYLES.status;

/* -------------------------- Helpers ------------------------------- */

/**
 * 标准化 slug 生成函数，与编辑器保持一致
 * 用于生成滚动目标的 DOM ID
 */
const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
};

/**
 * 优化的滚动函数，支持多种滚动容器检测
 * 与 FileExplorer 使用相同的滚动逻辑
 */
const scrollToTarget = (elementId: string): void => {
  // 使用双重 requestAnimationFrame 确保 DOM 更新完成
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const targetElement = document.getElementById(elementId);
      if (targetElement) {
        const scrollContainer = document.querySelector('.flex-1.overflow-y-auto.scroll-smooth') ||
                               document.querySelector('.flex-1.overflow-y-auto') ||
                               document.querySelector('[class*="overflow-y-auto"]') ||
                               document.documentElement;

        const targetRect = targetElement.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        if (scrollContainer === document.documentElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const scrollTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - 20;
          scrollContainer.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
        return;
      }

      // Fallback: 在 TiptapNotebookEditor 容器内查找
      const tiptapContainer = document.querySelector('.tiptap-notebook-editor');
      if (tiptapContainer) {
        const [baseId, key] = elementId.includes('--') ? elementId.split('--') : [elementId, ''];
        let heading = null as HTMLElement | null;
        
        if (key) {
          heading = tiptapContainer.querySelector(`[data-base-id="${CSS.escape(baseId)}"][data-heading-key="${CSS.escape(key)}"]`) as HTMLElement | null;
        }
        if (!heading) {
          heading = tiptapContainer.querySelector(`#${CSS.escape(elementId)}`) as HTMLElement | null;
        }

        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
};

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
    <StatusDot
      status={isActive ? 'in-progress' : 'pending'}
      size="sm"
    />
    <span className="font-normal">{step.title}</span>
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

export const PhaseSection = memo(({
  phase,
  isExpanded,
  onToggle,
  onStepSelect,
  isActive,
  currentStepId,
  isTitle
}: PhaseSectionProps) => {
  // 使用 useMemo 缓存计算值，提升性能
  const IconComponent = useMemo(() => 
    iconMapping[phase.icon as keyof typeof iconMapping] || CheckCircle2, 
    [phase.icon]
  );
  
  const { introStep, regularSteps } = useMemo(() => ({
    introStep: phase.steps[0],
    regularSteps: phase.steps.slice(1)
  }), [phase.steps]);

  const { isCurrentStep, hasSubSteps } = useMemo(() => ({
    isCurrentStep: currentStepId === introStep?.id,
    hasSubSteps: regularSteps.length > 0
  }), [currentStepId, introStep?.id, regularSteps.length]);

  // 生成唯一的 element ID，与编辑器保持一致
  const generateUniqueElementId = useCallback((stepId: string): string => {
    const stepTitle = phase.steps.find(s => s.id === stepId)?.title;
    if (!stepTitle) return phase.id;

    const baseId = phase.id;
    const rawSlug = generateSlug(stepTitle);
    const siblings = phase.steps.filter(s => s.title === stepTitle);
    
    if (siblings.length <= 1) {
      return `${baseId}--${rawSlug}`;
    }

    const indexAmongSame = siblings.findIndex(s => s.id === stepId);
    const uniqueSlug = indexAmongSame > 0 ? `${rawSlug}-${indexAmongSame + 1}` : rawSlug;
    return `${baseId}--${uniqueSlug}`;
  }, [phase.id, phase.steps]);

  const handleStepClick = useCallback((stepId: string) => {
    onStepSelect(phase.id, stepId);

    // 生成唯一的元素 ID 并滚动
    const elementId = generateUniqueElementId(stepId);
    scrollToTarget(elementId);

    // Fallback: 尝试不带序号的版本
    const stepTitle = phase.steps.find(s => s.id === stepId)?.title;
    if (stepTitle) {
      const fallbackId = `${phase.id}--${generateSlug(stepTitle)}`;
      setTimeout(() => {
        scrollToTarget(fallbackId);
      }, 150);
    }
  }, [phase.id, phase.steps, onStepSelect, generateUniqueElementId]);

  const handleTitleClick = useCallback(() => {
    if (!introStep) return;
    
    onStepSelect(phase.id, introStep.id);
    if (hasSubSteps) {
      onToggle();
    }

    // 滚动到对应元素
    scrollToTarget(phase.id);
  }, [phase.id, introStep, onStepSelect, onToggle, hasSubSteps]);

  // 计算动态样式类
  const buttonClasses = useMemo(() => `
    w-full flex items-center p-2.5 rounded-lg
    ${SHARED_STYLES.button.base} ${SHARED_STYLES.button.hover}
    ${isActive ? SHARED_STYLES.button.active : ''}
    ${isCurrentStep ? `border-2 border-theme-500 ${NB_SHADOW}` : ''}
    ${NB_TRANSITION}
  `, [isActive, isCurrentStep]);

  const iconWrapperClasses = useMemo(() => `
    w-10 h-10 flex items-center justify-center
    ${StatusStyles.colors[isActive ? 'in-progress' : 'pending']}
    ${NB_TRANSITION}
    relative
    before:absolute before:inset-0 
  `, [isActive]);

  const stepsContainerClasses = useMemo(() => `
    pl-8 mt-1.5 overflow-hidden ${NB_TRANSITION}
    ${isExpanded ? 'max-h-screen' : 'max-h-0'}
  `, [isExpanded]);

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
                <h3 className={`font-bold tracking-wide text-base text-black ${NB_TRANSITION} break-words`}>
                  {phase.title}
                </h3>
              </div>
            </>
          )}

          {isTitle && (
            <h2 className={`pl-2 text-lg font-semibold text-theme-800 ${NB_TRANSITION} break-words`}>
              {phase.title}
            </h2>
          )}

          {hasSubSteps && (
            <div className="relative px-1.5">
              {isExpanded ? (
                <ChevronDown size={NB_ICON_SIZE} className={`text-gray-600 ${NB_TRANSITION}`} />
              ) : (
                <ChevronRight size={NB_ICON_SIZE} className={`text-gray-600 ${NB_TRANSITION}`} />
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
});

export default PhaseSection;