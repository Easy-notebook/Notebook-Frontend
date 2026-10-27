import { comparison } from './contracts';
import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { parseStudyModel } from './studyModel';
const finite = z.number().finite();
const identity = z.object({
  frontend_notebook_id: z.string(),
  workspace: z.string(),
  revision: z.number().int().nonnegative(),
});
const result = identity.extend({
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
    this.check(response, workspace, revision);
    return response.assignments;
  }
  async compare(
    workspace: string,
    revision: number,
    model: string,
    csv: string,
    referenceCsv: string,
    referenceId: string,
    neighbors: number,
    signal: AbortSignal
  ) {
    const response = identity.extend({ comparison }).parse(
      await new NativeNotebookTransport(this.notebookId).send(
        'model-comparison',
        {
          workspace,
          expected_revision: revision,
          model: parseStudyModel(model),
          csv,
          reference_csv: referenceCsv,
          expected_reference_id: referenceId,
          neighbors,
        },
        signal
      )
    );
    this.check(response, workspace, revision);
    if (response.comparison.reference_id !== referenceId)
      throw new Error('比较结果的参考身份不匹配。');
    return response.comparison;
  }
  private check(response: z.infer<typeof identity>, workspace: string, revision: number) {
    if (
      response.frontend_notebook_id !== this.notebookId ||
      response.workspace !== workspace ||
      response.revision !== revision
    )
      throw new Error('导入模型结果与当前工作区不匹配。');
  }
}
