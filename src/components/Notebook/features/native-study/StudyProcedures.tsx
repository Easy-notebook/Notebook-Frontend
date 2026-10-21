import { useState } from 'react';
import type { NativeView } from '@Services/native-study/contracts';

type Procedure = NonNullable<NativeView['study']['procedures']>[number];
const selectionKey = (item: Procedure) =>
  item.origin === 'observed' ? `observed/${item.name}` : item.name;
interface Props {
  procedures: Procedure[];
  disabled: boolean;
  canSave: boolean;
  hasInputs: boolean;
  onSave: (name: string) => void;
  onReuse: (name: string, origin: 'saved' | 'observed') => void;
}
/** Saved instruction documents are inspected here; only the native recipe executor runs them. */
export function StudyProcedures({
  procedures,
  disabled,
  canSave,
  hasInputs,
  onSave,
  onReuse,
}: Props) {
  const [name, setName] = useState('housing-comparison');
  const [selected, setSelected] = useState('');
  const procedure = procedures.find((item) => selectionKey(item) === selected) ?? procedures[0];
  const validName = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name);
  const exists = procedures.some((item) => item.origin !== 'observed' && item.name === name);
  const buttonClass = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
  return (
    <details className="rounded border p-3 space-y-3">
      <summary className="cursor-pointer text-sm font-medium">
        可复用研究技能（{procedures.length}）
      </summary>
      <p className="text-sm text-muted-foreground">
        完成分群与相似样本比较后，可保存特征、分群数和近邻数。复用会使用下方参考与查询 CSV
        重新拟合、比较并生成第一条查询的 FoKn 证据，替换当前研究。历史结论不会沿用。
        “分群、比较并学习”成功后会自动保存技能及执行记录。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && canSave && validName && !exists) onSave(name);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="text-sm">
          研究技能名称
          <input
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            className="block rounded border bg-background px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className={buttonClass}
          disabled={disabled || !canSave || !validName || exists}
        >
          保存当前研究技能
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        名称使用小写字母、数字、连字符或下划线，首位为字母或数字；同名技能不会覆盖。
      </p>
      {exists && <p className="text-sm">此名称已保存，请使用新名称。</p>}
      {procedure && (
        <>
          <label className="block text-sm">
            已保存的研究技能
            <select
              value={selectionKey(procedure)}
              onChange={(event) => setSelected(event.target.value)}
              className="block rounded border bg-background px-3 py-2"
            >
              {procedures.map((item) => (
                <option key={selectionKey(item)} value={selectionKey(item)}>
                  {item.origin === 'observed' ? '自动学习 · ' : '手动保存 · '}
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
            {procedure.content}
          </pre>
          {procedure.observations && (
            <details>
              <summary className="cursor-pointer text-sm">查看已提交的执行记录</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                {procedure.observations}
              </pre>
            </details>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={disabled || !hasInputs}
            onClick={() => {
              if (!disabled && hasInputs) onReuse(procedure.name, procedure.origin ?? 'saved');
            }}
          >
            用当前 CSV 复用所选技能
          </button>
          <p className="text-xs text-muted-foreground">
            使用所选技能中保存的参数；下方手动填写的数值参数不参与本次复用。
          </p>
        </>
      )}
    </details>
  );
}
