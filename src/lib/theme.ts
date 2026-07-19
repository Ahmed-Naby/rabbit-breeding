export type Theme = "light" | "dark" | "system";

const THEME_KEY = "rabbittrack-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) || "system";
  } catch {
    return "system";
  }
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
    window.dispatchEvent(new CustomEvent("theme-changed", { detail: theme }));
  } catch (err) {
    console.error("Failed to save theme:", err);
  }
}

export function applyTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const theme = getTheme();
    let isDark = false;

    if (theme === "dark") {
      isDark = true;
    } else if (theme === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  } catch (err) {
    console.error("Failed to apply theme:", err);
  }
}

export function listenToSystemThemeChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  
  const listener = () => {
    if (getTheme() === "system") {
      applyTheme();
      callback();
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  } else {
    // Legacy support
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }
}
