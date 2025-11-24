var y = Object.defineProperty;
var M = (w, e, t) =>
  e in w ? y(w, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : (w[e] = t);
var _ = (w, e, t) => M(w, typeof e != 'symbol' ? e + '' : e, t);
import { D as x, I as L, g as v, a as u, f as h, N as A, s as R } from './index-DA3ohzAm.js';
import { d as G, b as $, c as U } from './index-DA3ohzAm.js';
class k {
  static async saveFile(e, t = {}) {
    if (!e.notebookId || !e.filePath || !e.fileName)
      throw new Error(
        `Invalid file data: missing required fields. Got notebookId=${e.notebookId}, filePath=${e.filePath}, fileName=${e.fileName}`
      );
    const p = await L.getDB(),
      i = Date.now(),
      d = {
        maxFileSize: t.maxFileSize ?? this.defaultConfig.maxFileSize,
        compressionEnabled: t.compressionEnabled ?? this.defaultConfig.compressionEnabled,
        forceLocal: t.forceLocal ?? !1,
      },
      m = `${e.notebookId}::${e.filePath}`,
      o = e.size > d.maxFileSize && !d.forceLocal,
      T = {
        id: m,
        notebookId: e.notebookId,
        filePath: e.filePath,
        fileName: e.fileName,
        fileType: v(e.filePath),
        size: e.size,
        lastModified: e.lastModified,
        cachedAt: i,
        lastAccessedAt: i,
        accessCount: 1,
        storageType: o ? 'remote' : 'local',
        hasLocalContent: !o,
        remoteUrl: e.remoteUrl,
        isLargeFile: o,
        contentPreview: o ? this.generateContentPreview(e.content) : void 0,
      };
    return new Promise((g, r) => {
      const n = p.transaction([u.STORES.FILES_METADATA, u.STORES.FILES_CONTENT], 'readwrite'),
        a = n.objectStore(u.STORES.FILES_METADATA),
        f = n.objectStore(u.STORES.FILES_CONTENT),
        c = a.get(m);
      ((c.onsuccess = () => {
        const E = c.result,
          F = E ? 0 : 1,
          b = T.size - ((E == null ? void 0 : E.size) || 0),
          O = a.put(T);
        ((O.onsuccess = () => {
          if (o)
            (A.logActivity(e.notebookId, 'file_create', e.filePath, {
              isLargeFile: !0,
              remoteUrl: e.remoteUrl,
            }).catch((C) => R.error('Failed to log large file create activity', { error: C })),
              A.adjustNotebookStats(e.notebookId, F, b).catch((C) =>
                R.error('Failed to adjust notebook stats for large file', { error: C })
              ),
              g(T));
          else {
            const C = {
                fileId: m,
                content: d.compressionEnabled ? this.compressContent(e.content) : e.content,
                compressed: d.compressionEnabled,
                encoding: this.detectEncoding(e.content),
              },
              I = f.put(C);
            ((I.onsuccess = () => {
              (h.fileOperation('save', e.filePath, {
                notebookId: e.notebookId,
                size: e.content.length,
                compressed: d.compressionEnabled,
                storageType: T.storageType,
                hasLocalContent: T.hasLocalContent,
              }),
                A.logActivity(e.notebookId, 'file_create', e.filePath).catch((N) =>
                  R.error('Failed to log file create activity', { error: N })
                ),
                A.adjustNotebookStats(e.notebookId, F, b).catch((N) =>
                  R.error('Failed to adjust notebook stats', { error: N })
                ),
                g(T));
            }),
              (I.onerror = () => r(I.error)));
          }
        }),
          (O.onerror = () => r(O.error)));
      }),
        (c.onerror = () => r(c.error)),
        (n.onerror = () => r(n.error)));
      const l = setTimeout(() => {
          (h.warn('Save file timeout', {
            notebookId: e.notebookId,
            filePath: e.filePath,
            timeoutMs: 2e4,
          }),
            r(new Error('Save file timeout - operation took longer than 20 seconds')));
        }, 2e4),
        s = g,
        S = r;
      ((g = (E) => {
        (clearTimeout(l), s(E));
      }),
        (r = (E) => {
          (clearTimeout(l), S(E));
        }));
    });
  }
  static async getFile(e, t) {
    if (!e || !t)
      return (h.warn('Invalid parameters for getFile', { notebookId: e, filePath: t }), null);
    const p = await L.getDB();
    return new Promise((i, d) => {
      const m = p.transaction([u.STORES.FILES_METADATA, u.STORES.FILES_CONTENT], 'readwrite'),
        o = m.objectStore(u.STORES.FILES_METADATA),
        g = o.index('notebookPath').get([e, t]);
      ((g.onsuccess = () => {
        const n = g.result;
        if (!n) {
          i(null);
          return;
        }
        const a = { ...n, lastAccessedAt: Date.now(), accessCount: n.accessCount + 1 },
          f = o.put(a);
        if (
          ((f.onsuccess = () => {
            (A.logActivity(e, 'file_access', t).catch((c) =>
              R.error('Failed to log file access activity', { error: c })
            ),
              A.updateNotebookAccess(e).catch((c) =>
                R.error('Failed to update notebook access', { error: c })
              ));
          }),
          (f.onerror = () =>
            h.error('Failed to update file access stats', { notebookId: e, filePath: t })),
          n.hasLocalContent)
        ) {
          const l = m.objectStore(u.STORES.FILES_CONTENT).get(n.id);
          ((l.onsuccess = () => {
            var E;
            clearTimeout(r);
            const s = l.result;
            h.debug('Retrieved file content', {
              fileId: n.id,
              found: !!s,
              compressed: s == null ? void 0 : s.compressed,
              rawContentSize:
                ((E = s == null ? void 0 : s.content) == null ? void 0 : E.length) || 0,
              encoding: s == null ? void 0 : s.encoding,
            });
            const S = {
              metadata: a,
              content: s ? this.decompressContent(s.content, s.compressed) : void 0,
            };
            (S.content && h.debug('Decompressed content size', { size: S.content.length }), i(S));
          }),
            (l.onerror = () => {
              (clearTimeout(r), i({ metadata: a, needsRemoteFetch: !0 }));
            }));
        } else (clearTimeout(r), i({ metadata: a, needsRemoteFetch: !0 }));
      }),
        (g.onerror = () => {
          (clearTimeout(r), d(g.error));
        }));
      const r = setTimeout(() => {
        (h.warn('File retrieval timeout - consider optimizing database', {
          notebookId: e,
          filePath: t,
          timeoutMs: 15e3,
        }),
          d(new Error('Get file timeout - operation took longer than 15 seconds')));
      }, 15e3);
    });
  }
  static async getFilesForNotebook(e, t = !1) {
    const p = await L.getDB();
    return (
      A.updateNotebookAccess(e).catch((i) =>
        R.error('Failed to update notebook access during file listing', { error: i })
      ),
      new Promise((i, d) => {
        const m = t ? [u.STORES.FILES_METADATA, u.STORES.FILES_CONTENT] : [u.STORES.FILES_METADATA],
          o = p.transaction(m, 'readonly'),
          r = o.objectStore(u.STORES.FILES_METADATA).index('notebookId').openCursor(e),
          n = [];
        ((r.onsuccess = (l) => {
          const s = l.target.result;
          if (s) {
            const S = s.value;
            if (t && S.hasLocalContent) {
              const F = o.objectStore(u.STORES.FILES_CONTENT).get(S.id);
              ((F.onsuccess = () => {
                const b = F.result;
                (n.push({
                  metadata: S,
                  content: b ? this.decompressContent(b.content, b.compressed) : void 0,
                  needsRemoteFetch: !b,
                }),
                  s.continue());
              }),
                (F.onerror = () => {
                  (n.push({ metadata: S, needsRemoteFetch: !0 }), s.continue());
                }));
            } else (n.push({ metadata: S, needsRemoteFetch: !S.hasLocalContent }), s.continue());
          } else i(n);
        }),
          (r.onerror = () => d(r.error)));
        const a = setTimeout(() => {
            (h.warn('Get files timeout for notebook', {
              notebookId: e,
              includeContent: t,
              timeoutMs: 2e4,
            }),
              d(new Error('Get files timeout - operation took longer than 20 seconds')));
          }, 2e4),
          f = i,
          c = d;
        ((i = (l) => {
          (clearTimeout(a), f(l));
        }),
          (d = (l) => {
            (clearTimeout(a), c(l));
          }));
      })
    );
  }
  static async deleteFile(e, t) {
    if (!e || !t)
      return (h.warn('Invalid parameters for deleteFile', { notebookId: e, filePath: t }), !1);
    const p = await L.getDB(),
      i = `${e}::${t}`;
    return new Promise((d, m) => {
      const o = p.transaction([u.STORES.FILES_METADATA, u.STORES.FILES_CONTENT], 'readwrite'),
        T = o.objectStore(u.STORES.FILES_METADATA),
        g = o.objectStore(u.STORES.FILES_CONTENT),
        r = T.get(i);
      ((r.onsuccess = () => {
        const c = r.result;
        if (!c) {
          d(!0);
          return;
        }
        const l = c.size || 0,
          s = T.delete(i);
        ((s.onsuccess = () => {
          const S = g.delete(i),
            E = () => {
              (A.logActivity(e, 'file_delete', t).catch((F) =>
                R.error('Failed to log file delete activity', { error: F })
              ),
                A.adjustNotebookStats(e, -1, -l).catch((F) =>
                  R.error('Failed to adjust notebook stats after delete', { error: F })
                ),
                d(!0));
            };
          ((S.onsuccess = E), (S.onerror = E));
        }),
          (s.onerror = () => m(s.error)));
      }),
        (r.onerror = () => m(r.error)));
      const n = setTimeout(() => {
          (h.warn('Delete file timeout', { notebookId: e, filePath: t, timeoutMs: 15e3 }),
            m(new Error('Delete file timeout - operation took longer than 15 seconds')));
        }, 15e3),
        a = d,
        f = m;
      ((d = (c) => {
        (clearTimeout(n), a(c));
      }),
        (m = (c) => {
          (clearTimeout(n), f(c));
        }));
    });
  }
  static async updateFileContent(e, t, p) {
    const i = await L.getDB(),
      d = `${e}::${t}`;
    return new Promise((m, o) => {
      const T = i.transaction([u.STORES.FILES_METADATA, u.STORES.FILES_CONTENT], 'readwrite'),
        g = T.objectStore(u.STORES.FILES_METADATA),
        r = T.objectStore(u.STORES.FILES_CONTENT),
        n = g.get(d);
      ((n.onsuccess = () => {
        const l = n.result;
        if (!l) {
          o(new Error('File not found'));
          return;
        }
        const s = {
            ...l,
            hasLocalContent: !0,
            storageType: 'local',
            size: new Blob([p]).size,
            lastModified: new Date().toISOString(),
            lastAccessedAt: Date.now(),
          },
          S = g.put(s);
        ((S.onsuccess = () => {
          const E = {
              fileId: d,
              content: this.defaultConfig.compressionEnabled ? this.compressContent(p) : p,
              compressed: this.defaultConfig.compressionEnabled,
              encoding: this.detectEncoding(p),
            },
            F = r.put(E);
          ((F.onsuccess = () => {
            const b = (s.size || 0) - (l.size || 0);
            (A.adjustNotebookStats(e, 0, b).catch((O) =>
              R.error('Failed to adjust notebook stats after file update', { error: O })
            ),
              m(!0));
          }),
            (F.onerror = () => o(F.error)));
        }),
          (S.onerror = () => o(S.error)));
      }),
        (n.onerror = () => o(n.error)));
      const a = setTimeout(() => {
          (h.warn('Update file timeout', { notebookId: e, filePath: t, timeoutMs: 2e4 }),
            o(new Error('Update file timeout - operation took longer than 20 seconds')));
        }, 2e4),
        f = m,
        c = o;
      ((m = (l) => {
        (clearTimeout(a), f(l));
      }),
        (o = (l) => {
          (clearTimeout(a), c(l));
        }));
    });
  }
  static async getLargeFiles(e) {
    const t = await L.getDB();
    return new Promise((p, i) => {
      const m = t
        .transaction([u.STORES.FILES_METADATA], 'readonly')
        .objectStore(u.STORES.FILES_METADATA);
      let o;
      e ? (o = m.index('notebookId').openCursor(e)) : (o = m.index('isLargeFile').openCursor(!0));
      const T = [];
      ((o.onsuccess = (a) => {
        const f = a.target.result;
        if (f) {
          const c = f.value;
          (c.isLargeFile && (!e || c.notebookId === e) && T.push(c), f.continue());
        } else p(T);
      }),
        (o.onerror = () => i(o.error)));
      const g = setTimeout(() => {
          (h.warn('Get large files timeout for notebook', { notebookId: e, timeoutMs: 15e3 }),
            i(new Error('Get large files timeout - operation took longer than 15 seconds')));
        }, 15e3),
        r = p,
        n = i;
      ((p = (a) => {
        (clearTimeout(g), r(a));
      }),
        (i = (a) => {
          (clearTimeout(g), n(a));
        }));
    });
  }
  static generateContentPreview(e) {
    return e.length <= 500
      ? e
      : typeof e == 'string'
        ? e.substring(0, 500) + '... [truncated]'
        : '[Binary content preview not available]';
  }
  static detectEncoding(e) {
    if (typeof e != 'string') return 'binary';
    if (/^data:/.test(e)) return 'base64';
    try {
      if (e.includes('\0') || /[^\x20-\x7E\t\r\n]/.test(e.substring(0, 100))) return 'binary';
    } catch {
      return 'binary';
    }
    return 'utf8';
  }
  static compressContent(e) {
    return e;
  }
  static decompressContent(e, t) {
    return e;
  }
}
_(k, 'defaultConfig', x);
export {
  u as DB_CONFIG,
  G as DB_STORES,
  x as DEFAULT_STORAGE_CONFIG,
  k as FileORM,
  L as IndexedDBManager,
  A as NotebookORM,
  $ as getActivePreviewMode,
  v as getFileType,
  U as getMimeType,
};
