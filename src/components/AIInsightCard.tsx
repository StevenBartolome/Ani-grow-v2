import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { getInsight, AIInsightContext } from '@/lib/ai';
import { getSavedFarmInsight, saveFarmInsight } from '@/lib/farmAiInsightService';

interface AIInsightCardProps {
  context?: AIInsightContext;
  title?: string;
  staticContent?: string;
  variant?: 'green' | 'purple' | 'orange' | 'blue';
  forceFresh?: boolean;
  category?: 'health_report' | 'growth_report' | 'feed_report' | 'prediction_report' | 'weigh_device' | 'feed_device' | 'health_records' | 'session_report' | string;
  farmId?: string;
  subKey?: string;
  onRefresh?: () => void;
}

function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const sentences: string[] = [];
  let currentSentence = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentSentence += char;

    if (char === '.' || char === '!' || char === '?') {
      // Check if it's a decimal point (digit before and digit after)
      const isPrevDigit = i > 0 && /\d/.test(text[i - 1]);
      const isNextDigit = i < text.length - 1 && /\d/.test(text[i + 1]);

      if (isPrevDigit && isNextDigit) {
        // It's a decimal point, do not split
        continue;
      }

      // Check if it's followed by a space or end of string
      const isNextWhitespace = i === text.length - 1 || /\s/.test(text[i + 1]);
      if (isNextWhitespace) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }
  }

  if (currentSentence.trim()) {
    sentences.push(currentSentence.trim());
  }

  return sentences.filter(Boolean);
}

// ─── Parser ───────────────────────────────────────────────────────────────────
/**
 * Parses the structured AI response:
 *   HEADLINE: [text]
 *   1. [item]
 *   2. [item]
 *   3. [item]
 *
 * Falls back gracefully for plain-text responses.
 */
function parseInsight(text: string): { headline: string; items: string[] } {
  if (!text) return { headline: '', items: [] };

  // Normalize common markdown artifacts around the HEADLINE prefix
  let cleanedText = text.replace(/^\s*\*\*HEADLINE:\*\*\s*/i, 'HEADLINE: ');
  cleanedText = cleanedText.replace(/^\s*\*HEADLINE:\*\s*/i, 'HEADLINE: ');
  cleanedText = cleanedText.replace(/^\s*HEADLINE:\s*/i, 'HEADLINE: ');

  const lines = cleanedText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let headline = '';
  const items: string[] = [];

  for (const line of lines) {
    // Check for HEADLINE prefix
    if (/^HEADLINE:\s*/i.test(line)) {
      headline = line.replace(/^HEADLINE:\s*/i, '').trim();
      continue;
    }

    // Numbered items: e.g. "1. text" or "1) text" or "**1.** text"
    // Normalize potential bolding from indices: "**1.**" or "**1**." -> "1."
    const cleanLine = line.replace(/^\s*\*\*(\d+)\.\*\*\s*/, '$1. ')
                          .replace(/^\s*\*\*(\d+)\*\*\.\s*/, '$1. ')
                          .replace(/^\s*(\d+)\.\s*/, '$1. ');
                          
    const numMatch = cleanLine.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      items.push(numMatch[1].trim());
      continue;
    }

    // Bullet items: "• text" or "- text" or "* text" or "**•** text"
    const bulletMatch = line.replace(/^\s*\*\*[•\-\*]\*\*\s*/, '• ')
                            .match(/^[•\-\*]\s+(.+)/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }

    // First unstructured line becomes the headline if we don't have one yet
    if (!headline && items.length === 0) {
      headline = line;
      continue;
    }

    // Any other unstructured lines are added as separate items
    items.push(line);
  }

  // If we only have a headline and no items, split the headline by sentences to form items
  if (items.length === 0 && headline) {
    const sentences = splitIntoSentences(headline);
    if (sentences.length > 1) {
      headline = (sentences[0] ?? '').trim();
      sentences.slice(1).forEach(s => {
        const t = (s ?? '').trim();
        if (t) items.push(t);
      });
    } else {
      // Guarantee at least one item so the bubble design applies
      items.push(headline);
    }
  }

  // Clean and filter empty values
  const uniqueItems = items.map(i => i.trim()).filter(Boolean);

  // If headline is still empty but we have items, use the first item as headline
  if (!headline && uniqueItems.length > 0) {
    headline = uniqueItems[0];
    uniqueItems.shift();
  }

  // Ensure there is always at least one item
  if (uniqueItems.length === 0 && headline) {
    uniqueItems.push(headline);
  }

  return { headline: headline.trim(), items: uniqueItems };
}

// ─── Format helper ────────────────────────────────────────────────────────────
function renderFormattedText(text: string) {
  if (!text) return null;
  const boldParts = text.split('**');
  return boldParts.flatMap((boldPart, boldIndex) => {
    const isBold = boldIndex % 2 === 1;
    const italicParts = boldPart.split('*');
    return italicParts.map((italicPart, italicIndex) => {
      const isItalic = italicIndex % 2 === 1;
      return (
        <Text
          key={`b-${boldIndex}-i-${italicIndex}`}
          style={[
            isBold && { fontFamily: 'Poppins-Bold' },
            isItalic && { fontStyle: 'italic' }
          ]}
        >
          {italicPart}
        </Text>
      );
    });
  });
}

// ─── Numbered item bubble ─────────────────────────────────────────────────────
function NumberBubble({ n }: { n: number }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      <Text style={{ color: '#FFF', fontFamily: 'Poppins-Bold', fontSize: 11, lineHeight: 14 }}>
        {n}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AIInsightCard({
  context,
  title = 'AI Insight',
  staticContent,
  variant = 'green',
  forceFresh = false,
  category,
  farmId,
  subKey,
  onRefresh,
}: AIInsightCardProps) {
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const { activeFarmIds } = useFarmFilter();
  const { profile } = useAuth();

  const effectiveFarmId = farmId || (activeFarmIds && activeFarmIds.length > 0 ? activeFarmIds[0] : ((profile as any)?.farm_id ?? ''));
  const effectiveCategory = category || (context?.type ? `${context.type}_insight` : 'general');
  const effectiveSubKey = subKey || '';

  const [insight, setInsight]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Incremented on every new fetch so stale in-flight responses are ignored.
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(async (bypassCache: boolean) => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      // 1. If not bypassing cache, check if today's insight is already saved in Supabase
      if (!bypassCache && effectiveFarmId && effectiveCategory) {
        const saved = await getSavedFarmInsight(effectiveFarmId, effectiveCategory, effectiveSubKey);
        if (saved && saved.content) {
          if (fetchIdRef.current === fetchId) {
            setInsight(saved.content);
            setLoading(false);
          }
          return;
        }
      }

      // 2. Generate / retrieve fresh insight
      let result = '';
      if (staticContent) {
        result = staticContent;
      } else if (context) {
        result = await getInsight(context, bypassCache);
      }

      if (fetchIdRef.current === fetchId) {
        setInsight(result);
      }

      // 3. Save / Upsert to Supabase for today's date
      if (result && effectiveFarmId && effectiveCategory) {
        const parsed = parseInsight(result);
        await saveFarmInsight(effectiveFarmId, effectiveCategory, result, {
          subKey: effectiveSubKey,
          title,
          headline: parsed.headline,
          items: parsed.items,
          contextData: context?.data,
        });
      }
    } catch (e: any) {
      if (fetchIdRef.current === fetchId) {
        setError(e?.message ?? 'Failed to load AI insight.');
      }
    } finally {
      if (fetchIdRef.current === fetchId) {
        setLoading(false);
      }
    }
  }, [effectiveFarmId, effectiveCategory, effectiveSubKey, staticContent, JSON.stringify(context), title]);

  // Auto-fetch whenever context, staticContent, or farmId changes
  useEffect(() => {
    setInsight(null);
    setLoading(true);
    setIsExpanded(false);

    doFetch(forceFresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFarmId, effectiveCategory, effectiveSubKey, staticContent, JSON.stringify(context), forceFresh]);

  // Gradient by variant
  const gradientColors =
    variant === 'blue'
      ? (['#1D4ED8', '#3B82F6'] as [string, string])
      : variant === 'purple'
      ? ([colors.prediction || '#8E24AA', '#BA68C8'] as [string, string])
      : variant === 'orange'
      ? (['#D97706', '#F59E0B'] as [string, string])
      : ([colors.primary, '#43A047'] as [string, string]);

  const { headline, items } = insight ? parseInsight(insight) : { headline: '', items: [] };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        shadowColor: gradientColors[0],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        {/* Left: icon + title */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.22)',
              padding: 7,
              borderRadius: 9,
              marginTop: 1,
            }}
          >
            <MaterialIcons name="auto-awesome" size={18} color="#FFF" />
          </View>
          
          {/* Title & Badge Container */}
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Text style={[textStyles.h3, { color: '#FFF', fontSize: 15 }]}>{title}</Text>

            {/* Recommendation pill */}
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <MaterialIcons name="lightbulb-outline" size={11} color="rgba(255,255,255,0.9)" />
              <Text
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Poppins-Medium',
                  fontSize: 10,
                }}
              >
                Recommendation
              </Text>
            </View>
          </View>
        </View>

        {/* Refresh button */}
        <TouchableOpacity
          onPress={() => {
            if (onRefresh) onRefresh();
            doFetch(true);
          }}
          disabled={loading}
          activeOpacity={0.7}
          style={{ padding: 4, opacity: loading ? 0.4 : 1, marginLeft: 8 }}
        >
          <MaterialIcons name="refresh" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color="#FFF" />
          <Text style={[textStyles.body, { color: '#FFF', opacity: 0.8, fontSize: 13, flexShrink: 1 }]}>
            Analyzing farm data…
          </Text>
        </View>
      ) : error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="error-outline" size={16} color="rgba(255,255,255,0.8)" />
          <Text style={[textStyles.body, { color: '#FFF', opacity: 0.85, fontSize: 13, flex: 1, flexShrink: 1 }]}>
            {error}
          </Text>
        </View>
      ) : (
        <View style={{ width: '100%' }}>
          {/* Headline */}
          {!!headline && (
            <Text
              style={[
                textStyles.body,
                {
                  color: '#FFF',
                  fontFamily: 'Poppins-Bold',
                  fontSize: 14,
                  lineHeight: 21,
                  marginBottom: items.length > 0 ? 12 : 0,
                  flexShrink: 1,
                },
              ]}
            >
              {renderFormattedText(headline)}
            </Text>
          )}

          {/* Numbered recommendations */}
          {items.length > 0 && (
            <View style={{ gap: 10, width: '100%' }}>
              {/* Always show first item */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  width: '100%',
                }}
              >
                {items.length > 1 && <NumberBubble n={1} />}
                <Text
                  style={[
                    textStyles.body,
                    { color: '#FFF', fontSize: 13, lineHeight: 20, flex: 1, opacity: 0.95, flexShrink: 1 },
                  ]}
                >
                  {renderFormattedText(items[0])}
                </Text>
              </View>

              {/* Remaining items — visible only when expanded */}
              {isExpanded &&
                items.slice(1).map((item, i) => (
                  <View
                    key={i + 1}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: 10,
                      width: '100%',
                    }}
                  >
                    <NumberBubble n={i + 2} />
                    <Text
                      style={[
                        textStyles.body,
                        { color: '#FFF', fontSize: 13, lineHeight: 20, flex: 1, opacity: 0.95, flexShrink: 1 },
                      ]}
                    >
                      {renderFormattedText(item)}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* ── Disclaimer + toggle ────────────────────────────────────────── */}
          <View
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255, 255, 255, 0.2)',
              gap: 10,
            }}
          >
            {/* See more / See less — only when there are extra items */}
            {items.length > 1 && (
              <TouchableOpacity
                onPress={() => setIsExpanded(prev => !prev)}
                activeOpacity={0.7}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#FFF', fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>
                  {isExpanded ? 'See less' : `See more (${items.length - 1} more)`}
                </Text>
                <MaterialIcons
                  name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={16}
                  color="#FFF"
                />
              </TouchableOpacity>
            )}

            {/* Disclaimer */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <MaterialIcons name="info-outline" size={12} color="rgba(255,255,255,0.65)" style={{ marginTop: 2 }} />
              <Text
                style={{
                  color: 'rgba(255,255,255,0.65)',
                  fontFamily: 'Poppins-Regular',
                  fontSize: 11,
                  flex: 1,
                  lineHeight: 16,
                }}
              >
                AI-generated recommendation · Always verify with a licensed veterinarian before acting
              </Text>
            </View>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}
