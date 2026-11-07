/**
 * ============================================================================
 * THEME CONFIGURATION MANAGER
 * Project: Verdant Mind Mental Health Portal
 * 
 * Centralized Theme Governance
 * - Supported Themes:
 *     - 'classic'       : Original Deep Oceanic Teal & Terracotta (Preserved Permanent Backup)
 *     - 'lavender-rose' : Official Purple-Based Visual Identity (Lavender Purple + Dusty Rose)
 * ============================================================================
 */

export const THEMES = {
  CLASSIC: 'classic',
  LAVENDER_ROSE: 'lavender-rose'
};

export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark'
};

/**
 * DEFAULT ACTIVE THEME
 * Set to 'lavender-rose' as the authoritative application theme.
 */
export const ACTIVE_THEME = THEMES.LAVENDER_ROSE;

const STORAGE_THEME_KEY = 'verdant_brand_theme';
const STORAGE_MODE_KEY = 'verdant_theme_mode';

/**
 * Returns the currently active theme name.
 */
export function getActiveTheme() {
  if (typeof window === 'undefined') return ACTIVE_THEME;
  const stored = localStorage.getItem(STORAGE_THEME_KEY);
  if (stored && Object.values(THEMES).includes(stored)) {
    return stored;
  }
  return ACTIVE_THEME;
}

/**
 * Returns the currently active mode ('light' | 'dark').
 */
export function getActiveMode() {
  if (typeof window === 'undefined') return THEME_MODES.LIGHT;
  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  if (stored && Object.values(THEME_MODES).includes(stored)) {
    return stored;
  }
  return THEME_MODES.LIGHT;
}

/**
 * Applies the given theme and mode to document root.
 * @param {string} themeName - 'classic' | 'lavender-rose'
 * @param {string} mode - 'light' | 'dark'
 */
export function applyTheme(themeName, mode = null) {
  if (typeof document === 'undefined') return;

  const targetTheme = Object.values(THEMES).includes(themeName) ? themeName : ACTIVE_THEME;
  const targetMode = mode && Object.values(THEME_MODES).includes(mode) ? mode : getActiveMode();

  document.documentElement.setAttribute('data-theme', targetTheme);
  document.documentElement.setAttribute('data-mode', targetMode);

  // Update browser theme-color meta tag
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    if (targetTheme === THEMES.LAVENDER_ROSE) {
      metaThemeColor.setAttribute('content', targetMode === 'dark' ? '#1E162A' : '#8050E8');
    } else {
      metaThemeColor.setAttribute('content', '#0F383D');
    }
  }

  try {
    localStorage.setItem(STORAGE_THEME_KEY, targetTheme);
    localStorage.setItem(STORAGE_MODE_KEY, targetMode);
  } catch (e) {
    // LocalStorage fallback for restricted sandboxes
  }

  window.dispatchEvent(new CustomEvent('themeChanged', { 
    detail: { theme: targetTheme, mode: targetMode } 
  }));

  return { theme: targetTheme, mode: targetMode };
}

/**
 * Initializes the theme on application bootstrap.
 * Checks localStorage first for zero-flicker render, then syncs with backend /api/theme.
 */
export function initTheme() {
  const currentTheme = getActiveTheme();
  const currentMode = getActiveMode();
  applyTheme(currentTheme, currentMode);

  // Asynchronously synchronize with global authoritative backend setting
  if (typeof window !== 'undefined') {
    fetchGlobalTheme().catch(() => {});
  }

  return { theme: currentTheme, mode: currentMode };
}

/**
 * Fetches the global practice theme configuration from the backend.
 */
export async function fetchGlobalTheme() {
  try {
    const res = await fetch('/api/theme');
    if (res.ok) {
      const data = await res.json();
      if (data && data.activeTheme) {
        applyTheme(data.activeTheme, data.themeMode || 'light');
        return data;
      }
    }
  } catch (err) {
    // Network fallback: retain local/default theme
  }
  return null;
}
