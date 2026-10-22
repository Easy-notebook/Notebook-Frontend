import { z } from 'zod';
export type FigureQuery = {
  workspace: string;
  expected_revision: number;
  expected_reference_id: string;
  x_feature: string;
  y_feature: string;
};
export const studyFigure = z
  .object({
    frontend_notebook_id: z.string().min(1),
    workspace: z.string().min(1),
    revision: z.number().int().nonnegative(),
    figure: z
      .object({
        name: z.literal('housing-clusters.svg'),
        svg: z
          .string()
          .startsWith('<svg')
          .refine((s) => new TextEncoder().encode(s).length <= 512 * 1024),
        caption: z.string().max(4096),
        reference_id: z.string().min(1),
        selected_data_id: z.string().min(1),
        input_csv_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        x_feature: z.string().min(1),
        y_feature: z.string().min(1),
        reference_rows: z.number().int().min(3).max(2000),
        points: z
          .array(
            z
              .object({
                row: z.number().int().nonnegative(),
                cluster: z.number().int().min(0).max(15),
                x: z.number().finite(),
                y: z.number().finite(),
              })
              .strict()
          )
          .min(1)
          .max(512),
      })
      .strict()
      .refine(
        (f) =>
          f.x_feature !== f.y_feature &&
          f.points.every(
            (p, i) => p.row < f.reference_rows && (i === 0 || p.row > f.points[i - 1].row)
          )
      ),
  })
  .strict();
export type StudyFigureSnapshot = z.infer<typeof studyFigure>;
