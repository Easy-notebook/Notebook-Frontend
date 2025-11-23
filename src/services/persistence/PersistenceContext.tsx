import React, { createContext, useContext, useEffect, useState } from 'react';
import { IPersistenceService } from './interfaces';
import { persistenceService } from './instance';

const PersistenceContext = createContext<IPersistenceService | null>(null);

export const PersistenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [service] = useState(() => persistenceService);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await service.initialize();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize persistence service:', error);
      }
    };

    init();

    return () => {
      service.close();
    };
  }, [service]);

  if (!isInitialized) {
    return null; // Or a loading spinner
  }

  return <PersistenceContext.Provider value={service}>{children}</PersistenceContext.Provider>;
};

export const usePersistence = (): IPersistenceService => {
  const context = useContext(PersistenceContext);
  if (!context) {
    throw new Error('usePersistence must be used within a PersistenceProvider');
  }
  return context;
};
