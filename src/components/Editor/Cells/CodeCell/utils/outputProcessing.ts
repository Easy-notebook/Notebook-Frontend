import { Output } from './types';

/**
 * Process and validate output objects
 */
export const processOutput = (output: unknown): Output | null => {
  if (!output || typeof output !== 'object') return null;

  const outputObj = output as { type?: string; content?: unknown; key?: string };

  if (outputObj.type === 'image') {
    try {
      return {
        type: 'image' as const,
        content:
          typeof outputObj.content === 'object'
            ? JSON.stringify(outputObj.content)
            : String(outputObj.content),
        key: outputObj.key || `image-${Date.now()}-${Math.random()}`,
      };
    } catch (error) {
      console.error('Error processing image output:', error);
      return {
        type: 'error',
        content: 'Error processing image output',
        key: `error-${Date.now()}-${Math.random()}`,
      };
    }
  }

  if (outputObj.type === 'text' || outputObj.type === 'error') {
    try {
      return {
        type: outputObj.type as 'text' | 'error',
        content: String(outputObj.content || ''),
        key: outputObj.key || `${outputObj.type}-${Date.now()}-${Math.random()}`,
      };
    } catch (error) {
      console.error('Error processing text/error output:', error);
      return {
        type: 'error',
        content: 'Error processing output',
        key: `error-${Date.now()}-${Math.random()}`,
      };
    }
  }

  return outputObj as Output;
};

/**
 * Format elapsed time in HH:MM:SS or MM:SS format
 */
export const formatElapsedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
