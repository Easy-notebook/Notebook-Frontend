import React, { ReactNode } from 'react';

interface PipelineStageWrapperProps {
    children: ReactNode;
    stage: string | number;
    currentStage: string | number;
    isAnimating: boolean;
    animationDirection: 'next' | 'previous';
}

// Animation component wrapper
const PipelineStageWrapper: React.FC<PipelineStageWrapperProps> = ({ 
    children, 
    stage, 
    currentStage, 
    isAnimating, 
    animationDirection 
}) => {
    // Only render if this is the current stage or we're animating
    const shouldRender = stage === currentStage || isAnimating;
    if (!shouldRender) return null;

    // Calculate CSS classes for animations
    let animationClass = '';

    if (isAnimating) {
        if (stage === currentStage) {
            // Current stage is animating out
            animationClass = animationDirection === 'next'
                ? 'animate-slide-up-out'
                : 'animate-slide-down-out';
        } else {
            // New stage is animating in
            animationClass = animationDirection === 'next'
                ? 'animate-slide-up-in'
                : 'animate-slide-down-in';
        }
    }

    return (
        <div className={`w-full h-full ${animationClass}`}>
            {children}
        </div>
    );
};

export default PipelineStageWrapper;