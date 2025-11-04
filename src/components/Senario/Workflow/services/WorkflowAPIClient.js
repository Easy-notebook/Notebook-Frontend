/**
 */

import constants from './constants';

class WorkflowAPIClient {
    constructor() {
        this.maxContextLength = 8000; // 最大上下文长度
        this.maxHistoryItems = 50; // 最大历史记录数
    }

    /**
     * 压缩上下文数据以避免过长
     */
    compressContext(context) {
        if (!context) return context;
        
        const compressed = { ...context };
        
        // 压缩历史记录
        if (compressed.agent_thinking_history && compressed.agent_thinking_history.length > this.maxHistoryItems) {
            // 保留最近的记录和关键里程碑
            const recent = compressed.agent_thinking_history.slice(-this.maxHistoryItems * 0.7);
            const milestones = compressed.agent_thinking_history
                .filter(item => item.is_milestone || item.confidence_level > 0.8)
                .slice(-this.maxHistoryItems * 0.3);
            
            compressed.agent_thinking_history = [...milestones, ...recent];
        }
        
        // 压缩步骤结果 - 只保留关键信息
        if (compressed.step_results) {
            Object.keys(compressed.step_results).forEach(stepId => {
                const result = compressed.step_results[stepId];
                if (result && typeof result === 'object') {
                    compressed.step_results[stepId] = {
                        status: result.status,
                        summary: result.summary || this.summarizeStepResult(result),
                        key_outputs: result.key_outputs || result.outputs,
                        timestamp: result.timestamp
                    };
                }
            });
        }
        
        // 检查总长度
        const contextStr = JSON.stringify(compressed);
        if (contextStr.length > this.maxContextLength) {
            return this.aggressiveCompress(compressed);
        }
        
        return compressed;
    }

    /**
     * 激进压缩 - 当常规压缩仍然过长时使用
     */
    aggressiveCompress(context) {
        const compressed = { ...context };
        
        // 只保留最核心的信息
        if (compressed.agent_thinking_history) {
            compressed.agent_thinking_history = compressed.agent_thinking_history
                .filter(item => item.is_milestone || item.confidence_level > 0.9)
                .slice(-10);
        }
        
        // 为每个阶段创建总结
        if (compressed.stage_results) {
            Object.keys(compressed.stage_results).forEach(stageId => {
                const result = compressed.stage_results[stageId];
                compressed.stage_results[stageId] = {
                    status: 'completed',
                    summary: `Stage ${stageId} completed with ${result.steps?.length || 0} steps`,
                    completedAt: result.completedAt
                };
            });
        }
        
        return compressed;
    }

    /**
     * 为步骤结果创建总结
     */
    summarizeStepResult(result) {
        if (!result) return 'No result';
        
        if (result.code) {
            return `Executed code with ${result.outputs?.length || 0} outputs`;
        }
        
        if (result.analysis) {
            return result.analysis.substring(0, 200) + '...';
        }
        
        return JSON.stringify(result).substring(0, 100) + '...';
    }

    
    async sendFeedback(feedbackRequest) {
        try {
            const compressedState = this.compressContext(feedbackRequest.state);
            
            const response = await fetch(constants.API.FEEDBACK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stage_id: feedbackRequest.stage_id,
                    step_index: feedbackRequest.step_index,
                    state: compressedState,
                    notebook_id: feedbackRequest.notebook_id
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to send feedback:', error);
            throw error;
        }
    }
}

// 创建单例实例
const workflowAPIClient = new WorkflowAPIClient();

export default workflowAPIClient;