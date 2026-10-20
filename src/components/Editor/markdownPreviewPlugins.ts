import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { remarkCompleteMermaid } from '@Utils/markdown/remarkCompleteMermaid';

/** One Markdown dialect for prose cells and prose surrounding executable code. */
export const markdownRemarkPlugins = [remarkGfm, remarkMath, remarkCompleteMermaid];
