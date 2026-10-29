export type BlockFrame = { key: string; left: number; right: number; top: number; bottom: number };

/** Drop targets include the gutter and inter-block whitespace, not just painted content. */
export function nearestBlock(frames: BlockFrame[], x: number, y: number) {
  let best: BlockFrame | undefined;
  let distance = Infinity;
  for (const frame of frames) {
    const dy = Math.max(frame.top - y, 0, y - frame.bottom);
    const dx = Math.max(frame.left - 56 - x, 0, x - frame.right);
    const score = dy + dx * 2;
    if (score < distance) {
      best = frame;
      distance = score;
    }
  }
  if (!best || distance > 100) return null;
  const after = y > (best.top + best.bottom) / 2;
  return {
    key: best.key,
    after,
    top: after ? best.bottom : best.top,
    left: best.left,
    width: best.right - best.left,
  };
}

export function leftMenuPosition(
  anchor: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
) {
  return {
    left: Math.max(8, Math.min(anchor.left - size.width - 8, viewport.width - size.width - 8)),
    top: Math.max(8, Math.min(anchor.top, viewport.height - size.height - 8)),
  };
}

export function blockControlPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('[contenteditable="false"], [style*="--editor-syntax-marker"]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const line = [...range.getClientRects()].find((r) => r.height && r.width);
    if (line) return { left: Math.max(4, rect.left - 50), top: line.top + line.height / 2 - 13 };
  }
  return { left: Math.max(4, rect.left - 50), top: rect.top + 2 };
}
