/**
 * AIRecommendationBanner
 *
 * A compact, dismissible AI suggestion card that appears inline on any page.
 * For pigs it uses the local pig care guide (ZERO API cost, instant render).
 * Shows: current feed recommendation + care actions due now + upcoming + overdue.
 *
 * Usage:
 *   <AIRecommendationBanner
 *     animalType="pig"
 *     ageDays={ageDays}
 *     batchName={batch.name}
 *     liveCount={batch.current_count}
 *     housingName={housing.name}
 *   />
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TouchableOpacity, View, ViewStyle } from 'react-native';

import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { computePigCareRecommendation } from '@/constants/pigCare';
import { useTheme } from '@/context/ThemeContext';

// ─── Format helper ────────────────────────────────────────────────────────────
function renderFormattedText(text: string, isBoldByDefault: boolean = false) {
  if (!text) return null;
  const boldParts = text.split('**');
  return boldParts.flatMap((boldPart, boldIndex) => {
    const isBold = boldIndex % 2 === 1 || isBoldByDefault;
    const italicParts = boldPart.split('*');
    return italicParts.map((italicPart, italicIndex) => {
      const isItalic = italicIndex % 2 === 1;
      return (
        <Text
          key={`b-${boldIndex}-i-${italicIndex}`}
          style={[
            isBold && { fontFamily: 'Poppins-Bold' },
            isItalic && { fontStyle: 'italic' as const }
          ]}
        >
          {italicPart}
        </Text>
      );
    });
  });
}

interface AIRecommendationBannerProps {
  animalType: 'pig' | 'chicken';
  ageDays?: number;
  batchName?: string;
  liveCount?: number;
  housingName?: string;
  /** Optional pre-built message to show instead of auto-computing */
  staticMessage?: string;
  style?: ViewStyle;
  onAskAniBot?: () => void;
}

export function AIRecommendationBanner({
  animalType,
  ageDays,
  batchName,
  liveCount,
  housingName,
  staticMessage,
  style,
  onAskAniBot,
}: AIRecommendationBannerProps) {
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (dismissed) return null;

  // ── Pig care (instant, from local constants) ──────────────────────────────
  if (animalType === 'pig' && ageDays !== undefined) {
    const rec = computePigCareRecommendation(ageDays);

    const hasDueCare   = rec.dueNow.length > 0;
    const hasOverdue   = rec.recentlyOverdue.length > 0;
    const accentColor  = hasOverdue ? colors.error : hasDueCare ? colors.warning : colors.primary;
    const headerLabel  = hasOverdue ? '⚠️ Overdue' : hasDueCare ? '⚡ Action Due' : '✨ AI Care Guide';

    const bullets: { emoji: string; text: string; highlight?: boolean }[] = [];

    // Feed recommendation
    if (rec.feedProduct) {
      bullets.push({ emoji: '🌾', text: `${rec.feedProduct} — ${rec.dailyAmount}` });
    } else {
      bullets.push({ emoji: '🌾', text: rec.dailyAmount });
    }
    if (rec.feedNotes) {
      bullets.push({ emoji: '💡', text: rec.feedNotes });
    }

    // Overdue (highest urgency)
    rec.recentlyOverdue.forEach(item => {
      const detail = item.medication ? ` — ${item.medication}, ${item.dosage}` : item.tasks ? ` — ${item.tasks}` : '';
      bullets.push({ emoji: '⚠️', text: `Overdue: ${item.action}${detail}`, highlight: true });
    });

    // Due now
    rec.dueNow.forEach(item => {
      const detail = item.medication
        ? ` — ${item.medication}, ${item.dosage} (${item.route})`
        : item.tasks ? ` — ${item.tasks}` : '';
      bullets.push({ emoji: '⚡', text: `Now: ${item.action}${detail}`, highlight: true });
    });

    // Upcoming
    rec.upcoming.slice(0, 3).forEach(item => {
      const med = item.medication ? ` (${item.medication})` : '';
      bullets.push({ emoji: '📅', text: `Day ${item.day_start}: ${item.action}${med}` });
    });

    if (bullets.length === 0) return null;

    const visibleBullets = isExpanded ? bullets : bullets.slice(0, 3);

    return (
      <View
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.stroke,
            borderLeftWidth: 4,
            borderLeftColor: accentColor,
            padding: 14,
            marginBottom: 16,
          },
          style,
        ]}
      >
        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View style={{ backgroundColor: accentColor + '20', padding: 6, borderRadius: 8 }}>
              <MaterialIcons name="auto-awesome" size={15} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.h3, { color: accentColor, fontSize: 12 }]}>
                {headerLabel}
              </Text>
              <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 1 }]}>
                Day {rec.ageDays} · {rec.feedStage} stage
                {batchName ? ` · ${batchName}` : ''}
                {liveCount ? ` · ${liveCount} pigs` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{ marginLeft: 8 }}
          >
            <MaterialIcons name="close" size={17} color={colors.textGrey} />
          </TouchableOpacity>
        </View>

        {/* ── Bullets ── */}
        <View style={{ gap: 5, marginBottom: bullets.length > 3 ? 8 : 12 }}>
          {visibleBullets.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Text style={{ fontSize: 13, marginTop: 1 }}>{b.emoji}</Text>
              <Text
                style={[
                  textStyles.body,
                  {
                    flex: 1,
                    fontSize: 12.5,
                    lineHeight: 19,
                    color: b.highlight ? colors.text : colors.textGrey,
                    fontFamily: b.highlight ? 'Poppins-SemiBold' : 'Poppins-Regular',
                  },
                ]}
              >
                {renderFormattedText(b.text, !!b.highlight)}
              </Text>
            </View>
          ))}
        </View>

        {/* See more / See less toggle */}
        {bullets.length > 3 && (
          <TouchableOpacity
            onPress={() => setIsExpanded(prev => !prev)}
            activeOpacity={0.7}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: accentColor + '15',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: accentColor }}>
              {isExpanded ? 'See less' : `See more (${bullets.length - 3} more)`}
            </Text>
            <MaterialIcons
              name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={14}
              color={accentColor}
            />
          </TouchableOpacity>
        )}

        {/* ── Ask AniBot CTA ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAskAniBot ?? (() => router.push('/(ai)/AIAssistantScreen' as any))}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 10,
            backgroundColor: accentColor + '15',
          }}
        >
          <MaterialIcons name="chat-bubble-outline" size={12} color={accentColor} />
          <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: accentColor }}>
            Ask AniBot for details
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Static message fallback (e.g. chicken, or custom text) ────────────────
  if (staticMessage) {
    const accentColor = colors.primary;
    return (
      <View
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.stroke,
            borderLeftWidth: 4,
            borderLeftColor: accentColor,
            padding: 14,
            marginBottom: 16,
          },
          style,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 }}>
            <View style={{ backgroundColor: accentColor + '20', padding: 6, borderRadius: 8, marginTop: 1 }}>
              <MaterialIcons name="auto-awesome" size={15} color={accentColor} />
            </View>
            <Text style={[textStyles.body, { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 }]}>
              {renderFormattedText(staticMessage)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{ marginLeft: 8 }}
          >
            <MaterialIcons name="close" size={17} color={colors.textGrey} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAskAniBot ?? (() => router.push('/(ai)/AIAssistantScreen' as any))}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 10,
            backgroundColor: accentColor + '15',
            marginTop: 10,
          }}
        >
          <MaterialIcons name="chat-bubble-outline" size={12} color={accentColor} />
          <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 11, color: accentColor }}>
            Ask AniBot
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}
