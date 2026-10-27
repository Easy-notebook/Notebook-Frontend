import type { JSONContent } from '@tiptap/core';
import { Backend_BASE_URL } from '@Config/base_url';

/** Upload results are node data, never HTML source. */
export function createUploadedAssetNode(notebookId: string, name: string): JSONContent {
  const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
  const image = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((extension) =>
    name.toLowerCase().endsWith(extension)
  );
  const markdown = `${image ? '!' : ''}[${name}](${url})`;
  return image
    ? { type: 'markdownImage', attrs: { src: url, alt: name, title: name, markdown } }
    : { type: 'fileAttachment', attrs: { markdown } };
}
