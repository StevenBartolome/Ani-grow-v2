import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { getInsight, AIInsightContext } from '@/lib/ai';

interface AIInsightCardProps {
  context?: AIInsightContext;
  title?: string;
  staticContent?: string;
  variant?: 'green' | 'purple' | 'orange';
}

export function AIInsightCard({ 
  context, 
  title = 'AI Insight', 
  staticContent,
  variant = 'green'
}: AIInsightCardProps) {
  const { colors } = useTheme();
  const textStyles = useTextStyles();

  const [insight, setInsight]   = useState<string | null>(staticContent || null);
  const [loading, setLoading]   = useState(!staticContent && !!context);
  const [error,   setError]     = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetch = useCallback(async () => {
    if (!context || staticContent) return;
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
  }, [JSON.stringify(context), staticContent]);

  useEffect(() => { 
    if (!staticContent) {
        fetch(); 
    } else {
        setInsight(staticContent);
        setLoading(false);
    }
  }, [fetch, staticContent]);

  // Determine colors based on variant
  const gradientColors = variant === 'purple'
    ? [colors.prediction || '#8E24AA', '#BA68C8'] as [string, string]
    : variant === 'orange'
    ? [colors.warning || '#F39C12', '#F39C12'] as [string, string]
    : [colors.primary, '#43A047'] as [string, string];

  const splitInsight = (text: string) => {
    if (!text) return { headline: '', body: '' };
    
    // Check if it already has a "Headline: " format
    if (text.includes(': ')) {
        const parts = text.split(': ');
        return { headline: parts[0] + ':', body: parts.slice(1).join(': ').trim() };
    }

    // Try to split by the first sentence ending (. ! ?)
    const sentenceEndRegex = /([.!?])\s/;
    const match = text.match(sentenceEndRegex);
    
    if (match && match.index !== undefined) {
      const headline = text.substring(0, match.index + 1);
      const body = text.substring(match.index + 1).trim();
      return { headline, body };
    }
    
    // Fallback if it's just one short sentence
    if (text.length < 100) {
        return { headline: text, body: '' };
    }

    // Truncate for headline if it's too long and no sentence end
    return { headline: text.substring(0, 80) + '...', body: text.substring(80).trim() };
  };

  const { headline, body } = insight ? splitInsight(insight) : { headline: '', body: '' };
  const hasBody = !!body;

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
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: 8, borderRadius: 8 }}>
            <MaterialIcons name="auto-awesome" size={20} color="#FFF" />
          </View>
          <Text style={[textStyles.h3, { color: '#FFF', fontSize: 16 }]}>
            {title}
          </Text>
        </View>
        {!staticContent && (
            <TouchableOpacity
                onPress={fetch}
                disabled={loading}
                activeOpacity={0.7}
                style={{ padding: 4, opacity: loading ? 0.4 : 1 }}
            >
                <MaterialIcons name="refresh" size={18} color="#FFF" />
            </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color="#FFF" />
          <Text style={[textStyles.body, { color: '#FFF', opacity: 0.8, fontSize: 13 }]}>
            Analyzing farm data…
          </Text>
        </View>
      ) : error ? (
        <Text style={[textStyles.body, { color: '#FFF', fontSize: 13 }]}>
          {error}
        </Text>
      ) : (
        <View>
          <Text style={[textStyles.body, { color: '#FFF', fontFamily: 'Poppins-Bold', fontSize: 15, lineHeight: 22 }]}>
            {headline}
          </Text>
          
          {isExpanded && hasBody && (
            <Text style={[textStyles.body, { color: '#FFF', opacity: 0.9, fontSize: 14, lineHeight: 22, marginTop: 8 }]}>
              {body}
            </Text>
          )}
          
          {hasBody && (
            <TouchableOpacity 
              onPress={() => setIsExpanded(!isExpanded)}
              activeOpacity={0.7}
              style={{ 
                marginTop: 12, 
                backgroundColor: 'rgba(255, 255, 255, 0.15)', 
                alignSelf: 'flex-start',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Text style={{ color: '#FFF', fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>
                {isExpanded ? 'Show less' : 'See full details'}
              </Text>
              <MaterialIcons 
                name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                size={16} 
                color="#FFF" 
              />
            </TouchableOpacity>
          )}
        </View>
      )}
    </LinearGradient>
  );
}
