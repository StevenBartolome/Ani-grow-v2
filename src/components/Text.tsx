import React, { useState, useEffect } from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { queueTranslation } from '@/lib/translator';
import { useAuth } from '@/context/AuthContext';

function shouldSkipTranslation(text: string, profile: any): boolean {
  const trimmed = text.trim();
  const lowerText = trimmed.toLowerCase();

  // 1. Skip brand names and default device setup Wi-Fi SSIDs
  const brandKeywords = [
    'anifeed',
    'aniweigh',
    'anibot',
    'ani-grow',
    'anigrow',
    'aniweigh_setup',
    'anifeed_setup'
  ];
  if (brandKeywords.some(keyword => lowerText.includes(keyword))) {
    return true;
  }

  // 2. Skip email addresses, usernames, URLs, and phone numbers
  if (
    lowerText.includes('@') || 
    lowerText.includes('http://') ||
    lowerText.includes('https://') ||
    lowerText.includes('www.') ||
    /^\+?[0-9\s\-()]{7,}$/.test(trimmed)
  ) {
    return true;
  }

  // 3. Skip user's farm name, user proper names, or username
  if (profile) {
    const farmName = (profile.farm_name || profile.farmName || '').trim();
    const firstName = (profile.first_name || profile.firstName || '').trim();
    const lastName = (profile.last_name || profile.lastName || '').trim();
    const username = (profile.username || '').trim();

    if (farmName && (lowerText === farmName.toLowerCase() || lowerText.includes(farmName.toLowerCase()))) {
      return true;
    }
    if (firstName && lowerText === firstName.toLowerCase()) {
      return true;
    }
    if (lastName && lowerText === lastName.toLowerCase()) {
      return true;
    }
    if (username && (lowerText === username.toLowerCase() || lowerText === `@${username.toLowerCase()}`)) {
      return true;
    }
  }

  // 4. Skip IDs, custom codes, Wi-Fi keys, and hex/UUID strings
  if (
    /^agr-[a-z0-9]{6}$/i.test(trimmed) || 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) || 
    /^[a-z0-9]+_[a-z0-9]+$/i.test(trimmed) || 
    /^[A-Z0-9_]{4,20}$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function fixFilipinoText(text: string): string {
  let fixed = text.replace(/\bnamatay\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  fixed = fixed.replace(/\bmanok\b/gi, (m, offset, str) => {
    const prev = str.slice(0, offset).trim();
    if (/(\bmga|\bng|\bsa|\bang|^)$/i.test(prev)) {
      return 'Manok';
    }
    return m;
  });
  fixed = fixed.replace(/\bbaboy\b/gi, (m, offset, str) => {
    const prev = str.slice(0, offset).trim();
    if (/(\bmga|\bng|\bsa|\bang|^)$/i.test(prev)) {
      return 'Baboy';
    }
    return m;
  });

  // Preserve leading whitespace instead of stripping it when normalizing 'mga'
  const leadingMatch = fixed.match(/^(\s+)/);
  const leadingSpace = leadingMatch ? leadingMatch[1] : '';
  const coreText = fixed.slice(leadingSpace.length);

  if (!leadingSpace && /^mga\b/i.test(coreText)) {
    // Only capitalize if it's the very start of a sentence/phrase without preceding whitespace
    fixed = coreText.replace(/^mga\b/i, 'Mga');
  } else if (leadingSpace) {
    // Preserve the leading whitespace and keep 'mga' lowercase
    fixed = leadingSpace + coreText.replace(/^mga\b/i, 'mga');
  }

  // Ensure spacing between digits/slash/dash and following word/letter (e.g. "100heads" -> "100 heads", "100mga" -> "100 mga", "10/20ulo" -> "10/20 ulo")
  fixed = fixed.replace(/([\d\/\-\:\.\,]+)([a-zA-Z\u00C0-\u024F]+)/g, '$1 $2');
  fixed = fixed.replace(/([a-zA-Z\u00C0-\u024F]+)([\d\/\-\:\.\,]+)/g, '$1 $2');

  return fixed;
}

async function translateNode(node: React.ReactNode, language: string, profile: any): Promise<React.ReactNode> {
  if (language === 'en') return node;

  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (!trimmed || trimmed.length < 2 || /^\d[\d\s,.:%-]*$/.test(trimmed)) return node;
    
    if (shouldSkipTranslation(node, profile)) {
      return node;
    }

    const leadingSpace = node.match(/^(\s+)/)?.[1] || '';
    const trailingSpace = node.match(/(\s+)$/)?.[1] || '';
    
    const translated = await queueTranslation(trimmed, language);
    let result = `${leadingSpace}${translated}${trailingSpace}`;

    if (language === 'fil') {
      result = fixFilipinoText(result);
    }

    return result;
  }

  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map((n) => translateNode(n, language, profile)));
    // Ensure space between numbers/symbols and following words across adjacent array nodes
    const processedParts: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i++) {
      let current = parts[i];
      if (i > 0) {
        const prev = processedParts[i - 1];
        const isPrevNumeric = 
          typeof prev === 'number' || 
          (typeof prev === 'string' && /[\d\/\-\:\.\,]+$/.test(prev.trimEnd()));
        
        if (isPrevNumeric && typeof current === 'string' && current.length > 0 && !/^\s/.test(current)) {
          current = ' ' + current;
        }
      }
      processedParts.push(current);
    }
    return processedParts;
  }

  return node;
}

interface CustomTextProps extends TextProps {
  translate?: boolean;
}

export function Text({ children, translate = true, style, ...props }: CustomTextProps) {
  const { language } = useTheme();
  const authContext = useAuth();
  const profile = authContext?.profile;

  const [translatedChildren, setTranslatedChildren] = useState<React.ReactNode>(children);

  useEffect(() => {
    if (!translate) {
      setTranslatedChildren(children);
      return;
    }
    let active = true;
    translateNode(children, language, profile).then((result) => {
      if (active) {
        if (language === 'fil') {
          if (typeof result === 'string') {
            setTranslatedChildren(fixFilipinoText(result));
          } else if (Array.isArray(result)) {
            setTranslatedChildren(result.map(item => typeof item === 'string' ? fixFilipinoText(item) : item));
          } else {
            setTranslatedChildren(result);
          }
        } else {
          setTranslatedChildren(result);
        }
      }
    });
    return () => { active = false; };
  }, [children, language, translate, profile]);

  return <RNText style={[{ flexShrink: 1 }, style]} {...props}>{translatedChildren}</RNText>;
}
