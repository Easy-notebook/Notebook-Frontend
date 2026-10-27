import { useState } from 'react';
import type { DiscussionInstruction } from '@Services/native-study/contracts';

/** The native workspace commits revisions; this form only submits feedback against displayed content. */
export function StudyInstruction({
  instruction,
  disabled,
  onRevise,
}: {
  instruction: DiscussionInstruction;
  disabled: boolean;
  onRevise: (feedback: string, expectedHash: string) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const length = [...feedback].length;
  const canRevise = !disabled && feedback.trim().length > 0 && length <= 8192;
  return (
    <details className="rounded border p-3 space-y-3">
      <summary className="cursor-pointer text-sm font-medium">调整房屋解释说明</summary>
      <p className="text-sm text-muted-foreground">
        模型结合已保存的相似样本比较和你的反馈修订说明，后续房屋讨论使用新版本。
        修订不会重新计算分群或修改历史回答。请先保存输入并完成相似样本比较。
      </p>
      <p className="text-xs">当前说明版本 {instruction.descriptor.revision}</p>
      <pre
        aria-label="当前房屋解释说明"
        className="max-h-64 overflow-auto whitespace-pre-wrap text-xs"
      >
        {instruction.content}
      </pre>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRevise) onRevise(feedback, instruction.descriptor.content_hash);
        }}
      >
        <label className="block text-sm">
          解释改进反馈
          <textarea
            className="block w-full rounded border bg-background px-3 py-2 text-sm"
            rows={3}
            disabled={disabled}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="请解释标准化距离的含义，避免把特征相似表述为价格相近。"
          />
        </label>
        {length > 8192 && <p role="alert">反馈超过 8,192 个字符，请缩短。</p>}
        <button
          type="submit"
          disabled={!canRevise}
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        >
          根据反馈修订说明
        </button>
      </form>
    </details>
  );
}
