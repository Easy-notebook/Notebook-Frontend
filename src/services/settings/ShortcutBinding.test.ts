import { expect, it } from 'vitest';
import { ShortcutBinding } from './ShortcutBinding';
import { initialSettings } from './SettingsDefaults';

it.each(['Ctrl+C', 'Ctrl + c', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z'])(
  'rejects reserved binding %s',
  (value) => {
    expect(() => ShortcutBinding.validateUpdate(value, {})).toThrow('reserved by the system');
  }
);

it('detects equivalent reordered modifiers while keeping distinct modifier sets separate', () => {
  expect(() => ShortcutBinding.validateUpdate('Shift+Ctrl+K', { runCell: 'Ctrl+Shift+k' })).toThrow(
    'runCell'
  );
  expect(() => ShortcutBinding.validateUpdate('Ctrl+K', { runCell: 'Ctrl+Shift+K' })).not.toThrow();
});

it.each(['Ctrl+Ctrl+K', 'Ctrl++K', 'Other+K', 'Ctrl', 'Ctrl+LongKey'])(
  'rejects malformed binding %s',
  (value) => {
    expect(() => ShortcutBinding.parse(value)).toThrow();
  }
);

it('accepts every built-in binding when updating its own action', () => {
  for (const [action, value] of Object.entries(initialSettings.shortcuts)) {
    const others: Record<string, string> = { ...initialSettings.shortcuts };
    delete others[action];
    expect(() => ShortcutBinding.validateUpdate(value, others)).not.toThrow();
  }
});
