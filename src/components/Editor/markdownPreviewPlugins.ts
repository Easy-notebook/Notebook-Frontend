import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkCompleteMermaid } from '@Utils/markdown/remarkCompleteMermaid';
import 'katex/dist/katex.min.css';

/** One Markdown dialect for prose cells and prose surrounding executable code. */
export const markdownRemarkPlugins = [remarkGfm, remarkMath, remarkCompleteMermaid];
export const markdownRehypePlugins = [rehypeKatex];
