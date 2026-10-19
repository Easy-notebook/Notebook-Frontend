import React from 'react';
import { createRoot } from 'react-dom/client';
import i18n from '/src/i18n/index.ts';
import SettingsPage from '/src/components/Scenario/settingState.tsx';
import store from '/src/store/settingsStore.ts';

export async function mountSettings() {
  await store.persist.rehydrate();
  await i18n.changeLanguage('en');
  store.getState().openSettings();
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(<SettingsPage />);
}
