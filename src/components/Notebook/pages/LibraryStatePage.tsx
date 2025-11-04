// src/components/Notebook/pages/LibraryStatePage.tsx
// Library state page component

import LibraryState from '../../Scenario/State/LibraryState/LibraryState';

interface LibraryStatePageProps {
  onSelectNotebook: (notebookId: string, notebookTitle: string) => Promise<void>;
  onBack: () => void;
}

export const LibraryStatePage = ({ onSelectNotebook, onBack }: LibraryStatePageProps) => {
  return <LibraryState onSelectNotebook={onSelectNotebook} onBack={onBack} />;
};
