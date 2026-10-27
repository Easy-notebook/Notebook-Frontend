import { expect, it } from 'vitest';
import { SpreadsheetRowOrder } from './SpreadsheetRowOrder';

it('navigates sorted source identities and stops at visible boundaries', () => {
  const order = new SpreadsheetRowOrder([2, 0, 1]);
  expect(order.move(2, 1)).toBe(0);
  expect(order.move(0, -1)).toBe(2);
  expect(order.move(2, -1)).toBe(2);
  expect(order.move(1, 1)).toBe(1);
  expect(order.offset(1, 1)).toBeNull();
});

it('projects selections in visible order and excludes filtered-out source rows', () => {
  const order = new SpreadsheetRowOrder([4, 1, 3]);
  expect(order.between(3, 4)).toEqual([4, 1, 3]);
  expect(order.between(4, 1)).toEqual([4, 1]);
  expect(order.between(0, 1)).toEqual([]);
  expect(order.offset(0, 1)).toBeNull();
});

it('captures row order so later caller mutations do not alter a command projection', () => {
  const rows = [2, 1, 0];
  const order = new SpreadsheetRowOrder(rows);
  rows.reverse();
  expect(order.between(2, 0)).toEqual([2, 1, 0]);
});
