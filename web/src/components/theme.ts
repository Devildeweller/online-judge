import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('oj:theme', theme);
  } catch {
    // Private mode: the choice simply lasts for this page view.
  }
  for (const listener of listeners) listener();
}

/** The initial theme is set by an inline script in index.html before React loads. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current);
  const toggle = useCallback(() => apply(current() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
