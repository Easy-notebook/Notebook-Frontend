import { z } from 'zod';
import type { NativeView } from './contracts';

/** Portable wire data; numerical validation and assignment belong to the Rust runtime. */
const model = z
  .object({
    version: z.literal(1),
    training_rows: z.number().int().min(3).max(2000),
    features: z
      .array(
        z
          .object({
            name: z.string().min(1),
            mean: z.number().finite(),
            scale: z.number().finite().positive(),
          })
          .strict()
      )
      .min(1)
      .max(16),
    centers: z.array(z.array(z.number().finite())).min(2).max(16),
  })
  .strict();

export function studyModelExport(view: NativeView): string {
  if (!view.study.current || !view.study.result)
    throw new Error('请先完成当前数据的分群，再导出模型。');
  const parsed = model.safeParse(view.study.result.report.model);
  if (!parsed.success) throw new Error('分群模型不完整，无法导出。');
  return JSON.stringify(parsed.data, null, 2);
}
