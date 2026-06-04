import { useCallback, useEffect, useState } from 'react';

export const ACCENT_COLORS = {
  blue: { name: 'Blue', light: '#2563eb', dark: '#60a5fa' },
  green: { name: 'Green', light: '#16a34a', dark: '#4ade80' },
  purple: { name: 'Purple', light: '#9333ea', dark: '#c084fc' },
  rose: { name: 'Rose', light: '#e11d48', dark: '#fb7185' },
  orange: { name: 'Orange', light: '#ea580c', dark: '#fb923c' },
  teal: { name: 'Teal', light: '#0d9488', dark: '#2dd4bf' },
  slate: { name: 'Slate', light: '#475569', dark: '#94a3b8' },
} as const;

export type AccentColorKey = keyof typeof ACCENT_COLORS;

const STORAGE_KEY = 'notebook:accent-color';
const DEFAULT_ACCENT_COLOR: AccentColorKey = 'blue';

const isAccentColorKey = (value: string | null): value is AccentColorKey =>
  !!value && value in ACCENT_COLORS;

const readAccentColor = (): AccentColorKey => {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_COLOR;
  const storedColor = window.localStorage.getItem(STORAGE_KEY);
  return isAccentColorKey(storedColor) ? storedColor : DEFAULT_ACCENT_COLOR;
};

const applyAccentColor = (accentColor: AccentColorKey) => {
  if (typeof document === 'undefined') return;
  const color = ACCENT_COLORS[accentColor];
  document.documentElement.style.setProperty('--accent-color', color.light);
  document.documentElement.style.setProperty('--accent-color-dark', color.dark);
};

export const useAccentColor = () => {
  const [accentColor, setAccentColorState] = useState<AccentColorKey>(readAccentColor);

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const setAccentColor = useCallback((nextAccentColor: AccentColorKey) => {
    setAccentColorState(nextAccentColor);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextAccentColor);
    }
  }, []);

  return { accentColor, setAccentColor };
};
