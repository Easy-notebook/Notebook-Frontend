import { useState } from 'react';
import type { NativeView, StudyAbility } from '@Services/native-study/contracts';

const inputClass = 'block w-full rounded border bg-background px-3 py-2 text-sm';
const buttonClass = 'rounded border px-3 py-2 text-sm disabled:opacity-50';

/** Renders native conversation state; the shared study session owns revision and retry. */
export function StudyDiscussion({
  view,
  busy,
  inputChanged,
  execute,
}: {
  view: NativeView;
  busy: boolean;
  inputChanged: boolean;
  execute: (ability: StudyAbility, args: Record<string, unknown>) => void;
}) {
  const [recipient, setRecipient] = useState('data_mining');
  const [message, setMessage] = useState('');
  const selected = view.recipients.some((item) => item.id === recipient)
    ? recipient
    : view.recipients[0].id;
  const bytes = new TextEncoder().encode(message).length;
  const hasChapter = view.document.notebook.chapters.length > 0;
  const disabled = busy || view.document.notebook.status !== 'Open' || !view.model_enabled;
  const canSend =
    !disabled &&
    !inputChanged &&
    hasChapter &&
    message.trim().length > 0 &&
    bytes <= 8192 &&
    view.document.messages.length < 128;
  const label = (id: string) =>
    view.recipients.find((item) => item.id === id || item.aliases.includes(id))?.label ?? id;
  return (
    <section aria-label="协作者讨论" className="space-y-3">
      <h3 className="font-semibold">与协作者讨论研究</h3>
      <p className="text-sm text-muted-foreground">
        回答使用已保存的研究结果及历史问答。未提交的输入不会发送；讨论不会重新拟合模型。
      </p>
      {!view.model_enabled && <p className="text-sm">当前服务未启用模型，仍可查看历史讨论。</p>}
      {inputChanged && <p className="text-sm">请先保存修改后的研究输入，再发起讨论。</p>}
      {!hasChapter && (
        <button
          className={buttonClass}
          type="button"
          disabled={disabled}
          onClick={() => execute('new_chapter', { title: '房屋研究讨论' })}
        >
          开始研究讨论
        </button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) execute('communication', { target_agent: selected, message });
        }}
      >
        <fieldset disabled={disabled || !hasChapter || inputChanged} className="space-y-3">
          <label className="block">
            讨论对象
            <select
              className={inputClass}
              value={selected}
              onChange={(event) => setRecipient(event.target.value)}
            >
              {view.recipients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            研究问题
            <textarea
              className={inputClass}
              rows={3}
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="哪些特征使查询样本与参考房屋相似？"
            />
          </label>
          {bytes > 8192 && <p role="alert">问题超过 8,192 字节，请缩短后发送。</p>}
          {view.document.messages.length >= 128 && (
            <p role="status">本研究已达到 128 条讨论上限。</p>
          )}
          <button className={buttonClass} type="submit" disabled={!canSend}>
            发送研究问题
          </button>
        </fieldset>
      </form>
      <ol aria-label="已保存的研究问答" className="space-y-4">
        {view.document.messages.map((item, index) => (
          <li key={index} className="rounded border p-3 space-y-2">
            <p className="text-sm font-medium">
              {index + 1}. {label(item.target_agent)} · 历史模型回答
            </p>
            <p className="whitespace-pre-wrap text-sm">问题：{item.message}</p>
            <p className="whitespace-pre-wrap text-sm">{item.reply}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
