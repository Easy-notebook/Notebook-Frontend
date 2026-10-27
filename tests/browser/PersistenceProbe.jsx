import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotebookRecoveryCenter } from '../../src/components/Notebook/recovery/NotebookRecoveryCenter';
import { PersistenceProvider } from '../../src/services/persistence/PersistenceContext';

/** Minimal application mount using the production provider and actual IndexedDB owner. */
function mountProbe(children) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <PersistenceProvider>{children}</PersistenceProvider>
    </StrictMode>
  );
  return () => {
    root.unmount();
    host.remove();
  };
}

export function mountPersistenceProbe() {
  return mountProbe(<div>Storage probe ready</div>);
}

export function mountRecoveryProbe() {
  return mountProbe(
    <>
      <NotebookRecoveryCenter />
      <div>Recovery probe ready</div>
    </>
  );
}
