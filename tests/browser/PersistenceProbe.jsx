import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistenceProvider } from '../../src/services/persistence/PersistenceContext';

/** Minimal application mount using the production provider and actual IndexedDB owner. */
export function mountPersistenceProbe() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <PersistenceProvider>
        <div>Storage probe ready</div>
      </PersistenceProvider>
    </StrictMode>
  );
  return () => {
    root.unmount();
    host.remove();
  };
}
