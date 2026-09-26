"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "theme";
/** Same-tab theme changes need a custom event: `storage` only fires in other tabs. */
const THEME_CHANGE_EVENT = "repo-health:theme-change";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

type Theme = "dark" | "light";

function getThemeSnapshot(): Theme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

/**
 * Theme state backed by localStorage (with the OS color-scheme as fallback).
 *
 * The stored preference is only written on explicit user toggles — never on
 * mount — so a saved theme can no longer be clobbered by initial rendering.
 * React hydrates with the server snapshot ("light") and upgrades to the stored
 * value after hydration, avoiding hydration mismatches.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const darkMode = theme === "dark";

  // Keep the document in sync with React state (external system update).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleTheme = useCallback(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? "light" : "dark");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, [darkMode]);

  return { darkMode, toggleTheme };
}
