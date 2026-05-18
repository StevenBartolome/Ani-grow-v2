import React, { useState, useEffect } from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { queueTranslation } from '@/lib/translator';

// Recursively translate every string node; pass React elements and numbers through unchanged.
async function translateNode(node: React.ReactNode, language: string): Promise<React.ReactNode> {
  if (language === 'en') return node;

  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (!trimmed || trimmed.length < 2 || /^\d[\d\s,.:%-]*$/.test(trimmed)) return node;
    return queueTranslation(node, language);
  }

  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map((n) => translateNode(n, language)));
    return parts;
  }

  // React elements, numbers, booleans — untouched (nested <Text> handles its own translation)
  return node;
}

/**
 * Drop-in replacement for React Native's <Text>.
 * Automatically translates all string children based on the current language.
 *
 * Replace:  import { Text } from 'react-native';
 * With:     import { Text } from '@/components/Text';
 */
interface CustomTextProps extends TextProps {
  translate?: boolean;
}

export function Text({ children, translate = true, ...props }: CustomTextProps) {
  const { language } = useTheme();
  const [translatedChildren, setTranslatedChildren] = useState<React.ReactNode>(children);

  useEffect(() => {
    if (!translate) {
      setTranslatedChildren(children);
      return;
    }
    let active = true;
    translateNode(children, language).then((result) => {
      if (active) setTranslatedChildren(result);
    });
    return () => { active = false; };
  }, [children, language, translate]);

  return <RNText {...props}>{translatedChildren}</RNText>;
}
