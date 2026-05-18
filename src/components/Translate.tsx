import React, { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { queueTranslation } from '@/lib/translator';

interface TranslateProps {
  children: string;
}

/**
 * Wraps a string child and auto-translates it based on the current language.
 *
 * Usage (always inside a <Text> element):
 *   <Text style={styles.title}><Translate>Farm Dashboard</Translate></Text>
 */
export default function Translate({ children }: TranslateProps) {
  const { language } = useTheme();
  const [translated, setTranslated] = useState(children);

  useEffect(() => {
    let active = true;

    if (language === 'en') {
      setTranslated(children);
      return;
    }

    queueTranslation(children, language).then((result) => {
      if (active) setTranslated(result);
    });

    return () => { active = false; };
  }, [children, language]);

  return <>{translated}</>;
}
