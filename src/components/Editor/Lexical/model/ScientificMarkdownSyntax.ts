import { fromMarkdown } from 'mdast-util-from-markdown';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import type { Extension, Tokenizer } from 'micromark-util-types';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown';
import type { Literal, Root } from 'mdast';

export interface ScientificSourceNode extends Literal {
  type: 'notebookScientificSource';
}

export interface LatexNode extends Literal {
  type: 'notebookLatex';
  display: boolean;
  source?: string;
}
export interface LatexDraftNode extends Omit<LatexNode, 'type'> {
  type: 'notebookLatexDraft';
}
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    notebookLatex: 'notebookLatex';
    notebookLatexData: 'notebookLatexData';
  }
}
declare module 'mdast' {
  interface PhrasingContentMap {
    notebookLatex: LatexNode;
    notebookLatexDraft: LatexDraftNode;
    notebookScientificSource: ScientificSourceNode;
  }
  interface RootContentMap {
    notebookScientificSource: ScientificSourceNode;
    notebookLatex: LatexNode;
    notebookLatexDraft: LatexDraftNode;
  }
  interface BlockContentMap {
    notebookScientificSource: ScientificSourceNode;
  }
}

// Tokenize before CommonMark's backslash escapes. Code spans/fences remain opaque,
// and positions still refer to the original source (no regex preprocessing).
const tokenizeLatex: Tokenizer = function (effects, ok, nok) {
  let closing = 0;
  const start: ReturnType<Tokenizer> = (code) => {
    if (code !== 92) return nok(code);
    effects.enter('notebookLatex');
    effects.consume(code);
    return opener;
  };
  const opener: ReturnType<Tokenizer> = (code) => {
    if (code !== 40 && code !== 91) return nok(code);
    closing = code === 40 ? 41 : 93;
    effects.consume(code);
    return body;
  };
  const body: ReturnType<Tokenizer> = (code) => {
    if (code === null) {
      effects.exit('notebookLatex');
      return ok(code);
    }
    if (code === -5 || code === -4 || code === -3) {
      effects.enter('lineEnding');
      effects.consume(code);
      effects.exit('lineEnding');
    } else {
      effects.enter('notebookLatexData');
      effects.consume(code);
      effects.exit('notebookLatexData');
    }
    return code === 92 ? afterSlash : body;
  };
  const afterSlash: ReturnType<Tokenizer> = (code) => {
    if (code === closing) {
      effects.enter('notebookLatexData');
      effects.consume(code);
      effects.exit('notebookLatexData');
      effects.exit('notebookLatex');
      return ok;
    }
    // A doubled slash belongs to TeX, never to the closing delimiter.
    if (code === 92) {
      effects.enter('notebookLatexData');
      effects.consume(code);
      effects.exit('notebookLatexData');
      return body;
    }
    return body(code);
  };
  return start;
};

export const latexSyntax: Extension = {
  text: { 92: { name: 'notebookLatex', tokenize: tokenizeLatex } },
};

export const scientificFromMarkdown: FromMarkdownExtension = {
  enter: {
    notebookLatex(token) {
      const raw = this.sliceSerialize(token);
      const closing = raw[1] === '[' ? ']' : ')';
      const slashes = raw.slice(0, -1).match(/\\+$/)?.[0].length || 0;
      const complete = raw.endsWith(closing) && slashes % 2 === 1;
      this.enter(
        {
          type: complete ? 'notebookLatex' : 'notebookLatexDraft',
          display: raw[1] === '[',
          value: raw.slice(2, complete ? -2 : undefined),
          source: raw,
        },
        token
      );
    },
  },
  exit: {
    notebookLatex(token) {
      this.exit(token);
    },
  },
};

export const scientificToMarkdown: ToMarkdownExtension = {
  handlers: {
    notebookScientificSource(node) {
      return node.value;
    },
    notebookLatexDraft(node) {
      return node.source || node.value;
    },
    notebookLatex(node) {
      return node.source ?? (node.display ? `\\[${node.value}\\]` : `\\(${node.value}\\)`);
    },
  },
};

/** One grammar for editor import, source previews and Markdown hygiene. */
export const scientificMarkdownGrammar = {
  micromarkExtensions: [math(), latexSyntax],
  mdastExtensions: [mathFromMarkdown(), scientificFromMarkdown],
  toMarkdownExtensions: [mathToMarkdown(), scientificToMarkdown],
};

export function parseScientificMarkdown(source: string): Root {
  return fromMarkdown(source, {
    extensions: scientificMarkdownGrammar.micromarkExtensions,
    mdastExtensions: scientificMarkdownGrammar.mdastExtensions,
  });
}
