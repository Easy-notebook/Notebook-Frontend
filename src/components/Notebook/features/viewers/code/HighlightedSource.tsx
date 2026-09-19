import { Prism as SyntaxHighlighter, type SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function HighlightedSource({ isDark, ...props }: SyntaxHighlighterProps & { isDark: boolean }) {
  return <SyntaxHighlighter {...props} style={isDark ? tomorrow : prism} />;
}
