import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { WorkspacePage } from './WorkspacePage';

vi.mock('@/components/Scenario/View/CreateMode', () => ({ default: () => <div>Create editor</div> }));
vi.mock('@/components/Scenario/View/DemoMode', () => ({ default: () => <div>Demo editor</div> }));
vi.mock('@Utils/markdownParser', () => ({ findCellsByStep: vi.fn() }));

it.each(['create', 'demo'])('does not project unused cell/output data in %s mode', viewMode => {
  const getCurrentViewCells = vi.fn(() => { throw new Error('Unexpected full-cell projection'); });
  const props = { viewMode, getCurrentViewCells } as unknown as ComponentProps<typeof WorkspacePage>;
  const view = render(<WorkspacePage {...props} />);
  view.rerender(<WorkspacePage {...props} currentStepIndex={1} />);
  expect(getCurrentViewCells).not.toHaveBeenCalled();
  expect(screen.getByText(viewMode === 'create' ? 'Create editor' : 'Demo editor')).toBeTruthy();
});

it('projects cells only when switching into the view that consumes them', () => {
  const getCurrentViewCells = vi.fn(() => [{ id: 'one', content: 'Visible cell' }]);
  const renderCell = vi.fn(cell => <div key={cell.id}>{cell.content}</div>);
  const renderStepNavigation = vi.fn(() => <div>Step navigation</div>);
  const props = {
    viewMode: 'create', getCurrentViewCells, renderCell, renderStepNavigation,
  } as unknown as ComponentProps<typeof WorkspacePage>;
  const view = render(<WorkspacePage {...props} />);
  expect(getCurrentViewCells).not.toHaveBeenCalled();
  view.rerender(<WorkspacePage {...props} viewMode="complete" />);
  expect(getCurrentViewCells).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Visible cell')).toBeTruthy();
  expect(screen.getByText('Step navigation')).toBeTruthy();
  view.rerender(<WorkspacePage {...props} />);
  expect(getCurrentViewCells).toHaveBeenCalledTimes(1);
});
