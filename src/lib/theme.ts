const STORAGE_KEY = "bookprint-theme";

export type Theme = "light" | "dark";

/**
 * The stylesheet switches on a `.dark` class (`@custom-variant dark` in
 * index.css), but nothing ever applied it — 150 `dark:` utilities were dead.
 * This is the missing half: read the preference, apply the class, persist it.
 */
function read(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage blocked (private mode) — fall through to the system preference */
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function currentTheme(): Theme {
  return read();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function initTheme(): Theme {
  const theme = read();
  applyTheme(theme);
  return theme;
}

export function toggleTheme(): Theme {
  const next: Theme = read() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* not fatal: the theme just will not survive a reload */
  }
  applyTheme(next);
  return next;
}
