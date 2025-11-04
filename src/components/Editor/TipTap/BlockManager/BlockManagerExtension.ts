import { Extension } from '@tiptap/core';

interface BlockManagerOptions {
  onBlockHover?: (blockId: string, element: HTMLElement) => void;
  onBlockUnhover?: () => void;
  onBlockSelect?: (blockId: string) => void;
  onBlockDragStart?: (blockId: string) => void;
  onBlockDragEnd?: () => void;
}

export const BlockManagerExtension = Extension.create<BlockManagerOptions>({
  name: 'blockManager',

  addOptions() {
    return {
      onBlockHover: () => {},
      onBlockUnhover: () => {},
      onBlockSelect: () => {},
      onBlockDragStart: () => {},
      onBlockDragEnd: () => {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'],
        attributes: {
          class: {
            default: null,
            parseHTML: element => {
              const existingClass = element.getAttribute('class') || '';
              return existingClass.includes('tiptap-block') ? existingClass : `${existingClass} tiptap-block`.trim();
            },
            renderHTML: attributes => {
              return {
                class: 'tiptap-block',
              };
            },
          },
          'data-block-type': {
            default: null,
            renderHTML: (attributes, { node }) => {
              return {
                'data-block-type': node.type.name,
              };
            },
          },
        },
      },
    ];
  },

  onCreate() {
    // 在编辑器创建后设置事件监听器
    setTimeout(() => {
      this.setupEventListeners();
    }, 100);
  },

  onUpdate() {
    // 确保事件监听器始终存在
    this.setupEventListeners();
  },

  setupEventListeners() {
    const editor = this.editor;
    const options = this.options;

    if (!editor?.view?.dom) return;

    const editorElement = editor.view.dom;

    // 移除旧的事件监听器
    editorElement.removeEventListener('mouseover', this.handleMouseOver);
    editorElement.removeEventListener('mouseout', this.handleMouseOut);
    editorElement.removeEventListener('click', this.handleClick);

    // 添加新的事件监听器
    this.handleMouseOver = (event: Event) => {
      const target = event.target as HTMLElement;
      const blockElement = target.closest('.tiptap-block');

      if (blockElement) {
        const blockType = blockElement.getAttribute('data-block-type');
        const blockId = `block-${blockType}-${Date.now()}`;
        blockElement.setAttribute('data-block-id', blockId);
        options.onBlockHover?.(blockId, blockElement as HTMLElement);
      }
    };

    this.handleMouseOut = (event: Event) => {
      const target = event.target as HTMLElement;
      const relatedTarget = (event as MouseEvent).relatedTarget as HTMLElement;

      // 检查是否真的离开了块元素
      const blockElement = target.closest('.tiptap-block');
      const relatedBlockElement = relatedTarget?.closest?.('.tiptap-block');

      if (blockElement && blockElement !== relatedBlockElement) {
        options.onBlockUnhover?.();
      }
    };

    this.handleClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const blockElement = target.closest('.tiptap-block');

      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        if (blockId) {
          options.onBlockSelect?.(blockId);
        }
      }
    };

    editorElement.addEventListener('mouseover', this.handleMouseOver);
    editorElement.addEventListener('mouseout', this.handleMouseOut);
    editorElement.addEventListener('click', this.handleClick);
  },

  onDestroy() {
    // 清理事件监听器
    const editor = this.editor;
    if (editor?.view?.dom) {
      const editorElement = editor.view.dom;
      editorElement.removeEventListener('mouseover', this.handleMouseOver);
      editorElement.removeEventListener('mouseout', this.handleMouseOut);
      editorElement.removeEventListener('click', this.handleClick);
    }
  },
});

export default BlockManagerExtension;
