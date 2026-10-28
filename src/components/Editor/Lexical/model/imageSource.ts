import { fromMarkdown } from 'mdast-util-from-markdown';

/** One CommonMark interpretation for image nodes, cell previews and source edits. */
export function parseImageSource(source: string) {
  const root = fromMarkdown(source);
  const paragraph = root.children[0];
  const image =
    root.children.length === 1 && paragraph?.type === 'paragraph' && paragraph.children.length === 1
      ? paragraph.children[0]
      : null;
  return image?.type === 'image'
    ? { src: image.url, alt: image.alt ?? '', title: image.title }
    : null;
}
