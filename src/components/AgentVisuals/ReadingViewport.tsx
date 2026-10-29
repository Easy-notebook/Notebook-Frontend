import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const anchors = 'p,li,pre,h1,h2,h3,h4,h5,h6,button';
/** Owns the following/reading lifecycle for every Agent scroll surface. */
export class ReadingPosition {
  private mode: 'following' | 'reading' = 'following';
  private anchor: HTMLElement | null = null;
  private offset = 0;
  private expectedScroll: number | null = null;
  private touchY = 0;
  private readonly resize: ResizeObserver;
  constructor(
    private readonly viewport: HTMLElement,
    content: HTMLElement,
    private readonly onReadingChange: (reading: boolean) => void = () => {}
  ) {
    this.resize = new ResizeObserver(() => this.restore());
    this.resize.observe(content);
    this.resize.observe(viewport);
    viewport.addEventListener('scroll', this.onScroll, { passive: true });
    viewport.addEventListener('wheel', this.onWheel, { passive: true });
    viewport.addEventListener('keydown', this.onKey);
    viewport.addEventListener('touchstart', this.onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', this.onTouchMove, { passive: true });
    viewport.addEventListener('click', this.onClick, true);
    this.latest();
  }
  private get end() {
    return Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
  }
  private top(element: HTMLElement) {
    return element.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top;
  }
  private notify() {
    this.onReadingChange(this.mode === 'reading' && this.end > 12);
  }
  private capture() {
    const height = this.viewport.clientHeight;
    this.anchor =
      Array.from(this.viewport.querySelectorAll<HTMLElement>(anchors)).find((element) => {
        const top = this.top(element);
        return element.getClientRects().length > 0 && top >= 0 && top < height;
      }) ?? null;
    if (this.anchor) this.offset = this.top(this.anchor);
  }
  private pause = () => {
    this.mode = 'reading';
    this.expectedScroll = null;
    this.capture();
    this.notify();
  };
  private scrollTo(top: number) {
    this.viewport.scrollTop = Math.max(0, Math.min(this.end, top));
    this.expectedScroll = this.viewport.scrollTop;
  }
  latest = () => {
    this.mode = 'following';
    this.anchor = null;
    this.scrollTo(this.end);
    this.notify();
  };
  private onScroll = (event: Event) => {
    if (event.target !== this.viewport) return;
    if (
      this.expectedScroll !== null &&
      Math.abs(this.viewport.scrollTop - this.expectedScroll) < 1
    ) {
      this.expectedScroll = null;
      return;
    }
    this.expectedScroll = null;
    this.mode = this.end - this.viewport.scrollTop <= 12 ? 'following' : 'reading';
    if (this.mode === 'reading') this.capture();
    this.notify();
  };
  private onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) this.pause();
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.target === this.viewport && ['ArrowUp', 'PageUp', 'Home'].includes(event.key))
      this.pause();
  };
  private onTouchStart = (event: TouchEvent) => {
    this.touchY = event.touches[0]?.clientY ?? 0;
  };
  private onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY ?? this.touchY;
    if (y > this.touchY) this.pause();
    this.touchY = y;
  };
  private onClick = (event: Event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('button,summary') : null;
    if (!target || !this.viewport.contains(target)) return;
    this.pause();
    this.anchor = target;
    this.offset = this.top(target);
  };
  private restore() {
    if (this.mode === 'following') {
      this.scrollTo(this.end);
    } else if (
      this.anchor?.isConnected &&
      this.viewport.contains(this.anchor) &&
      this.anchor.getClientRects().length
    ) {
      const delta = this.top(this.anchor) - this.offset;
      if (Math.abs(delta) > 0.5) this.scrollTo(this.viewport.scrollTop + delta);
    } else this.capture();
    this.notify();
  }
  dispose() {
    this.resize.disconnect();
    this.viewport.removeEventListener('scroll', this.onScroll);
    this.viewport.removeEventListener('wheel', this.onWheel);
    this.viewport.removeEventListener('keydown', this.onKey);
    this.viewport.removeEventListener('touchstart', this.onTouchStart);
    this.viewport.removeEventListener('touchmove', this.onTouchMove);
    this.viewport.removeEventListener('click', this.onClick, true);
  }
}

export function ReadingViewport({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const position = useRef<ReadingPosition>();
  const [reading, setReading] = useState(false);
  useLayoutEffect(() => {
    position.current = new ReadingPosition(viewport.current!, content.current!, setReading);
    return () => position.current?.dispose();
  }, []);
  return (
    <div className={`agent-reading-shell ${className}`}>
      <div
        ref={viewport}
        className="agent-reading-viewport"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <div ref={content}>{children}</div>
      </div>
      {reading && (
        <button
          type="button"
          className="agent-jump-latest"
          aria-label={`${label}：回到最新`}
          onClick={() => position.current?.latest()}
        >
          ↓ 回到最新
        </button>
      )}
    </div>
  );
}
