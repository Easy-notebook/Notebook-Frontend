import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export interface BlockManagerOptions {
  dragHandleWidth: number
  className: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockManager: {
      moveBlockUp: () => ReturnType
      moveBlockDown: () => ReturnType
      deleteBlock: (pos: number) => ReturnType
      duplicateBlock: (pos: number) => ReturnType
      insertBlockAbove: (pos: number) => ReturnType
    }
  }
}

const BlockManagerExtension = Extension.create<BlockManagerOptions>({
  name: 'blockManager',
  
  addOptions() {
    return {
      dragHandleWidth: 24,
      className: 'block-manager',
    }
  },

  addCommands() {
    return {
      moveBlockUp: () => ({ tr, state, dispatch }) => {
        if (!dispatch) return false
        
        const { selection } = state
        const { $from } = selection
        
        // 找到当前块的开始位置
        const currentBlockPos = $from.start($from.depth)
        const currentNode = state.doc.nodeAt(currentBlockPos)
        
        if (!currentNode) return false
        
        // 找到前一个块
        let prevPos = currentBlockPos - 1
        while (prevPos > 0) {
          const resolvedPos = state.doc.resolve(prevPos)
          const prevNode = resolvedPos.nodeBefore
          
          if (prevNode && prevNode.isBlock) {
            const prevBlockStart = resolvedPos.pos - prevNode.nodeSize
            
            // 执行移动
            tr.delete(currentBlockPos, currentBlockPos + currentNode.nodeSize)
            tr.insert(prevBlockStart, currentNode)
            
            dispatch(tr)
            return true
          }
          prevPos--
        }
        
        return false
      },

      moveBlockDown: () => ({ tr, state, dispatch }) => {
        if (!dispatch) return false
        
        const { selection } = state
        const { $from } = selection
        
        // 找到当前块的开始位置
        const currentBlockPos = $from.start($from.depth)
        const currentNode = state.doc.nodeAt(currentBlockPos)
        
        if (!currentNode) return false
        
        // 找到下一个块
        let nextPos = currentBlockPos + currentNode.nodeSize
        while (nextPos < state.doc.content.size) {
          const resolvedPos = state.doc.resolve(nextPos)
          const nextNode = resolvedPos.nodeAfter
          
          if (nextNode && nextNode.isBlock) {
            // 执行移动
            tr.delete(currentBlockPos, currentBlockPos + currentNode.nodeSize)
            const insertPos = nextPos - currentNode.nodeSize + nextNode.nodeSize
            tr.insert(insertPos, currentNode)
            
            dispatch(tr)
            return true
          }
          nextPos++
        }
        
        return false
      },

      deleteBlock: (pos: number) => ({ tr, state, dispatch }) => {
        if (!dispatch) return false
        
        const node = state.doc.nodeAt(pos)
        if (!node) return false
        
        tr.delete(pos, pos + node.nodeSize)
        dispatch(tr)
        return true
      },

      duplicateBlock: (pos: number) => ({ tr, state, dispatch }) => {
        if (!dispatch) return false
        
        const node = state.doc.nodeAt(pos)
        if (!node) return false
        
        const duplicatedNode = node.copy(node.content)
        const insertPos = pos + node.nodeSize
        tr.insert(insertPos, duplicatedNode)
        
        dispatch(tr)
        return true
      },

      insertBlockAbove: (pos: number) => ({ tr, state, dispatch, editor }) => {
        if (!dispatch) return false
        
        const schema = state.schema
        const newParagraph = schema.nodes.paragraph.create()
        
        tr.insert(pos, newParagraph)
        dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockManager'),
        
        props: {
          decorations: (state) => {
            const { doc, selection } = state
            const decorations: Decoration[] = []
            
            // 为每个顶级块添加数据属性
            doc.descendants((node, pos, parent) => {
              if (node.isBlock && parent === doc) {
                // 添加块ID装饰器
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-block-id': `block-${pos}`,
                    'data-block-type': node.type.name,
                    class: `${this.options.className}__block`
                  })
                )
              }
              return true
            })
            
            return DecorationSet.create(doc, decorations)
          },
        },
        
        view: () => {
          return {
            update: (view, prevState) => {
              // 可以在这里添加视图更新逻辑
            }
          }
        }
      })
    ]
  },
})

export default BlockManagerExtension