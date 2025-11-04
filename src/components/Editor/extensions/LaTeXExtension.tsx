import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import React, { useState, useRef, useEffect } from 'react'
import { Edit3, X, Copy } from 'lucide-react'
import 'katex/dist/katex.min.css'

// 直接导入katex
import katex from 'katex'

// 添加LaTeX样式
const latexStyles = `
  .latex-markdown-wrapper {
    line-height: 1;
  }
  
  .latex-markdown-wrapper.inline-latex {
    display: inline !important;
    vertical-align: baseline;
  }
  
  .latex-markdown-wrapper.block-latex {
    display: inline-block !important;
    width: 100% !important;
    text-align: center !important;
    margin: 0.5em 0 !important;
  }
  
  .latex-markdown-wrapper .katex-rendered {
    color: black !important;
  }
  
  .latex-markdown-wrapper .katex-display {
    margin: 0.5em auto;
    text-align: center;
  }
  
  .latex-markdown-wrapper .katex {
    color: black !important;
    font-size: 1em !important;
  }
  
  .latex-markdown-wrapper .katex * {
    color: black !important;
  }
  
  .latex-markdown-wrapper.inline-latex .katex {
    display: inline !important;
    vertical-align: baseline !important;
  }
  
  .latex-editor input {
    color: black !important;
  }
  
  /* 确保行内LaTeX与文本对齐 */
  .latex-markdown-wrapper.inline-latex .katex-rendered {
    display: inline !important;
    vertical-align: baseline !important;
    line-height: 1 !important;
  }
  
  /* 块级LaTeX居中显示 */
  .latex-markdown-wrapper.block-latex .katex-rendered {
    display: block !important;
    text-align: center !important;
    margin: 0.5em auto !important;
    width: 100% !important;
  }
  
  /* 强制块级LaTeX换行 */
  .latex-markdown-wrapper.block-latex::before,
  .latex-markdown-wrapper.block-latex::after {
    content: "";
    display: block;
    width: 100%;
    height: 0;
  }
`

// 注入样式
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.type = 'text/css'
  styleSheet.innerText = latexStyles
  document.head.appendChild(styleSheet)
}

// LaTeX组件
const LaTeXComponent = ({ node, updateAttributes, deleteNode }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempLatex, setTempLatex] = useState('')
  const [renderedHtml, setRenderedHtml] = useState('')
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const { latex, displayMode } = node.attrs

  // 初始化编辑状态
  useEffect(() => {
    console.log('LaTeX组件初始化，latex:', latex, 'displayMode:', displayMode)
    if (latex) {
      setTempLatex(latex)
      setIsEditing(false) // 有内容时默认显示模式
    } else {
      setTempLatex('')
      setIsEditing(true) // 新节点默认进入编辑模式
    }
  }, [latex])

  // 渲染LaTeX
  useEffect(() => {
    const renderLatex = (code) => {
      if (!code) {
        setRenderedHtml('')
        setError('')
        return
      }

      try {
        console.log('渲染LaTeX:', code, '显示模式:', displayMode)
        
        // 测试KaTeX是否可用
        if (typeof katex === 'undefined') {
          throw new Error('KaTeX未加载')
        }
        
        const html = katex.renderToString(code, {
          displayMode: displayMode,
          throwOnError: false,
          errorColor: '#dc2626',
          strict: 'warn',
          trust: false
        })
        
        console.log('LaTeX渲染成功:', html.length, '字符')
        console.log('HTML内容预览:', html.substring(0, 200))
        setRenderedHtml(html)
        setError('')
      } catch (err) {
        console.error('LaTeX渲染错误:', err)
        setError(err.message || 'LaTeX渲染错误')
        setRenderedHtml('')
      }
    }

    // 渲染tempLatex（编辑时）和latex（显示时）
    const codeToRender = isEditing ? tempLatex : latex
    renderLatex(codeToRender)
  }, [tempLatex, latex, displayMode, isEditing])

  // 开始编辑
  const startEditing = () => {
    setIsEditing(true)
    const currentLatex = latex || ''
    setTempLatex(currentLatex)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const length = currentLatex.length
        textareaRef.current.setSelectionRange(length, length)
      }
    }, 0)
  }

  // 保存编辑
  const saveEdit = () => {
    updateAttributes({
      latex: tempLatex,
    })
    setIsEditing(false)
  }

  // 取消编辑
  const cancelEdit = () => {
    const currentLatex = latex || ''
    setTempLatex(currentLatex)
    setIsEditing(false)
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  // 复制LaTeX代码
  const copyLatex = () => {
    const latexText = displayMode ? `$$${latex}$$` : `$${latex}$`
    navigator.clipboard.writeText(latexText)
  }

  console.log('LaTeX组件渲染状态:', { isEditing, latex, tempLatex, renderedHtml: !!renderedHtml, error })

  return (
    <NodeViewWrapper 
      className={`latex-markdown-wrapper ${displayMode ? 'block-latex' : 'inline-latex'}`}
      style={{
        display: displayMode ? 'inline-block' : 'inline',
        verticalAlign: 'baseline',
        width: displayMode ? '100%' : 'auto',
        textAlign: displayMode ? 'center' : 'left'
      }}
    >
      {isEditing ? (
        // 编辑模式：源码编辑器 + 实时预览
        <div className={`latex-editor ${displayMode ? 'block' : 'inline-block'}`}>
          {/* LaTeX源码编辑器 */}
          <input
            ref={textareaRef}
            type="text"
            value={tempLatex}
            onChange={(e) => setTempLatex(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveEdit}
            placeholder="输入 LaTeX 公式，如: E = mc^2"
            className="p-1 border border-gray-300 rounded font-mono text-xs focus:outline-none focus:border-theme-400 bg-white text-black"
            style={{ 
              width: `${Math.max(120, tempLatex.length * 8 + 20)}px`,
              minWidth: '120px',
              maxWidth: displayMode ? '100%' : '300px',
              height: '24px'
            }}
          />
          
          {/* 实时预览LaTeX - 只在块级模式显示 */}
          {displayMode && tempLatex ? (
            <div className="mt-2">
              {error ? (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                  ⚠️ LaTeX 错误: {error}
                </div>
              ) : (
                <div 
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  className="katex-rendered katex-display text-center"
                  style={{ color: 'black' }}
                />
              )}
            </div>
          ) : null}
          
          {/* 模式切换按钮 - 只在块级模式显示 */}
          {displayMode && (
            <div className="mt-1 flex items-center justify-between">
              <button
                onClick={() => updateAttributes({ displayMode: !displayMode })}
                className="text-xs text-theme-500 hover:text-theme-700"
              >
                切换为行内公式
              </button>
            </div>
          )}
        </div>
      ) : (
        // 显示模式：显示渲染后的LaTeX
        <span className={`latex-display ${displayMode ? 'block' : 'inline'}`}>
          {latex ? (
            <span className="relative group">
              {/* 显示渲染后的LaTeX */}
              {renderedHtml ? (
                <span 
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  onClick={startEditing}
                  className={`katex-rendered cursor-pointer hover:bg-gray-100 transition-all ${displayMode ? 'katex-display' : ''}`}
                  style={{ 
                    color: 'black',
                    display: displayMode ? 'block' : 'inline',
                    verticalAlign: 'baseline',
                    margin: displayMode ? '0.5em auto' : '0'
                  }}
                  title="点击编辑公式"
                />
              ) : error ? (
                <span className="p-1 bg-red-100 text-red-600 text-xs rounded">
                  ⚠️ {error}
                </span>
              ) : (
                <span className="p-1 bg-gray-100 text-gray-600 text-xs rounded">
                  渲染中...
                </span>
              )}
              
              {/* 悬浮工具栏 - 仅在悬停时显示 */}
              <span className="absolute -top-6 left-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={startEditing}
                  className="p-1 bg-black bg-opacity-70 text-white rounded text-xs hover:bg-opacity-90"
                  title="编辑"
                >
                  <Edit3 size={10} />
                </button>
                <button
                  onClick={copyLatex}
                  className="p-1 bg-black bg-opacity-70 text-white rounded text-xs hover:bg-opacity-90"
                  title="复制"
                >
                  <Copy size={10} />
                </button>
                <button
                  onClick={() => deleteNode()}
                  className="p-1 bg-black bg-opacity-70 text-white rounded text-xs hover:bg-opacity-90"
                  title="删除"
                >
                  <X size={10} />
                </button>
              </span>
            </span>
          ) : (
            // 空状态 - 简化为行内显示
            <span 
              className="latex-placeholder inline-block border border-dashed border-gray-300 rounded px-2 py-1 text-gray-500 cursor-pointer hover:border-gray-400 transition-colors text-xs"
              onClick={startEditing}
            >
              添加公式
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}

// 定义LaTeX节点
export const LaTeXExtension = Node.create({
  name: 'latexBlock',
  
  group: 'inline',
  
  inline: true,
  
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
      },
      displayMode: {
        default: true, // 默认为块级显示
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="latex-block"]',
        getAttrs: (element) => ({
          latex: element.getAttribute('data-latex'),
          displayMode: element.getAttribute('data-display-mode') === 'true',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'latex-block' }, {
        'data-latex': HTMLAttributes.latex,
        'data-display-mode': HTMLAttributes.displayMode,
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LaTeXComponent)
  },

  addCommands() {
    return {
      setLaTeX: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        })
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('latexPaste'),
        props: {
          handlePaste: (view, event, slice) => {
            const text = event.clipboardData?.getData('text/plain') || ''
            console.log('粘贴事件，文本:', text)
            
            if (text && (text.includes('$$') || text.includes('$'))) {
              console.log('检测到LaTeX内容:', text)
              
              // 检查块级LaTeX
              const blockMatch = text.match(/\$\$([^$]+)\$\$/)
              if (blockMatch) {
                console.log('插入块级LaTeX:', blockMatch[1])
                event.preventDefault()
                
                const { state } = view
                const { tr } = state
                const { from, to } = tr.selection
                
                // 删除选中内容
                if (from !== to) {
                  tr.delete(from, to)
                }
                
                const latexNode = this.type.create({
                  latex: blockMatch[1].trim(),
                  displayMode: true
                })
                tr.insert(from, latexNode)
                view.dispatch(tr)
                return true
              }
              
              // 检查行内LaTeX
              const inlineMatch = text.match(/\$([^$]+)\$/)
              if (inlineMatch) {
                console.log('插入行内LaTeX:', inlineMatch[1])
                event.preventDefault()
                
                const { state } = view
                const { tr } = state
                const { from, to } = tr.selection
                
                // 删除选中内容
                if (from !== to) {
                  tr.delete(from, to)
                }
                
                const latexNode = this.type.create({
                  latex: inlineMatch[1].trim(),
                  displayMode: false
                })
                tr.insert(from, latexNode)
                view.dispatch(tr)
                return true
              }
            }
            
            return false
          }
        }
      }),
      
      // 实时LaTeX解析插件
      new Plugin({
        key: new PluginKey('latexRealtime'),
        props: {
          handleTextInput: (view, from, to, text) => {
            // 当输入$字符时，检查是否完成了LaTeX语法
            if (text === '$') {
              setTimeout(() => {
                checkAndConvertLatex(view, this.type)
              }, 50)
            }
            return false
          },
          
          handleKeyDown: (view, event) => {
            // 在按下某些键时也检查LaTeX转换
            if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab') {
              setTimeout(() => {
                checkAndConvertLatex(view, this.type)
              }, 50)
            }
            return false
          }
        }
      })
    ]
  },

  addInputRules() {
    return [
      // 独占行的块级LaTeX规则 - 输入 $$formula$$ 后按空格，且该行开头
      new InputRule({
        find: /^\$\$([^$]+)\$\$ $/,
        handler: ({ state, range, match }) => {
          console.log('InputRule触发 - 独占行块级LaTeX:', match[1])
          const { tr } = state
          const start = range.from
          const end = range.to - 1 // 排除空格
          
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: true
          })
          
          tr.replaceWith(start, end, latexNode)
          return tr
        }
      }),
      // 独占行的行内LaTeX规则 - 输入 $formula$ 后按空格，且该行开头
      new InputRule({
        find: /^\$([^$]+)\$ $/,
        handler: ({ state, range, match }) => {
          console.log('InputRule触发 - 独占行行内LaTeX（显示为块级）:', match[1])
          const { tr } = state
          const start = range.from
          const end = range.to - 1 // 排除空格
          
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: true
          })
          
          tr.replaceWith(start, end, latexNode)
          return tr
        }
      }),
      // 行内LaTeX规则 - 输入 $formula$ 后按空格（非行开头）
      new InputRule({
        find: /\$([^$]+)\$ $/,
        handler: ({ state, range, match }) => {
          const { tr, doc } = state
          const start = range.from
          const end = range.to - 1 // 排除空格
          
          // 检查是否在段落开头
          const $start = doc.resolve(start)
          const isAtLineStart = $start.parentOffset === 0
          
          // 如果在行开头，已经被上面的规则处理了，这里跳过
          if (isAtLineStart) {
            return null
          }
          
          console.log('InputRule触发 - 行内LaTeX:', match[1])
          
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: false
          })
          
          tr.replaceWith(start, end, latexNode)
          return tr
        }
      }),
      // 行内$$LaTeX规则 - 输入 $$formula$$ 后按空格（非行开头）
      new InputRule({
        find: /\$\$([^$]+)\$\$ $/,
        handler: ({ state, range, match }) => {
          const { tr, doc } = state
          const start = range.from
          const end = range.to - 1 // 排除空格
          
          // 检查是否在段落开头
          const $start = doc.resolve(start)
          const isAtLineStart = $start.parentOffset === 0
          
          // 如果在行开头，已经被上面的规则处理了，这里跳过
          if (isAtLineStart) {
            return null
          }
          
          console.log('InputRule触发 - 行内$$LaTeX:', match[1])
          
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: false
          })
          
          tr.replaceWith(start, end, latexNode)
          return tr
        }
      })
    ]
  },
})

// 检查并转换LaTeX的方法（移到外部避免this上下文问题）
function checkAndConvertLatex(view, nodeType) {
  const { state } = view
  const { doc, selection } = state
  const { from } = selection
  
  // 获取当前段落
  const $from = doc.resolve(from)
  const paragraph = $from.parent
  
  if (paragraph.type.name !== 'paragraph') {
    return
  }
  
  const paragraphStart = $from.start($from.depth)
  const paragraphText = paragraph.textContent
  
  console.log('检查段落文本:', paragraphText)
  
  // 检查块级LaTeX（独占行）
  const blockLatexMatch = paragraphText.trim().match(/^(\$\$[^$]+\$\$|\$[^$]+\$)$/)
  if (blockLatexMatch) {
    const fullMatch = blockLatexMatch[1]
    let latex, displayMode
    
    if (fullMatch.startsWith('$$') && fullMatch.endsWith('$$')) {
      latex = fullMatch.slice(2, -2).trim()
      displayMode = true
      console.log('检测到独占行的块级LaTeX:', latex)
    } else if (fullMatch.startsWith('$') && fullMatch.endsWith('$')) {
      latex = fullMatch.slice(1, -1).trim()
      displayMode = true // 独占行的单$也显示为块级
      console.log('检测到独占行的行内LaTeX（显示为块级）:', latex)
    }
    
    if (latex) {
      const tr = state.tr
      const latexNode = nodeType.create({
        latex: latex,
        displayMode: displayMode
      })
      
      // 替换整个段落
      tr.replaceWith(paragraphStart, paragraphStart + paragraph.nodeSize, latexNode)
      view.dispatch(tr)
      return
    }
  }
  
  // 检查行内LaTeX
  convertInlineLatex(view, nodeType, paragraph, paragraphStart, paragraphText)
}

// 转换行内LaTeX
function convertInlineLatex(view, nodeType, paragraph, paragraphStart, paragraphText) {
  const { state } = view
  
  // 查找所有LaTeX模式
  const latexMatches = []
  
  // 匹配$$...$$
  let match
  const blockRegex = /\$\$([^$]+)\$\$/g
  while ((match = blockRegex.exec(paragraphText)) !== null) {
    latexMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: match[1].trim(),
      displayMode: false, // 行内的$$也作为行内显示
      original: match[0]
    })
  }
  
  // 匹配$...$（避免与$$冲突）
  const inlineRegex = /\$([^$]+)\$/g
  while ((match = inlineRegex.exec(paragraphText)) !== null) {
    // 检查是否与已有的$$匹配重叠，或者是$$的一部分
    const overlaps = latexMatches.some(existing => 
      match.index < existing.end && match.index + match[0].length > existing.start
    )
    
    // 检查前后是否有$字符（手动实现断言）
    const prevChar = match.index > 0 ? paragraphText[match.index - 1] : ''
    const nextChar = match.index + match[0].length < paragraphText.length ? 
      paragraphText[match.index + match[0].length] : ''
    
    const isPartOfDoubleD = prevChar === '$' || nextChar === '$'
    
    if (!overlaps && !isPartOfDoubleD) {
      latexMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        latex: match[1].trim(),
        displayMode: false,
        original: match[0]
      })
    }
  }
  
  if (latexMatches.length === 0) {
    return
  }
  
  console.log('检测到行内LaTeX匹配:', latexMatches)
  
  // 按位置排序，从后往前处理避免位置偏移
  latexMatches.sort((a, b) => b.start - a.start)
  
  const tr = state.tr
  
  for (const latexMatch of latexMatches) {
    const latexNode = nodeType.create({
      latex: latexMatch.latex,
      displayMode: latexMatch.displayMode
    })
    
    const start = paragraphStart + 1 + latexMatch.start // +1 for paragraph node
    const end = paragraphStart + 1 + latexMatch.end
    
    tr.replaceWith(start, end, latexNode)
  }
  
  if (latexMatches.length > 0) {
    view.dispatch(tr)
  }
}

export default LaTeXExtension