import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { parseStudyModel } from './studyModel';
const finite = z.number().finite();
const result = z.object({
  frontend_notebook_id: z.string(),
  workspace: z.string(),
  revision: z.number().int().nonnegative(),
  assignments: z.array(
    z.object({
      row: z.number().int().nonnegative(),
      cluster: z.number().int().nonnegative(),
      distance_squared: finite.nonnegative(),
      terms: z.array(
        z.object({
          feature: z.string(),
          value: finite,
          center: finite,
          standardized_difference: finite,
          squared_distance: finite.nonnegative(),
        })
      ),
    })
  ),
});
export class ImportedModelClient {
  constructor(private readonly notebookId: string) {}
  async assign(
    workspace: string,
    revision: number,
    model: string,
    csv: string,
    signal: AbortSignal
  ) {
    const response = result.parse(
      await new NativeNotebookTransport(this.notebookId).send(
        'model-assignment',
        { workspace, expected_revision: revision, model: parseStudyModel(model), csv },
        signal
      )
    );
    if (
      response.frontend_notebook_id !== this.notebookId ||
      response.workspace !== workspace ||
      response.revision !== revision
    )
      throw new Error('导入模型结果与当前工作区不匹配。');
    return response.assignments;
  }
}
