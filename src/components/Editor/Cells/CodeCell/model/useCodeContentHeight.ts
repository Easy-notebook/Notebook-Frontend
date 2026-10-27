import { useLayoutEffect, type RefObject } from 'react';

/** Observe only mounted editors; suspension retains the last measured height in the view model. */
export function useCodeContentHeight(
  container: RefObject<HTMLDivElement | null>,
  active: boolean,
  publish: (height: number) => void
) {
  useLayoutEffect(() => {
    const element = container.current;
    if (!active || !element) return;
    let disposed = false;
    const measure = () => {
      if (!disposed) publish(element.scrollHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined')
      return () => {
        disposed = true;
      };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The viewport may be constrained while the CodeMirror content grows.
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [container, active, publish]);
}
