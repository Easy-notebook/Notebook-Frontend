// utils/markdownExport.ts
import { saveAs } from 'file-saver';

// Type definitions for markdown export
interface CellOutput {
  type: 'image' | 'error' | 'text';
  content: string;
}

interface Cell {
  id: string;
  type: 'markdown' | 'code' | 'hybrid';
  content: string;
  outputs?: CellOutput[];
  [key: string]: any;
}

interface CellStats {
  total: number;
  code: number;
  markdown: number;
}

const CELL_SEPARATOR: string = '\n\n---\n\n';
const CODE_BLOCK_DELIMITER: string = '```';

/**
 * Convert a cell's outputs to markdown format
 * @param outputs - Array of cell outputs
 * @returns Markdown formatted outputs
 */
const formatOutputs = (outputs: CellOutput[] | undefined): string => {
  if (!outputs || outputs.length === 0) return '';

  return outputs.map((output: CellOutput) => {
    if (output.type === 'image') {
      // For images, create a markdown image tag with base64 content
      return `![Output](${output.content})`;
    } else if (output.type === 'error') {
      // For errors, create a code block with error formatting
      return `\n❌ Error:\n${CODE_BLOCK_DELIMITER}\n${output.content}\n${CODE_BLOCK_DELIMITER}\n`;
    } else {
      // For regular text output
      return `\nOutput:\n${CODE_BLOCK_DELIMITER}\n${output.content}\n${CODE_BLOCK_DELIMITER}\n`;
    }
  }).join('\n');
};

/**
 * Convert a code cell to markdown format
 * @param cell - Code cell object
 * @returns Markdown formatted code cell
 */
const convertCodeCellToMarkdown = (cell: Cell): string => {
  const codeBlock: string = `${CODE_BLOCK_DELIMITER}python\n${cell.content || ''}\n${CODE_BLOCK_DELIMITER}`;
  const outputs: string = formatOutputs(cell.outputs);
  
  return `${codeBlock}\n${outputs}`;
};

/**
 * Add frontmatter to the markdown document
 * @param cells - Array of notebook cells
 * @returns Frontmatter section
 */
const createFrontmatter = (cells: Cell[]): string => {
  const date: string = new Date().toISOString().split('T')[0];
  const totalCells: number = cells.length;
  const codeCells: number = cells.filter((cell: Cell) => cell.type === 'code').length;
  const markdownCells: number = cells.filter((cell: Cell) => cell.type === 'markdown').length;

  return `---
title: Exported Notebook
date: ${date}
cells:
  total: ${totalCells}
  code: ${codeCells}
  markdown: ${markdownCells}
---

`;
};

/**
 * Export notebook cells to markdown format
 * @param cells - Array of notebook cells
 * @param filename - Output filename
 */
const exportToMarkdown = (cells: Cell[], filename: string = 'notebook.md'): void => {
  try {
    // Create frontmatter
    let markdownContent: string = createFrontmatter(cells);

    // Convert each cell
    const cellsContent: string[] = cells.map((cell: Cell) => {
      if (cell.type === 'markdown') {
        return cell.content || '';
      } else if (cell.type === 'code') {
        return convertCodeCellToMarkdown(cell);
      }
      return '';
    });

    // Combine all content with separators
    markdownContent += cellsContent.join(CELL_SEPARATOR);

    // Create and save the file
    const blob: Blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    saveAs(blob, filename);

  } catch (error: unknown) {
    console.error('Error generating Markdown:', error);
    throw error;
  }
};

export { exportToMarkdown };