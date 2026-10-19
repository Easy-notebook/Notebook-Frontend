/** Reads the operation protocol's concatenated JSON objects in wire order. */
export class OperationStreamReader {
  async consume(
    stream: ReadableStream<Uint8Array>,
    receive: (data: Record<string, unknown>) => Promise<void>
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '';
    let ended = false;
    const drain = async () => {
      let start = 0;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = 0; index < buffer.length; index++) {
        const char = buffer[index];
        if (depth === 0) {
          if (/\s/.test(char)) {
            start = index + 1;
            continue;
          }
          if (char !== '{') throw new Error('Operation stream must contain JSON objects');
        }
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            const data: Record<string, unknown> = JSON.parse(buffer.slice(start, index + 1));
            await receive(data);
            start = index + 1;
          }
        }
      }
      buffer = buffer.slice(start);
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          ended = true;
          buffer += decoder.decode();
          await drain();
          if (buffer.trim()) throw new Error('Operation stream ended with incomplete JSON');
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        await drain();
      }
    } finally {
      try {
        if (!ended) await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
  }
}
