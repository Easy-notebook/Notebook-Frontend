import pdfMake from 'pdfmake/build/pdfmake';
import Prism from 'prismjs';
import { marked } from 'marked';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';

// Type definitions for PDF export
interface CellOutput {
  type: 'image' | 'error' | 'text';
  content: string;
}

interface Cell {
  id: string;
  type: 'markdown' | 'code' | 'hybrid';
  content: string;
  outputs?: CellOutput[];
  language?: string;
  [key: string]: any;
}

interface PDFStyle {
  font?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italics?: boolean;
  lineHeight?: number;
  margin?: number[];
  fontWeight?: number;
  background?: string;
  preserveLeadingSpaces?: boolean;
  noWrap?: boolean;
  alignment?: string;
  decoration?: string;
}

interface PDFContent {
  text?: string | any[];
  style?: string | string[];
  color?: string;
  bold?: boolean;
  italics?: boolean;
  fontWeight?: number;
  alignment?: string;
  margin?: number[];
  stack?: any[];
  table?: any;
  layout?: any;
  canvas?: any[];
  fillColor?: string;
  preserveLeadingSpaces?: boolean;
  image?: string;
  width?: number;
  ul?: any[];
  ol?: any[];
}

const mainColor = '#9F1239';
const paragraphColor = '#1f2937';
const codeBlockBg = '#fef2f2';
const inlineCodeBg = '#fff7ed';

// Font loading
const loadFonts = async (): Promise<void> => {
  if (pdfMake.vfs && pdfMake.fonts) return;

  try {
    const fontResponse: Response = await fetch('/fonts/NotoSansSC-VariableFont_wght.ttf');
    if (!fontResponse.ok) {
      throw new Error('Font file not found');
    }
    const fontArrayBuffer: ArrayBuffer = await fontResponse.arrayBuffer();
    const fontBase64: string = arrayBufferToBase64(fontArrayBuffer);

    const fontFileName = 'NotoSansSC.ttf';
    const boldFontFileName = 'NotoSansSC-Bold.ttf';

    pdfMake.vfs = {
      [fontFileName]: fontBase64,
      [boldFontFileName]: fontBase64,
    };

    pdfMake.fonts = {
      NotoSansSC: {
        normal: fontFileName,
        bold: boldFontFileName,
        italics: fontFileName,
        bolditalics: boldFontFileName,
      },
    };
  } catch (error: unknown) {
    console.warn('Failed to load NotoSansSC font, falling back to Helvetica', error);
    pdfMake.fonts = {
      NotoSansSC: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };
  }
};

const getStyles = (): Record<string, PDFStyle> => ({
  h1: {
    font: 'NotoSansSC',
    fontSize: 18,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 10, 0, 5],
    fontWeight: 700,
  },
  h2: {
    font: 'NotoSansSC',
    fontSize: 15,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 8, 0, 4],
    fontWeight: 700,
  },
  h3: {
    font: 'NotoSansSC',
    fontSize: 13,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 6, 0, 3],
    fontWeight: 700,
  },
  h4: {
    font: 'NotoSansSC',
    fontSize: 11,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 4, 0, 2],
    fontWeight: 700,
  },
  h5: {
    font: 'NotoSansSC',
    fontSize: 10,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 4, 0, 2],
    fontWeight: 700,
  },
  h6: {
    font: 'NotoSansSC',
    fontSize: 9,
    color: mainColor,
    bold: true,
    lineHeight: 1.2,
    margin: [0, 4, 0, 2],
    fontWeight: 700,
  },
  paragraph: {
    font: 'NotoSansSC',
    fontSize: 10,
    color: paragraphColor,
    lineHeight: 1.5,
    margin: [0, 0, 0, 8],
  },
  codeBlock: {
    font: 'NotoSansSC',
    fontSize: 9,
    lineHeight: 1.3,
    preserveLeadingSpaces: true,
    noWrap: true,
  },
  inlineCode: {
    font: 'NotoSansSC',
    fontSize: 9,
    background: inlineCodeBg,
    color: '#c2410c', // orange-700
    margin: [0, 0, 0, 0],
  },
  output: {
    font: 'NotoSansSC',
    fontSize: 9,
    color: '#000000',
    lineHeight: 1.2,
  },
  error: {
    font: 'NotoSansSC',
    fontSize: 9,
    color: '#dc2626', // red-600
    lineHeight: 1.2,
  },
  blockquote: {
    font: 'NotoSansSC',
    fontSize: 10,
    color: '#4b5563', // gray-600
    italics: true,
    margin: [0, 5, 0, 5],
  },
  list: {
    font: 'NotoSansSC',
    fontSize: 10,
    color: paragraphColor,
    lineHeight: 1.4,
    margin: [0, 0, 0, 5],
  },
  link: {
    color: '#2563eb', // blue-600
    decoration: 'underline',
  },
});

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes: Uint8Array = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// --- Markdown Processing with Marked ---

const processTokens = (tokens: any[]): PDFContent[] => {
  const content: PDFContent[] = [];

  tokens.forEach((token) => {
    switch (token.type) {
      case 'heading':
        content.push({
          text: token.text,
          style: `h${token.depth}`,
        });
        // Add a separator line for H1 and H2
        if (token.depth <= 2) {
          content.push({
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 515, // Approx A4 width minus margins
                y2: 0,
                lineWidth: 1,
                lineColor: '#e5e7eb', // gray-200
              },
            ],
            margin: [0, 0, 0, 10],
          });
        }
        break;

      case 'paragraph':
        content.push({
          text: processInlineTokens(token.tokens),
          style: 'paragraph',
        });
        break;

      case 'list': {
        const listType = token.ordered ? 'ol' : 'ul';
        const listItems = token.items.map((item: any) => {
          // Flatten items content if possible, or handle nested blocks
          // For simplicity, we process the tokens of the item
          return {
            text: processInlineTokens(item.tokens),
            style: 'list',
          };
        });
        content.push({
          [listType]: listItems,
          margin: [0, 0, 0, 8],
        });
        break;
      }

      case 'code':
        content.push(...createCodeBlock(token.text, [], token.lang || 'text'));
        break;

      case 'blockquote':
        content.push({
          stack: processTokens(token.tokens),
          style: 'blockquote',
          margin: [10, 5, 0, 5],
          // Simulate blockquote border with a table or layout if needed
          // For now, just indentation and italics
        });
        break;

      case 'space':
        // Ignore extra spaces
        break;

      case 'hr':
        content.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 1,
              lineColor: '#d1d5db', // gray-300
            },
          ],
          margin: [0, 10, 0, 10],
        });
        break;

      default:
        console.warn(`Unsupported markdown token type: ${token.type}`, token);
        if (token.text) {
          content.push({
            text: token.text,
            style: 'paragraph',
          });
        }
        break;
    }
  });

  return content;
};

const processInlineTokens = (tokens: any[]): any[] => {
  if (!tokens) return [];
  return tokens.map((token) => {
    const style: any = {};
    if (token.type === 'strong') style.bold = true;
    if (token.type === 'em') style.italics = true;
    if (token.type === 'codespan') {
      return {
        text: token.text,
        style: 'inlineCode',
      };
    }
    if (token.type === 'link') {
      style.color = '#2563eb';
      style.decoration = 'underline';
      // pdfMake supports link: 'url'
      return {
        text: token.text,
        link: token.href,
        ...style,
      };
    }
    if (token.type === 'text') {
      // Handle nested formatting if marked provides it, otherwise just text
      // Marked text tokens might have 'tokens' property if they contain other inline elements?
      // Usually 'strong' contains 'tokens' etc.
      // But 'text' is usually a leaf.
      return {
        text: token.text,
        ...style,
      };
    }

    // Recursive processing for inline containers
    if (token.tokens) {
      return {
        text: processInlineTokens(token.tokens),
        ...style,
      };
    }

    return {
      text: token.text || '',
      ...style,
    };
  });
};

const convertMarkdownToPdf = (content: string): PDFContent[] => {
  try {
    const tokens = marked.lexer(content);
    return processTokens(tokens);
  } catch (e) {
    console.error('Error parsing markdown:', e);
    return [{ text: content, style: 'paragraph' }];
  }
};

// --- Code Block Processing ---

const parseCodeHighlight = (code: string, language = 'python'): PDFContent[] => {
  try {
    if (!Prism.languages[language]) {
      return [
        {
          text: code,
          style: 'codeBlock',
          color: '#000000',
        },
      ];
    }

    const highlighted = Prism.highlight(code, Prism.languages[language], language);
    if (!highlighted) {
      return [
        {
          text: code,
          style: 'codeBlock',
          color: '#000000',
        },
      ];
    }

    const parts: PDFContent[] = [];
    const tempDiv: HTMLDivElement = document.createElement('div');
    tempDiv.innerHTML = highlighted;

    const processNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          parts.push({
            text: node.textContent,
            style: 'codeBlock',
            color: '#000000',
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        let color = '#000000';
        const element = node as Element;
        const classes: string[] = Array.from(element.classList || []);
        if (classes.includes('keyword')) color = '#0000FF';
        else if (classes.includes('string')) color = '#A31515';
        else if (classes.includes('function')) color = '#795E26';
        else if (classes.includes('comment')) color = '#008000';
        else if (classes.includes('number')) color = '#098658';
        else if (classes.includes('boolean')) color = '#0000FF';
        else if (classes.includes('operator')) color = '#333333';

        if (node.textContent) {
          parts.push({
            text: node.textContent,
            style: 'codeBlock',
            color,
          });
        }
      }
    };

    Array.from(tempDiv.childNodes).forEach(processNode);

    return parts.length
      ? parts
      : [
          {
            text: code,
            style: 'codeBlock',
            color: '#000000',
          },
        ];
  } catch (error: unknown) {
    console.error('Error parsing code highlight:', error);
    return [
      {
        text: code,
        style: 'codeBlock',
        color: '#000000',
      },
    ];
  }
};

const createCodeBlock = (
  code: string,
  outputs: CellOutput[] = [],
  language = 'python'
): PDFContent[] => {
  const codeLines: string[] = code.split('\n');

  const codeContent: PDFContent[] = codeLines.map((line: string, index: number) => ({
    stack: [
      {
        text: line ? parseCodeHighlight(line, language) : ' ',
        style: 'codeBlock',
        preserveLeadingSpaces: true,
      },
    ],
    margin: [0, index > 0 ? 1 : 0, 0, 0],
  }));

  const mainContainer: PDFContent = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: codeContent,
            fillColor: codeBlockBg,
          },
        ],
      ],
    },
    layout: {
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => codeBlockBg,
    },
    margin: [0, 5, 0, 5],
  };

  const result: PDFContent[] = [mainContainer];

  if (outputs && outputs.length > 0) {
    outputs.forEach((output: CellOutput) => {
      if (!output.content) return;

      if (output.type === 'image') {
        // Handle base64 images
        // Ensure content is a valid base64 data URI or raw base64
        let imageContent = output.content;
        // If it doesn't start with data:image, assume it's raw base64 and prepend prefix (guess png)
        // But usually output.content from backend might be just base64 or data uri.
        // Let's assume standard data URI or try to detect.
        if (!imageContent.startsWith('data:image')) {
          imageContent = `data:image/png;base64,${imageContent}`;
        }

        result.push({
          image: imageContent,
          width: 400, // Limit width
          margin: [0, 5, 0, 5],
        });
      } else {
        const outputLines: string[] = output.content.split('\n');
        outputLines.forEach((line: string) => {
          result.push({
            text: line,
            style: output.type === 'error' ? 'error' : 'output',
            margin: [0, 1, 0, 1],
          });
        });
      }
    });
  }

  return result;
};

export const exportToPdf = async (cells: Cell[]): Promise<void> => {
  try {
    await loadFonts();

    const content: PDFContent[] = [];

    for (const cell of cells) {
      if (!cell || !cell.type || !cell.content) continue;

      if (cell.type === 'markdown') {
        content.push(...convertMarkdownToPdf(cell.content));
      } else if (cell.type === 'code') {
        const language: string = typeof cell.language === 'string' ? cell.language : 'python';
        content.push(...createCodeBlock(cell.content, cell.outputs, language));
      }
    }

    const docDefinition: any = {
      content: content,
      defaultStyle: {
        font: 'NotoSansSC',
      },
      styles: getStyles(),
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
    };

    pdfMake.createPdf(docDefinition).download('notebook.pdf');
  } catch (error: unknown) {
    console.error('Error exporting to PDF:', error);
    throw error;
  }
};
