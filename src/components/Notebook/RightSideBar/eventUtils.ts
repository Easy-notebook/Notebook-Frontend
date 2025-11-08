import { EVENT_TYPES, EventType } from '@Store/AIAgentStore';

export const getEventLabel = (type: EventType, t: any) => {
  const labelConfig = {
    [EVENT_TYPES.USER_ASK_QUESTION]: {
      text: t('rightSideBar.eventTypes.question'),
      color: 'text-theme-800 dark:text-white',
    },
    [EVENT_TYPES.USER_NEW_INSTRUCTION]: {
      text: t('rightSideBar.eventTypes.instruction'),
      color: 'text-green-800 dark:text-white',
    },
    [EVENT_TYPES.USER_FILE_UPLOAD]: {
      text: t('rightSideBar.eventTypes.upload'),
      color: 'text-purple-800 dark:text-white',
    },
    [EVENT_TYPES.AI_UNDERSTANDING]: {
      text: t('rightSideBar.eventTypes.understanding'),
      color: 'text-yellow-800 dark:text-white',
    },
    [EVENT_TYPES.AI_EXPLAINING_PROCESS]: {
      text: t('rightSideBar.eventTypes.explaining'),
      color: 'text-indigo-800 dark:text-white',
    },
    [EVENT_TYPES.AI_WRITING_CODE]: {
      text: t('rightSideBar.eventTypes.coding'),
      color: 'text-green-800 dark:text-white',
    },
    [EVENT_TYPES.AI_RUNNING_CODE]: {
      text: t('rightSideBar.eventTypes.running'),
      color: 'text-pink-800 dark:text-white',
    },
    [EVENT_TYPES.AI_ANALYZING_RESULTS]: {
      text: t('rightSideBar.eventTypes.analysis'),
      color: 'text-teal-800 dark:text-white',
    },
    [EVENT_TYPES.AI_FIXING_BUGS]: {
      text: t('rightSideBar.eventTypes.debug'),
      color: 'text-red-800 dark:text-white',
    },
    [EVENT_TYPES.AI_CRITICAL_THINKING]: {
      text: t('rightSideBar.eventTypes.thinking'),
      color: 'text-orange-800 dark:text-white',
    },
    [EVENT_TYPES.AI_REPLYING_QUESTION]: {
      text: t('rightSideBar.eventTypes.reply'),
      color: 'text-theme-800 dark:text-white',
    },
    [EVENT_TYPES.AI_FIXING_CODE]: {
      text: t('rightSideBar.eventTypes.debug'),
      color: 'text-gray-800 dark:text-white',
    },
    [EVENT_TYPES.SYSTEM_EVENT]: {
      text: t('rightSideBar.eventTypes.system'),
      color: 'text-gray-800 dark:text-white',
    },
    [EVENT_TYPES.AI_GENERATING_CODE]: {
      text: t('rightSideBar.eventTypes.editing'),
      color: 'text-theme-800 dark:text-white',
    },
    [EVENT_TYPES.AI_GENERATING_TEXT]: {
      text: t('rightSideBar.eventTypes.editing'),
      color: 'text-purple-800 dark:text-white',
    },
  } as Record<string, { text: string; color: string }>;
  return (
    labelConfig[type] || {
      text: t('rightSideBar.eventTypes.event'),
      color: 'text-theme-800 dark:text-white',
    }
  );
};
