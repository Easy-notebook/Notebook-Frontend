// utils/fileValidation.ts
// File validation utilities for notebook and preview systems

/**
 * Check if a file path is valid and safe to load
 */
export function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.trim().length === 0) {
    return false;
  }

  // Check for problematic extensions
  const problematicExtensions = ['.tmp', '.lock', '.swp', '~', '.bak'];
  const lowerPath = filePath.toLowerCase();
  
  if (problematicExtensions.some(ext => lowerPath.endsWith(ext))) {
    return false;
  }

  // Check for very long paths that might cause issues
  if (filePath.length > 200) {
    return false;
  }

  // Check for invalid characters that might cause issues
  const invalidChars = ['<', '>', '|', '\0', '\x01', '\x02', '\x03', '\x04', '\x05'];
  if (invalidChars.some(char => filePath.includes(char))) {
    return false;
  }

  return true;
}

/**
 * Check if a file is a notebook file that should be handled specially
 */
export function isNotebookFile(filePath: string, fileName: string): boolean {
  return fileName?.endsWith('.easynb') || 
         (filePath?.includes('notebook_') && fileName?.includes('.notebook.json'));
}

/**
 * Check if a file should be filtered out from tabs
 */
export function shouldFilterFromTabs(filePath: string, fileName: string): boolean {
  return fileName?.startsWith('.') || // Hidden files
         fileName?.includes('__pycache__') ||
         fileName?.includes('.git') ||
         filePath?.startsWith('cells/'); // Old cell files from previous implementation
}

/**
 * Get a safe file name for display purposes
 */
export function getSafeFileName(filePath: string): string {
  if (!filePath) return 'Unknown File';
  
  const fileName = filePath.split('/').pop() || filePath;
  
  // Decode URL encoding if present
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

/**
 * Check if a file path looks like an image reference that might be missing
 */
export function isPotentialMissingImage(filePath: string): boolean {
  if (!filePath) return false;
  
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  const lowerPath = filePath.toLowerCase();
  
  return imageExtensions.some(ext => lowerPath.includes(ext)) ||
         filePath.includes('Screenshot') ||
         filePath.includes('Image') ||
         filePath.includes('photo');
}

/**
 * Sanitize file path for safe usage
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath) return '';
  
  // Remove leading/trailing whitespace
  let sanitized = filePath.trim();
  
  // Replace multiple consecutive slashes with single slash
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Remove leading slash if present (relative paths are safer)
  sanitized = sanitized.replace(/^\//, '');
  
  return sanitized;
}

/**
 * Check if a file path indicates a temporary or system file
 */
export function isSystemOrTempFile(filePath: string): boolean {
  if (!filePath) return false;
  
  // Whitelist .assets directory - it's for user uploaded files, not system files
  if (filePath.startsWith('.assets/') || filePath === '.assets') {
    return false;
  }
  
  const systemPatterns = [
    /^\./,           // Hidden files (but not .assets/ which is whitelisted above)
    /~$/,            // Backup files
    /\.tmp$/i,       // Temporary files
    /\.lock$/i,      // Lock files
    /\.swp$/i,       // Vim swap files
    /\.bak$/i,       // Backup files
    /__pycache__/,   // Python cache
    /\.git/,         // Git files
    /node_modules/,  // Node modules
    /\.DS_Store/,    // macOS system files
    /Thumbs\.db/i,   // Windows system files
  ];

  return systemPatterns.some(pattern => pattern.test(filePath));
}

/**
 * Extract meaningful name from file content for naming
 */
export function extractMeaningfulName(content: string, filePath: string): string {
  if (!content || !content.trim()) {
    return getSafeFileName(filePath);
  }

  // Try to extract title from markdown
  const markdownTitleMatch = content.match(/^#+\s+(.+)/m);
  if (markdownTitleMatch) {
    return markdownTitleMatch[1].trim().substring(0, 50);
  }

  // Try to extract function/class name from code
  const codeNameMatch = content.match(/(?:def|class|function)\s+(\w+)/);
  if (codeNameMatch) {
    return codeNameMatch[1];
  }

  // Use first non-empty line as fallback
  const firstLine = content.split('\n').find(line => line.trim().length > 0);
  if (firstLine) {
    return firstLine.trim().substring(0, 50);
  }

  return getSafeFileName(filePath);
}

/**
 * File validation result interface
 */
export interface FileValidationResult {
  isValid: boolean;
  reason?: string;
  suggestion?: string;
}

/**
 * Comprehensive file validation
 */
export function validateFileForTab(filePath: string, fileName: string, content?: string): FileValidationResult {
  if (!isValidFilePath(filePath)) {
    return {
      isValid: false,
      reason: 'Invalid file path',
      suggestion: 'Check file path format'
    };
  }

  if (shouldFilterFromTabs(filePath, fileName)) {
    return {
      isValid: false,
      reason: 'System file or cell fragment',
      suggestion: 'These files should not appear as tabs'
    };
  }

  if (isSystemOrTempFile(filePath)) {
    return {
      isValid: false,
      reason: 'System or temporary file',
      suggestion: 'These files should not be opened as tabs'
    };
  }

  if (isPotentialMissingImage(filePath) && (!content || content.trim().length === 0)) {
    return {
      isValid: false,
      reason: 'Potentially missing image file',
      suggestion: 'File may not exist on server'
    };
  }

  return { isValid: true };
}