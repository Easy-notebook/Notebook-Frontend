import { describe, expect, it } from 'vitest';
import { leftMenuPosition, nearestBlock } from './BlockGeometry';
const frames = [
  { key: 'before', left: 400, right: 900, top: 100, bottom: 130 },
  { key: 'code', left: 400, right: 900, top: 160, bottom: 300 },
  { key: 'after', left: 400, right: 900, top: 330, bottom: 360 },
];
describe('block gutter geometry', () => {
  it('finds drop targets while dragging in the left gutter', () => {
    expect(nearestBlock(frames, 365, 350)).toMatchObject({ key: 'after', after: true, top: 360 });
    expect(nearestBlock(frames, 365, 165)).toMatchObject({ key: 'code', after: false, top: 160 });
  });
  it('resolves whitespace and rejects distant unrelated panes', () => {
    expect(nearestBlock(frames, 365, 145)?.key).toBe('before');
    expect(nearestBlock(frames, 10, 145)).toBeNull();
  });
  it('places the menu on the left and clamps to the visible viewport', () => {
    expect(
      leftMenuPosition(
        { left: 350, top: 100 },
        { width: 288, height: 400 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ left: 54, top: 100 });
    expect(
      leftMenuPosition(
        { left: 35, top: 650 },
        { width: 288, height: 400 },
        { width: 695, height: 740 }
      )
    ).toEqual({ left: 8, top: 332 });
  });
});
