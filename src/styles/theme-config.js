/**
 * ============================================================================
 * THEME CONFIGURATION MANAGER
 * Project: Psychology Portfolio - Verdant Mind
 * 
 * Centralized Theme Governance
 * - Supported Themes:
 *     - 'classic'   : Original Deep Teal & Terracotta theme (Preserved Backup)
 *     - 'botanical' : New Botanical Wellness theme (Lavender Purple, Botanical Green, Warm Ivory)
 * ============================================================================
 */

export const THEMES = {
  CLASSIC: 'classic',
  BOTANICAL: 'botanical'
};

/**
 * DEFAULT ACTIVE THEME
 * Change this value to THEMES.CLASSIC to instantly roll back to the original theme.
 */
export const ACTIVE_THEME = THEMES.BOTANICAL;

const STORAGE_KEY = 'verdant_brand_theme';

/**
 * Returns the currently active theme name.
 */
export function getActiveTheme() {
  if (typeof window === 'undefined') return ACTIVE_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && Object.values(THEMES).includes(stored)) {
    return stored;
  }
  return ACTIVE_THEME;
}

/**
 * Applies the given theme to the document root element.
 * @param {string} themeName - 'classic' | 'botanical'
 */
export function applyTheme(themeName) {
  if (typeof document === 'undefined') return;
  
  const targetTheme = Object.values(THEMES).includes(themeName) ? themeName : ACTIVE_THEME;
  
  document.documentElement.setAttribute('data-theme', targetTheme);
  
  // Update browser theme-color meta tag
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    if (targetTheme === THEMES.BOTANICAL) {
      metaThemeColor.setAttribute('content', '#8050E8'); // Lavender Purple
    } else {
      metaThemeColor.setAttribute('content', '#0F383D'); // Deep Oceanic Teal
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, targetTheme);
  } catch (e) {
    // LocalStorage might fail in private/incognito mode
  }

  // Dispatch custom event for reactive UI components
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: targetTheme } }));
  return targetTheme;
}

/**
 * Initializes the theme on application bootstrap.
 */
export function initTheme() {
  const current = getActiveTheme();
  applyTheme(current);
  return current;
}

/**
 * Toggles between classic and botanical themes.
 */
export function toggleTheme() {
  const current = getActiveTheme();
  const next = current === THEMES.BOTANICAL ? THEMES.CLASSIC : THEMES.BOTANICAL;
  return applyTheme(next);
}
