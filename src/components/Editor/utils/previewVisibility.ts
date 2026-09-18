type Listener = (visible: boolean) => void;
const listeners = new Map<Element, Listener>();
let observer: IntersectionObserver | undefined;

/** One observer per document, disconnected when its last preview unmounts. */
export function observePreview(element: Element, listener: Listener): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    listener(true);
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: '300px' }
  );
  listeners.set(element, listener);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    listeners.delete(element);
    if (!listeners.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
