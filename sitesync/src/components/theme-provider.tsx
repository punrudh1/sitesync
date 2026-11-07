'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentMode = 'orange' | 'blue' | 'green' | 'purple' | 'pink';
type Appearance = { theme: ThemeMode; accent: AccentMode; setTheme: (v: ThemeMode) => void; setAccent: (v: AccentMode) => void };
const Context = createContext<Appearance | null>(null);

export function ThemeProvider({ children, initialTheme = 'dark', initialAccent = 'orange' }: {
  children: ReactNode; initialTheme?: ThemeMode; initialAccent?: AccentMode;
}) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [accent, setAccent] = useState<AccentMode>(initialAccent);
  useEffect(() => {
    const root = document.documentElement;
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.dataset.theme = resolved;
    root.dataset.accent = accent;
    root.style.colorScheme = resolved;
  }, [theme, accent]);
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'; };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  const value = useMemo(() => ({ theme, accent, setTheme, setAccent }), [theme, accent]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppearance must be used inside ThemeProvider');
  return value;
}
