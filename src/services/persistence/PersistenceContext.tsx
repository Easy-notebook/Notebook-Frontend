import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { IPersistenceService } from './interfaces';
import { persistenceService } from './instance';
import { StorageManager } from '../../storage/storageManager';

const PersistenceContext = createContext<IPersistenceService | null>(null);

type InitializationState = { status: 'opening' } | { status: 'ready' } | { status: 'failed' };

export const PersistenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const service = persistenceService;
  const [state, setState] = useState<InitializationState>({ status: 'opening' });
  const [attempt, setAttempt] = useState(0);
  const closing = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'opening' });
    const initialize = async () => {
      try {
        // StrictMode replay and retries must wait for the preceding owner to close.
        await closing.current;
        if (cancelled) return;
        await StorageManager.initialize();
        if (!cancelled) setState({ status: 'ready' });
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to initialize persistence service:', error);
          setState({ status: 'failed' });
        }
      }
    };
    void initialize();

    return () => {
      cancelled = true;
      closing.current = StorageManager.close();
      // Observe cleanup failures even when the provider will not mount again.
      void closing.current.catch((error: unknown) => {
        console.error('Failed to close persistence service:', error);
      });
    };
  }, [service, attempt]);

  if (state.status === 'failed') {
    return (
      <div role="alert">
        <p>Your notebooks could not be opened from local storage.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (state.status !== 'ready') return <div role="status">Opening notebooks…</div>;

  return <PersistenceContext.Provider value={service}>{children}</PersistenceContext.Provider>;
};

export const usePersistence = (): IPersistenceService => {
  const context = useContext(PersistenceContext);
  if (!context) {
    throw new Error('usePersistence must be used within a PersistenceProvider');
  }
  return context;
};
