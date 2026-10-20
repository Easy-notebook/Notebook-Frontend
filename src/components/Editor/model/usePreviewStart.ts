import { useEffect, useRef, useState } from 'react';
import { observePreview } from '../utils/previewVisibility';

/** Defer first rendering until near the viewport; retain ready geometry afterward. */
export function usePreviewStart<T extends HTMLElement>(force = false) {
  const container = useRef<T>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started) return;
    if (force) {
      setStarted(true);
      return;
    }
    if (container.current)
      return observePreview(container.current, (visible) => {
        if (visible) setStarted(true);
      });
  }, [started, force]);
  return { container, active: force || started };
}
