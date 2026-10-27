import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initialSettings } from '@Services/settings/SettingsDefaults';
import type { SettingsStore } from '@Store/settingsStore';
import SettingsPage from './settingState';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  rehydrate: vi.fn(),
  hasHydrated: vi.fn(),
}));
vi.mock('@Store/settingsStore', () => ({
  default: Object.assign(mocks.read, {
    persist: { rehydrate: mocks.rehydrate, hasHydrated: mocks.hasHydrated },
  }),
  useSettings: () => mocks.read().settings,
  useSettingsOpen: () => mocks.read().settingsOpen,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));
let state: SettingsStore;
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    settings: structuredClone(initialSettings),
    settingsOpen: true,
    error: null,
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn(),
    updateApiSettings: vi.fn().mockResolvedValue(undefined),
    updateMarkdownPreferences: vi.fn(),
    updateEditorSettings: vi.fn(),
    updateShortcut: vi.fn(),
    updateLanguage: vi.fn(),
    resetSetting: vi.fn(),
    batchUpdateSettings: vi.fn(),
    getPlatformShortcut: vi.fn(),
  };
  mocks.read.mockImplementation(() => state);
  mocks.rehydrate.mockResolvedValue(undefined);
  mocks.hasHydrated.mockReturnValue(true);
});

it('submits numeric API timeouts and string API credentials through their declared types', async () => {
  render(<SettingsPage />);
  fireEvent.change(screen.getByLabelText('settings.api.apiTimeout'), {
    target: { value: '45000' },
  });
  fireEvent.change(screen.getByLabelText('settings.api.apiKey'), { target: { value: 'test-key' } });
  await waitFor(() => expect(state.updateApiSettings).toHaveBeenCalledWith({ apiTimeout: 45000 }));
  expect(state.updateApiSettings).toHaveBeenCalledWith({ apiKey: 'test-key' });
});

it('shows persistence errors and only clears them after successful explicit reload', async () => {
  state.error = 'Settings changed in another context';
  render(<SettingsPage />);
  expect(screen.getByRole('alert')).toHaveTextContent(state.error);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved settings (replace current changes)' })
  );
  await waitFor(() => expect(state.clearError).toHaveBeenCalledTimes(1));
  mocks.hasHydrated.mockReturnValue(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved settings (replace current changes)' })
  );
  await waitFor(() =>
    expect(state.setError).toHaveBeenCalledWith('Could not read saved settings.')
  );
  expect(state.clearError).toHaveBeenCalledTimes(1);
});

it('retains a recorded shortcut through parent rerenders and commits it when modifiers are released', () => {
  const view = render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'settings.tabs.shortcuts' }));
  const input = screen.getByDisplayValue('Ctrl+Enter');
  fireEvent.click(input);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(screen.getByDisplayValue('Ctrl + K')).toBeInTheDocument();
  view.rerender(<SettingsPage />);
  expect(screen.getByDisplayValue('Ctrl + K')).toBeInTheDocument();
  fireEvent.keyUp(window, { key: 'Control', ctrlKey: false });
  expect(state.updateShortcut).toHaveBeenCalledWith('newCell', 'Ctrl + K');
});
