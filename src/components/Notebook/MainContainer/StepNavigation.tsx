import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const VUE_PRIMARY = '#41B883';
const VUE_SECONDARY = '#35495E';

interface Phase {
  id: string;
  title: string;
}

interface StepNavigationProps {
  currentPhase: Phase;
  currentStepIndex: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onPreviousPhase: () => void;
  onNextPhase: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
}

const StepNavigation = memo<StepNavigationProps>(({
  currentPhase,
  currentStepIndex,
  totalSteps,
  onPrevious,
  onNext,
  onPreviousPhase,
  onNextPhase,
  isFirstPhase,
  isLastPhase
}) => {
  const { t } = useTranslation();
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const baseBtn = "flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all duration-200 shadow-lg";
  const enabledStyle = `bg-white/80 backdrop-blur-md hover:bg-white/90`;
  const disabledStyle = `bg-white/60 text-gray-400`;

  const renderPreviousButton = () => {
    if (isFirstStep) {
      if (!isFirstPhase) {
        return (
          <button 
            onClick={onPreviousPhase} 
            className={`${baseBtn} ${enabledStyle}`}
            style={{ color: VUE_PRIMARY }}
          > 
            <ArrowLeft size={16}/> {t('navigation.prevStage')}
          </button>
        );
      }
      return <button className={`${baseBtn} ${disabledStyle}`}>{t('navigation.topOfAll')}</button>;
    }
    return (
      <button 
        onClick={onPrevious} 
        className={`${baseBtn} ${enabledStyle}`}
        style={{ color: VUE_PRIMARY }}
      > 
        <ArrowLeft size={16}/> {t('navigation.prevStep')}
      </button>
    );
  };

  const renderNextButton = () => {
    const nextBtnStyle = {
      backgroundColor: `${VUE_PRIMARY}90`,
      color: 'white',
    };
    
    if (isLastStep) {
      if (!isLastPhase) {
        return (
          <button 
            onClick={onNextPhase} 
            className={`${baseBtn}`}
            style={nextBtnStyle}
          >
            {t('navigation.nextStage')} <ArrowRight size={16}/>
          </button>
        );
      }
      return <button className={`${baseBtn} ${disabledStyle}`}>{t('navigation.endOfAll')}</button>;
    }
    return (
      <button 
        onClick={onNext} 
        className={`${baseBtn}`}
        style={nextBtnStyle}
      >
        {t('navigation.nextStep')} <ArrowRight size={16}/>
      </button>
    );
  };

  return (
    <div className="h-20 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md" style={{ borderColor: `${VUE_SECONDARY}33` }}>
      <div className="flex items-center gap-2">
        {renderPreviousButton()}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-lg font-semibold" style={{ color: VUE_SECONDARY }}>
          {currentPhase?.title}
        </span>
        <div className="flex items-center gap-3">
          {totalSteps > 0 && Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`h-2 w-2 rounded-full transition duration-200 ${idx === currentStepIndex ? '' : 'bg-gray-200/50'}`}
              style={idx === currentStepIndex ? { backgroundColor: VUE_PRIMARY } : {}}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {renderNextButton()}
      </div>
    </div>
  );
});

export default StepNavigation;