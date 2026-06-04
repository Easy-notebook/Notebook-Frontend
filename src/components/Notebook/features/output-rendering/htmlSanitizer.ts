import DOMPurify, { Config } from 'dompurify';

const NOTEBOOK_HTML_SANITIZE_OPTIONS: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['class', 'style', 'target', 'rel'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
};

export const sanitizeNotebookHtml = (html: string): string =>
  DOMPurify.sanitize(html, NOTEBOOK_HTML_SANITIZE_OPTIONS);
