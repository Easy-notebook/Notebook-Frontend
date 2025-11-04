// services/agentMemoryService.ts
export type AgentType = 'general' | 'command' | 'debug' | 'output';

// 通用Agent记忆存储结构
interface AgentMemory {
  // 基础信息
  agent_type: AgentType;
  notebook_id: string;
  created_at: number;
  last_updated: number;
  
  // 用户意图观测
  user_intent_observations: {
    stated_goals: string[];
    inferred_goals: string[];
    progress_markers: {
      completed_steps: string[];
      current_focus: string;
      blocked_on: string[];
    };
  };
  
  // 实际情况记录
  situation_tracking: {
    debug_attempts: {
      attempted_directions: string[];
      failed_approaches: string[];
      remaining_strategies: string[];
      debug_cycle_count: number;
      max_debug_attempts: number;
    };
    code_evolution: {
      original_version?: string;
      working_versions: string[];
      current_version: string;
      broken_versions: string[];
      version_notes: Record<string, string>;
    };
    task_completion: {
      total_requirements: string[];
      completed_requirements: string[];
      pending_requirements: string[];
      blocked_requirements: string[];
    };
    successful_interactions: any[];
    failed_attempts: any[];
    current_context?: any[];
  };
  
  // 触发条件和终止机制
  termination_conditions: {
    max_iterations: {
      debug_cycles: number;
      code_generations: number;
      question_rounds: number;
    };
    current_counts: {
      debug_cycles: number;
      code_generations: number;
      question_rounds: number;
    };
    success_criteria: string[];
    failure_indicators: string[];
  };
  
  // 交互历史
  interactions: {
    user_input: string;
    agent_response: string;
    timestamp: number;
    outcome: 'success' | 'partial' | 'failed' | 'blocked';
    context_snapshot: {
      cell_id: string;
      task_phase: string;
      debug_cycle: number;
    };
  }[];
  
  // 学习到的模式
  learned_patterns: {
    effective_solutions: Record<string, string>;
    user_preferences: {
      coding_style: string[];
      preferred_libraries: string[];
      explanation_detail: 'brief' | 'detailed';
    };
    warning_signs: string[];
  };
}

// Agent记忆存储
interface AgentMemoryStore {
  [agent_id: string]: AgentMemory;
}

export class AgentMemoryService {
  private static memories: AgentMemoryStore = {};
  private static readonly STORAGE_KEY = 'agent_memories_v2';

  // 生成agent_id
  static generateAgentId(notebookId: string, agentType: AgentType): string {
    return `${notebookId}_${agentType}`;
  }

  // 初始化Agent记忆
  static initializeAgentMemory(notebookId: string, agentType: AgentType): AgentMemory {
    const agent_id = this.generateAgentId(notebookId, agentType);
    
    if (this.memories[agent_id]) {
      return this.memories[agent_id];
    }

    const memory: AgentMemory = {
      agent_type: agentType,
      notebook_id: notebookId,
      created_at: Date.now(),
      last_updated: Date.now(),
      
      user_intent_observations: {
        stated_goals: [],
        inferred_goals: [],
        progress_markers: {
          completed_steps: [],
          current_focus: '',
          blocked_on: []
        }
      },
      
      situation_tracking: {
        debug_attempts: {
          attempted_directions: [],
          failed_approaches: [],
          remaining_strategies: [],
          debug_cycle_count: 0,
          max_debug_attempts: 5
        },
        code_evolution: {
          working_versions: [],
          current_version: '',
          broken_versions: [],
          version_notes: {}
        },
        task_completion: {
          total_requirements: [],
          completed_requirements: [],
          pending_requirements: [],
          blocked_requirements: []
        },
        successful_interactions: [],
        failed_attempts: []
      },
      
      termination_conditions: {
        max_iterations: {
          debug_cycles: 5,
          code_generations: 10,
          question_rounds: 20
        },
        current_counts: {
          debug_cycles: 0,
          code_generations: 0,
          question_rounds: 0
        },
        success_criteria: [],
        failure_indicators: []
      },
      
      interactions: [],
      
      learned_patterns: {
        effective_solutions: {},
        user_preferences: {
          coding_style: [],
          preferred_libraries: [],
          explanation_detail: 'detailed'
        },
        warning_signs: []
      }
    };

    this.memories[agent_id] = memory;
    this.saveToStorage();
    return memory;
  }

  // 获取Agent记忆
  static getAgentMemory(notebookId: string, agentType: AgentType): AgentMemory | null {
    const agent_id = this.generateAgentId(notebookId, agentType);
    return this.memories[agent_id] || null;
  }

  // 更新Agent记忆
  static updateAgentMemory(notebookId: string, agentType: AgentType, updates: Partial<AgentMemory>): void {
    const agent_id = this.generateAgentId(notebookId, agentType);
    const currentMemory = this.memories[agent_id];
    
    if (!currentMemory) {
      console.warn(`No memory found for ${agent_id}`);
      return;
    }

    this.memories[agent_id] = {
      ...currentMemory,
      ...updates,
      last_updated: Date.now()
    };
    
    this.saveToStorage();
    
    // 触发具体agent更新事件
    const event = new CustomEvent('agentMemoryUpdated', {
      detail: { 
        notebookId, 
        agentType, 
        timestamp: Date.now(),
        updateType: 'memory_update'
      }
    });
    window.dispatchEvent(event);
  }

  // 记录操作型交互（用于streamHandler）
  static recordOperationInteraction(
    notebookId: string,
    agentType: AgentType,
    operationType: string,
    success: boolean,
    operationData: any = {}
  ): void {
    let memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, agentType);
    }

    const interaction = {
      operation_type: operationType,
      success,
      timestamp: Date.now(),
      operation_data: operationData,
      context_snapshot: {
        debug_cycle: memory.termination_conditions.current_counts.debug_cycles,
        code_generations: memory.termination_conditions.current_counts.code_generations,
        question_rounds: memory.termination_conditions.current_counts.question_rounds
      }
    };

    // 添加到情况跟踪
    const situation = memory.situation_tracking;
    
    if (success) {
      situation.successful_interactions.push(interaction);
      // 只保留最近20次成功交互
      if (situation.successful_interactions.length > 20) {
        situation.successful_interactions = situation.successful_interactions.slice(-20);
      }
    } else {
      situation.failed_attempts.push(interaction);
      // 只保留最近30次失败尝试
      if (situation.failed_attempts.length > 30) {
        situation.failed_attempts = situation.failed_attempts.slice(-30);
      }
    }

    // 更新计数器
    if (agentType === 'debug') {
      memory.termination_conditions.current_counts.debug_cycles++;
    } else if (agentType === 'command') {
      memory.termination_conditions.current_counts.code_generations++;
    } else if (agentType === 'general') {
      memory.termination_conditions.current_counts.question_rounds++;
    }

    this.saveToStorage();
    
    // 触发交互记录事件
    const event = new CustomEvent('agentMemoryUpdated', {
      detail: { 
        notebookId, 
        agentType, 
        timestamp: Date.now(),
        updateType: 'operation_interaction'
      }
    });
    window.dispatchEvent(event);
  }

  // 记录交互
  static recordInteraction(
    notebookId: string,
    agentType: AgentType,
    userInput: string,
    agentResponse: string,
    outcome: 'success' | 'partial' | 'failed' | 'blocked',
    context: {
      cell_id: string;
      task_phase: string;
    }
  ): void {
    let memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, agentType);
    }

    const interaction = {
      user_input: userInput,
      agent_response: agentResponse,
      timestamp: Date.now(),
      outcome,
      context_snapshot: {
        cell_id: context.cell_id,
        task_phase: context.task_phase,
        debug_cycle: memory.termination_conditions.current_counts.debug_cycles
      }
    };

    memory.interactions.unshift(interaction); // 最新的在前面
    
    // 只保留最近50次交互
    if (memory.interactions.length > 50) {
      memory.interactions = memory.interactions.slice(0, 50);
    }

    // 更新计数器
    if (agentType === 'debug') {
      memory.termination_conditions.current_counts.debug_cycles++;
    } else if (agentType === 'command') {
      memory.termination_conditions.current_counts.code_generations++;
    } else if (agentType === 'general') {
      memory.termination_conditions.current_counts.question_rounds++;
    }

    this.updateAgentMemory(notebookId, agentType, memory);
    
    // 触发交互记录事件
    const event = new CustomEvent('agentMemoryUpdated', {
      detail: { 
        notebookId, 
        agentType, 
        timestamp: Date.now(),
        updateType: 'interaction_record'
      }
    });
    window.dispatchEvent(event);
  }

  // 记录debug尝试
  static recordDebugAttempt(
    notebookId: string,
    direction: string,
    success: boolean,
    codeVersion?: string
  ): void {
    let memory = this.getAgentMemory(notebookId, 'debug');
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, 'debug');
    }

    const debugAttempts = memory.situation_tracking.debug_attempts;
    
    if (!debugAttempts.attempted_directions.includes(direction)) {
      debugAttempts.attempted_directions.push(direction);
    }

    if (!success && !debugAttempts.failed_approaches.includes(direction)) {
      debugAttempts.failed_approaches.push(direction);
    }

    if (codeVersion) {
      const codeEvolution = memory.situation_tracking.code_evolution;
      codeEvolution.current_version = codeVersion;
      
      if (success) {
        if (!codeEvolution.working_versions.includes(codeVersion)) {
          codeEvolution.working_versions.push(codeVersion);
        }
      } else {
        if (!codeEvolution.broken_versions.includes(codeVersion)) {
          codeEvolution.broken_versions.push(codeVersion);
        }
      }
    }

    this.updateAgentMemory(notebookId, 'debug', memory);
  }

  // 学习成功的解决方案
  static learnSuccessfulSolution(
    notebookId: string,
    agentType: AgentType,
    problemType: string,
    solution: string
  ): void {
    let memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, agentType);
    }

    memory.learned_patterns.effective_solutions[problemType] = solution;
    this.updateAgentMemory(notebookId, agentType, memory);
  }

  // 更新用户意图
  static updateUserIntent(
    notebookId: string,
    agentType: AgentType,
    statedGoals: string[] = [],
    inferredGoals: string[] = [],
    currentFocus: string = '',
    blockedOn: string[] = []
  ): void {
    let memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, agentType);
    }

    const intent = memory.user_intent_observations;
    
    // 添加新的目标，避免重复
    statedGoals.forEach(goal => {
      if (!intent.stated_goals.includes(goal)) {
        intent.stated_goals.push(goal);
      }
    });
    
    inferredGoals.forEach(goal => {
      if (!intent.inferred_goals.includes(goal)) {
        intent.inferred_goals.push(goal);
      }
    });

    if (currentFocus) {
      intent.progress_markers.current_focus = currentFocus;
    }
    
    intent.progress_markers.blocked_on = blockedOn;

    this.updateAgentMemory(notebookId, agentType, memory);
  }

  // 更新当前上下文状态
  static updateCurrentContext(
    notebookId: string,
    agentType: AgentType,
    contextData: Record<string, any>
  ): void {
    let memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      memory = this.initializeAgentMemory(notebookId, agentType);
    }

    // 将上下文数据添加到最近的交互记录中，或创建新的上下文记录
    const contextRecord = {
      context_update: contextData,
      timestamp: Date.now(),
      agent_type: agentType
    };

    // 如果没有专门的上下文存储字段，我们可以将其添加到situation_tracking中
    if (!memory.situation_tracking.current_context) {
      memory.situation_tracking.current_context = [];
    }
    
    memory.situation_tracking.current_context.unshift(contextRecord);
    
    // 只保留最近10个上下文记录
    if (memory.situation_tracking.current_context.length > 10) {
      memory.situation_tracking.current_context = memory.situation_tracking.current_context.slice(0, 10);
    }

    this.updateAgentMemory(notebookId, agentType, memory);
  }

  // 为后端准备记忆上下文
  static prepareMemoryContextForBackend(
    notebookId: string | null,
    agentType: AgentType,
    currentContext: {
      current_cell_id?: string;
      current_code?: string;
      error_message?: string;
      related_cells?: any[];
      related_qa_ids?: string[];
      current_qa_id?: string;
      question_content?: string;
      command_id?: string;
      command_content?: string;
    }
  ): any {
    // 如果notebookId为null，生成一个临时的session ID
    const effectiveNotebookId = notebookId || `temp-session-${Date.now()}`;
    
    console.log('prepareMemoryContextForBackend:', {
      original_notebookId: notebookId,
      effective_notebookId: effectiveNotebookId,
      agentType
    });
    
    const memory = this.getAgentMemory(effectiveNotebookId, agentType);
    
    return {
      agent_memory: memory,
      current_context: currentContext,
      notebook_id: effectiveNotebookId,
      agent_type: agentType
    };
  }

  // 检查是否应该终止
  static shouldTerminate(notebookId: string, agentType: AgentType): { shouldTerminate: boolean; reason: string } {
    const memory = this.getAgentMemory(notebookId, agentType);
    if (!memory) {
      return { shouldTerminate: false, reason: '' };
    }

    const { current_counts, max_iterations } = memory.termination_conditions;
    
    if (agentType === 'debug' && current_counts.debug_cycles >= max_iterations.debug_cycles) {
      return { 
        shouldTerminate: true, 
        reason: `已进行${current_counts.debug_cycles}次debug尝试，建议换个思路或寻求帮助` 
      };
    }
    
    if (agentType === 'command' && current_counts.code_generations >= max_iterations.code_generations) {
      return { 
        shouldTerminate: true, 
        reason: `已生成${current_counts.code_generations}个代码版本，建议暂停整理思路` 
      };
    }
    
    if (agentType === 'general' && current_counts.question_rounds >= max_iterations.question_rounds) {
      return { 
        shouldTerminate: true, 
        reason: `问答轮次过多，建议总结当前进展` 
      };
    }

    return { shouldTerminate: false, reason: '' };
  }

  // 重置特定类型的计数器
  static resetCounter(notebookId: string, agentType: AgentType, counterType: 'debug_cycles' | 'code_generations' | 'question_rounds'): void {
    const memory = this.getAgentMemory(notebookId, agentType);
    if (memory) {
      memory.termination_conditions.current_counts[counterType] = 0;
      this.updateAgentMemory(notebookId, agentType, memory);
    }
  }

  // 存储管理
  private static saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.memories));
      // 触发自定义事件通知组件更新
      const event = new CustomEvent('agentMemoryUpdated', {
        detail: { timestamp: Date.now() }
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to save agent memories:', error);
    }
  }

  static loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.memories = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load agent memories:', error);
      this.memories = {};
    }
  }

  // 清理过期记忆
  static cleanupExpiredMemories(): void {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    Object.keys(this.memories).forEach(agent_id => {
      const memory = this.memories[agent_id];
      if (memory && memory.last_updated < oneWeekAgo) {
        delete this.memories[agent_id];
      }
    });
    
    this.saveToStorage();
  }

  // 清理所有记忆数据
  static clearAllMemories(): void {
    this.memories = {};
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('所有agent记忆已清理');
    } catch (error) {
      console.error('清理记忆失败:', error);
    }
  }

  // 获取存储使用情况
  static getStorageUsage(): { used: number; total: number; percentage: number } {
    try {
      let total = 0;
      let used = 0;
      
      // 估算localStorage使用量
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
      
      // 大多数浏览器localStorage限制为5-10MB
      total = 5 * 1024 * 1024; // 5MB
      
      return {
        used,
        total,
        percentage: Math.round((used / total) * 100)
      };
    } catch (error) {
      console.error('获取存储使用情况失败:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  // 压缩存储数据
  static compressMemories(): void {
    Object.keys(this.memories).forEach(agent_id => {
      const memory = this.memories[agent_id];
      if (memory) {
        // 减少交互历史保留数量
        if (memory.interactions.length > 20) {
          memory.interactions = memory.interactions.slice(0, 20);
        }
        
        // 减少成功交互记录
        if (memory.situation_tracking.successful_interactions.length > 10) {
          memory.situation_tracking.successful_interactions = 
            memory.situation_tracking.successful_interactions.slice(-10);
        }
        
        // 减少失败尝试记录
        if (memory.situation_tracking.failed_attempts.length > 15) {
          memory.situation_tracking.failed_attempts = 
            memory.situation_tracking.failed_attempts.slice(-15);
        }
        
        // 清理过长的代码版本历史
        const codeEvolution = memory.situation_tracking.code_evolution;
        if (codeEvolution.working_versions.length > 5) {
          codeEvolution.working_versions = codeEvolution.working_versions.slice(-5);
        }
        if (codeEvolution.broken_versions.length > 5) {
          codeEvolution.broken_versions = codeEvolution.broken_versions.slice(-5);
        }
      }
    });
    
    this.saveToStorage();
    console.log('记忆数据已压缩');
  }

  // 获取记忆统计
  static getMemoryStats(): any {
    const stats = {
      total_agents: Object.keys(this.memories).length,
      by_type: {} as Record<AgentType, number>,
      by_notebook: {} as Record<string, number>
    };

    Object.values(this.memories).forEach(memory => {
      // 按类型统计
      stats.by_type[memory.agent_type] = (stats.by_type[memory.agent_type] || 0) + 1;
      
      // 按notebook统计
      stats.by_notebook[memory.notebook_id] = (stats.by_notebook[memory.notebook_id] || 0) + 1;
    });

    return stats;
  }
}

// 初始化服务
AgentMemoryService.loadFromStorage();