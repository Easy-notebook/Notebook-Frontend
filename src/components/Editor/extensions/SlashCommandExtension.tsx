import { Extension } from '@tiptap/core';

interface SlashCommandOptions {
  onSlashDetected?: (query: string) => void;
}

export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onSlashDetected: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      '/': ({ editor }) => {
        // 简单的斜杠检测
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;

        // 检查光标前的文本
        const textBefore = $from.parent.textBetween(0, $from.parentOffset);
        const isAtStart = $from.parentOffset === 0;
        const isAfterSpace = textBefore.endsWith(' ');

        if (isAtStart || isAfterSpace) {
          // 插入斜杠
          editor.commands.insertContent('/');

          // 通知外部检测到斜杠
          setTimeout(() => {
            this.options.onSlashDetected?.('');
          }, 100);

          return true;
        }

        return false;
      },
    };
  },
});

export default SlashCommandExtension;
