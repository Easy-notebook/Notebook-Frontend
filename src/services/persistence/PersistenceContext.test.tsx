import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistenceProvider, usePersistence } from './PersistenceContext';

const service = vi.hoisted(() => ({ initialize: vi.fn(), close: vi.fn() }));
vi.mock('./instance', () => ({ persistenceService: service }));
const lifecycle = vi.hoisted(() => ({ initialize: vi.fn(), close: vi.fn() }));
vi.mock('../../storage/storageManager', () => ({ StorageManager: lifecycle }));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function Content() {
  const persistence = usePersistence();
  return <div>{Object.is(persistence, service) ? 'Notebook ready' : 'Wrong owner'}</div>;
}
beforeEach(() => {
  vi.resetAllMocks();
  lifecycle.initialize.mockResolvedValue(undefined);
  lifecycle.close.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('persistence provider lifecycle', () => {
  it('waits for StrictMode cleanup before opening and exposes the initialized owner', async () => {
    const closed = deferred();
    lifecycle.close.mockReturnValueOnce(closed.promise);
    render(
      <StrictMode>
        <PersistenceProvider>
          <Content />
        </PersistenceProvider>
      </StrictMode>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(lifecycle.initialize).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Opening');
    await act(async () => {
      closed.resolve();
    });
    expect(lifecycle.initialize).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Notebook ready')).toBeInTheDocument();
  });

  it('does not start opening after unmount while cleanup is pending', async () => {
    const closed = deferred();
    lifecycle.close.mockReturnValue(closed.promise);
    const view = render(
      <StrictMode>
        <PersistenceProvider>
          <Content />
        </PersistenceProvider>
      </StrictMode>
    );
    view.unmount();
    await act(async () => {
      closed.resolve();
    });
    expect(lifecycle.initialize).not.toHaveBeenCalled();
  });

  it('does not render children from an initialization completing after unmount', async () => {
    const opening = deferred();
    lifecycle.initialize.mockReturnValue(opening.promise);
    const view = render(
      <PersistenceProvider>
        <Content />
      </PersistenceProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(lifecycle.initialize).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      opening.resolve();
    });
    expect(screen.queryByText('Notebook ready')).not.toBeInTheDocument();
    expect(lifecycle.close).toHaveBeenCalledTimes(1);
  });

  it('shows a failed initialization and waits for cleanup before retrying', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    lifecycle.initialize.mockRejectedValueOnce(new Error('blocked'));
    render(
      <PersistenceProvider>
        <Content />
      </PersistenceProvider>
    );
    await screen.findByRole('alert');
    const closed = deferred();
    lifecycle.close.mockReturnValueOnce(closed.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(lifecycle.initialize).toHaveBeenCalledTimes(1);
    await act(async () => {
      closed.resolve();
    });
    expect(lifecycle.initialize).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Notebook ready')).toBeInTheDocument();
  });

  it('reports a cleanup failure and retries only after a successful close', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    lifecycle.close.mockRejectedValueOnce(new Error('close failed'));
    render(
      <StrictMode>
        <PersistenceProvider>
          <Content />
        </PersistenceProvider>
      </StrictMode>
    );
    await screen.findByRole('alert');
    expect(lifecycle.initialize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Notebook ready');
    expect(lifecycle.initialize).toHaveBeenCalledTimes(1);
  });

  it('observes a cancelled opening rejection without changing the mounted state', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const opening = deferred();
    lifecycle.initialize.mockReturnValueOnce(opening.promise);
    const view = render(
      <PersistenceProvider>
        <Content />
      </PersistenceProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    await act(async () => {
      opening.reject(new Error('closed during initialization'));
    });
    expect(error).not.toHaveBeenCalled();
  });
});
