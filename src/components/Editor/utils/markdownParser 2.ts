import { v4 as uuidv4 } from 'uuid';

/**
 * 解析 Markdown 内容，分离标题和正文，并根据标题层级管理堆栈结构
 * @param {string} content - Markdown 内容
 * @param {Array} stack - 当前的标题堆栈
 * @returns {Array} - 分离后的单元格数组
 */
export const parseMarkdownContent = (content: string, stack: number[] = []) => {
  const lines = content.split('\n');
  const cells: any[] = [];
  let currentContent: string[] = [];

  lines.forEach((line) => {
    const titleMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (titleMatch) {
      // 如果当前有正文内容，先将其作为一个单元格添加
      if (currentContent.length > 0) {
        cells.push({
          type: 'markdown',
          content: currentContent.join('\n'),
          id: `content-${uuidv4()}`,
        });
        currentContent = [];
      }

      const hashes: string = titleMatch[1];
      const titleText: string = titleMatch[2].trim();
      let level: number = hashes.length;

      // 根据堆栈管理标题层级
      while (stack.length > 0 && stack[stack.length - 1] >= level) {
        stack.pop();
      }
      const currentLevel: number = stack.length + 1;
      stack.push(level);

      // 创建标题单元格
      cells.push({
        type: 'markdown',
        content: `${'#'.repeat(currentLevel)} ${titleText}`,
        id: `title-${uuidv4()}`,
        level: currentLevel, // 记录标题级别
      });
    } else {
      currentContent.push(line);
    }
  });

  // 添加剩余的正文内容
  if (currentContent.length > 0) {
    cells.push({
      type: 'markdown',
      content: currentContent.join('\n'),
      id: `content-${uuidv4()}`,
    });
  }

  return cells;
};
