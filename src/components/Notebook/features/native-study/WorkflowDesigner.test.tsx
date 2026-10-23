import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowDesigner } from './WorkflowDesigner';
import { input, workflowFixture } from '@Services/native-study/test-support/workflowFixture';
const context = {
  workspace: input.workspace,
  expected_revision: 1,
  reference_csv: input.reference_csv,
  query_csv: input.query_csv,
  columns: input.columns,
  clusters: input.clusters,
  neighbors: input.neighbors,
  maximum: input.maximum,
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it('requires source review before explicit execution and shows frozen results', async () => {
  const fixture = workflowFixture();
  render(<WorkflowDesigner notebookId="houses" context={context} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByLabelText('工作流源码');
  expect(screen.getByRole('button', { name: '执行已审阅工作流' })).toBeDisabled();
  expect(fixture.calls.map((c) => c.route)).toEqual(['draft']);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '执行已审阅工作流' }));
  await screen.findByLabelText('工作流执行结果');
  expect(screen.getByLabelText('工作流执行结果')).toHaveTextContent('selected_count');
  expect(fixture.calls.map((c) => c.route)).toEqual(['draft', 'execute']);
  fireEvent.click(screen.getByRole('button', { name: '清除本地记录，准备新草稿' }));
  expect(screen.getByLabelText('工作流类名')).not.toHaveValue('HousingWorkflow');
  expect(fixture.calls).toHaveLength(2);
});
it('restores a lost response only after an explicit retry and resets scope on revision changes', async () => {
  const fixture = workflowFixture();
  fixture.loseDraft();
  const rendered = render(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} />
  );
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByText('Error: lost response');
  rendered.unmount();
  const reopened = render(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} />
  );
  await screen.findByRole('button', { name: '恢复原工作流操作' });
  expect(fixture.calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '恢复原工作流操作' }));
  await screen.findByLabelText('工作流源码');
  expect(fixture.calls[1].body).toEqual(fixture.calls[0].body);
  fireEvent.click(screen.getByRole('checkbox'));
  reopened.rerender(
    <WorkflowDesigner
      notebookId="houses"
      context={{ ...context, expected_revision: 2 }}
      disabled={false}
    />
  );
  await waitFor(() => expect(screen.queryByLabelText('工作流源码')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: '执行已审阅工作流' })).not.toBeInTheDocument();
  expect(fixture.calls).toHaveLength(2);
});
