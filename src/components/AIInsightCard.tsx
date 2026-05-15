import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { getInsight, AIInsightContext } from '@/lib/ai';

const AI_PURPLE = '#8B5CF6';

interface AIInsightCardProps {
  context: AIInsightContext;
  title?: string;
}

export function AIInsightCard({ context, title = 'AI Insight' }: AIInsightCardProps) {
  const { colors } = useTheme();
  const textStyles = useTextStyles();

  const [insight, setInsight]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getInsight(context);
      setInsight(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load AI insight.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context)]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.stroke,
        marginHorizontal: 0,
        marginBottom: 16,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      {/* Left accent strip */}
      <View style={{ width: 4, backgroundColor: AI_PURPLE }} />

      <View style={{ flex: 1, padding: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: AI_PURPLE + '18', borderRadius: 8, padding: 5 }}>
              <MaterialIcons name="auto-awesome" size={14} color={AI_PURPLE} />
            </View>
            <Text style={[textStyles.label, { color: AI_PURPLE, fontSize: 13, fontWeight: '700' }]}>
              {title}
            </Text>
          </View>
          <TouchableOpacity
            onPress={fetch}
            disabled={loading}
            activeOpacity={0.7}
            style={{ padding: 4, opacity: loading ? 0.4 : 1 }}
          >
            <MaterialIcons name="refresh" size={18} color={colors.textGrey} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <ActivityIndicator size="small" color={AI_PURPLE} />
            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
              Analyzing farm data…
            </Text>
          </View>
        ) : error ? (
          <Text style={[textStyles.body, { color: colors.error, fontSize: 13 }]}>
            {error}
          </Text>
        ) : (
          <Text style={[textStyles.body, { color: colors.text, fontSize: 13, lineHeight: 20 }]}>
            {insight}
          </Text>
        )}
      </View>
    </View>
  );
}
