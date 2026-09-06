// Tiny, always-mounted banner (see app/_layout.tsx, next to <AniBotFAB />)
// showing whenever offlineQueue.ts has pending items — so a queued Add
// Housing (etc.) never just silently vanishes from the user's awareness.
// Also runs the periodic retry loop itself, app-wide, regardless of which
// screen originally queued something.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { flushQueue, getQueuedActions } from '@/lib/offlineQueue';

const FLUSH_INTERVAL_MS = 20000;

export function OfflineSyncBanner() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const [pendingCount, setPendingCount] = useState(0);
    const [isFlushing, setIsFlushing] = useState(false);
    const mountedRef = useRef(true);

    const refreshCount = async () => {
        const queue = await getQueuedActions();
        if (mountedRef.current) setPendingCount(queue.length);
    };

    const attemptFlush = async () => {
        setIsFlushing(true);
        try {
            await flushQueue(supabase);
        } finally {
            if (mountedRef.current) setIsFlushing(false);
            await refreshCount();
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        refreshCount();
        attemptFlush();

        const interval = setInterval(attemptFlush, FLUSH_INTERVAL_MS);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') attemptFlush();
        });

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
            sub.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (pendingCount === 0) return null;

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
                paddingTop: 48, paddingBottom: 10, paddingHorizontal: 16,
                backgroundColor: colors.warning + 'E6',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
        >
            {isFlushing && <ActivityIndicator size="small" color="#fff" />}
            <Text style={[textStyles.body, { color: '#fff', fontSize: 12, fontWeight: '700' }]}>
                {pendingCount} item{pendingCount === 1 ? '' : 's'} waiting to sync...
            </Text>
        </View>
    );
}
