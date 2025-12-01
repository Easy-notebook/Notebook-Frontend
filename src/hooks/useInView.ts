import { useState, useEffect } from 'react';

interface UseInViewOptions extends IntersectionObserverInit {
  triggerOnce?: boolean;
}

export function useInView(
  options: UseInViewOptions = {}
): [(node: HTMLDivElement | null) => void, boolean] {
  const { threshold = 0, root = null, rootMargin = '0px', triggerOnce = false } = options;
  const [isInView, setInView] = useState(false);
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (triggerOnce) {
            observer.unobserve(node);
          }
        } else if (!triggerOnce) {
          setInView(false);
        }
      },
      { threshold, root, rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.unobserve(node);
    };
  }, [threshold, root, rootMargin, triggerOnce, node]);

  const ref = (element: HTMLDivElement | null) => {
    setNode(element);
  };

  return [ref, isInView];
}
