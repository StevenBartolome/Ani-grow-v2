import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, ColorsType } from '@/constants/colors';

export type ThemeMode = 'device' | 'light' | 'dark';

type ThemeContextType = {
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  colors: ColorsType;
  language: string;
  setLanguage: (lang: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('device');
  const [language, setLanguageState] = useState('en');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('app_theme_mode'),
      AsyncStorage.getItem('app_language'),
    ]).then(([savedTheme, savedLang]) => {
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'device') {
        setThemeModeState(savedTheme);
      }
      if (savedLang) setLanguageState(savedLang);
    });
  }, []);

  const isDark = themeMode === 'device' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem('app_theme_mode', mode);
  };

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    AsyncStorage.setItem('app_language', lang);
  };

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, setThemeMode, colors, language, setLanguage }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
