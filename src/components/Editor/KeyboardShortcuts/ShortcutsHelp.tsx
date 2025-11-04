import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = {
    global: [
      { keys: ['Ctrl/Cmd', 'S'], description: '保存笔记本' },
      { keys: ['Ctrl/Cmd', 'Z'], description: '撤销' },
      { keys: ['Ctrl/Cmd', 'Y'], description: '重做' },
      { keys: ['Ctrl/Cmd', 'Shift', 'Z'], description: '重做' },
    ],
    cell: [
      { keys: ['Ctrl/Cmd', 'Shift', 'L'], description: '插入代码块' },
      { keys: ['Ctrl/Cmd', 'Shift', 'M'], description: '插入文本块' },
      { keys: ['Ctrl/Cmd', 'Shift', 'I'], description: '插入图片' },
      { keys: ['Ctrl/Cmd', 'Shift', 'T'], description: '插入表格' },
      { keys: ['Ctrl/Cmd', 'Shift', 'B'], description: '插入AI思考' },
      { keys: ['Ctrl/Cmd', 'Shift', 'E'], description: '插入数学公式' },
      { keys: ['Ctrl/Cmd', 'Enter'], description: '运行当前cell' },
      { keys: ['Ctrl/Cmd', 'Shift', 'Enter'], description: '运行所有cells' },
      { keys: ['Delete'], description: '删除cell' },
      { keys: ['Enter'], description: '编辑cell' },
      { keys: ['Esc'], description: '退出编辑' },
      { keys: ['↑'], description: '选择上一个cell' },
      { keys: ['↓'], description: '选择下一个cell' },
      { keys: ['Alt', '↑'], description: '向上移动cell' },
      { keys: ['Alt', '↓'], description: '向下移动cell' },
    ],
    command: [
      { keys: ['Ctrl/Cmd', '/'], description: '打开命令面板' },
      { keys: ['Ctrl/Cmd', 'Shift', 'P'], description: '打开命令面板' },
      { keys: ['/'], description: '斜杠命令（在编辑时）' },
    ],
    drag: [
      { keys: ['鼠标拖拽'], description: '拖拽cell重新排序' },
      { keys: ['悬停'], description: '显示拖拽手柄' },
    ]
  };

  const renderShortcutGroup = (title: string, shortcuts: any[]) => (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">{shortcut.description}</span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key: string, keyIndex: number) => (
                <React.Fragment key={keyIndex}>
                  <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded shadow-sm">
                    {key}
                  </kbd>
                  {keyIndex < shortcut.keys.length - 1 && (
                    <span className="text-gray-400 text-xs">+</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Keyboard className="text-theme-600" size={24} />
            <h2 className="text-xl font-bold text-gray-800">键盘快捷键</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              {renderShortcutGroup('全局操作', shortcuts.global)}
              {renderShortcutGroup('命令面板', shortcuts.command)}
            </div>
            <div>
              {renderShortcutGroup('Cell操作', shortcuts.cell)}
              {renderShortcutGroup('拖拽操作', shortcuts.drag)}
            </div>
          </div>

          {/* 提示信息 */}
          <div className="mt-8 p-4 bg-theme-50 rounded-lg border border-theme-200">
            <h4 className="font-semibold text-theme-800 mb-2">💡 使用提示</h4>
            <ul className="text-sm text-theme-700 space-y-1">
              <li>• 在编辑模式下，输入 <kbd className="px-1 py-0.5 bg-white border rounded text-xs">/</kbd> 可以快速打开命令菜单</li>
              <li>• 悬停在cell左侧可以看到拖拽手柄，拖拽可以重新排序</li>
              <li>• 使用 <kbd className="px-1 py-0.5 bg-white border rounded text-xs">Ctrl/Cmd + /</kbd> 可以在任何时候打开命令面板</li>
              <li>• 大部分快捷键在编辑模式下也可以使用</li>
            </ul>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              按 <kbd className="px-1 py-0.5 bg-white border rounded text-xs">Esc</kbd> 或点击外部区域关闭
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-theme-600 text-white rounded-lg hover:bg-theme-700 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
