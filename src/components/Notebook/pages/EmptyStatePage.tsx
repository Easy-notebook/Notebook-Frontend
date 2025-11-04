// src/components/Notebook/pages/EmptyStatePage.tsx
// Empty state page component

import EmptyState from '../../Scenario/State/EmptyState/EmptyState';

interface EmptyStatePageProps {
  onAddCell: (type: 'markdown' | 'code') => Promise<void>;
}

export const EmptyStatePage = ({ onAddCell }: EmptyStatePageProps) => {
  return <EmptyState onAddCell={onAddCell} />;
};
