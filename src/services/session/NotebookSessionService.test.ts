import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotebookSessionService } from './NotebookSessionService';
import { SessionStatus } from './types';
import { createSessionStore } from './sessionStore';

const mocks = vi.hoisted(() => ({
  autoSave: {
    initialize: vi.fn(),
    isPaused: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    flush: vi.fn(),
    waitForComplete: vi.fn(),
  },
  store: {
    notebookId: 'a',
    notebookTitle: 'A',
    cells: [{ id: 'a-cell', content: 'A content' }],
    tasks: [],
    isLoaded: true,
    isInitialized: true,
    error: null as string | null,
    loadFromDatabase: vi.fn(),
  },
}));
vi.mock('@Services/autoSave', () => ({
  AutoSaveService: { getInstance: () => mocks.autoSave },
}));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => ({ ...mocks.store }) } }));
let service: NotebookSessionService;
beforeEach(async () => {
  vi.resetAllMocks();
  NotebookSessionService.resetInstance();
  Object.assign(mocks.store, {
    notebookId: 'a',
    notebookTitle: 'A',
    cells: [{ id: 'a-cell', content: 'A content' }],
    isLoaded: true,
    isInitialized: true,
    error: null,
  });
  mocks.autoSave.isPaused.mockReturnValue(false);
  mocks.autoSave.pause.mockResolvedValue(undefined);
  mocks.autoSave.flush.mockResolvedValue(undefined);
  mocks.store.loadFromDatabase.mockImplementation(async (id: string) => {
    mocks.store.notebookId = id;
    return true;
  });
  service = NotebookSessionService.getInstance();
  await service.connect('a');
});

describe('session storage ownership', () => {
  it('projects cached connections and initial state from the service', async () => {
    const binding = createSessionStore(service);
    expect(binding.store.getState()).toMatchObject(service.getState());
    mocks.store.notebookId = 'b';
    await binding.store.getState().connect('b');
    expect(binding.store.getState()).toMatchObject(service.getState());
    expect(binding.store.getState().currentNotebookId).toBe('b');
    expect(binding.store.getState().lastSessionTimestamp).not.toBeNull();
    binding.unsubscribe();
  });

  it('projects failed connection identity instead of inferring it from the requested ID', async () => {
    const binding = createSessionStore(service);
    mocks.store.loadFromDatabase.mockResolvedValueOnce(false);
    await expect(binding.store.getState().connect('b')).rejects.toThrow();
    expect(binding.store.getState()).toMatchObject(service.getState());
    expect(binding.store.getState().currentNotebookId).toBe('a');
    binding.unsubscribe();
  });

  it('delivers reentrant error dismissal after the failure snapshot to every observer', async () => {
    service.subscribe((event) => {
      if (event.type === 'session_error') service.clearError();
    });
    const binding = createSessionStore(service);
    const errors: Array<string | null> = [];
    const unsubscribe = binding.store.subscribe((state) => errors.push(state.error));
    mocks.autoSave.pause.mockRejectedValueOnce(new Error('quota'));
    await expect(binding.store.getState().disconnect()).rejects.toThrow('quota');
    expect(errors).toEqual(['quota', null]);
    expect(binding.store.getState()).toMatchObject(service.getState());
    expect(service.getState().error).toBeNull();
    unsubscribe();
    binding.unsubscribe();
  });

  it('clears errors in the service and stops projection when unsubscribed', async () => {
    const binding = createSessionStore(service);
    await expect(binding.store.getState().connect(' ')).rejects.toThrow('Invalid notebook ID');
    expect(binding.store.getState().error).toBe('Invalid notebook ID');
    binding.store.getState().clearError();
    expect(service.getState().error).toBeNull();
    binding.unsubscribe();
    const previous = binding.store.getState();
    await service.disconnect();
    expect(binding.store.getState()).toBe(previous);
  });

  it('publishes initialization errors and immutable event state', async () => {
    const binding = createSessionStore(service);
    const states: Readonly<ReturnType<typeof service.getState>>[] = [];
    service.subscribe((event) => states.push(event.state));
    mocks.autoSave.initialize.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(binding.store.getState().initialize()).rejects.toThrow('database unavailable');
    expect(binding.store.getState()).toMatchObject(service.getState());
    const failure = states[0];
    expect(Object.isFrozen(failure)).toBe(true);
    await binding.store.getState().initialize();
    expect(binding.store.getState().error).toBeNull();
    expect(failure.error).toBe('database unavailable');
    binding.unsubscribe();
  });

  it('returns the post-load snapshot instead of the departing notebook fields', async () => {
    mocks.store.loadFromDatabase.mockImplementationOnce(async () => {
      Object.assign(mocks.store, {
        notebookId: 'b',
        notebookTitle: 'B',
        cells: [{ id: 'b-cell', content: 'B content' }],
      });
      return true;
    });
    const result = await service.connect('b');
    expect(result).toMatchObject({
      notebookId: 'b',
      notebookTitle: 'B',
      cells: [{ id: 'b-cell', content: 'B content' }],
    });
  });

  it('rejects a false load result before publishing success and permits retry', async () => {
    mocks.store.loadFromDatabase.mockImplementationOnce(async () => {
      mocks.store.notebookId = 'b'; // A loader may fail after a partial store update.
      mocks.store.error = 'read failed';
      return false;
    });
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.connect('b')).rejects.toThrow('read failed');
    expect(events).not.toContain('session_loaded');
    expect(service.getState()).toMatchObject({
      status: SessionStatus.DISCONNECTED,
      error: 'read failed',
    });
    await service.connect('b');
    expect(service.getState()).toMatchObject({
      currentNotebookId: 'b',
      status: SessionStatus.CONNECTED,
      error: null,
    });
    expect(events.filter((type) => type === 'session_loaded')).toHaveLength(1);
    expect(mocks.store.loadFromDatabase).toHaveBeenCalledTimes(2);
  });

  it('rejects a successful load whose current snapshot belongs to another notebook', async () => {
    mocks.store.loadFromDatabase.mockResolvedValueOnce(true);
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.connect('b')).rejects.toThrow('identity');
    expect(events).not.toContain('session_loaded');
    expect(service.getCurrentNotebookId()).not.toBe('b');
  });

  it('uses the same success publication for an already loaded notebook without reloading', async () => {
    Object.assign(mocks.store, { notebookId: 'b', notebookTitle: 'Cached B' });
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.connect('b')).resolves.toMatchObject({
      notebookId: 'b',
      notebookTitle: 'Cached B',
    });
    expect(mocks.store.loadFromDatabase).not.toHaveBeenCalled();
    expect(events.filter((type) => type === 'session_loaded')).toHaveLength(1);
  });

  it('flushes only the departing notebook without waiting for unrelated saves', async () => {
    mocks.autoSave.waitForComplete.mockImplementation(() => new Promise(() => {}));
    await service.switchSession('b');
    expect(mocks.autoSave.waitForComplete).not.toHaveBeenCalled();
    expect(mocks.autoSave.flush).toHaveBeenCalledExactlyOnceWith('a');
    expect(service.getCurrentNotebookId()).toBe('b');
  });

  it('flushes accepted departing edits even if the editor already shows another notebook', async () => {
    mocks.store.notebookId = 'b';
    await service.switchSession('b');
    expect(mocks.autoSave.flush).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('does not relabel a different notebook snapshot when disconnecting', async () => {
    mocks.store.notebookId = 'b';
    mocks.store.notebookTitle = 'B';
    await service.disconnect();
    expect(mocks.autoSave.pause).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(service.getState()).toMatchObject({
      currentNotebookId: null,
      status: SessionStatus.DISCONNECTED,
    });
  });

  it('captures a matching editor snapshot before pausing', async () => {
    await service.disconnect();
    expect(mocks.autoSave.pause).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: 'a',
        notebookTitle: 'A',
        cells: mocks.store.cells,
      })
    );
  });

  it('keeps session identity after pause fails so a second disconnect really retries', async () => {
    mocks.autoSave.pause.mockRejectedValueOnce(new Error('quota'));
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.disconnect()).rejects.toThrow('quota');
    expect(service.getState()).toMatchObject({
      currentNotebookId: 'a',
      status: SessionStatus.CONNECTED,
      error: 'quota',
    });
    expect(events).toEqual(['session_error']);
    await service.disconnect();
    expect(mocks.autoSave.pause).toHaveBeenCalledTimes(2);
    expect(service.getState()).toMatchObject({
      currentNotebookId: null,
      status: SessionStatus.DISCONNECTED,
      error: null,
    });
  });

  it('restores the connected phase when departure flush fails and clears error after retry', async () => {
    mocks.autoSave.flush.mockRejectedValueOnce(new Error('quota'));
    await expect(service.switchSession('b')).rejects.toThrow('quota');
    expect(mocks.store.loadFromDatabase).not.toHaveBeenCalled();
    expect(service.getState()).toMatchObject({
      currentNotebookId: 'a',
      status: SessionStatus.CONNECTED,
      error: 'quota',
    });
    await service.switchSession('b');
    expect(service.getState()).toMatchObject({
      currentNotebookId: 'b',
      status: SessionStatus.CONNECTED,
      error: null,
    });
  });
});
