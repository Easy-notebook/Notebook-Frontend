import { Splitter } from 'antd';
import React, {
    useState,
    useEffect,
    useCallback,
    FC, // 使用 FC (FunctionComponent) 类型
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight,
    Sparkles,
    PlusCircle,
} from 'lucide-react';
import { useAIPlanningContextStore } from '@/components/Senario/Workflow/store/aiPlanningContext';
import usePreStageStore from '@/components/Senario/Workflow/store/preStageStore';
// @ts-ignore
import { generalResponse } from '@/components/Senario/Workflow/services/StageGeneralFunction';

// ─────────── 类型定义 (Type Definitions) ───────────

// 为 window 对象扩展自定义方法
declare global {
    interface Window {
        changeTypingText?: (newText: string) => void;
    }
}

// AI 建议的问题选项的接口
interface ProblemChoice {
    problem_name: string;
    problem_description: string;
    target: string;
}

// ProblemDefineWorkload 和 ProblemDefineState 组件的 Props 接口
interface ProblemDefineProps {
    confirmProblem: () => Promise<void> | void;
}

// 工作负载步骤的类型
type WorkloadStep = 'select' | 'background' | 'confirm';

// ─────────── 组件 (Components) ───────────

/**
 * TypingTitle 组件：实现打字动画效果的标题
 */
const TypingTitle: FC = () => {
    const [text, setText] = useState('');
    const [isTypingDone, setIsTypingDone] = useState(false);
    const [showCursor, setShowCursor] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const typingSpeed = 35;
    const deletingSpeed = 20;

    const startTyping = useCallback((fullText: string) => {
        setIsDeleting(false);
        let index = 0;
        const interval = setInterval(() => {
            setText(fullText.slice(0, index + 1));
            index++;
            if (index === fullText.length) {
                clearInterval(interval);
                setIsTypingDone(true);
                setTimeout(() => setShowCursor(false), 2000);
            }
        }, typingSpeed);

        return () => clearInterval(interval);
    }, []);

    const deleteText = useCallback((onComplete: () => void) => {
        setIsDeleting(true);
        setIsTypingDone(false);
        setShowCursor(true);

        let index = text.length;
        const interval = setInterval(() => {
            setText(prev => prev.slice(0, index - 1));
            index--;
            if (index === 0) {
                clearInterval(interval);
                onComplete();
            }
        }, deletingSpeed);

        return () => clearInterval(interval);
    }, [text.length]);

    const changeText = useCallback((newText: string) => {
        deleteText(() => {
            startTyping(newText);
        });
    }, [deleteText, startTyping]);

    useEffect(() => {
        const cleanup = startTyping('VDSAgent');
        return cleanup;
    }, [startTyping]);

    useEffect(() => {
        window.changeTypingText = changeText;
        return () => {
            delete window.changeTypingText;
        };
    }, [changeText]);

    return (
        <div className="relative">
            {/* 样式与原版保持一致 */}
            <style>
                {`
                @keyframes typing-cursor { 0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.9; } 50% { transform: scaleY(0.7) scaleX(1.2); opacity: 0.7; } }
                @keyframes done-cursor { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
                @keyframes deleting-cursor { 0%, 100% { transform: scaleY(1) scaleX(1); opacity: 1; } 50% { transform: scaleY(0.7) scaleX(1.2); opacity: 0.7; } }
                .cursor-typing { background: #f3f4f6; animation: typing-cursor ${typingSpeed * 2}ms ease-in-out infinite; }
                .cursor-done { background: #f3f4f6; animation: done-cursor 1.2s steps(1) infinite; }
                .cursor-deleting { background: #f3f4f6; animation: deleting-cursor ${deletingSpeed * 2}ms ease-in-out infinite; }
                .title-container { display: inline; position: relative; }
                .cursor { display: inline-block; position: relative; vertical-align: text-top; margin-left: 3px; margin-top: 5px; }
                `}
            </style>
            <div className="title-container">
                <span className="text-4xl font-bold mb-4 leading-tight theme-grad-text">
                    {text}
                    {showCursor && (
                        <div
                            className={`cursor w-1 h-8 rounded-sm inline-block ${isDeleting
                                ? 'cursor-deleting'
                                : isTypingDone
                                    ? 'cursor-done'
                                    : 'cursor-typing'
                                }`}
                        />
                    )}
                </span>
            </div>
        </div>
    );
};

/**
 * ProblemDefineWorkload 组件：处理问题定义的完整工作流程
 */
const ProblemDefineWorkload: FC<ProblemDefineProps> = ({ confirmProblem }) => {
    const { t, i18n } = useTranslation();

    /* ─────────── State ─────────── */
    const [step, setStep] = useState<WorkloadStep>('select');
    const [selectedProblem, setSelectedProblem] = useState<ProblemChoice | null>(null);
    const [customProblem, setCustomProblem] = useState('');
    const [datasetBackground, setDatasetBackground] = useState('');

    /* ─────────── Store Access ─────────── */
    const choiceMap = usePreStageStore(state => state.choiceMap);
    const currentFile = usePreStageStore(state => state.currentFile);
    const problem_description = usePreStageStore(state => state.problem_description);
    const problem_name = usePreStageStore(state => state.problem_name);
    const selectedTarget = usePreStageStore(state => state.selectedTarget);
    const setSelectedProblemStore = usePreStageStore(state => state.setSelectedProblem);
    const setDatasetInfoStore = usePreStageStore(state => state.setDatasetInfo);
    const addVariable = useAIPlanningContextStore(state => state.addVariable);

    /* ─────────── Handlers ─────────── */
    const handleProblemSelect = useCallback((problem: ProblemChoice) => {
        setSelectedProblem(problem);
        setSelectedProblemStore(
            problem.target,
            problem.problem_description,
            problem.problem_name
        );
        setStep('background');
    }, [setSelectedProblemStore]);

    const handleCustomSubmit = useCallback(() => {
        if (customProblem.trim()) {
            // 为自定义问题创建一个 ProblemChoice 结构
            const customProblemChoice: ProblemChoice = {
                target: 'custom',
                problem_description: customProblem.trim(),
                problem_name: 'Custom Analysis'
            };
            setSelectedProblem(customProblemChoice);
            setSelectedProblemStore(
                customProblemChoice.target,
                customProblemChoice.problem_description,
                customProblemChoice.problem_name
            );
            setStep('background');
        }
    }, [customProblem, setSelectedProblemStore]);

    const handleBackgroundSubmit = useCallback(() => {
        setStep('confirm');
    }, []);

    const handleFinalConfirm = useCallback(async () => {
        const state = usePreStageStore.getState();
        
        const variables = {
            csv_file_path: currentFile?.name || '',
            problem_description: state.problem_description || '',
            context_description: datasetBackground || 'No additional context provided',
            problem_name: state.problem_name || '',
            user_goal: state.problem_description || ''
        };

        Object.entries(variables).forEach(([key, value]) => {
            addVariable(key, value);
            console.log(`[ProblemDefineState] Added variable ${key}:`, value);
        });

        if (datasetBackground) {
            setDatasetInfoStore(datasetBackground);
        }
        
        state.setDataBackground(datasetBackground || '');

        const aiPlanningStore = useAIPlanningContextStore.getState();
        console.log('[ProblemDefineState] All stored variables:', aiPlanningStore.variables);

        await confirmProblem();
    }, [datasetBackground, confirmProblem, addVariable, currentFile, setDatasetInfoStore]);

    const setPreProblem = useCallback(async () => {
        const fileColumns = usePreStageStore.getState().getFileColumns();
        const datasetInfo = usePreStageStore.getState().getDatasetInfo();
        try {
            const choiceMapResponse = await generalResponse(
                "generate_question_choice_map",
                {
                    "column_info": fileColumns,
                    "dataset_info": datasetInfo
                },
                i18n.language
            );
            // 假设 choiceMapResponse.message 是 ProblemChoice[] 类型
            usePreStageStore.getState().updateChoiceMap(choiceMapResponse["message"]);
        } catch (error) {
            console.error("Failed to generate question choices:", error);
        }
    }, [i18n.language]);

    useEffect(() => {
        if (problem_description && problem_name && currentFile) {
            setSelectedProblem({
                problem_name,
                problem_description,
                target: selectedTarget || 'vds'
            });
            setStep('confirm');
        }
    }, [problem_description, problem_name, selectedTarget, currentFile]);

    useEffect(() => {
        if (currentFile && choiceMap.length === 0 && !problem_description) {
            setPreProblem();
        }
    }, [currentFile, choiceMap.length, problem_description, setPreProblem]);

    /* ─────────── Render Steps ─────────── */
    if (step === 'select') {
        return (
            <div className="relative flex flex-col items-center justify-center h-full w-full bg-transparent">
                <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
                    <div className="text-center mb-8 flex flex-col items-center justify-center">
                        <TypingTitle />
                    </div>
                    
                    <div className="max-w-4xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                {t('emptyState.chooseAnalysisType') || '选择分析类型'}
                            </h2>
                            <p className="text-gray-600">
                                {t('emptyState.fileUploaded') || '文件已上传'}: <span className="font-medium">{currentFile?.name}</span>
                            </p>
                        </div>
                        
                        <div className="grid gap-4 mb-8">
                            {choiceMap.map((choice: ProblemChoice, index: number) => (
                                <button
                                    key={index}
                                    onClick={() => handleProblemSelect(choice)}
                                    className="group p-6 bg-white border-2 border-gray-200 rounded-2xl text-left hover:border-theme-300 hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02]"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-theme-50 rounded-xl flex items-center justify-center group-hover:bg-theme-100 transition-colors">
                                            <Sparkles className="w-6 h-6 text-theme-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-gray-800 mb-2">{choice.problem_name}</h3>
                                            <p className="text-gray-600 text-sm">{choice.problem_description}</p>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-theme-600 transition-colors" />
                                    </div>
                                </button>
                            ))}
                        </div>
                        
                        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-6">
                            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <PlusCircle className="w-5 h-5" />
                                {t('emptyState.customProblem') || '自定义问题'}
                            </h3>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={customProblem}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomProblem(e.target.value)}
                                    placeholder={t('emptyState.customProblemPlaceholder') || '描述你想进行的自定义分析...'}
                                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-theme-400 transition-colors"
                                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCustomSubmit()}
                                />
                                <button
                                    onClick={handleCustomSubmit}
                                    disabled={!customProblem.trim()}
                                    className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                                        customProblem.trim()
                                            ? 'bg-theme-600 text-white hover:bg-theme-700 transform hover:scale-105'
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    {t('emptyState.confirm') || '确认'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'background') {
        return (
            <div className="relative flex flex-col items-center justify-center h-full w-full bg-transparent">
                <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
                    <div className="text-center mb-8 flex flex-col items-center justify-center">
                        <TypingTitle />
                    </div>
                    
                    <div className="max-w-2xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                {t('emptyState.addDatasetBackground') || '添加数据集背景信息'}
                            </h2>
                            <p className="text-gray-600">
                                {t('emptyState.backgroundOptional') || '背景信息是可选的，有助于更好地理解数据'}
                            </p>
                        </div>
                        
                        <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 mb-6">
                            <textarea
                                value={datasetBackground}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDatasetBackground(e.target.value)}
                                placeholder={t('emptyState.backgroundPlaceholder') || '请描述数据集的背景信息、数据来源、收集目的等...'}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-theme-400 resize-none h-32 transition-colors"
                            />
                        </div>
                        
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleBackgroundSubmit}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                            >
                                {t('emptyState.skip') || '跳过'}
                            </button>
                            <button
                                onClick={handleBackgroundSubmit}
                                className="px-6 py-3 bg-theme-600 text-white rounded-xl font-medium hover:bg-theme-700 transition-colors transform hover:scale-105"
                            >
                                {t('emptyState.continue') || '继续'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'confirm') {
        const problemText = selectedProblem
            ? `${selectedProblem.problem_name}: ${selectedProblem.problem_description}`
            : customProblem;
            
        return (
            <div className="relative flex flex-col items-center justify-center h-full w-full bg-transparent">
                <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
                    <div className="text-center mb-8 flex flex-col items-center justify-center">
                        <TypingTitle />
                    </div>
                    
                    <div className="max-w-2xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                {t('emptyState.confirmProblem') || '确认问题设定'}
                            </h2>
                            <p className="text-gray-600">
                                {t('emptyState.reviewSettings') || '请检查以下设置'}
                            </p>
                        </div>
                        
                        <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 mb-8 space-y-4">
                            <div>
                                <h4 className="font-semibold text-gray-800 mb-2">{t('emptyState.analysisType') || '分析类型'}</h4>
                                <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{problemText}</p>
                            </div>
                            
                            <div>
                                <h4 className="font-semibold text-gray-800 mb-2">{t('emptyState.dataFile') || '数据文件'}</h4>
                                <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{currentFile?.name}</p>
                            </div>
                            
                            {datasetBackground && (
                                <div>
                                    <h4 className="font-semibold text-gray-800 mb-2">{t('emptyState.datasetBackground') || '数据集背景'}</h4>
                                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{datasetBackground}</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => {
                                    if (problem_description) {
                                        usePreStageStore.getState().setSelectedProblem('', '', '');
                                    }
                                    setStep('select');
                                }}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                            >
                                {t('emptyState.goBack') || '返回'}
                            </button>
                            <button
                                onClick={handleFinalConfirm}
                                className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors transform hover:scale-105 flex items-center gap-2"
                            >
                                <Sparkles className="w-5 h-5" />
                                {t('emptyState.startAnalysis') || '开始分析'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    return null;
};

/**
 * ProblemDefineState 组件：作为问题定义阶段的容器
 */
const ProblemDefineState: FC<ProblemDefineProps> = ({ confirmProblem }) => {
    return (
        <Splitter>
            <Splitter.Panel defaultSize={'100%'} resizable={false}>
                <div className="flex items-center justify-center w-full h-full">
                    <ProblemDefineWorkload confirmProblem={confirmProblem} />
                </div>
            </Splitter.Panel>
        </Splitter>
    );
};

export default ProblemDefineState;
