import { EVENT_TYPES, EventType } from '../../../store/AIAgentStore';

export const getEventLabel = (type: EventType, t: any) => {
  const labelConfig = {
    [EVENT_TYPES.USER_ASK_QUESTION]: { text: t('rightSideBar.eventTypes.question'), color: 'bg-theme-100 text-theme-800' },
    [EVENT_TYPES.USER_NEW_INSTRUCTION]: { text: t('rightSideBar.eventTypes.instruction'), color: 'bg-green-100 text-green-800' },
    [EVENT_TYPES.USER_FILE_UPLOAD]: { text: t('rightSideBar.eventTypes.upload'), color: 'bg-purple-100 text-purple-800' },
    [EVENT_TYPES.AI_UNDERSTANDING]: { text: t('rightSideBar.eventTypes.understanding'), color: 'bg-yellow-100 text-yellow-800' },
    [EVENT_TYPES.AI_EXPLAINING_PROCESS]: { text: t('rightSideBar.eventTypes.explaining'), color: 'bg-indigo-100 text-indigo-800' },
    [EVENT_TYPES.AI_WRITING_CODE]: { text: t('rightSideBar.eventTypes.coding'), color: 'bg-green-100 text-green-800' },
    [EVENT_TYPES.AI_RUNNING_CODE]: { text: t('rightSideBar.eventTypes.running'), color: 'bg-pink-100 text-pink-800' },
    [EVENT_TYPES.AI_ANALYZING_RESULTS]: { text: t('rightSideBar.eventTypes.analysis'), color: 'bg-teal-100 text-teal-800' },
    [EVENT_TYPES.AI_FIXING_BUGS]: { text: t('rightSideBar.eventTypes.debug'), color: 'bg-red-100 text-red-800' },
    [EVENT_TYPES.AI_CRITICAL_THINKING]: { text: t('rightSideBar.eventTypes.thinking'), color: 'bg-orange-100 text-orange-800' },
    [EVENT_TYPES.AI_REPLYING_QUESTION]: { text: t('rightSideBar.eventTypes.reply'), color: 'bg-theme-100 text-theme-800' },
    [EVENT_TYPES.AI_FIXING_CODE]: { text: t('rightSideBar.eventTypes.debug'), color: 'bg-gray-100 text-gray-800' },
    [EVENT_TYPES.SYSTEM_EVENT]: { text: t('rightSideBar.eventTypes.system'), color: 'bg-gray-100 text-gray-800' },
    [EVENT_TYPES.AI_GENERATING_CODE]: { text: t('rightSideBar.eventTypes.editing'), color: 'bg-theme-100 text-theme-800' },
    [EVENT_TYPES.AI_GENERATING_TEXT]: { text: t('rightSideBar.eventTypes.editing'), color: 'bg-purple-100 text-purple-800' },
  } as Record<string, { text: string; color: string }>;
  return labelConfig[type] || { text: t('rightSideBar.eventTypes.event'), color: 'bg-theme-100 text-theme-800' };
};


