/** Frames one JSON object at a time without rescanning incomplete messages. */
class OperationObjectFramer {
  private fragments: string[] = [];
  private depth = 0;
  private stringState: 'outside' | 'quoted' | 'escaped' = 'outside';

  *push(chunk: string): Generator<Record<string, unknown>> {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      const char = chunk[index];
      if (this.depth === 0) {
        if (/\s/.test(char)) {
          start = index + 1;
          continue;
        }
        if (char !== '{') throw new Error('Operation stream must contain JSON objects');
      }
      if (this.stringState === 'escaped') {
        this.stringState = 'quoted';
      } else if (this.stringState === 'quoted') {
        if (char === '\\') this.stringState = 'escaped';
        else if (char === '"') this.stringState = 'outside';
      } else if (char === '"') {
        this.stringState = 'quoted';
      } else if (char === '{') {
        this.depth++;
      } else if (char === '}') {
        this.depth--;
        if (this.depth === 0) {
          this.fragments.push(chunk.slice(start, index + 1));
          const object = this.fragments.join('');
          this.fragments = [];
          start = index + 1;
          // Yield before inspecting the next object: handlers provide backpressure.
          yield JSON.parse(object) as Record<string, unknown>;
        }
      }
    }
    if (start < chunk.length) this.fragments.push(chunk.slice(start));
  }

  finish(): void {
    if (this.depth !== 0) throw new Error('Operation stream ended with incomplete JSON');
  }
}

/** Reads the operation protocol's concatenated JSON objects in wire order. */
export class OperationStreamReader {
  async consume(
    stream: ReadableStream<Uint8Array>,
    receive: (data: Record<string, unknown>) => Promise<void>,
    signal?: AbortSignal
  ): Promise<void> {
    const reader = stream.getReader();
    let cancellation: Promise<void> | undefined;
    const cancel = () => {
      cancellation ??= reader.cancel(signal?.reason);
      void cancellation.catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const framer = new OperationObjectFramer();
    let ended = false;
    const drain = async (chunk: string) => {
      for (const data of framer.push(chunk)) {
        signal?.throwIfAborted();
        await receive(data);
        signal?.throwIfAborted();
      }
    };
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        signal?.throwIfAborted();
        if (done) {
          ended = true;
          await drain(decoder.decode());
          framer.finish();
          return;
        }
        await drain(decoder.decode(value, { stream: true }));
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      try {
        if (!ended) {
          cancel();
          await cancellation;
        }
      } finally {
        reader.releaseLock();
      }
    }
  }
}
