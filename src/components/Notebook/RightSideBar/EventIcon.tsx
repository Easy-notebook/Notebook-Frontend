import React from 'react';
import { 
  MessageSquare, UploadCloud, Eye, BookOpen, Code, PlayCircle,
  BarChart2, Bug, AlertTriangle, MessageCircle, Wrench, Server,
  Edit, ShieldCheck
} from 'lucide-react';
import { EVENT_TYPES, EventType } from '../../../store/AIAgentStore';

export interface EventIconProps { type: EventType; className?: string; onProcess?: boolean }

const EventIcon: React.FC<EventIconProps> = ({ type, className = 'w-5 h-5' }) => {
  const iconConfig = {
    [EVENT_TYPES.USER_ASK_QUESTION]: { Icon: MessageSquare, color: 'text-theme-600' },
    [EVENT_TYPES.USER_NEW_INSTRUCTION]: { Icon: Code, color: 'text-green-600' },
    [EVENT_TYPES.USER_FILE_UPLOAD]: { Icon: UploadCloud, color: 'text-purple-600' },
    [EVENT_TYPES.AI_UNDERSTANDING]: { Icon: Eye, color: 'text-yellow-600' },
    [EVENT_TYPES.AI_EXPLAINING_PROCESS]: { Icon: BookOpen, color: 'text-indigo-600' },
    [EVENT_TYPES.AI_WRITING_CODE]: { Icon: Code, color: 'text-green-800' },
    [EVENT_TYPES.AI_RUNNING_CODE]: { Icon: PlayCircle, color: 'text-pink-600' },
    [EVENT_TYPES.AI_ANALYZING_RESULTS]: { Icon: BarChart2, color: 'text-teal-600' },
    [EVENT_TYPES.AI_FIXING_BUGS]: { Icon: Bug, color: 'text-red-600' },
    [EVENT_TYPES.AI_CRITICAL_THINKING]: { Icon: AlertTriangle, color: 'text-orange-600' },
    [EVENT_TYPES.AI_REPLYING_QUESTION]: { Icon: MessageCircle, color: 'text-theme-800' },
    [EVENT_TYPES.AI_FIXING_CODE]: { Icon: Wrench, color: 'text-gray-800' },
    [EVENT_TYPES.SYSTEM_EVENT]: { Icon: Server, color: 'text-gray-600' },
    [EVENT_TYPES.AI_GENERATING_CODE]: { Icon: Edit, color: 'text-green-800' },
    [EVENT_TYPES.AI_GENERATING_TEXT]: { Icon: Edit, color: 'text-indigo-800' },
  } as Record<string, { Icon: any; color: string }>;

  const { Icon = ShieldCheck, color = 'text-theme-800' } = iconConfig[type] || {} as any;
  return (
    <div className="relative">
      <Icon className={`${className} ${color} transition-colors duration-300`} />
    </div>
  );
};

export default EventIcon;


