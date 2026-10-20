/** Structural deletion must not consume modified text-editing shortcuts. */
export function isPlainBackspace(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
): boolean {
  return (
    event.key === 'Backspace' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}
