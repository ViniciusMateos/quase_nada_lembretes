import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const themeStorage = new MMKV();

export const DARK_THEME = {
  isDark: true,
  background: '#0B0B0D',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  primary: '#0A84FF',
  primaryLight: '#5EB0FF',
  textPrimary: '#F1F5F9',
  textSecondary: '#98989F',
  textPlaceholder: '#5A5A60',
  border: '#3A3A3C',
  error: '#EF4444',
  tabBar: '#1A1A1F',
  tabBarBorder: '#2A2A2F',
};

export const LIGHT_THEME = {
  isDark: false,
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  primary: '#0A84FF',
  primaryLight: '#4DA3FF',
  textPrimary: '#1A1A2E',
  textSecondary: '#475569',
  textPlaceholder: '#94A3B8',
  border: '#E2E8F0',
  error: '#EF4444',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isDark, setIsDark] = useState(() => {
    const saved = themeStorage.getString('theme');
    return saved !== 'light';
  });

  const toggleTheme = () => {
    Animated.timing(fadeAnim, {
      toValue: 0.25,
      duration: 110,
      useNativeDriver: true,
    }).start();
    setTimeout(() => {
      setIsDark(prev => {
        const next = !prev;
        themeStorage.set('theme', next ? 'dark' : 'light');
        return next;
      });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }, 120);
  };

  const theme = useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, fadeAnim }}>
      <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
        {children}
      </Animated.View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return context;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
