import { $previewSource } from './MarkdownSourcePreview';
import {
  $getSelection,
  $setSelection,
  $isTextNode,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  $isRangeSelection,
  $nodesOfType,
  $getNodeByKey,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  PASTE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  HISTORY_MERGE_TAG,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
} from 'lexical';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { MdastShortcutsExtension } from '@lexical/mdast';
import { mergeRegister } from '@lexical/utils';
import { MarkdownSourceNode } from '../model/MarkdownSourceNode';
import {
  $collapseSource,
  $expandSource,
  $sourceTarget,
  $replaceSourceSelection,
  $sourceAncestor,
  $sourceOffset,
} from './InlineMarkdownSource';
const SOURCE_TRANSITION = 'notebook-source-transition';

/** Selection is the state machine: selected source stays editable; departed source renders. */
export class MarkdownSourceEditing {
  private pointerHeld = false;
  private previewed = new Map<string, string>();
  private navigation: 'start' | 'end' | undefined;
  constructor(private readonly editor: LexicalEditor) {}
  private shortcuts = (disabled: boolean) => {
    getExtensionDependencyFromEditor(this.editor, MdastShortcutsExtension).output.disabled.value =
      disabled || !this.editor.isEditable();
  };
  reconcile = (close = false) => {
    const editor = this.editor;
    if (editor.isComposing() || this.pointerHeld) return;
    const focused =
      !close && editor.isEditable() && !!editor.getRootElement()?.contains(document.activeElement);
    const plan = editor.getEditorState().read(() => {
      const selection = $getSelection();
      const selected = new Set<string>();
      if (focused && $isRangeSelection(selection)) {
        for (const node of [
          selection.anchor.getNode(),
          selection.focus.getNode(),
          ...selection.getNodes(),
        ]) {
          selected.add(node.getKey());
          for (const parent of node.getParents()) selected.add(parent.getKey());
        }
      }
      const sources = $nodesOfType(MarkdownSourceNode).filter((node) => node.isAttached());
      return {
        close: sources.filter((node) => !selected.has(node.getKey())).map((node) => node.getKey()),
        open: focused ? $sourceTarget()?.getKey() : null,
        preview: sources
          .filter(
            (node) =>
              selected.has(node.getKey()) &&
              this.previewed.get(node.getKey()) !== node.getTextContent()
          )
          .map((node) => node.getKey()),
        editing: sources.some((node) => selected.has(node.getKey())),
      };
    });
    this.shortcuts(plan.editing || !!plan.open);
    if (!plan.close.length && !plan.open && !plan.preview.length) return;
    editor.update(
      () => {
        for (const key of plan.close) {
          const node = $getNodeByKey(key);
          if (node instanceof MarkdownSourceNode) $collapseSource(node);
          this.previewed.delete(key);
        }
        const target = plan.open ? $getNodeByKey(plan.open) : null;
        if (target?.isAttached()) {
          const raw = $expandSource(target, this.navigation);
          plan.preview.push(raw.getKey());
        }
        for (const key of plan.preview) {
          const raw = $getNodeByKey(key);
          if (raw instanceof MarkdownSourceNode) {
            $previewSource(raw);
            this.previewed.set(key, raw.getTextContent());
          }
        }
        this.navigation = undefined;
      },
      { tag: [SOURCE_TRANSITION, HISTORY_MERGE_TAG, ...(close ? [SKIP_DOM_SELECTION_TAG] : [])] }
    );
  };
  attach() {
    const down = () => {
      this.pointerHeld = true;
      this.navigation = undefined;
    };
    const up = () => {
      if (this.pointerHeld) {
        this.pointerHeld = false;
        this.reconcile();
      }
    };
    const keydown = (event: KeyboardEvent) => {
      this.navigation =
        !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
          ? event.key === 'ArrowLeft'
            ? 'end'
            : event.key === 'ArrowRight'
              ? 'start'
              : undefined
          : undefined;
    };
    const blur = (event: FocusEvent) => {
      if (!this.editor.getRootElement()?.contains(event.relatedTarget as Node))
        this.reconcile(true);
    };
    document.addEventListener('pointerup', up);
    const arrow = (event: KeyboardEvent, delta: number) => {
      if (event.metaKey || event.ctrlKey || event.altKey || this.editor.isComposing()) return false;
      const currentSelection = $getSelection();
      if (
        !$isRangeSelection(currentSelection) ||
        (!currentSelection.isCollapsed() && !event.shiftKey)
      )
        return false;
      const selection = currentSelection.clone();
      const point = selection.focus;
      const node = point.getNode();
      const source = $sourceAncestor(node);
      if (!$isTextNode(node) || !source) return false;
      let next = $sourceOffset(source, point) + delta;
      if (next < 0 || next > source.getTextContentSize()) return false;
      event.preventDefault();
      for (const text of source.getAllTextNodes()) {
        if (next <= text.getTextContentSize()) {
          point.set(text.getKey(), next, 'text');
          if (!event.shiftKey) selection.anchor.set(text.getKey(), next, 'text');
          break;
        }
        next -= text.getTextContentSize();
      }
      $setSelection(selection.clone());
      return true;
    };
    return mergeRegister(
      this.editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          if (this.editor.isComposing()) return false;
          // Structural editing belongs to the standard rich-text nodes, not the source projection.
          for (const raw of $nodesOfType(MarkdownSourceNode)) {
            if (raw.isAttached()) $collapseSource(raw, true);
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      this.editor.registerEditableListener((editable) => this.reconcile(!editable)),
      this.editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => arrow(event, -1),
        COMMAND_PRIORITY_CRITICAL
      ),
      this.editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => arrow(event, 1),
        COMMAND_PRIORITY_CRITICAL
      ),
      this.editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || this.editor.isComposing()) return false;
          const value = typeof event === 'string' ? event : event.data;
          if (value === null || !$replaceSourceSelection(selection, value)) return false;
          if (typeof event !== 'string') event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      this.editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !(event instanceof ClipboardEvent)) return false;
          const value = event.clipboardData?.getData('text/plain');
          if (value === undefined || !$replaceSourceSelection(selection, value)) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      this.editor.registerRootListener((root, previous) => {
        previous?.removeEventListener('pointerdown', down);
        previous?.removeEventListener('keydown', keydown, true);
        previous?.removeEventListener('focusout', blur);
        root?.addEventListener('pointerdown', down);
        root?.addEventListener('keydown', keydown, true);
        root?.addEventListener('focusout', blur);
      }),
      this.editor.registerUpdateListener(({ tags }) => {
        if (!tags.has(SOURCE_TRANSITION)) this.reconcile();
      }),
      () => {
        document.removeEventListener('pointerup', up);
        this.shortcuts(false);
      }
    );
  }
}
