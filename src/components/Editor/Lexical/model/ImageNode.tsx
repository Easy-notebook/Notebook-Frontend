import {
  $getNodeByKey,
  $createTextNode,
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  defineExtension,
  configExtension,
} from 'lexical';
import { MdastImportExtension, type MdastNode } from '@lexical/mdast';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { ImageView } from '../components/ImageView';
import { parseImageSource } from './imageSource';
type ImageData = { src: string; alt: string; title?: string | null; displayMode: boolean };
type SerializedImage = Spread<ImageData, SerializedLexicalNode>;
function View({ data, nodeKey }: { data: ImageData; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  const update = (patch: Partial<ImageData>) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof ImageNode && node.getData() === data)
          node.setData({ ...data, ...patch });
      },
      { discrete: true }
    );
  };
  return (
    <ImageView
      {...data}
      readOnly={readOnly}
      markdown={`![${data.alt}](<${data.src}>)`}
      onChange={update}
      onDelete={() => {
        if (!readOnly)
          editor.update(() => {
            $getNodeByKey(nodeKey)?.remove();
          });
      }}
      onSave={(source) => {
        if (readOnly) return false;
        let saved = false;
        editor.update(
          () => {
            const node = $getNodeByKey(nodeKey);
            if (!(node instanceof ImageNode) || node.getData() !== data) return;
            const image = parseImageSource(source);
            if (image) node.setData({ ...data, ...image });
            else if (source) node.replace($createTextNode(source));
            else node.remove();
            saved = true;
          },
          { discrete: true }
        );
        return saved;
      }}
    />
  );
}
export class ImageNode extends DecoratorNode<React.ReactNode> {
  __data: ImageData;
  static getType() {
    return 'notebook-image';
  }
  static clone(node: ImageNode) {
    return new ImageNode(node.__data, node.__key);
  }
  constructor(data: ImageData = { src: '', alt: '', displayMode: true }, key?: NodeKey) {
    super(key);
    this.__data = data;
  }
  static importJSON(data: SerializedImage) {
    return new ImageNode(data);
  }
  exportJSON(): SerializedImage {
    return { ...super.exportJSON(), ...this.__data, type: ImageNode.getType(), version: 1 };
  }
  createDOM() {
    return document.createElement('span');
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return true;
  }
  exportDOM() {
    const data = this.getData();
    const element = document.createElement('span');
    element.dataset.type = 'markdown-image';
    element.dataset.src = data.src;
    element.dataset.alt = data.alt;
    element.dataset.title = data.title ?? '';
    element.dataset.displayMode = String(data.displayMode);
    return { element };
  }
  getData() {
    return this.getLatest().__data;
  }
  setData(data: ImageData) {
    this.getWritable().__data = data;
  }
  decorate() {
    return <View data={this.__data} nodeKey={this.__key} />;
  }
}
export const ImageExtension = defineExtension({
  name: 'notebook/image',
  nodes: [ImageNode],
  dependencies: [
    configExtension(MdastImportExtension, {
      importRules: [
        {
          type: 'image',
          $import: (node: MdastNode) => {
            const image = node as unknown as { url: string; alt?: string; title?: string };
            return $applyNodeReplacement(
              new ImageNode({
                src: image.url,
                alt: image.alt ?? '',
                title: image.title,
                displayMode: true,
              })
            );
          },
        },
      ],
      exportRules: [
        {
          type: ImageNode.getType(),
          $export: (node) =>
            node instanceof ImageNode
              ? ({
                  type: 'image',
                  url: node.getData().src,
                  alt: node.getData().alt,
                  title: node.getData().title,
                } as MdastNode)
              : null,
        },
      ],
    }),
  ],
});
