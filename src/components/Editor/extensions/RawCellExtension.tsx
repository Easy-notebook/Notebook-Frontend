import { Node, mergeAttributes, RawCommands } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../../../store/notebookStore'

const RawCellView: React.FC<any> = ({ node, updateAttributes, deleteNode }) => {
  const { cells, updateCell, editingCellId, setEditingCellId, currentCellId } = useStore()
  const cellId = node.attrs.cellId
  const storeCell = useMemo(() => cells.find(c => c.id === cellId) || null, [cells, cellId])
  const contentFromStore = storeCell?.content ?? ''
  const [isEditing, setIsEditing] = useState(false)
  const [temp, setTemp] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // keep node attr and local state in sync with store
  useEffect(() => {
    const next = contentFromStore
    if (next !== node.attrs.content) {
      updateAttributes({ content: next, cellId })
    }
    if (!isEditing) setTemp(next)
  }, [contentFromStore, node.attrs.content, cellId, isEditing])

  useEffect(() => {
    // initialize
    setTemp(node.attrs.content || '')
  }, [node.attrs.content])

  const beginEdit = () => {
    setIsEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const save = () => {
    const value = temp ?? ''
    if (cellId && updateCell) {
      updateCell(cellId, value)
    }
    updateAttributes({ content: value, cellId })
    setIsEditing(false)
  }

  return (
    <NodeViewWrapper className="raw-cell-wrapper my-3" data-cell-id={cellId}>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="w-full min-h-[80px] p-2 font-mono text-sm border rounded bg-white text-black"
          value={temp}
          onChange={e => setTemp(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false) }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save() }
          }}
          placeholder="Raw cell content (not interpreted as Markdown)"
        />
      ) : (
        <div className="raw-cell-display group relative">
          <pre
            className="whitespace-pre-wrap font-mono text-sm bg-gray-50 border rounded p-3 text-gray-900"
            onDoubleClick={beginEdit}
            title="Double-click to edit raw content"
          >{node.attrs.content || ''}</pre>
          <button
            className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-black bg-opacity-60 text-white rounded"
            onClick={() => beginEdit()}
            title="Edit"
          >Edit</button>
          <button
            className="absolute -top-2 right-14 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-red-600 text-white rounded"
            onClick={() => deleteNode()}
            title="Delete"
          >Delete</button>
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const RawCellExtension = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-id'),
        renderHTML: (attrs: any) => ({ 'data-cell-id': attrs.cellId })
      },
      content: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-content') || ''
          try { return decodeURIComponent(v) } catch { return v }
        },
        renderHTML: (attrs: any) => ({ 'data-content': encodeURIComponent(attrs.content || '') })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'raw-block',
        'data-cell-id': node.attrs.cellId,
        'data-content': encodeURIComponent(node.attrs.content || ''),
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawCellView)
  },

  addCommands() {
    return {
      insertRawBlock:
        (options: { cellId?: string; content?: string } = {}) =>
        ({ commands }: { commands: RawCommands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { cellId: options.cellId || undefined, content: options.content || '' },
          })
        },
    } as Partial<RawCommands>
  },
})

