/**
 * TipTap Editor Plugins Configuration
 * Custom ProseMirror plugins for enhanced editor behavior
 */

import { Extension } from '@tiptap/react';
import { Plugin, PluginKey, Selection } from 'prosemirror-state';
import { isBlankArea, debouncedFocus } from '@Editor/utils/cursorPositioning';

/**
 * Cursor Style Extension
 * Dynamically changes cursor color based on current node type
 */
export const CursorStyleExtension = Extension.create({
  name: 'cursorStyle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('cursorStyle'),
        view(editorView) {
          const updateCursorStyle = () => {
            try {
              const state = editorView?.state;
              if (!state) return;
              const selection = state.selection;
              if (!selection) return;
              const from = selection.from;

              // 获取当前位置的节点
              const $pos = state.doc.resolve(from);
              const node = $pos.parent;

              // 根据节点类型设置游标颜色
              let caretColor = '#1f2937'; // 默认颜色

              if (node.type.name === 'heading') {
                const level = node.attrs.level;
                switch (level) {
                  case 1:
                    caretColor = '#3b82f6'; // 蓝色 - H1/默认标题
                    break;
                  case 2:
                    caretColor = '#059669'; // 绿色 - H2
                    break;
                  case 3:
                    caretColor = '#dc2626'; // 红色 - H3
                    break;
                  default:
                    caretColor = '#7c3aed'; // 紫色 - H4-H6
                }
              } else if (node.type.name === 'listItem') {
                caretColor = '#f59e0b'; // 橙色 - 列表项
              } else if (node.type.name === 'blockquote') {
                caretColor = '#6b7280'; // 灰色 - 引用
              } else if (node.type.name === 'codeBlock') {
                caretColor = '#ef4444'; // 红色 - 代码块
              } else if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                caretColor = '#8b5cf6'; // 紫色 - 表格
              }

              // 应用样式到编辑器
              const editorElement = editorView.dom;
              if (editorElement) {
                editorElement.style.caretColor = caretColor;
              }
            } catch (error) {
              // Ignore cursor style errors silently
            }
          };

          // 初始设置
          updateCursorStyle();

          return {
            update: updateCursorStyle,
          };
        },
      }),
    ];
  },
});

/**
 * Trailing Paragraph Extension
 * Ensures document always ends with an empty paragraph for better UX
 */
export const TrailingParagraphExtension = Extension.create({
  name: 'trailingParagraph',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingParagraph'),
        appendTransaction: (_transactions, _oldState, newState) => {
          try {
            const doc = newState?.doc;
            const tr = newState?.tr;
            const schema = newState?.schema;
            if (!doc || !tr || !schema) return null;
            const last = doc.lastChild;
            const paragraph = schema.nodes.paragraph;
            if (!paragraph) return null;
            if (!last || last.type !== paragraph) {
              const insertPos = doc.content.size;
              const nextTr = tr.insert(insertPos, paragraph.create());
              return nextTr;
            }
            return null;
          } catch (error) {
            return null;
          }
        },
      }),
    ];
  },
});

/**
 * Enhanced Cursor Position Extension
 * Handles click events for better cursor positioning, especially in blank areas
 */
export const EnhancedCursorPositionExtension = Extension.create({
  name: 'enhancedCursorPosition',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('enhancedCursorPosition'),
        props: {
          handleClick(view, pos, event) {
            try {
              const state = view?.state;
              if (!state) return false;
              const doc = state.doc;
              const schema = state.schema;
              const paragraph = schema.nodes.paragraph;
              if (!paragraph) return false;

              const target = event.target as HTMLElement;
              const isBlankAreaClick = target && isBlankArea(target);

              // 处理点击空白区域的情况
              if (isBlankAreaClick || pos >= doc.content.size) {
                // 确保文档末尾有空段落
                const last = doc.lastChild;
                let insertPosition = doc.content.size;

                if (!last || last.type.name !== 'paragraph' || last.content.size > 0) {
                  const trInsert = state.tr.insert(insertPosition, paragraph.create());
                  view.dispatch(trInsert);
                  insertPosition = trInsert.doc.content.size;
                }

                // 将光标定位到末尾
                debouncedFocus(() => {
                  const newState = view.state;
                  const $end = newState.doc.resolve(newState.doc.content.size - 1);
                  const selection = Selection.near($end, 1);
                  const tr = newState.tr.setSelection(selection);
                  view.dispatch(tr);
                  view.focus();
                });
                return true;
              }

              // 处理点击文档内容但光标位置不准确的情况
              const clickedNode = state.doc.nodeAt(pos);
              if (clickedNode && pos < doc.content.size) {
                debouncedFocus(() => {
                  try {
                    const $pos = state.doc.resolve(pos);
                    const selection = Selection.near($pos, 1);
                    const tr = state.tr.setSelection(selection);
                    view.dispatch(tr);
                    view.focus();
                  } catch (e) {
                    // Fallback: focus at the end if position resolution fails
                    const $end = state.doc.resolve(doc.content.size - 1);
                    const selection = Selection.near($end, 1);
                    const tr = state.tr.setSelection(selection);
                    view.dispatch(tr);
                    view.focus();
                  }
                });
              }
            } catch (e) {
              // Fallback: always try to focus at the end on any error
              try {
                const state = view?.state;
                if (state) {
                  const doc = state.doc;
                  const $end = doc.resolve(Math.max(0, doc.content.size - 1));
                  const selection = Selection.near($end, 1);
                  const tr = state.tr.setSelection(selection);
                  view.dispatch(tr);
                  view.focus();
                }
              } catch (fallbackError) {
                // Silent fallback
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
