// Pipeline.tsx
import { useCallback } from 'react';
import { usePipelineStore } from './store/usePipelineStore';
import { useWorkflowStateMachine } from './store/workflowStateMachine';
import usePreStageStore from './store/preStageStore';
import PipelineStageWrapper from './utils/PipelineStageWrapper';
import EmptyState from '../State/EmptyState';
import ProblemDefineState from '../State/ProblemDefineState';
import { Loader2 } from 'lucide-react';

/**
 * A dedicated view for when the workflow is active and being executed by the FSM.
 * It displays the current stage's information and the FSM's live state.
 */
const WorkflowInProgressView = () => {
    const { workflowTemplate } = usePipelineStore();
    const { currentState, context: fsmContext } = useWorkflowStateMachine();

    // Find the configuration for the current stage
    const currentStageConfig = workflowTemplate?.stages.find(
        stage => stage.id === fsmContext.currentStageId
    );

    if (!currentStageConfig) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Loader2 className="w-8 h-8 text-theme-500 animate-spin mb-4" />
                <p className="text-gray-600">Initializing workflow stage...</p>
                <p className="text-sm text-gray-400 mt-2">
                    Current FSM State: <span className="font-mono">{currentState}</span>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 text-center">
            <h2 className="text-3xl font-bold text-gray-800">
                {currentStageConfig.title || currentStageConfig.id}
            </h2>
            <p className="text-gray-600 max-w-lg">
                {currentStageConfig.description || 'This stage is being executed by the workflow engine.'}
            </p>
            <div className="mt-4 pt-4 border-t w-full max-w-md">
                <p className="text-sm text-gray-500">
                    Workflow Status: 
                    <span className="font-mono ml-2 px-2 py-1 bg-theme-100 text-theme-700 rounded">
                        {currentState}
                    </span>
                </p>
            </div>
        </div>
    );
};


/**
 * The main pipeline component that routes to the correct view based on the application's state.
 */
interface DSLCPipelineProps {
    onAddCell: () => void;
}

const DSLCPipeline: React.FC<DSLCPipelineProps> = ({ onAddCell }) => {
    const { 
        currentPreStage, // Use a dedicated state for pre-workflow stages
        isAnimating, 
        animationDirection, 
        initializeWorkflow,
        isWorkflowActive,
        setPreStage,
    } = usePipelineStore();

    // This effect is no longer needed here as it's handled by other components.
    // If it were necessary, it should be placed in a top-level App component.
    // useEffect(() => {
    //     useWorkflowStateMachine.getState().setStoreReferences(useAIPlanningContextStore, usePipelineStore);
    // }, []);

    const handleConfirmProblem = useCallback(async () => {
        try {
            console.log('[Pipeline] Problem confirmed, initializing workflow...');
            
            const preStageState = usePreStageStore.getState();
            const planningRequest = {
                problem_name: preStageState.problem_name || 'Data Analysis Task',
                user_goal: preStageState.problem_description || 'Analyze data to derive insights',
                problem_description: preStageState.problem_description,
                context_description: preStageState.datasetInfo,
            };
            
            await initializeWorkflow(planningRequest);
        } catch (error) {
            console.error('[Pipeline] Failed to confirm problem and initialize workflow:', error);
            alert('Failed to initialize workflow. Please check the console and try again.');
        }
    }, [initializeWorkflow]);

    const renderContent = () => {
        if (isWorkflowActive) {
            return <WorkflowInProgressView />;
        }
        
        // If workflow is not active, render the appropriate pre-stage component.
        switch (currentPreStage) {
            case 'EMPTY':
                return (
                    <PipelineStageWrapper
                        stage="EMPTY"
                        currentStage={currentPreStage}
                        isAnimating={isAnimating}
                        animationDirection={animationDirection === 'forward' ? 'next' : 'previous'}
                    >
                        <EmptyState 
                            onAddCell={onAddCell}
                            onFileUpload={() => {
                                setPreStage('PROBLEM_DEFINE');
                            }} 
                        />
                    </PipelineStageWrapper>
                );
            
            case 'PROBLEM_DEFINE':
                return (
                    <PipelineStageWrapper
                        stage="PROBLEM_DEFINE"
                        currentStage={currentPreStage}
                        isAnimating={isAnimating}
                        animationDirection={animationDirection === 'forward' ? 'next' : 'previous'}
                    >
                        <ProblemDefineState 
                            confirmProblem={handleConfirmProblem}
                        />
                    </PipelineStageWrapper>
                );
            
            default:
                return (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500">Loading or unknown state...</p>
                    </div>
                );
        }
    };
    
    return (
        <div className="w-full h-full">
            <div className="w-full h-full flex items-center justify-center">
                {renderContent()}
            </div>
        </div>
    );
};

export default DSLCPipeline;