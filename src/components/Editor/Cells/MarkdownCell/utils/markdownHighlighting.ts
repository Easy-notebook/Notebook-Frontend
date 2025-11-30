import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const markdownHighlighting = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700', color: '#41B883' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#41B883' },
  { tag: tags.link, color: '#41B883', textDecoration: 'none', borderBottom: '1.5px solid #41B883' },
  {
    tag: tags.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.875rem',
    backgroundColor: 'rgba(65, 184, 131, 0.05)',
    color: '#41B883',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    fontWeight: '500',
  },
  {
    tag: tags.quote,
    borderLeft: '4px solid #41B883',
    backgroundColor: 'rgba(65, 184, 131, 0.05)',
    color: '#35495E',
    fontStyle: 'italic',
    padding: '0.5rem 1rem',
    margin: '1.5rem 0',
  },
  { tag: tags.list, color: '#41B883', fontWeight: 'bold' },
]);
