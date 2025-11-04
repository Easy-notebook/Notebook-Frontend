// src/extensions/ThinkingCellExtension.tsx
import { Node, mergeAttributes } from '@tiptap/core'
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewProps,
} from '@tiptap/react'
import { v4 as uuidv4 } from 'uuid'
import AIThinkingCell from '../Cells/AIThinkingCell'

/** 节点属性类型 */
export interface ThinkingCellAttributes {
  cellId: string | null
  agentName: string
  customText: string | null
  textArray: string[]
  useWorkflowThinking: boolean
}

/** 扩展可选项（这里留空） */
export interface ThinkingCellOptions {}

// 扩展 editor.commands.*
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    thinkingCell: {
      /** 设置或替换一个 thinkingCell */
      setThinkingCell: (
        attributes: Partial<ThinkingCellAttributes>
      ) => ReturnType
      /** 在当前位置插入一个 thinkingCell */
      insertThinkingCell: (
        attributes: Partial<ThinkingCellAttributes>
      ) => ReturnType
    }
  }
}

/** NodeView 组件 */
type ThinkingCellViewProps = NodeViewProps;
const ThinkingCellView: React.FC<ThinkingCellViewProps> = ({ node, deleteNode }) => {
  const attrs = node.attrs as ThinkingCellAttributes;
  const { cellId, agentName, customText, textArray, useWorkflowThinking } = attrs

  // 构造传给 Cell 组件的对象
  const cell = {
    id: cellId!,
    content: '',
    agentName,
    customText,
    textArray,
    useWorkflowThinking,
  }

  return (
    <NodeViewWrapper>
      <AIThinkingCell
        cell={cell as any}
        onDelete={() => deleteNode()}
        isInDetachedView={false}
      />
    </NodeViewWrapper>
  )
}

/** ThinkingCell 扩展 */
export const ThinkingCellExtension = Node.create<
  ThinkingCellOptions,
  ThinkingCellAttributes
>({
  name: 'thinkingCell',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-cell-id'),
        renderHTML: attrs => ({
          'data-cell-id': attrs.cellId,
        }),
      },
      agentName: {
        default: 'AI',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-agent-name') || 'AI',
        renderHTML: attrs => ({
          'data-agent-name': attrs.agentName,
        }),
      },
      customText: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const text = element.getAttribute('data-custom-text')
          return text ? decodeURIComponent(text) : null
        },
        renderHTML: attrs => ({
          'data-custom-text': attrs.customText
            ? encodeURIComponent(attrs.customText)
            : '',
        }),
      },
      textArray: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const attr = element.getAttribute('data-text-array')
          if (!attr) return []
          try {
            return JSON.parse(decodeURIComponent(attr))
          } catch {
            return []
          }
        },
        renderHTML: attrs => ({
          'data-text-array': encodeURIComponent(
            JSON.stringify(attrs.textArray || [])
          ),
        }),
      },
      useWorkflowThinking: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-use-workflow-thinking') === 'true',
        renderHTML: attrs => ({
          'data-use-workflow-thinking': String(
            attrs.useWorkflowThinking
          ),
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="thinking-cell"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'thinking-cell',
        'data-cell-id': node.attrs.cellId,
        'data-agent-name': node.attrs.agentName,
        'data-custom-text': node.attrs.customText
          ? encodeURIComponent(node.attrs.customText)
          : '',
        'data-text-array': encodeURIComponent(
          JSON.stringify(node.attrs.textArray || [])
        ),
        'data-use-workflow-thinking': String(
          node.attrs.useWorkflowThinking
        ),
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ThinkingCellView)
  },

  addCommands() {
    return {
      setThinkingCell:
        attributes =>
        ({ commands }) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4()
          }
          return commands.setNode(this.name, attributes)
        },
      insertThinkingCell:
        attributes =>
        ({ commands }) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4()
          }
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
