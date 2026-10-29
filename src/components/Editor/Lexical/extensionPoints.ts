import type { ComponentType } from 'react';
import type { AnyLexicalExtensionArgument, Klass, LexicalNode } from 'lexical';

export interface NotebookEditorPlugin {
  id: string;
  priority?: number;
  nodes?: readonly Klass<LexicalNode>[];
  extensions?: readonly AnyLexicalExtensionArgument[];
  Component?: ComponentType;
}

/** Schema and React plugins consume the same validated, immutable contribution set. */
export class NotebookPluginRegistry {
  readonly plugins: readonly NotebookEditorPlugin[];
  constructor(plugins: readonly NotebookEditorPlugin[]) {
    const ids = new Set<string>();
    const nodes = new Set<string>();
    for (const plugin of plugins) {
      if (ids.has(plugin.id)) throw new Error(`Duplicate notebook plugin: ${plugin.id}`);
      ids.add(plugin.id);
      for (const node of plugin.nodes ?? []) {
        if (nodes.has(node.getType()))
          throw new Error(`Duplicate notebook node: ${node.getType()}`);
        nodes.add(node.getType());
      }
    }
    this.plugins = Object.freeze(
      plugins
        .map((plugin) =>
          Object.freeze({
            ...plugin,
            nodes: plugin.nodes && Object.freeze([...plugin.nodes]),
            extensions: plugin.extensions && Object.freeze([...plugin.extensions]),
          })
        )
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    );
  }
  nodes() {
    return this.plugins.flatMap((plugin) => [...(plugin.nodes ?? [])]);
  }
  extensions() {
    return this.plugins.flatMap((plugin) => [...(plugin.extensions ?? [])]);
  }
}
