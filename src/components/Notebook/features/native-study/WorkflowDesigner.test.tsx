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
  render(
    <WorkflowDesigner modelEnabled={true} notebookId="houses" context={context} disabled={false} />
  );
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByLabelText('工作流源码');
  expect(screen.getByRole('button', { name: '执行已审阅工作流' })).toBeDisabled();
  expect(fixture.calls.map((c) => c.route)).toEqual(['draft']);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '执行已审阅工作流' }));
  await screen.findByLabelText('工作流执行结果');
  expect(screen.getByLabelText('工作流执行结果')).toHaveTextContent('selected_count');
  expect(fixture.calls.map((c) => c.route)).toEqual(['draft', 'execute']);
  fireEvent.click(screen.getByRole('button', { name: '验收房屋筛选结果' }));
  await screen.findByText('本次房屋筛选结果与原生测量不匹配。');
  expect(screen.getByLabelText('工作流数值验收')).toHaveTextContent('差异字段');
  fireEvent.click(screen.getByRole('button', { name: '保存本次验收为 FoKn 实例证据' }));
  await screen.findByText('已保存：本次结果反驳数值契约。');
  fixture.stale();
  fireEvent.click(screen.getByRole('button', { name: '刷新当前证据状态' }));
  await screen.findByText('当前查询：证据已过期，不能作为当前支持。');
  expect(screen.getByText('已保存：本次结果反驳数值契约。')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '清除本地记录，准备新草稿' }));
  expect(screen.getByLabelText('工作流类名')).not.toHaveValue('HousingWorkflow');
  expect(fixture.calls).toHaveLength(5);
  expect(screen.queryByLabelText('已保存的工作流证据')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('工作流数值验收')).not.toBeInTheDocument();
});
it('restores a lost response only after an explicit retry and resets scope on revision changes', async () => {
  const fixture = workflowFixture();
  fixture.loseDraft();
  const rendered = render(
    <WorkflowDesigner modelEnabled={true} notebookId="houses" context={context} disabled={false} />
  );
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByText('Error: lost response');
  rendered.unmount();
  const reopened = render(
    <WorkflowDesigner modelEnabled={true} notebookId="houses" context={context} disabled={false} />
  );
  await screen.findByRole('button', { name: '恢复原工作流操作' });
  expect(fixture.calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '恢复原工作流操作' }));
  await screen.findByLabelText('工作流源码');
  expect(fixture.calls[1].body).toEqual(fixture.calls[0].body);
  fireEvent.click(screen.getByRole('checkbox'));
  reopened.rerender(
    <WorkflowDesigner
      modelEnabled={true}
      notebookId="houses"
      context={{ ...context, expected_revision: 2 }}
      disabled={false}
    />
  );
  await waitFor(() => expect(screen.queryByLabelText('工作流源码')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: '执行已审阅工作流' })).not.toBeInTheDocument();
  expect(fixture.calls).toHaveLength(2);
});
it('continues suspended work explicitly and recovers a lost continuation response', async () => {
  const fixture = workflowFixture();
  fixture.suspend();
  const rendered = render(
    <WorkflowDesigner modelEnabled={true} notebookId="houses" context={context} disabled={false} />
  );
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByLabelText('工作流源码');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '执行已审阅工作流' }));
  await screen.findByRole('button', { name: '继续挂起工作流' });
  expect(fixture.calls).toHaveLength(2);
  fixture.release();
  fixture.loseContinuation();
  fireEvent.click(screen.getByRole('button', { name: '继续挂起工作流' }));
  await screen.findByText('Error: lost response');
  rendered.unmount();
  render(
    <WorkflowDesigner modelEnabled={true} notebookId="houses" context={context} disabled={false} />
  );
  expect(fixture.calls).toHaveLength(3);
  expect(screen.queryByRole('button', { name: '继续挂起工作流' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '恢复原工作流操作' }));
  await screen.findByRole('button', { name: '清除本地记录，准备新草稿' });
  expect(screen.getByLabelText('工作流执行结果')).toHaveTextContent('selected_count');
  expect(fixture.calls[3].body).toEqual(fixture.calls[2].body);
});

it('keeps evidence operations available without models while blocking authoring and respecting workspace locks', async () => {
  const fixture = workflowFixture();
  const rendered = render(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} modelEnabled={false} />
  );
  expect(screen.getByRole('button', { name: '生成工作流草稿' })).toBeDisabled();
  rendered.rerender(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} modelEnabled={true} />
  );
  fireEvent.click(screen.getByRole('button', { name: '生成工作流草稿' }));
  await screen.findByLabelText('工作流源码');
  fireEvent.click(screen.getByRole('checkbox'));
  rendered.rerender(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} modelEnabled={false} />
  );
  expect(screen.getByRole('button', { name: '执行已审阅工作流' })).toBeDisabled();
  rendered.rerender(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} modelEnabled={true} />
  );
  fireEvent.click(screen.getByRole('button', { name: '执行已审阅工作流' }));
  await screen.findByLabelText('工作流执行结果');
  rendered.rerender(
    <WorkflowDesigner notebookId="houses" context={context} disabled={false} modelEnabled={false} />
  );
  fireEvent.click(screen.getByRole('button', { name: '验收房屋筛选结果' }));
  await screen.findByText('本次房屋筛选结果与原生测量不匹配。');
  fireEvent.click(screen.getByRole('button', { name: '保存本次验收为 FoKn 实例证据' }));
  await screen.findByText('已保存：本次结果反驳数值契约。');
  rendered.rerender(
    <WorkflowDesigner notebookId="houses" context={context} disabled={true} modelEnabled={false} />
  );
  expect(screen.getByRole('button', { name: '验收房屋筛选结果' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '刷新当前证据状态' })).toBeDisabled();
  expect(fixture.calls.map((c) => c.route)).toEqual(['draft', 'execute', 'assess', 'publish']);
});
