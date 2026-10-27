import { useEffect, useRef, useState } from 'react';
import useRouteStore from '@Store/routeStore';
import { NativeStudyNotebook } from '@Services/native-study/NativeStudyNotebook';

export function CreateHousingStudyButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creator = useRef<NativeStudyNotebook | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      creator.current ??= new NativeStudyNotebook();
      const id = await creator.current.create();
      if (mounted.current) useRouteStore.getState().navigateToWorkspace(id);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="rounded-lg px-3 py-1.5 text-sm text-primary bg-primary/10 disabled:opacity-50"
      >
        {busy ? '正在创建研究…' : '新建房屋研究'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
