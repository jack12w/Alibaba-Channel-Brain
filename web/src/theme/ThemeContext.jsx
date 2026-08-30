import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

/**
 * 主题模式管理：light / dark / system（跟随系统）
 * - system 模式通过 matchMedia('(prefers-color-scheme: dark)') 实时监听系统切换
 * - 解析后的实际主题写入 <html data-theme>，供 CSS 变量与自定义类使用
 * - 选择持久化到 localStorage（键：cb-theme-mode）
 */

const ThemeContext = createContext(null);
const STORAGE_KEY = 'cb-theme-mode';

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readSavedMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch (e) {
    /* localStorage 不可用时静默降级为 system */
  }
  return 'system';
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readSavedMode);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = mode === 'system' ? systemTheme : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const setMode = useCallback((next) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* 忽略持久化失败 */
    }
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, resolvedTheme, isDark: resolvedTheme === 'dark' }),
    [mode, setMode, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode 必须在 <ThemeProvider> 内使用');
  return ctx;
}
