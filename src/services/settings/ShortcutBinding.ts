const modifiers = new Set(['Ctrl', 'Alt', 'Shift', 'Meta']);
const reserved = new Set(['ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+a', 'ctrl+z']);

function identity(value: string): string {
  const parts = value.split('+').map((part) => part.trim().toLowerCase());
  return [...parts.slice(0, -1).sort(), parts[parts.length - 1]].join('+');
}

/** Semantic shortcut identity is independent of modifier order and key letter case. */
export class ShortcutBinding {
  private constructor(readonly identity: string) {}

  static parse(value: string): ShortcutBinding {
    const parts = value.split('+').map((part) => part.trim());
    if (parts.length < 2 || parts.length > 3) throw new Error('Shortcut must have 2-3 keys');
    const keys = parts.slice(0, -1);
    if (!keys.every((key) => modifiers.has(key)) || new Set(keys).size !== keys.length)
      throw new Error('Invalid modifier key(s)');
    const finalKey = parts[parts.length - 1];
    // Enter is used by the built-in new-cell and run-cell bindings.
    if (!/^[A-Za-z0-9]$/.test(finalKey) && finalKey !== 'Enter')
      throw new Error('Invalid final key');
    return new ShortcutBinding(identity(value));
  }

  static validateUpdate(value: string, existing: Record<string, string>): void {
    const candidate = ShortcutBinding.parse(value);
    if (reserved.has(candidate.identity))
      throw new Error('This shortcut is reserved by the system');
    const conflicts = Object.entries(existing).filter(
      ([, binding]) => identity(binding) === candidate.identity
    );
    if (conflicts.length)
      throw new Error(`Shortcut conflicts with: ${conflicts.map(([key]) => key).join(', ')}`);
  }
}
