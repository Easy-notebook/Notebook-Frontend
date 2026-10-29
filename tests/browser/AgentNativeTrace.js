// Test-only native-call attribution. No patches are installed by the application.
export function installAgentNativeTrace() {
  const restores = [];
  for (const [prototype, names] of [
    [HTMLDialogElement.prototype, ['showModal', 'close']],
    [HTMLElement.prototype, ['focus']],
  ]) {
    for (const name of names) {
      const original = prototype[name];
      prototype[name] = function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          performance.measure(`agent-native:${name}`, {
            start,
            end: performance.now(),
            detail: { element: this.tagName, label: this.getAttribute('aria-label') },
          });
        }
      };
      restores.push(() => {
        prototype[name] = original;
      });
    }
  }
  return () => restores.reverse().forEach((restore) => restore());
}
