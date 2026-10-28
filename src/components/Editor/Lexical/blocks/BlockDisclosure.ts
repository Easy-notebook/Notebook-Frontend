import type { BlockKind } from './BlockMetadata';
export function isFoldableBlock(kind: BlockKind): boolean {
  return kind === 'toggle' || kind === 'toggle-heading';
}
/** Shared DOM presentation for authored folds and temporary read-only navigation. */
export function setBlockDisclosure(element: HTMLElement, collapsed: boolean): void {
  const kind = element.dataset.kind as BlockKind;
  const body = element.lastElementChild as HTMLElement;
  const button = element.firstElementChild?.querySelector('button');
  body.id = element.id + '-content';
  element.dataset.collapsed = String(isFoldableBlock(kind) && collapsed);
  body.hidden = kind === 'toggle' && collapsed;
  if (isFoldableBlock(kind)) {
    button?.setAttribute('aria-controls', body.id);
    button?.setAttribute('aria-expanded', String(!collapsed));
    if (kind === 'toggle-heading' && button) {
      button.textContent = collapsed ? '▸' : '▾';
      button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
    }
  } else {
    button?.removeAttribute('aria-expanded');
    button?.removeAttribute('aria-controls');
  }
}
