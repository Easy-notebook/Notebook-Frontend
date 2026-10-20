import { useCallback, useEffect, useRef } from 'react';

/** Latest navigation owns its scheduled work; the browser selects ancestor scrollers. */
export function useHeadingNavigation() {
  const frame = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return useCallback(
    (elementId: string) => {
      cancel();
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          const editor = document.querySelector('.tiptap-notebook-editor');
          const exact = document.getElementById(elementId);
          let target = exact && (!editor || editor.contains(exact)) ? exact : null;
          if (!target && editor) {
            const separator = elementId.indexOf('--');
            if (separator >= 0) {
              target = editor.querySelector<HTMLElement>(
                `[data-base-id="${CSS.escape(elementId.slice(0, separator))}"][data-heading-key="${CSS.escape(elementId.slice(separator + 2))}"]`
              );
            }
          }
          // Smooth scrolling through deferred previews changes geometry along the path.
          target?.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      });
    },
    [cancel]
  );
}
