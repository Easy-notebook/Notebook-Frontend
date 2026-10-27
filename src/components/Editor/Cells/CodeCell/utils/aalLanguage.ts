import { StreamLanguage } from '@codemirror/language';

// AAL uses indentation, double-quoted strings and # line comments.
const keywords = new Set(
  `agent ability about archive async await behavior bridge collect config
contract derive effects else engine enum factory for from if in instances is limit match memory
not on open or overridable override parallel permissions persist private public require return role
scope skill start state strict struct then think tool until use wait while workflow and fn`.split(
    /\s+/
  )
);

export const aalLanguage = StreamLanguage.define({
  name: 'aal',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('"')) {
      let escaped = false;
      while (!stream.eol()) {
        const char = stream.next();
        if (char === '"' && !escaped) break;
        escaped = char === '\\' && !escaped;
      }
      return 'string';
    }
    if (stream.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z_0-9]*/)) {
      const word = stream.current();
      if (keywords.has(word)) return 'keyword';
      if (/^(true|false|None)$/.test(word)) return 'atom';
      if (word === 'self') return 'variableName.special';
      if (/^[A-Z]/.test(word)) return 'typeName';
      return stream.match(/^\s*\(/, false) ? 'variableName.function' : 'variableName';
    }
    if (stream.match(/^[+\-*/=<>!%&|]+/)) return 'operator';
    stream.next();
    return 'punctuation';
  },
  languageData: { commentTokens: { line: '#' } },
});
