import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderMath(source: string, displayMode: boolean): string {
  return katex.renderToString(source, {
    displayMode,
    throwOnError: false,
    errorColor: '#dc2626',
    strict: 'warn',
    trust: false,
  });
}
