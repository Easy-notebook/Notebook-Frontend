/**
 * title_extractor.ts
 */

/**
 * 从形如 "chapter_{num}_..." 的标识符中提取章节标题。
 *
 * 例如: "chapter_5_model_implementation_execution" => "model implementation execution"
 *
 * @param identifier - 要处理的标识符字符串
 * @returns 提取并用空格连接后的标题
 */
export function extractChapterTitle(identifier: string): string {
    if (!identifier) {
        return '';
    }
    const parts = identifier.split('_');
    // 去掉前两部分："chapter" 和 数字
    const core = parts.slice(2);
    if (core.length === 0) {
        return identifier;
    }
    return core.join(' ');
}

/**
 * 从形如 "..._section_{num}_..." 的标识符中提取小节标题。
 *
 * 例如: "chapter_5_model_implementation_execution_section_1_workflow_initialization" => "workflow initialization"
 *
 * @param identifier - 要处理的标识符字符串
 * @returns 提取并用空格连接后的标题
 */
export function extractSectionTitle(identifier: string): string {
    if (!identifier) {
        return '';
    }
    const marker = '_section_';
    const idx = identifier.indexOf(marker);
    if (idx === -1) {
        // 如果没有找到 section 标记，则退回到章节标题提取
        return extractChapterTitle(identifier);
    }
    // 提取 marker 之后的部分
    const tail = identifier.slice(idx + marker.length);
    const parts = tail.split('_');
    // 去掉第一个部分（章节号）
    const core = parts.slice(1);
    if (core.length === 0) {
        return identifier;
    }
    return core.join(' ');
}

export function filterSectionStageText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    
    // 移除各种可能的 section 和 stage 模式（不区分大小写）
    // 支持格式：section1, section 1, section_1, section-1, Section1, SECTION1 等
    return text
      .replace(/section[\s_-]*\d+/gi, '')
      .replace(/stage[\s_-]*\d+/gi, '')
      .replace(/第?\s*\d+\s*章节?/gi, '') // 中文章节
      .replace(/第?\s*\d+\s*阶段/gi, '') // 中文阶段
      .replace(/^\s*[-:：]\s*/g, '') // 移除开头的分隔符
      .replace(/\s+/g, ' ') // 将多个空格替换为单个空格
      .trim(); // 去除首尾空格
  };