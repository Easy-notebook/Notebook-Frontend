interface FontResources {
  fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;
  vfs: Record<string, string>;
}

/** One shared font admission; failed loads can retry without publishing partial resources. */
export class PdfFontResources {
  private pending: Promise<FontResources> | null = null;

  constructor(
    private readonly request: typeof fetch = (...args) => fetch(...args),
    private readonly base = import.meta.env.BASE_URL
  ) {}

  load(): Promise<FontResources> {
    if (!this.pending) {
      this.pending = this.read().catch((error: unknown) => {
        this.pending = null;
        throw error;
      });
    }
    return this.pending;
  }

  private async read(): Promise<FontResources> {
    const names = ['NotoSansSC-Regular.ttf', 'NotoSansSC-Bold.ttf'];
    const entries = await Promise.all(
      names.map(async (name) => {
        const response = await this.request(`${this.base}fonts/${name}`);
        if (!response.ok) throw new Error(`Cannot load PDF font ${name}: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error(`Empty PDF font: ${name}`);
        const chunks: string[] = [];
        for (let offset = 0; offset < bytes.length; offset += 8192)
          chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
        return [name, btoa(chunks.join(''))] as const;
      })
    );
    return {
      vfs: Object.fromEntries(entries),
      fonts: {
        NotoSansSC: { normal: names[0], bold: names[1], italics: names[0], bolditalics: names[1] },
      },
    };
  }
}

export const pdfFontResources = new PdfFontResources();
