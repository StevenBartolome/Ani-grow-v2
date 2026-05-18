import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ColorsType } from '@/constants/colors';

type ThemeContextType = {
  isDark: boolean;
  colors: ColorsType;
  toggleTheme: () => void;
  language: string;
  setLanguage: (lang: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  const [language, setLanguageState] = useState('en');

  // Load saved language on mount
  useEffect(() => {
    AsyncStorage.getItem('app_language').then((saved) => {
      if (saved) setLanguageState(saved);
    });
  }, []);

  const toggleTheme = () => setIsDark(prev => !prev);

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    AsyncStorage.setItem('app_language', lang);
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme, language, setLanguage }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
