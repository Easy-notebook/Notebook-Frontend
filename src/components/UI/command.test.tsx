import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { CommandDialog } from './command';
import { Dialog, DialogContent, DialogTitle } from './Dialog';

function Palette({ showCloseButton = true }: { showCloseButton?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open commands</button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Actions"
        description="Find an action"
        showCloseButton={showCloseButton}
      >
        <input aria-label="Command search" />
      </CommandDialog>
    </>
  );
}

it('labels the command dialog and closes it through the default close button', async () => {
  render(<Palette />);
  fireEvent.click(screen.getByRole('button', { name: 'Open commands' }));
  expect(screen.getByRole('dialog', { name: 'Actions' })).toHaveAccessibleDescription(
    'Find an action'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('hides the close button while preserving Escape dismissal and focus restoration', async () => {
  render(<Palette showCloseButton={false} />);
  const trigger = screen.getByRole('button', { name: 'Open commands' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Command search' })).toHaveFocus()
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('preserves the content onClose callback', () => {
  const onClose = vi.fn();
  render(
    <Dialog open>
      <DialogContent onClose={onClose} aria-describedby={undefined}>
        <DialogTitle>Details</DialogTitle>
      </DialogContent>
    </Dialog>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledOnce();
});
