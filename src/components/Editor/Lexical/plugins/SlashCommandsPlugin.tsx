import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $createParagraphNode, type ElementNode } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import {
  Code,
  Type,
  Heading,
  List,
  ListOrdered,
  Quote,
  Table,
  Calculator,
  Image,
  Brain,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import type { Cell } from '@Store/models';
class Command extends MenuOption {
  constructor(
    key: string,
    readonly title: string,
    readonly description: string,
    readonly Icon: LucideIcon,
    readonly keywords: string[],
    readonly action: (query: string) => void
  ) {
    super(key);
  }
}
export function SlashCommandsPlugin() {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  const readOnly = useEditorReadOnly();
  const [query, setQuery] = useState<string | null>(null);
  const trigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0, allowWhitespace: true });
  const commands = useMemo(() => {
    const block = (create: () => ElementNode) => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, create);
    };
    const insert = (type: Cell['type']) => {
      const id = crypto.randomUUID();
      session.insert({
        id,
        type,
        content: '',
        outputs: [],
        language: type === 'code' ? 'python' : undefined,
        enableEdit: type !== 'thinking',
      });
      if (type === 'code') session.focusEmbeddedCell(id);
    };
    const markdown = (content: string) => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        selection.insertNodes($generateNodesFromMarkdownString(content));
    };
    return [
      new Command(
        'paragraph',
        '段落',
        '普通文本段落',
        Type,
        ['text', 'paragraph', '文本', '段落', 'txt'],
        () => block($createParagraphNode)
      ),
      ...[1, 2, 3, 4, 5, 6].map(
        (level) =>
          new Command(
            `heading${level}`,
            `标题 ${level}`,
            `正文 ${level} 级标题`,
            Heading,
            [`h${level}`, 'heading', '标题'],
            () => block(() => $createHeadingNode(`h${level}` as HeadingTagType))
          )
      ),
      new Command(
        'bulletlist',
        '无序列表',
        '创建无序列表',
        List,
        ['list', 'bullet', 'ul', '列表', '无序'],
        () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      ),
      new Command(
        'orderedlist',
        '有序列表',
        '创建编号列表',
        ListOrdered,
        ['list', 'numbered', 'ol', '列表', '有序', '编号'],
        () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      ),
      new Command('blockquote', '引用', '创建引用块', Quote, ['quote', 'blockquote', '引用'], () =>
        block($createQuoteNode)
      ),
      new Command('codeblock', '代码块', '插入代码块', Code, ['code', 'codeblock', '代码'], () =>
        insert('code')
      ),
      new Command('table', '表格', '插入表格', Table, ['table', 'grid', '表格'], () =>
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          rows: '3',
          columns: '3',
          includeHeaders: true,
        })
      ),
      new Command(
        'math',
        '数学公式',
        '插入LaTeX数学公式',
        Calculator,
        ['math', 'latex', 'formula', '数学', '公式'],
        () => markdown('$$\nE = mc^2\n$$')
      ),
      new Command(
        'image',
        '图片',
        '插入图片 /image [url]',
        Image,
        ['image', 'photo', 'picture', '图片', '照片', 'img'],
        (q) => {
          const url = q.match(/^image\s+(.+)$/)?.[1] || window.prompt('请输入图片URL:');
          if (url) markdown(`![图片](<${url.replace(/[<>\n]/g, '')}>)`);
        }
      ),
      new Command(
        'raw',
        '原始文本',
        '插入原始文本单元（不解析为Markdown）',
        Code,
        ['raw', 'text', 'plain', '原始', '文本'],
        () => insert('raw')
      ),
      new Command(
        'video',
        '视频',
        '插入视频 /video [url]',
        Video,
        ['video', 'movie', 'mp4', '视频', '影片', 'vid'],
        (q) => {
          const url = q.match(/^video\s+(.+)$/)?.[1] || window.prompt('请输入视频URL:');
          if (url) markdown(`![视频](<${url.replace(/[<>\n]/g, '')}>)`);
        }
      ),
      new Command(
        'agent',
        'Agent 对话',
        '在需求面板中打开 Codex / Claude 对话',
        Brain,
        ['agent', 'codex', 'claude', '助手', '智能体'],
        () => insert('agent')
      ),
      new Command(
        'thinking',
        'AI思考',
        '插入AI思考块',
        Brain,
        ['ai', 'thinking', 'assistant', '思考', '助手'],
        () => insert('thinking')
      ),
    ];
  }, [editor, session]);
  const options = commands.filter(
    (command) =>
      !query ||
      [command.title, ...command.keywords].some((word) =>
        word.toLowerCase().includes(query.split(' ')[0].toLowerCase())
      )
  );
  if (readOnly) return null;
  return (
    <LexicalTypeaheadMenuPlugin
      options={options}
      onQueryChange={setQuery}
      triggerFn={trigger}
      onSelectOption={(option, node, close, query) => {
        if (!editor.isEditable()) return;
        editor.update(() => {
          node?.remove();
          option.action(query);
        });
        close();
      }}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchor.current &&
        createPortal(
          <div className="notebook-insert-menu" style={{ maxHeight: 320 }}>
            {query && (
              <div className="notebook-insert-query">
                <div className="flex items-center gap-2">
                  <span className="font-mono">/{query}</span>
                </div>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto">
              <div className="py-1">
                {options.map((command, index) => (
                  <button
                    key={command.key}
                    ref={command.setRefElement}
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectOptionAndCleanUp(command)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className="notebook-insert-option"
                  >
                    <div className="notebook-insert-icon">
                      <command.Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="notebook-insert-title">{command.title}</div>
                      <div className="notebook-insert-description">{command.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          anchor.current
        )
      }
    />
  );
}
