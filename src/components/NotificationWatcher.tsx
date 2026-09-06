// Always-mounted, screen-independent watcher that turns real farm events
// into rows in the `notifications` table (+ a local device notification) —
// see app/_layout.tsx, next to <OfflineSyncBanner />. Centralizing this here
// (instead of scattering creation calls across AniWeighScreen, AniFeedScreen,
// MortalityRecordsScreen, AnimalDetails) means every one of those screens
// stays completely untouched, and notifications fire farm-wide regardless of
// which screen — if any — is currently open.
//
// Renders nothing. Scope is deliberately client-side-only: this only runs
// while the app is open (foreground or backgrounded, JS still alive) — true
// background/killed-app monitoring would need expo-task-manager, out of
// scope for staying Expo-Go compatible (see notify.ts).
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notify';
import { getDeviceDisplayStatus, DeviceDisplayStatus } from '@/lib/deviceStatus';

const DEVICE_POLL_INTERVAL_MS = 30_000;
const LOW_STOCK_THRESHOLD_KG = 5;

function todayDateString(): string {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function daysUntil(dateStr: string): number {
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date(todayDateString() + 'T00:00:00');
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function alreadyAlerted(key: string): Promise<boolean> {
    try { return (await AsyncStorage.getItem(key)) !== null; } catch { return false; }
}
async function markAlerted(key: string): Promise<void> {
    try { await AsyncStorage.setItem(key, '1'); } catch { /* best-effort */ }
}
async function clearAlerted(key: string): Promise<void> {
    try { await AsyncStorage.removeItem(key); } catch { /* best-effort */ }
}

export function NotificationWatcher() {
    const { activeFarmIds } = useFarmFilter();
    const farmIdsRef = useRef<string[]>([]);
    farmIdsRef.current = activeFarmIds;

    // ── Device online/offline transitions ──────────────────────────────
    useEffect(() => {
        if (activeFarmIds.length === 0) return;

        // Last-known display status per device — first tick after mount only
        // seeds this map (never notifies), so app launch never floods
        // notifications for devices that were already offline.
        const lastKnown = new Map<string, DeviceDisplayStatus>();
        let seeded = false;

        const tick = async () => {
            const { data, error } = await supabase
                .from('devices')
                .select('id, name, status, last_seen, farm_id')
                .in('farm_id', farmIdsRef.current);
            if (error || !data) return;

            for (const d of data as any[]) {
                const display = getDeviceDisplayStatus(d.status, d.last_seen);
                const prev = lastKnown.get(d.id);
                lastKnown.set(d.id, display);

                if (!seeded) continue; // baseline pass — record, don't alert
                if (prev === undefined || prev === display) continue;
                // Only alert on genuine online<->offline flips — a
                // transition into/out of 'maintenance' is an intentional
                // human action, not something to alarm about.
                if (prev === 'maintenance' || display === 'maintenance') continue;

                const nowOnline = display === 'online';
                await createNotification({
                    farmId: d.farm_id,
                    category: 'device_alert',
                    type: nowOnline ? 'success' : 'error',
                    title: d.name,
                    message: nowOnline ? 'is back online.' : 'went offline — check its connection.',
                    actionUrl: `/(devices)/DeviceSettingsScreen?deviceId=${d.id}`,
                });
            }
            seeded = true;
        };

        tick();
        const interval = setInterval(tick, DEVICE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [activeFarmIds]);

    // ── Weight / feed(dispense) / health(mortality) realtime events ────
    // No per-farm server-side filter (Realtime filters only support one
    // equality condition, and a farm-admin can manage many farms) — same
    // precedent already used by RecentLogsScreen.tsx: filter client-side.
    useEffect(() => {
        const weighChannel = supabase
            .channel('notif-watch-weigh')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'weigh_sessions' }, (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                if (row.status === 'normal' || row.status === 'invalid') return;
                const label = row.status === 'underweight' ? 'Underweight' : 'Overweight';
                createNotification({
                    farmId: row.farm_id,
                    category: 'weight_alert',
                    type: 'warning',
                    title: `${label} Reading`,
                    message: `A ${row.animal_type ?? 'animal'} weighed in at ${(row.net_weight_grams / 1000).toFixed(2)} kg — ${label.toLowerCase()}.`,
                });
            })
            .subscribe();

        const feedChannel = supabase
            .channel('notif-watch-feed')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispense_records' }, (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                if (row.status !== 'error') return;
                createNotification({
                    farmId: row.farm_id,
                    category: 'feed_alert',
                    type: 'error',
                    title: 'Dispense Failed',
                    message: 'A scheduled feed dispense failed — check the feeder and its feed stock.',
                });
            })
            .subscribe();

        const healthChannel = supabase
            .channel('notif-watch-health')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'health_records' }, (payload) => {
                const row = payload.new as any;
                if (!farmIdsRef.current.includes(row.farm_id)) return;
                if (row.record_type !== 'mortality') return;
                const type = row.severity === 'high' ? 'error' : row.severity === 'medium' ? 'warning' : 'info';
                createNotification({
                    farmId: row.farm_id,
                    category: 'health_alert',
                    type,
                    title: 'Mortality Recorded',
                    message: row.title || `${row.affected_count ?? 1} animal(s) deceased.`,
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(weighChannel);
            supabase.removeChannel(feedChannel);
            supabase.removeChannel(healthChannel);
        };
    }, []);

    // ── Feed expiry / low stock — checked once per calendar day ────────
    // Defined via useCallback (stable identity, reads farmIdsRef fresh each
    // call) so it can be triggered both by activeFarmIds becoming available
    // and by the AppState foreground listener below.
    const checkFeeds = useCallback(async () => {
        if (farmIdsRef.current.length === 0) return;
        const today = todayDateString();
        const dayKey = `feed_alert_checked_${today}`;
        if (await alreadyAlerted(dayKey)) return;

        const { data, error } = await supabase
            .from('feeds')
            .select('id, name, farm_id, stock_kg, expiry_date')
            .in('farm_id', farmIdsRef.current);
        if (error || !data) return;

        for (const feed of data as any[]) {
            if (feed.expiry_date) {
                const days = daysUntil(feed.expiry_date);
                if (days < 0) {
                    const key = `feed_expired_${feed.id}`;
                    if (!(await alreadyAlerted(key))) {
                        await createNotification({
                            farmId: feed.farm_id, category: 'feed_alert', type: 'error',
                            title: 'Feed Expired', message: `"${feed.name}" expired on ${feed.expiry_date}.`,
                        });
                        await markAlerted(key);
                    }
                } else if (days <= 7) {
                    const key = `feed_expiring_${feed.id}`;
                    if (!(await alreadyAlerted(key))) {
                        await createNotification({
                            farmId: feed.farm_id, category: 'feed_alert', type: 'warning',
                            title: 'Feed Expiring Soon', message: `"${feed.name}" expires in ${days} day(s).`,
                        });
                        await markAlerted(key);
                    }
                } else {
                    // Back outside the window (e.g. expiry_date was
                    // pushed out) — clear so a future re-entry re-alerts.
                    await clearAlerted(`feed_expiring_${feed.id}`);
                }
            }

            const lowStockKey = `feed_low_stock_${feed.id}`;
            if (typeof feed.stock_kg === 'number' && feed.stock_kg < LOW_STOCK_THRESHOLD_KG) {
                if (!(await alreadyAlerted(lowStockKey))) {
                    await createNotification({
                        farmId: feed.farm_id, category: 'feed_alert', type: 'warning',
                        title: 'Low Feed Stock', message: `"${feed.name}" is down to ${feed.stock_kg} kg remaining.`,
                    });
                    await markAlerted(lowStockKey);
                }
            } else {
                await clearAlerted(lowStockKey); // restocked above threshold — re-arm for next time
            }
        }

        await markAlerted(dayKey);
    }, []);

    // Runs whenever activeFarmIds changes — including the very first time it
    // populates after this component mounts before farm data has loaded
    // (checkFeeds itself no-ops on an empty list, so this fires safely on
    // every render of that dependency without double-checking same-day work).
    useEffect(() => {
        checkFeeds();
    }, [activeFarmIds, checkFeeds]);

    // Also re-check whenever the app comes back to the foreground, in case a
    // feed crossed a threshold (expired, ran low) while the app was backgrounded.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') checkFeeds();
        });
        return () => sub.remove();
    }, [checkFeeds]);

    return null;
}
