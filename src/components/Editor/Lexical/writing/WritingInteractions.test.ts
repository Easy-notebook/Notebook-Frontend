import { $isLinkNode } from '@lexical/link';
import { MarkdownSourceBlockNode } from '../model/MarkdownSourceBlockNode';
import { $previewSource } from './MarkdownSourcePreview';
import { $sourceOffset, $sourceAncestor } from './InlineMarkdownSource';
import {
  $expandSource,
  $sourceTarget,
  $collapseSource,
  $sourceForNode,
  $replaceSourceSelection,
} from './InlineMarkdownSource';
import { MarkdownSourceNode } from '../model/MarkdownSourceNode';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { registerNotebookMarkdownInput } from './NotebookMarkdownInput';
import { KEY_ENTER_COMMAND, KEY_TAB_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { WritingAssistant } from './WritingAssistant';
import type { AgentTransport } from '@Services/agent-cell/AgentTransport';
import { $isTextNode, $createTextNode } from 'lexical';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WritingCompletion } from './WritingCompletion';
import { WritingModelClient } from './WritingModelClient';
import { buildEditorFromExtensions } from '@lexical/extension';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_DOWN_COMMAND,
  KEY_BACKSPACE_COMMAND,
  UNDO_COMMAND,
  type ElementNode,
} from 'lexical';
import { createNotebookExtension } from '../model/NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import { registerNotebookHistory } from '../plugins/NotebookHistoryPlugin';
import { registerWritingInput } from './WritingInput';
import { FindController } from './FindController';
import useStore from '@Store/notebookStore';
const cleanups = new Set<() => void>();
afterEach(() => {
  for (const close of cleanups) close();
  vi.useRealTimers();
});
function setup(content = 'A **bold** word. A bold word.') {
  const cells = [
    { id: 'title', type: 'markdown' as const, content: '# Test', outputs: [] },
    { id: 'body', type: 'markdown' as const, content, outputs: [] },
    { id: 'code', type: 'code' as const, language: 'python', content: 'A bold word.', outputs: [] },
  ];
  useStore.setState({ notebookId: 'writing-test', cells });
  const editor = buildEditorFromExtensions(
    createNotebookExtension(cells, false, new NotebookPluginRegistry([]))
  );
  editor.update(() => {}, { discrete: true });
  const session = new NotebookEditorSession(editor, 'writing-test');
  session.attach();
  const history = registerNotebookHistory(editor),
    input = registerWritingInput(editor);
  const markdown = registerNotebookMarkdownInput(editor);
  const body = () =>
    ($getRoot().getChildAtIndex(1) as ElementNode).getFirstChildOrThrow() as ElementNode;
  const close = () => {
    if (!cleanups.delete(close)) return;
    markdown();
    input();
    history();
    session.dispose();
    editor.dispose();
  };
  cleanups.add(close);
  return { editor, session, body, close };
}
const options = { query: 'A bold word', matchCase: false, wholeWord: false };
describe('writing interactions', () => {
  const transport: AgentTransport = {
    start: async () => {},
    run: async (_request, _signal, emit) => {
      await emit({ type: 'text', text: JSON.stringify({ text: 'Revised.', reason: 'Shorter' }) });
    },
    reply: async () => {},
  };
  it('keeps runtime metadata out of Lexical reconciliation while syncing authored language', () => {
    const t = setup();
    const update = vi.spyOn(t.editor, 'update');
    useStore.getState().updateCellMetadata('code', { agent: { answer: 'stream chunk' } } as never);
    expect(update).not.toHaveBeenCalled();
    const cells = useStore
      .getState()
      .cells.map((cell) => (cell.id === 'code' ? { ...cell, language: 'javascript' } : cell));
    useStore.setState({ cells });
    expect(update).toHaveBeenCalledTimes(1);
    update.mockRestore();
  });
  it('remaps the selected cell before an external agent replaces its text subtree', () => {
    const t = setup('Manually edited note.');
    t.editor.update(
      () => {
        const text = t.body().getFirstChildOrThrow();
        if ($isTextNode(text)) text.select(8, 8);
      },
      { discrete: true }
    );
    expect(() =>
      useStore.getState().updateCell('body', 'Agent approved replacement')
    ).not.toThrow();
    t.editor.read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        expect(selection.anchor.getNode().isAttached()).toBe(true);
        expect(selection.anchor.getNode().getTextContent()).toBe('Agent approved replacement');
        expect(selection.anchor.offset).toBe(8);
      }
    });
    expect(() => useStore.getState().updateCell('body', 'Next external update')).not.toThrow();
    t.close();
  });
  it('accepts a proposal without merging a paragraph with its preceding heading, then undoes it', async () => {
    const t = setup('## Heading\n\nOriginal sentence.');
    const assistant = new WritingAssistant(t.session, transport);
    t.editor.update(
      () => {
        const cell = $getRoot().getChildAtIndex(1) as ElementNode;
        const texts = cell.getAllTextNodes();
        const selection = texts[0].select(
          texts[0].getTextContentSize(),
          texts[0].getTextContentSize()
        );
        selection.focus.set(texts[1].getKey(), texts[1].getTextContentSize(), 'text');
      },
      { discrete: true }
    );
    expect(assistant.capture()).toBe(true);
    expect(assistant.snapshot().original).toBe('Original sentence.');
    await assistant.request('Shorten', 'claude');
    expect(assistant.accept()).toBe(true);
    expect(
      t.editor.read(() =>
        ($getRoot().getChildAtIndex(1) as ElementNode)
          .getChildren()
          .map((n) => [n.getType(), n.getTextContent()])
      )
    ).toEqual([
      ['heading', 'Heading'],
      ['paragraph', 'Revised.'],
    ]);
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(useStore.getState().cells[1].content).toContain('Original sentence.');
    assistant.dispose();
    t.close();
  });
  it('refuses a proposal after the original cell changes', async () => {
    const t = setup('Original sentence.');
    const assistant = new WritingAssistant(t.session, transport);
    t.editor.update(
      () => {
        const node = t.body().getFirstChildOrThrow();
        if ($isTextNode(node)) node.select(0, node.getTextContentSize());
      },
      { discrete: true }
    );
    expect(assistant.capture()).toBe(true);
    await assistant.request('Shorten', 'claude');
    t.session.updateSource('body', 'Original sentence.', 'User changed this.');
    expect(assistant.accept()).toBe(false);
    expect(useStore.getState().cells[1].content).toBe('User changed this.');
    assistant.dispose();
    t.close();
  });
  it('discards a late completion after typing continues and accepts the current suggestion once', async () => {
    vi.useFakeTimers();
    const t = setup('Start writing');
    let release: (() => void) | undefined;
    const delayed: AgentTransport = {
      start: async () => {},
      reply: async () => {},
      run: async (_request, _signal, emit) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await emit({ type: 'text', text: JSON.stringify({ text: ' naturally.' }) });
      },
    };
    const completion = new WritingCompletion(t.session, new WritingModelClient(delayed));
    t.editor.update(() => t.body().selectEnd(), { discrete: true });
    completion.refresh('claude');
    await vi.advanceTimersByTimeAsync(1200);
    expect(completion.snapshot().phase).toBe('running');
    completion.cancel();
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(completion.snapshot().phase).toBe('idle');
    completion.refresh('claude');
    await vi.advanceTimersByTimeAsync(1200);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(completion.snapshot().phase).toBe('suggested');
    const unregister = t.editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (!completion.$accept()) return false;
        event?.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    expect(
      t.editor.dispatchCommand(
        KEY_TAB_COMMAND,
        new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
      )
    ).toBe(true);
    t.editor.update(() => {}, { discrete: true });
    unregister();
    expect(completion.$accept()).toBe(false);
    expect(t.editor.read(() => t.body().getTextContent())).toBe('Start writing naturally.');
    completion.dispose();
    t.close();
    vi.useRealTimers();
  });
  it('commits a typed Markdown heading inside a cell and keeps the next line ready for prose', () => {
    const t = setup('placeholder');
    t.editor.update(
      () => {
        t.body().clear().append($createTextNode('## Act III, Scene 1'));
        t.body().selectEnd();
      },
      { discrete: true }
    );
    t.editor.dispatchCommand(
      KEY_ENTER_COMMAND,
      new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    );
    t.editor.update(() => {}, { discrete: true });
    expect(
      t.editor.read(() =>
        ($getRoot().getChildAtIndex(1) as ElementNode)
          .getChildren()
          .map((n) => [n.getType(), n.getTextContent()])
      )
    ).toEqual([
      ['heading', 'Act III, Scene 1'],
      ['paragraph', ''],
    ]);
    expect(useStore.getState().cells[2].type).toBe('code');
    t.close();
  });
  it('continues a quote on Enter and exits it on an empty line', () => {
    const t = setup('placeholder');
    t.editor.update(
      () => {
        t.body().clear().append($createTextNode('> To be, or not to be'));
        t.body().selectEnd();
      },
      { discrete: true }
    );
    const enter = () => {
      t.editor.dispatchCommand(
        KEY_ENTER_COMMAND,
        new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
      );
      t.editor.update(() => {}, { discrete: true });
    };
    enter();
    expect(t.editor.read(() => t.body().getType())).toBe('quote');
    t.editor.update(
      () => {
        const s = $getSelection();
        if ($isRangeSelection(s)) s.insertText('Whether tis nobler');
      },
      { discrete: true }
    );
    enter();
    enter();
    expect(
      t.editor.read(() =>
        ($getRoot().getChildAtIndex(1) as ElementNode).getChildren().map((n) => n.getType())
      )
    ).toEqual(['quote', 'paragraph']);
    expect(t.editor.read(() => t.body().getTextContent())).toContain('Whether tis nobler');
    t.close();
  });
  it('serializes only the changed prose cell during typing, retaining executable cell identity', () => {
    const t = setup('Original');
    const code = useStore.getState().cells[2];
    const spy = vi.spyOn(NotebookCellNode.prototype, 'getSource');
    t.editor.update(
      () => {
        t.body().selectEnd().insertText(' text');
      },
      { discrete: true }
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().cells[1].content).toBe('Original text');
    expect(useStore.getState().cells[2]).toBe(code);
    spy.mockRestore();
    t.close();
  });
  it('finds across formatting runs, replaces in one undo step, excludes code', () => {
    const t = setup();
    const find = new FindController(t.session);
    expect(find.find(options)).toHaveLength(2);
    find.replace(options, 'Revised');
    expect(t.editor.read(() => t.body().getTextContent())).toBe('Revised. Revised.');
    expect(useStore.getState().cells[2].content).toBe('A bold word.');
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(find.find(options)).toHaveLength(2);
    t.close();
  });
  it('rejects read-only replacements and filters whole words', () => {
    const t = setup('cat scatter CAT');
    const find = new FindController(t.session);
    expect(find.find({ query: 'cat', matchCase: false, wholeWord: true })).toHaveLength(2);
    t.editor.setEditable(false);
    find.replace({ ...options, query: 'cat' }, 'dog');
    expect(t.editor.read(() => t.body().getTextContent())).toBe('cat scatter CAT');
    t.close();
  });
  it('leaves prose apostrophes literal, including the video’s leading contraction', () => {
    const t = setup('Whether ');
    t.editor.update(() => t.body().selectEnd(), { discrete: true });
    const event = new KeyboardEvent('keydown', { key: "'", cancelable: true });
    t.editor.dispatchCommand(KEY_DOWN_COMMAND, event);
    expect(event.defaultPrevented).toBe(false);
    t.close();
  });
  it('pairs at an empty paragraph and deletes the pair together', () => {
    const t = setup('');
    t.editor.update(() => t.body().selectStart(), { discrete: true });
    t.editor.dispatchCommand(
      KEY_DOWN_COMMAND,
      new KeyboardEvent('keydown', { key: '(', cancelable: true })
    );
    t.editor.update(() => {}, { discrete: true });
    expect(t.editor.read(() => t.body().getTextContent())).toBe('()');
    t.editor.dispatchCommand(
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true })
    );
    t.editor.update(() => {}, { discrete: true });
    expect(t.editor.read(() => t.body().getTextContent())).toBe('');
    t.close();
  });
  it('steps over generated closers after typing inside them', () => {
    const t = setup('prefix ');
    t.editor.update(() => t.body().selectEnd(), { discrete: true });
    t.editor.dispatchCommand(
      KEY_DOWN_COMMAND,
      new KeyboardEvent('keydown', { key: '(', cancelable: true })
    );
    t.editor.update(() => {}, { discrete: true });
    t.editor.update(
      () => {
        const s = $getSelection();
        if ($isRangeSelection(s)) s.insertText('text');
      },
      { discrete: true }
    );
    t.editor.dispatchCommand(
      KEY_DOWN_COMMAND,
      new KeyboardEvent('keydown', { key: ')', cancelable: true })
    );
    t.editor.update(() => {}, { discrete: true });
    expect(t.editor.read(() => t.body().getTextContent())).toBe('prefix(text)');
    expect(
      t.editor.read(() => {
        const s = $getSelection();
        return $isRangeSelection(s) ? s.anchor.offset : 0;
      })
    ).toBe(12);
    t.close();
  });
  it('updates rich source without replacing executable cells and rejects stale bases', () => {
    const t = setup('before');
    expect(t.session.updateSource('body', 'before', '## Changed')).toBe(true);
    expect(t.session.updateSource('body', 'before', 'stale')).toBe(false);
    expect(t.editor.read(() => t.body().getType())).toBe('heading');
    expect(useStore.getState().cells[2].type).toBe('code');
    t.close();
  });
});

describe('body Markdown source', () => {
  it('exports editable source literally and parses an edited link without consuming its siblings', () => {
    const t = setup('Before [**label**](https://example.com/old) after.');
    let raw: MarkdownSourceNode;
    t.editor.update(
      () => {
        const node = t.body().getChildren()[1];
        expect($sourceForNode(node)).toBe('[**label**](https://example.com/old)');
        raw = $expandSource(node);
        expect(raw.getParent()).toBe(t.body());
      },
      { discrete: true, tag: 'history-merge' }
    );
    expect(useStore.getState().cells[1].content).toContain(
      'Before [**label**](https://example.com/old) after.'
    );
    t.editor.update(
      () => {
        raw.splice(0, raw.getChildrenSize(), [
          $createTextNode('[**renamed**](https://example.com/new)'),
        ]);
      },
      { discrete: true, tag: 'history-push' }
    );
    expect(useStore.getState().cells[1].content).toContain(
      '[**renamed**](https://example.com/new)'
    );
    t.editor.update(
      () => {
        t.body().getLastDescendant()?.selectEnd();
        $collapseSource(raw);
      },
      { discrete: true, tag: 'history-merge' }
    );
    expect(useStore.getState().cells[1].content).toContain(
      'Before [**renamed**](https://example.com/new) after.'
    );
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(useStore.getState().cells[1].content).toContain('[**label**](https://example.com/old)');
  });
  it('survives splitting and replacing selected source text', () => {
    const t = setup('Before **bold** after.');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getChildren()[1]);
        const text = raw.getFirstChildOrThrow();
        if (!$isTextNode(text)) throw new Error('Expected text');
        expect($replaceSourceSelection(text.select(0, text.getTextContentSize()), '*italic*')).toBe(
          true
        );
        expect(raw.getTextContent()).toBe('*italic*');
        t.body().getLastDescendant()?.selectEnd();
        $collapseSource(raw);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content).toContain('Before *italic* after.');
  });
  it('changes heading level and keeps code cells intact', () => {
    const t = setup('### Heading');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body());
        raw.splice(0, raw.getChildrenSize(), [$createTextNode('## Updated')]);
        $collapseSource(raw);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content.trim()).toBe('## Updated');
    expect(useStore.getState().cells[2].content).toBe('A bold word.');
  });
});

describe('live source grammar', () => {
  it('keeps subsequent typing in the same fragment after preview replaces the selected text node', () => {
    const t = setup('Before **bold** after.');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getChildren()[1]);
        const text = raw.getFirstChildOrThrow();
        if (!$isTextNode(text)) throw new Error('Expected source text');
        text.select(3, 3);
        $previewSource(raw);
      },
      { discrete: true }
    );
    t.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error('Expected caret');
        const raw = $sourceAncestor(selection.anchor.getNode());
        expect(raw).not.toBeNull();
        expect($sourceOffset(raw!, selection.anchor)).toBe(3);
        selection.insertText('X');
        expect(raw!.getTextContent()).toBe('**bXold**');
      },
      { discrete: true }
    );
    // The controller previews after the native typing transaction normalizes its nodes.
    t.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error('Expected caret');
        const raw = $sourceAncestor(selection.anchor.getNode());
        expect(raw).not.toBeNull();
        $previewSource(raw!);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content).toContain('Before **bXold** after.');
  });

  it('updates formats immediately as delimiters change while preserving the source and caret', () => {
    const t = setup('Before **bold** after.');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getChildren()[1]);
        const replace = (value: string) => {
          const node = $createTextNode(value);
          raw.splice(0, raw.getChildrenSize(), [node]);
          node.select(value.length, value.length);
          $previewSource(raw);
          const selection = $getSelection();
          expect($isRangeSelection(selection) && $sourceOffset(raw, selection.anchor)).toBe(
            value.length
          );
          expect(raw.getTextContent()).toBe(value);
        };
        $previewSource(raw);
        expect(raw.getAllTextNodes().some((node) => node.hasFormat('bold'))).toBe(true);
        replace('*italic*');
        expect(raw.getAllTextNodes().some((node) => node.hasFormat('bold'))).toBe(false);
        expect(
          raw
            .getAllTextNodes()
            .find((node) => node.getTextContent() === 'italic')
            ?.hasFormat('italic')
        ).toBe(true);
        replace('*italic');
        expect(raw.getAllTextNodes().every((node) => node.getFormat() === 0)).toBe(true);
        replace('*italic*');
        expect(
          raw
            .getAllTextNodes()
            .find((node) => node.getTextContent() === 'italic')
            ?.hasFormat('italic')
        ).toBe(true);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content).toContain('Before *italic* after.');
  });
  it('uses the same grammar for nested formats, links and literal inline code', () => {
    const t = setup('Before **bold** after.');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getChildren()[1]);
        raw.splice(0, raw.getChildrenSize(), [
          $createTextNode('***nested*** [link](https://example.com) `**literal**`'),
        ]);
        $previewSource(raw);
        const texts = raw.getAllTextNodes();
        const nested = texts.find((node) => node.getTextContent() === 'nested');
        expect(nested?.hasFormat('bold')).toBe(true);
        expect(nested?.hasFormat('italic')).toBe(true);
        expect(texts.find((node) => node.getTextContent() === 'link')?.hasFormat('underline')).toBe(
          true
        );
        const code = texts.find((node) => node.getTextContent() === '**literal**');
        expect(code?.hasFormat('code')).toBe(true);
        expect(code?.hasFormat('bold')).toBe(false);
      },
      { discrete: true }
    );
  });
});

describe('live block semantics', () => {
  it('reclassifies block syntax without changing source identity or caret', () => {
    const t = setup('## Heading');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body());
        const key = raw.getKey();
        for (const [value, kind] of [
          ['Heading', 'paragraph'],
          ['### Heading', 'h3'],
          ['> Heading', 'quote'],
          ['- Heading', 'bullet'],
          ['1. Heading', 'number'],
          ['Heading', 'paragraph'],
        ]) {
          const text = $createTextNode(value);
          raw.splice(0, raw.getChildrenSize(), [text]);
          text.select(value.length, value.length);
          $previewSource(raw);
          expect(raw.getKey()).toBe(key);
          expect((raw.getParent() as MarkdownSourceBlockNode).getKind()).toBe(kind);
          const selection = $getSelection();
          expect($isRangeSelection(selection) && $sourceOffset(raw, selection.anchor)).toBe(
            value.length
          );
        }
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content).toBe('Heading');
    expect(useStore.getState().cells[2].content).toBe('A bold word.');
  });
  it('restores a middle list item without losing order or duplicating markers', () => {
    const t = setup('- first\n- second\n- third');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getChildren()[1]);
        expect(raw.getTextContent()).toBe('- second');
        $previewSource(raw);
        $collapseSource(raw);
        expect(
          t
            .body()
            .getChildren()
            .map((node) => node.getTextContent())
        ).toEqual(['first', 'second', 'third']);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1].content).toBe('- first\n- second\n- third');
  });
  it('removes and rebuilds a link when its delimiter and URL change', () => {
    const t = setup('[label](target)');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body().getFirstChildOrThrow());
        for (const [value, url] of [
          ['[label](target', null],
          ['[label](changed)', 'changed'],
        ]) {
          const text = $createTextNode(value!);
          raw.splice(0, raw.getChildrenSize(), [text]);
          text.select(value!.length, value!.length);
          $previewSource(raw);
          const link = raw.getChildren().find($isLinkNode);
          expect(link?.getURL() ?? null).toBe(url);
          if (url) {
            const markers = raw
              .getAllTextNodes()
              .filter((node) => ['[', '](', ')'].includes(node.getTextContent()));
            expect(markers.map((node) => node.getTextContent())).toEqual(['[', '](', ')']);
            expect(markers.every((node) => node.getStyle().includes('font-size: 0.82em'))).toBe(
              true
            );
          }
          const selection = $getSelection();
          expect($isRangeSelection(selection) && $sourceOffset(raw, selection.anchor)).toBe(
            value!.length
          );
        }
      },
      { discrete: true }
    );
  });
});

describe('source delimiter editing', () => {
  it.each([
    ['**bold**', '**bold*', '*', 'bold'],
    ['`code`', '`code', '`', 'code'],
  ])(
    'keeps a restored closing delimiter inside %s and clears typing style',
    (initial, incomplete, delimiter, format) => {
      const t = setup(initial);
      t.editor.update(
        () => {
          const raw = $expandSource(t.body().getFirstChildOrThrow());
          const text = $createTextNode(incomplete);
          raw.splice(0, raw.getChildrenSize(), [text]);
          text.select(incomplete.length, incomplete.length);
          $previewSource(raw);
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error('Expected caret');
          expect($replaceSourceSelection(selection, delimiter)).toBe(true);
          $previewSource(raw);
          expect(raw.getTextContent()).toBe(initial);
          expect(
            raw.getAllTextNodes().some((node) => node.hasFormat(format as 'bold' | 'code'))
          ).toBe(true);
          const restored = $getSelection();
          if (!$isRangeSelection(restored)) throw new Error('Expected restored caret');
          expect($sourceOffset(raw, restored.anchor)).toBe(initial.length);
          expect(restored.style).toBe('');
          expect(restored.format).toBe(0);
          $collapseSource(raw);
          expect(
            t
              .body()
              .getAllTextNodes()
              .every((node) => node.getStyle() === '')
          ).toBe(true);
        },
        { discrete: true }
      );
    }
  );
});

describe('source structural editing', () => {
  it('maps a source caret to the heading before the standard paragraph split', () => {
    const t = setup('## Heading');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body());
        raw.getFirstChildOrThrow<import('lexical').TextNode>().select(5, 5);
        $collapseSource(raw, true);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error('Expected caret');
        expect(selection.anchor.offset).toBe(2);
        selection.insertParagraph();
        const cell = $getRoot().getChildAtIndex(1) as ElementNode;
        expect(cell.getChildren().map((node) => node.getTextContent())).toEqual(['He', 'ading']);
      },
      { discrete: true }
    );
  });
  it('does not expand an empty quote paragraph before composition or typing starts', () => {
    const t = setup('> Quote');
    t.editor.update(
      () => {
        const raw = $expandSource(t.body(), 'end');
        $collapseSource(raw, true);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error('Expected caret');
        selection.insertParagraph();
        expect($sourceTarget()).toBeNull();
        const next = $getSelection();
        if (!$isRangeSelection(next)) throw new Error('Expected new paragraph');
        next.insertText('新行');
      },
      { discrete: true }
    );
    t.editor.update(
      () => {
        const caret = $getSelection();
        if (!$isRangeSelection(caret)) throw new Error('Expected typed caret');
        expect(caret.anchor.getNode().getTextContent()).toBe('新行');
        expect(caret.anchor.offset).toBe(2);
        expect(t.body().getTextContent()).toBe('Quote');
        expect(
          ($getRoot().getChildAtIndex(1) as ElementNode).getLastChildOrThrow().getTextContent()
        ).toBe('新行');
      },
      { discrete: true }
    );
  });
});

describe('list source ownership', () => {
  it.each(['- First\n- Second', '1. First\n2. Second', '- [ ] First\n- [x] Second'])(
    'keeps list structure editable instead of revealing a detached source block: %s',
    (content) => {
      const t = setup(content);
      t.editor.update(
        () => {
          const list = t.body();
          const item = list.getFirstChildOrThrow<ElementNode>();
          item.selectEnd();
          expect($sourceTarget()).toBeNull();
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error('Expected list selection');
          selection.insertParagraph();
          const next = $getSelection();
          if (!$isRangeSelection(next)) throw new Error('Expected next item');
          next.insertText('新项目');
          expect($sourceTarget()).toBeNull();
          expect(list.getChildren().map((node) => node.getTextContent())).toEqual([
            'First',
            '新项目',
            'Second',
          ]);
        },
        { discrete: true }
      );
    }
  );
});

it('exits an empty list item inside a notebook cell without losing following items', () => {
  const t = setup('- First\n- Second');
  t.editor.update(() => {
    t.body().getFirstChildOrThrow<ElementNode>().selectEnd();
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error('Expected list caret');
    selection.insertParagraph();
    t.editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', {key:'Enter'}));
    const next = $getSelection();
    if (!$isRangeSelection(next)) throw new Error('Expected paragraph caret');
    next.insertText('Outside');
    const cell = $getRoot().getChildAtIndex(1) as ElementNode;
    expect(cell.getChildren().map(node => [node.getType(), node.getTextContent()])).toEqual([
      ['list', 'First'], ['paragraph', 'Outside'], ['list', 'Second'],
    ]);
  }, {discrete:true});
});
