type Listener = (visible: boolean) => void;
const listeners = new Map<Element, { listener: Listener }>();
let observer: IntersectionObserver | undefined;

/** One observer per document, disconnected when its last preview unmounts. */
export function observePreview(element: Element, listener: Listener): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    listener(true);
    return () => {};
  }
  if (!observer) {
    const current = new IntersectionObserver(
      (entries) => {
        if (observer !== current) return;
        for (const entry of entries) listeners.get(entry.target)?.listener(entry.isIntersecting);
      },
      { rootMargin: '300px' }
    );
    observer = current;
  }
  const subscription = { listener };
  listeners.set(element, subscription);
  observer.observe(element);
  return () => {
    if (listeners.get(element) !== subscription) return;
    observer?.unobserve(element);
    listeners.delete(element);
    if (!listeners.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
