/**
 * 前端上下文总结工具
 * Frontend Context Summarizer - 提供智能上下文管理和总结功能
 */

export class ContextSummarizer {
    constructor() {
        this.maxSummaryLength = 500;
        this.maxHistoryItems = 20;
    }

    /**
     * 为阶段创建总结
     */
    createStageSummary(stageId, stepResults, agentHistory) {
        const summary = {
            stage_id: stageId,
            timestamp: new Date().toISOString(),
            steps_completed: Object.keys(stepResults).length,
            key_outcomes: [],
            issues_encountered: [],
            is_milestone: true,
            confidence_level: 0.9
        };

        // 分析步骤结果
        Object.entries(stepResults).forEach(([stepId, result]) => {
            if (result && typeof result === 'object') {
                if (result.status === 'success' || result.success) {
                    if (result.key_outputs || result.outputs) {
                        const outputs = result.key_outputs || result.outputs;
                        summary.key_outcomes.push(`${stepId}: ${this.summarizeOutputs(outputs)}`);
                    }
                } else if (result.status === 'error' || result.error) {
                    const error = result.error || result.message || 'Unknown error';
                    summary.issues_encountered.push(`${stepId}: ${error.substring(0, 100)}`);
                }
            }
        });

        // 分析agent历史找到关键洞察
        const keyInsights = agentHistory
            .filter(item => item.confidence_level > 0.7 && item.thinking_text)
            .slice(-3)
            .map(item => item.thinking_text.substring(0, 100));

        if (keyInsights.length > 0) {
            summary.key_insights = keyInsights;
        }

        return summary;
    }

    /**
     * 总结输出内容
     */
    summarizeOutputs(outputs) {
        if (!outputs) return 'No outputs';
        
        if (Array.isArray(outputs)) {
            if (outputs.length === 0) return 'Empty results';
            if (outputs.length === 1) return String(outputs[0]).substring(0, 50);
            return `${outputs.length} items: ${String(outputs[0]).substring(0, 30)}...`;
        }

        if (typeof outputs === 'object') {
            const keys = Object.keys(outputs);
            return `${keys.length} properties: ${keys.slice(0, 3).join(', ')}`;
        }

        return String(outputs).substring(0, 50);
    }

    /**
     * 压缩历史记录保留关键信息
     */
    compressHistory(history, maxItems = this.maxHistoryItems) {
        if (!history || history.length <= maxItems) {
            return history;
        }

        // 保留里程碑
        const milestones = history.filter(item => 
            item.is_milestone || item.confidence_level > 0.8
        );

        // 保留最近的记录
        const recentCount = Math.max(10, maxItems - milestones.length);
        const recent = history.slice(-recentCount);

        // 合并并去重
        const combined = [...milestones, ...recent];
        const unique = combined.filter((item, index, arr) => 
            arr.findIndex(t => t.timestamp === item.timestamp) === index
        );

        return unique.slice(-maxItems);
    }

    /**
     * 创建工作流进度总结
     */
    createProgressSummary(currentStage, completedStages, completedSteps, stageSummaries) {
        const summary = {
            current_stage: currentStage,
            overall_progress: {
                completed_stages: completedStages.length,
                completed_steps: completedSteps.length,
                current_status: 'in_progress'
            },
            key_achievements: [],
            next_actions: [],
            timestamp: new Date().toISOString()
        };

        // 提取关键成果
        if (stageSummaries) {
            Object.values(stageSummaries).forEach(stageSummary => {
                if (stageSummary.key_outcomes) {
                    summary.key_achievements.push(...stageSummary.key_outcomes.slice(0, 2));
                }
            });
        }

        // 限制成果数量
        summary.key_achievements = summary.key_achievements.slice(0, 5);

        return summary;
    }

    /**
     * 检查是否需要创建阶段总结
     */
    shouldCreateStageSummary(stepResults, threshold = 3) {
        return Object.keys(stepResults).length >= threshold;
    }

    /**
     * 优化上下文数据以减少传输大小
     */
    optimizeContextForTransmission(context) {
        if (!context) return context;

        const optimized = { ...context };

        // 压缩agent思考历史
        if (optimized.agent_thinking_history) {
            optimized.agent_thinking_history = this.compressHistory(
                optimized.agent_thinking_history
            );
        }

        // 简化步骤结果
        if (optimized.step_results) {
            const simplified = {};
            Object.entries(optimized.step_results).forEach(([stepId, result]) => {
                if (result && typeof result === 'object') {
                    simplified[stepId] = {
                        status: result.status || 'unknown',
                        summary: result.summary || this.summarizeOutputs(result.outputs),
                        timestamp: result.timestamp
                    };
                } else {
                    simplified[stepId] = String(result).substring(0, 100);
                }
            });
            optimized.step_results = simplified;
        }

        // 压缩变量数据
        if (optimized.variables) {
            const compressedVars = {};
            Object.entries(optimized.variables).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length > 200) {
                    compressedVars[key] = value.substring(0, 200) + '...[truncated]';
                } else if (typeof value === 'object' && value !== null) {
                    compressedVars[key] = `[Object: ${Object.keys(value).length} properties]`;
                } else {
                    compressedVars[key] = value;
                }
            });
            optimized.variables = compressedVars;
        }

        return optimized;
    }

    /**
     * 估算上下文大小
     */
    estimateContextSize(context) {
        try {
            return JSON.stringify(context).length;
        } catch (error) {
            console.warn('Failed to estimate context size:', error);
            return 0;
        }
    }

    /**
     * 检查是否需要压缩
     */
    shouldCompress(context, maxSize = 8000) {
        return this.estimateContextSize(context) > maxSize;
    }
}

// 导出单例实例
export const contextSummarizer = new ContextSummarizer();
export default contextSummarizer;