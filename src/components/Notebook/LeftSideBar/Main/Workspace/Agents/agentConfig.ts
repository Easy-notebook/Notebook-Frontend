import { AgentType } from '@Services/agentMemoryService';

export interface AgentCapability {
  name: string;
  description: string;
  icon: string;
}

export interface AgentMode {
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentProfile {
  type: AgentType;
  name: string;
  icon: string;
  color: string;
  borderColor: string;
  description: string;
  role: string;
  introduction: string;
  capabilities: AgentCapability[];
  modes: AgentMode[];
  maxIterations: {
    debug_cycles?: number;
    code_generations?: number;
    question_rounds?: number;
  };
  engine: string;
  specialty: string[];
}

export const AGENT_PROFILES: Record<AgentType, AgentProfile> = {
  general: {
    type: 'general',
    name: 'General Agent',
    icon: 'GEN',
    color: 'bg-theme-100 text-theme-800',
    borderColor: 'border-theme-200',
    description: 'Handles general questions and conversations',
    role: 'You are AI Agent behind easyremote notebook.',
    introduction: `Hi! I'm your General Agent, your primary assistant in the Claude Code environment. 

I'm designed to handle a wide range of questions and provide comprehensive support for your data science and programming tasks. Think of me as your knowledgeable companion who can help you understand concepts, plan approaches, and navigate through complex problems.

I'm particularly good at explaining concepts, providing guidance, and helping you think through problems step by step. Whether you need clarification on a technical concept or want to discuss the best approach for your project, I'm here to help!`,
    capabilities: [
      {
        name: 'Question Answering',
        description: 'Provide detailed answers to technical and conceptual questions',
        icon: 'Q&A'
      },
      {
        name: 'Problem Analysis',
        description: 'Break down complex problems into manageable steps',
        icon: 'ANALYZE'
      },
      {
        name: 'Concept Explanation',
        description: 'Explain technical concepts in clear, understandable terms',
        icon: 'EXPLAIN'
      },
      {
        name: 'Project Guidance',
        description: 'Provide strategic advice and planning support',
        icon: 'GUIDE'
      }
    ],
    modes: [
      { name: 'Interactive Q&A', description: 'Real-time question answering', enabled: true },
      { name: 'Tutorial Mode', description: 'Step-by-step learning guidance', enabled: true },
      { name: 'Research Assistant', description: 'Help with research and analysis', enabled: true }
    ],
    maxIterations: {
      question_rounds: 20
    },
    engine: 'o4-mini',
    specialty: ['General Support', 'Education', 'Problem Solving', 'Conceptual Guidance']
  },

  command: {
    type: 'command',
    name: 'Command Agent',
    icon: 'CMD',
    color: 'bg-green-100 text-green-800',
    borderColor: 'border-green-200',
    description: 'Executes commands and generates code',
    role: 'You are an AI assistant that generates code based on user instructions. 只输出python代码，除了代码以外的只能解释代码用用注释',
    introduction: `Hello! I'm your Command Agent, specialized in turning your ideas into executable Python code.

I excel at understanding your requirements and generating clean, efficient Python code that gets the job done. My primary focus is code generation - I listen to what you want to accomplish and write the appropriate code to make it happen.

Key things about me:
• I output primarily Python code with minimal explanations
• I use common fonts in plotting code to ensure compatibility
• I focus on practical, working solutions
• I keep explanations concise and within code comments

Just tell me what you want to accomplish, and I'll generate the code to make it happen!`,
    capabilities: [
      {
        name: 'Code Generation',
        description: 'Generate Python code based on user instructions',
        icon: 'CODE'
      },
      {
        name: 'Data Processing',
        description: 'Create code for data manipulation and analysis',
        icon: 'DATA'
      },
      {
        name: 'Visualization',
        description: 'Generate plotting and visualization code',
        icon: 'VIZ'
      },
      {
        name: 'Task Automation',
        description: 'Write code to automate repetitive tasks',
        icon: 'AUTO'
      }
    ],
    modes: [
      { name: 'Code Generation', description: 'Direct code output from instructions', enabled: true },
      { name: 'Function Creation', description: 'Generate reusable functions', enabled: true },
      { name: 'Script Writing', description: 'Create complete scripts', enabled: true }
    ],
    maxIterations: {
      code_generations: 10
    },
    engine: 'gpt-4o',
    specialty: ['Python Programming', 'Data Analysis', 'Visualization', 'Automation']
  },

  debug: {
    type: 'debug',
    name: 'Debug Agent',
    icon: 'FIX',
    color: 'bg-red-100 text-red-800',
    borderColor: 'border-red-200',
    description: 'Helps with debugging and troubleshooting',
    role: 'You are a debugging specialist AI agent that helps identify and fix code issues.',
    introduction: `Hey there! I'm your Debug Agent, your go-to specialist when things aren't working as expected.

I'm designed to help you identify, understand, and fix issues in your code. Whether you're dealing with syntax errors, logical bugs, runtime exceptions, or performance issues, I'm here to help you get back on track.

My approach to debugging:
• Analyze error messages and execution results
• Identify root causes of problems
• Suggest targeted fixes and improvements
• Help you understand why issues occurred
• Prevent similar problems in the future

I work systematically through debugging challenges and can handle everything from simple syntax fixes to complex logical issues. Let's get your code working perfectly!`,
    capabilities: [
      {
        name: 'Error Analysis',
        description: 'Analyze error messages and execution results',
        icon: 'ERROR'
      },
      {
        name: 'Code Fixing',
        description: 'Identify and fix bugs in existing code',
        icon: 'REPAIR'
      },
      {
        name: 'Performance Optimization',
        description: 'Improve code performance and efficiency',
        icon: 'OPTIMIZE'
      },
      {
        name: 'Testing Support',
        description: 'Help create tests and validate fixes',
        icon: 'TEST'
      }
    ],
    modes: [
      { name: 'Error Diagnosis', description: 'Analyze and explain errors', enabled: true },
      { name: 'Code Review', description: 'Review code for potential issues', enabled: true },
      { name: 'Fix Generation', description: 'Generate corrected code versions', enabled: true }
    ],
    maxIterations: {
      debug_cycles: 5
    },
    engine: 'gpt-4o',
    specialty: ['Debugging', 'Error Handling', 'Code Review', 'Performance Tuning']
  },

  output: {
    type: 'output',
    name: 'Output Agent',
    icon: 'OUT',
    color: 'bg-purple-100 text-purple-800',
    borderColor: 'border-purple-200',
    description: 'Processes and analyzes outputs',
    role: 'You are an output analysis specialist that helps interpret and explain code execution results.',
    introduction: `Hi! I'm your Output Agent, specialized in analyzing and interpreting the results of your code execution.

I excel at making sense of complex outputs, whether they're data visualizations, statistical results, model outputs, or error messages. My job is to help you understand what your code produced and what it means for your project.

What I do best:
• Interpret execution results and outputs
• Analyze data visualizations and plots
• Explain statistical and model results
• Summarize findings and insights
• Suggest next steps based on results

I bridge the gap between raw output and actionable insights, helping you understand not just what happened, but what it means and what you should do next.`,
    capabilities: [
      {
        name: 'Result Interpretation',
        description: 'Explain and interpret code execution results',
        icon: 'RESULT'
      },
      {
        name: 'Data Analysis',
        description: 'Analyze and summarize data outputs',
        icon: 'ANALYSIS'
      },
      {
        name: 'Visualization Review',
        description: 'Interpret charts, plots, and visual outputs',
        icon: 'VISUAL'
      },
      {
        name: 'Insight Generation',
        description: 'Extract insights and suggest next steps',
        icon: 'INSIGHT'
      }
    ],
    modes: [
      { name: 'Output Analysis', description: 'Analyze and explain execution results', enabled: true },
      { name: 'Data Interpretation', description: 'Interpret data and statistical outputs', enabled: true },
      { name: 'Visual Analysis', description: 'Analyze charts and visualizations', enabled: true }
    ],
    maxIterations: {
      question_rounds: 15
    },
    engine: 'gpt-4o',
    specialty: ['Output Analysis', 'Data Interpretation', 'Result Explanation', 'Insight Generation']
  }
};