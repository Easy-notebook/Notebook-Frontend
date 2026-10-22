import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SkillReviewPreview } from './SkillReviewPreview';
const resource = {
  skill: 'house-feature-review',
  source: 'github',
  location: 'fixture/housing',
  content_hash: 'frozen',
  path: 'houses.aalkm',
  model: {},
};
const props = {
  notebookId: 'houses',
  workspace: 'workspace',
  revision: 1,
  lock: { skills: [] },
  resource,
  busy: false,
};
function response(body: Record<string, unknown>) {
  return {
    frontend_notebook_id: 'houses',
    workspace: 'workspace',
    revision: 1,
    execution_authorized: false,
    preview: {
      artifact_fingerprint: 'compiled',
      selection: body.selection,
      tools: [
        'profile',
        'assign',
        ...((body.selection as { reference: unknown }).reference ? ['similar'] : []),
      ].map((name) => ({
        name,
        operation: `skill.${name}`,
        description: name,
        parameters: {},
        result: {},
        binding: { positional: [], named: {} },
      })),
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it('previews explicit frozen bindings without granting execution, including an optional reference', async () => {
  const fetch = vi.fn(
    async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify(response(JSON.parse(init.body as string))))
  );
  vi.stubGlobal('fetch', fetch);
  render(<SkillReviewPreview {...props} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '检查技能工具绑定' }));
  await screen.findByLabelText('已核对技能工具');
  expect(screen.getByText('资源与绑定已核对；尚未授权执行。')).toBeInTheDocument();
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    workspace: 'workspace',
    expected_revision: 1,
    lock: props.lock,
    selection: {
      source: resource.source,
      location: resource.location,
      content_hash: resource.content_hash,
      model_path: resource.path,
      reference: null,
    },
  });
  fireEvent.click(screen.getByLabelText('包含参考样本比较工具'));
  expect(screen.queryByLabelText('已核对技能工具')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '检查技能工具绑定' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('技能包内参考 CSV 路径'), {
    target: { value: 'reference.csv' },
  });
  fireEvent.change(screen.getByLabelText('技能参考身份'), { target: { value: 'ref-id' } });
  fireEvent.click(screen.getByRole('button', { name: '检查技能工具绑定' }));
  await screen.findByText('比较冻结参考样本');
  expect(fetch.mock.calls.every(([url]) => url.endsWith('/skill-review/preview'))).toBe(true);
});
it('aborts a late preview when the revision changes', async () => {
  let complete!: (value: Response) => void;
  const fetch = vi.fn(
    (_url: string, _init: RequestInit) =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const view = render(<SkillReviewPreview {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '检查技能工具绑定' }));
  const init = fetch.mock.calls[0][1];
  view.rerender(<SkillReviewPreview {...props} revision={2} />);
  expect(init.signal?.aborted).toBe(true);
  await act(async () =>
    complete(new Response(JSON.stringify(response(JSON.parse(init.body as string)))))
  );
  expect(screen.queryByLabelText('已核对技能工具')).not.toBeInTheDocument();
});
it.each(['scope', 'selection', 'authority'])(
  'rejects a changed %s in the returned preview',
  async (fault) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const value = response(JSON.parse(init.body as string));
        if (fault === 'scope') value.workspace = 'other';
        if (fault === 'selection')
          value.preview.selection = {
            ...(value.preview.selection as Record<string, unknown>),
            model_path: 'other.aalkm',
          };
        if (fault === 'authority') value.execution_authorized = true;
        return new Response(JSON.stringify(value));
      })
    );
    render(<SkillReviewPreview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '检查技能工具绑定' }));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('已核对技能工具')).not.toBeInTheDocument();
  }
);
