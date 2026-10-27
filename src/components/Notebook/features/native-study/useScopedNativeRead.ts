import { useEffect, useRef, useState } from 'react';
type Observation<T> =
  | { status: 'idle' }
  | { status: 'loading'; scope: string }
  | { status: 'ready'; scope: string; value: T }
  | { status: 'error'; scope: string; message: string };
/** A read belongs to one rendered scope and one attempt, including away-and-back navigation. */
export function useScopedNativeRead<T>(
  scope: string,
  busy: boolean,
  load: (signal: AbortSignal) => Promise<T>
) {
  const [state, setState] = useState<Observation<T>>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  const current = useRef(scope);
  current.current = scope;
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setState({ status: 'idle' });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [scope, busy]);
  const visible: Observation<T> =
    !busy && 'scope' in state && state.scope === scope ? state : { status: 'idle' };
  const read = async () => {
    if (busy || request.current) return;
    const attempt = new AbortController();
    request.current = attempt;
    setState({ status: 'loading', scope });
    const active = () =>
      !attempt.signal.aborted && request.current === attempt && current.current === scope;
    try {
      const value = await load(attempt.signal);
      if (active()) setState({ status: 'ready', scope, value });
    } catch (error) {
      if (active()) setState({ status: 'error', scope, message: String(error) });
    } finally {
      if (request.current === attempt) request.current = null;
    }
  };
  return { state: visible, read };
}
