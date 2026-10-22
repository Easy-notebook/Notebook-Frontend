import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HousingStudyPanel } from './HousingStudyPanel';
import {
  publishComparisonCell,
  publishComparisonWorkflow,
  publishEvidenceCell,
} from '@Services/native-study/publishComparisonCell';
vi.mock('@Services/native-study/publishComparisonCell', () => ({
  publishComparisonCell: vi.fn(),
  publishComparisonWorkflow: vi.fn(),
  publishEvidenceCell: vi.fn(),
}));
vi.mock('@Services/native-study/publishStudy', () => ({ publishStudy: vi.fn() }));
vi.mock('@Services/native-study/publishDatasetCell', () => ({ publishDatasetCell: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: 'a', addCell: vi.fn() }) },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
function savedView(owner: string, csv: string) {
  return {
    frontend_notebook_id: owner,
    document: {
      id: `native-${owner}`,
      revision: 1,
      notebook: { status: 'Open', chapters: [] },
      messages: [],
    },
    recipients: [{ id: 'data_mining', label: '房屋特征分群', aliases: ['mining'] }],
    model_enabled: false,
    study: {
      input: {
        revision: 1,
        configuration: {
          kind: 'mining',
          csv,
          parameters: { columns: ['area', 'rooms'], clusters: 3 },
        },
      },
      current: false,
      result: null,
      comparison: null,
      practice: null,
      sample_evidence: null,
    },
  };
}
it('requires saving a changed draft before running against the stored input', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(savedView('a', 'area,rooms\n40,2'))))
  );
  render(<HousingStudyPanel notebookId="a" />);
  const input = screen.getByLabelText('参考 CSV 内容');
  await waitFor(() => expect(input).toHaveValue('area,rooms\n40,2'));
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeEnabled();
  fireEvent.change(input, { target: { value: 'area,rooms\n50,2' } });
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeDisabled();
  expect(screen.getByText(/当前输入尚未保存/)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'area,rooms\n40,2' } });
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeEnabled();
});
it('loads another notebook input even when both saved revisions have the same number', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(savedView('a', 'area,rooms\n40,2'))))
      .mockResolvedValueOnce(new Response(JSON.stringify(savedView('b', 'area,rooms\n90,4'))))
  );
  const view = render(<HousingStudyPanel notebookId="a" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n40,2')
  );
  view.rerender(<HousingStudyPanel notebookId="b" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n90,4')
  );
});
it('admits only one initial read under StrictMode and enables the actual study form', async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          frontend_notebook_id: 'a',
          document: {
            id: 'native-a',
            revision: 0,
            notebook: { status: 'Open', chapters: [] },
            messages: [],
          },
          recipients: [{ id: 'data_mining', label: '房屋特征分群', aliases: ['mining'] }],
          model_enabled: false,
          study: {
            input: null,
            current: false,
            result: null,
            comparison: null,
            practice: null,
            sample_evidence: null,
          },
        }),
        { status: 200 }
      )
  );
  vi.stubGlobal('fetch', request);
  render(
    <StrictMode>
      <HousingStudyPanel notebookId="a" />
    </StrictMode>
  );
  await screen.findByText(/研究已就绪/);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('参考 CSV 内容')).toBeEnabled();
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeDisabled();
});

it('publishes captured comparison inputs, blocks duplicate actions, and aborts on disposal', async () => {
  const view = savedView('a', 'area,rooms\n40,2');
  view.study.current = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(view)))
  );
  let finish!: () => void;
  vi.mocked(publishComparisonCell).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const panel = render(<HousingStudyPanel notebookId="a" />);
  await screen.findByText(/研究已就绪/);
  fireEvent.change(screen.getByLabelText('新样本 CSV'), { target: { value: 'area,rooms\n41,2' } });
  const button = screen.getByRole('button', { name: '插入 AAL 相似样本单元格' });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(screen.getByText('正在保存研究单元格…')).toBeInTheDocument();
  expect(publishComparisonCell).toHaveBeenCalledWith(
    'a',
    {
      referenceCsv: 'area,rooms\n40,2',
      queryCsv: 'area,rooms\n41,2',
      columns: ['area', 'rooms'],
      clusters: 3,
      neighbors: 3,
    },
    expect.any(AbortSignal)
  );
  const calls = vi.mocked(publishComparisonCell).mock.calls;
  const signal = calls[calls.length - 1][2]!;
  panel.unmount();
  expect(signal.aborted).toBe(true);
  finish();
});

it('submits a complete PCS task from current inputs without a prior fitted study', async () => {
  const view = {
    ...savedView('a', 'area,rooms\n40,2'),
    model_enabled: true,
    generated_selection_enabled: true,
  };
  const request = vi.fn<typeof fetch>(async (_url, options) =>
    options?.method === 'POST'
      ? new Response(JSON.stringify({ error: { message: 'Injected model interruption' } }), {
          status: 503,
        })
      : new Response(JSON.stringify(view))
  );
  vi.stubGlobal('fetch', request);
  render(<HousingStudyPanel notebookId="a" />);
  await screen.findByText(/研究已就绪/);
  expect(screen.getByRole('button', { name: '比较并解释相似样本' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('参考 CSV 内容'), {
    target: { value: 'area,rooms\n41,2' },
  });
  fireEvent.change(screen.getByLabelText('新样本 CSV'), { target: { value: 'area,rooms\n42,2' } });
  fireEvent.change(screen.getByLabelText('研究或筛选目标'), {
    target: { value: 'Compare houses and save sample evidence' },
  });
  fireEvent.click(screen.getByRole('button', { name: '由 PCS 规划并执行完整研究' }));
  await screen.findByText(/上次操作待处理/);
  const sent = JSON.parse(
    String(request.mock.calls.find((call) => call[1]?.method === 'POST')![1]!.body)
  );
  expect(sent).toMatchObject({
    ability: 'auto_study_task',
    workspace: 'native-a',
    arguments: {
      csv: 'area,rooms\n41,2',
      query_csv: 'area,rooms\n42,2',
      neighbors: 3,
      maximum: 0.001,
      goal: 'Compare houses and save sample evidence',
      expected_revision: 1,
    },
  });
  expect(JSON.parse(sessionStorage.getItem('aal-study-pending:a')!)).toEqual(sent);
  expect(screen.getByRole('button', { name: '重试原操作' })).toBeEnabled();
});

it('publishes reusable fit/compare cells from saved inputs before any study fit', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(savedView('a', 'area,rooms\n40,2'))))
  );
  render(<HousingStudyPanel notebookId="a" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n40,2')
  );
  fireEvent.change(screen.getByLabelText('新样本 CSV'), { target: { value: 'area,rooms\n41,2' } });
  expect(screen.getByRole('button', { name: '比较并解释相似样本' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '插入可复用的拟合与比较单元格' }));
  await waitFor(() =>
    expect(publishComparisonWorkflow).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ referenceCsv: 'area,rooms\n40,2', queryCsv: 'area,rooms\n41,2' }),
      expect.any(AbortSignal)
    )
  );
});

it('opens the native chapter and recovers the exact discussion after losing its response', async () => {
  const base = savedView('a', 'area,rooms\n40,2');
  let view = {
    ...base,
    model_enabled: true,
    document: {
      ...base.document,
      notebook: { status: 'Open', chapters: [] as { title: string }[] },
      messages: [] as { target_agent: string; message: string; reply: string }[],
    },
  };
  const sent: Record<string, unknown>[] = [];
  let lost = false;
  const request = vi.fn<typeof fetch>(async (_url, options) => {
    if (options?.method !== 'POST') return new Response(JSON.stringify(view));
    const command = JSON.parse(String(options.body));
    sent.push(command);
    if (String(_url).endsWith('/commands/lookup'))
      return new Response(
        JSON.stringify({
          frontend_notebook_id: 'a',
          workspace: command.workspace,
          invocation: command.invocation,
          ability: command.ability,
          status: 'completed',
          result: { id: command.workspace, revision: 3 },
        })
      );
    if (command.ability === 'new_chapter') {
      view = {
        ...view,
        document: {
          ...view.document,
          revision: 2,
          notebook: { status: 'Open', chapters: [{ title: command.arguments.title }] },
        },
      };
    } else if (!lost) {
      lost = true;
      view = {
        ...view,
        document: {
          ...view.document,
          revision: 3,
          messages: [
            {
              target_agent: command.arguments.target_agent,
              message: command.arguments.message,
              reply: '<script>reported text</script> Saved rows describe similarity.',
            },
          ],
        },
      };
      throw new Error('reply lost after native commit');
    }
    return new Response('{}');
  });
  vi.stubGlobal('fetch', request);
  const first = render(<HousingStudyPanel notebookId="a" />);
  await screen.findByText(/研究已就绪/);
  expect(screen.getByRole('button', { name: '发送研究问题' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '开始研究讨论' }));
  await waitFor(() => expect(screen.getByLabelText('研究问题')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('研究问题'), {
    target: { value: 'Explain actual neighbors' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送研究问题' }));
  await screen.findByText(/上次操作待处理/);
  expect(sent[1]).toMatchObject({
    ability: 'communication',
    workspace: 'native-a',
    arguments: {
      target_agent: 'data_mining',
      message: 'Explain actual neighbors',
      expected_revision: 2,
    },
  });
  first.unmount();
  render(<HousingStudyPanel notebookId="a" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '重试原操作' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '重试原操作' }));
  await screen.findByText(/研究已就绪/);
  expect(sent[2]).toEqual(sent[1]);
  expect(sent).toHaveLength(3);
  expect(
    request.mock.calls.filter(
      ([url, options]) => String(url).endsWith('/command') && options?.method === 'POST'
    )
  ).toHaveLength(2);
  expect(screen.getByRole('list', { name: '已保存的研究问答' }).children).toHaveLength(1);
  expect(
    screen.getByText('<script>reported text</script> Saved rows describe similarity.')
  ).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(sessionStorage.getItem('aal-study-pending:a')).toBeNull();
});

it('keeps history readable without a model and resets discussion drafts when changing notebooks', async () => {
  const base = savedView('a', 'area,rooms\n40,2');
  const owned = {
    ...base,
    model_enabled: true,
    document: {
      ...base.document,
      notebook: { status: 'Open', chapters: [{ title: 'Housing' }] },
      messages: [
        {
          target_agent: 'data_mining',
          message: 'Previous question',
          reply: 'Previous model answer',
        },
      ],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/a/')
              ? owned
              : {
                  ...owned,
                  frontend_notebook_id: 'b',
                  model_enabled: false,
                  document: { ...owned.document, id: 'native-b', messages: [] },
                }
          )
        )
    )
  );
  const panel = render(<HousingStudyPanel notebookId="a" />);
  await screen.findByText('Previous model answer');
  fireEvent.change(screen.getByLabelText('研究问题'), { target: { value: '房'.repeat(2731) } });
  expect(screen.getByRole('button', { name: '发送研究问题' })).toBeDisabled();
  expect(screen.getByText(/问题超过 8,192/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('研究问题'), { target: { value: 'My private draft' } });
  expect(screen.getByRole('button', { name: '发送研究问题' })).toBeEnabled();
  panel.rerender(<HousingStudyPanel notebookId="b" />);
  await screen.findByText(/当前服务未启用模型/);
  expect(screen.getByLabelText('研究问题')).toHaveValue('');
  expect(screen.queryByText('Previous model answer')).toBeNull();
  expect(screen.getByRole('button', { name: '发送研究问题' })).toBeDisabled();
  panel.rerender(<HousingStudyPanel notebookId="a" />);
  await screen.findByText('Previous model answer');
  expect(screen.getByLabelText('研究问题')).toHaveValue('');
});

it('publishes the selected evidence row, rejects invalid form rows and resets on notebook change', async () => {
  vi.mocked(publishEvidenceCell).mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(savedView(url.includes('/b/') ? 'b' : 'a', 'area,rooms\n40,2')))
    )
  );
  const view = render(<HousingStudyPanel notebookId="a" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n40,2')
  );
  fireEvent.change(screen.getByLabelText('新样本 CSV'), {
    target: { value: 'area,rooms\n41,2\n90,4' },
  });
  const row = screen.getByLabelText('证据样本行（从 0 开始）');
  const publish = screen.getByRole('button', { name: '插入 FoKn 样本证据单元格' });
  expect(row).toHaveValue(0);
  for (const value of ['', '-1', '128', '0.5']) {
    fireEvent.change(row, { target: { value } });
    expect(publish).toBeDisabled();
  }
  fireEvent.change(row, { target: { value: '1' } });
  expect(publish).toBeEnabled();
  fireEvent.click(publish);
  await waitFor(() =>
    expect(publishEvidenceCell).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ queryRow: 1 }),
      expect.any(AbortSignal)
    )
  );
  await screen.findByText(/运行后查看查询行 1/);
  view.rerender(<HousingStudyPanel notebookId="b" />);
  await waitFor(() => expect(row).toHaveValue(0));
});
