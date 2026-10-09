/**
 * DeviceSettingsScreen — Full IoT Device Lifecycle Management
 *
 * SQL needed (run once in Supabase SQL Editor):
 * ─────────────────────────────────────────────
 * ALTER TABLE devices
 *   ADD COLUMN IF NOT EXISTS claim_code     TEXT,
 *   ADD COLUMN IF NOT EXISTS last_reset_at  TIMESTAMPTZ,
 *   ADD COLUMN IF NOT EXISTS registered_at  TIMESTAMPTZ DEFAULT NOW();
 *
 * CREATE TABLE IF NOT EXISTS device_transfer_logs (
 *   id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   device_id      TEXT NOT NULL,
 *   device_name    TEXT,
 *   action         TEXT NOT NULL,      -- 'remove' | 'reset' | 'rename'
 *   from_farm_id   UUID,
 *   performed_by   TEXT,              -- user uid
 *   performed_at   TIMESTAMPTZ DEFAULT NOW(),
 *   notes          TEXT
 * );
 * ─────────────────────────────────────────────
 */

import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { DeviceIcon } from '@/components/DeviceIcon';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useSettingsSubPageStyles } from '@/styles/settingsSubPageStyles';
import { useDevicesStyles } from '@/styles/devicesStyles';
import { getDeviceDisplayStatus } from '@/lib/deviceStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceDetail {
    id: string;
    name: string;
    type: string;
    status: 'online' | 'offline' | 'maintenance';
    last_seen: string | null;
    farm_id: string | null;
    housing_id: string | null;
    claim_code: string | null;
    last_reset_at: string | null;
    registered_at: string | null;
    housing_name: string | null;
    farm_name: string | null;
    serial_number: string | null;
    unique_code: string | null;
    firmware_version: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random 8-character alphanumeric claim code */
function generateClaimCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function formatDate(iso: string | null): string {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DeviceSettingsScreen() {
    const { profile } = useAuth();
    const farmId  = (profile as any)?.farm_id;
    const userId  = (profile as any)?.uid || (profile as any)?.id;
    const { colors } = useTheme();
    const textStyles   = useTextStyles();
    const styles       = useSettingsSubPageStyles();
    const deviceStyles = useDevicesStyles();
    const insets       = useSafeAreaInsets();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const router       = useRouter();
    const params       = useLocalSearchParams<{ deviceId?: string; type?: string }>();
    const deviceId     = params.deviceId || '';

    // ── State ─────────────────────────────────────────────────────────────────
    const [device, setDevice]       = useState<DeviceDetail | null>(null);
    const [deviceName, setDeviceName] = useState('');
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving]       = useState(false);

    // Confirm modal
    const [modalVisible, setModalVisible]   = useState(false);
    const [modalType, setModalType]         = useState<ActionModalType>('confirmation');
    const [modalTitle, setModalTitle]       = useState('');
    const [modalMessage, setModalMessage]   = useState('');
    const [pendingAction, setPendingAction] = useState<'rename' | 'remove' | 'reset' | 'reset-wifi' | null>(null);

    // ── Network section — live WiFi SSID + reset-wifi action ───────────────────
    const [liveSsid, setLiveSsid] = useState<string | null>(null);
    const [ssidLoading, setSsidLoading] = useState(false);
    const [resettingWifi, setResettingWifi] = useState(false);

    // Claim-code success modal
    const [claimModal, setClaimModal]     = useState(false);
    const [newClaimCode, setNewClaimCode] = useState('');
    const [codeCopied, setCodeCopied]     = useState(false);

    // Snackbar
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType]       = useState<SnackbarType>('success');

    const showSnackbar = (msg: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(msg);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchDevice = useCallback(async () => {
        if (!deviceId) { setLoading(false); return; }
        try {
            const { data, error } = await supabase
                .from('devices')
                .select(`
                    id, name, type, status, last_seen, farm_id, housing_id,
                    claim_code, last_reset_at, registered_at,
                    serial_number, unique_code, firmware_version,
                    housings(name),
                    farms(name)
                `)
                .eq('id', deviceId)
                .single();

            if (error) throw error;
            if (data) {
                const d: DeviceDetail = {
                    id:            data.id,
                    name:          data.name,
                    type:          data.type,
                    status:        data.status,
                    last_seen:     data.last_seen ?? null,
                    farm_id:       data.farm_id,
                    housing_id:    data.housing_id,
                    claim_code:    data.claim_code ?? null,
                    last_reset_at: data.last_reset_at ?? null,
                    registered_at: data.registered_at ?? null,
                    housing_name:  (data as any).housings?.name ?? null,
                    farm_name:     (data as any).farms?.name ?? null,
                    serial_number: data.serial_number ?? null,
                    unique_code:   data.unique_code ?? null,
                    firmware_version: data.firmware_version ?? null,
                };
                setDevice(d);
                setDeviceName(d.name);
            }
        } catch (err) {
            console.error('[DeviceSettingsScreen] fetch error:', err);
            showSnackbar('Failed to load device info.', 'error');
        } finally {
            setLoading(false);
        }
    }, [deviceId]);

    useEffect(() => { fetchDevice(); }, [fetchDevice]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchDevice();
        setRefreshing(false);
    }, [fetchDevice]);

    // ── Live WiFi network name ──────────────────────────────────────────────────
    // Fetched directly from the board over LAN (never stored/transmitted from the
    // app side) — only reachable when this phone/browser is on the same network
    // as the device, or joined to its AniGrow_Setup_<id> hotspot.
    const deviceLanUrls = useCallback((path: string): string[] => {
        const code = device?.unique_code;
        return code
            ? [`http://anigrow-${code}.local${path}`, `http://192.168.4.1${path}`]
            : [`http://192.168.4.1${path}`];
    }, [device?.unique_code]);

    const fetchWithTimeout = async (url: string, timeoutMs = 2500): Promise<Response> => {
        return Promise.race([
            fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json, text/plain, */*' } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
        ]);
    };

    const fetchLiveSsid = useCallback(async () => {
        if (!device) return;
        setSsidLoading(true);
        setLiveSsid(null);
        for (const url of deviceLanUrls('/status')) {
            try {
                const res = await fetchWithTimeout(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.wifi_ssid) {
                        setLiveSsid(data.wifi_ssid);
                        break;
                    }
                }
            } catch { /* try next URL */ }
        }
        setSsidLoading(false);
    }, [device, deviceLanUrls]);

    useEffect(() => { fetchLiveSsid(); }, [fetchLiveSsid]);

    // ── Write audit log (graceful — no crash if table missing) ────────────────
    const writeAuditLog = async (action: string, notes?: string) => {
        try {
            await supabase.from('device_transfer_logs').insert({
                device_id:    deviceId,
                device_name:  device?.name,
                action,
                from_farm_id: device?.farm_id,
                performed_by: userId,
                notes,
            });
        } catch { /* table may not exist yet — silent */ }
    };

    // ── Cancel any active sessions before reset/remove ────────────────────────
    const cancelActiveSessions = async () => {
        // Mark in-progress dispense records as cancelled
        await supabase
            .from('dispense_records')
            .update({ status: 'cancelled' })
            .eq('device_id', deviceId)
            .eq('status', 'in_progress');

        // Mark in-progress weigh sessions as cancelled
        await supabase
            .from('weigh_sessions')
            .update({ status: 'cancelled' })
            .eq('device_id', deviceId)
            .eq('status', 'in_progress');
    };

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleRename = () => {
        if (!deviceName.trim() || deviceName.trim() === device?.name) {
            showSnackbar('No changes to save.', 'info');
            return;
        }
        setPendingAction('rename');
        setModalType('confirmation');
        setModalTitle('Save Changes?');
        setModalMessage(`Rename this device to "${deviceName.trim()}"?`);
        setModalVisible(true);
    };

    const handleRemove = () => {
        setPendingAction('remove');
        setModalType('confirmation');
        setModalTitle('Remove Device?');
        setModalMessage(
            'This will unlink the device from your farm. Historical records (feed logs, weight sessions) will be preserved. The device can be re-added to any farm using a claim code.'
        );
        setModalVisible(true);
    };

    const handleReset = () => {
        setPendingAction('reset');
        setModalType('confirmation');
        setModalTitle('Factory Reset Device?');
        setModalMessage(
            'This will:\n\n• Unlink the device from this farm\n• Clear its housing assignment\n• Cancel any active sessions\n• Generate a new claim code for the new owner\n\nHistorical data stays on this farm\'s records. This cannot be undone.'
        );
        setModalVisible(true);
    };

    const handleResetWifiPress = () => {
        setPendingAction('reset-wifi');
        setModalType('confirmation');
        setModalTitle('Reset WiFi Network?');
        setModalMessage(
            `This device will forget "${liveSsid ?? 'its saved network'}" and restart into setup mode. It stays registered to this farm — you'll just need to reconnect it to a network using "Change WiFi Network" afterward.\n\nOnly works while the device is currently reachable. If it's completely unreachable, hold the BOOT button on the board for 5 seconds at power-on instead.`
        );
        setModalVisible(true);
    };

    const confirmAction = async () => {
        setModalVisible(false);

        if (pendingAction === 'reset-wifi') {
            setResettingWifi(true);
            let success = false;
            for (const url of deviceLanUrls('/reset-wifi')) {
                try {
                    const res = await fetchWithTimeout(url, 4000);
                    if (res.ok) { success = true; break; }
                } catch { /* try next URL */ }
            }
            setResettingWifi(false);
            setPendingAction(null);
            if (success) {
                setLiveSsid(null);
                await writeAuditLog('reset-wifi', 'WiFi credentials cleared — device restarting into setup mode.');
                showSnackbar('WiFi reset. The device is restarting — use "Change WiFi Network" to reconnect it.', 'success');
            } else {
                showSnackbar(
                    'Could not reach the device to reset its WiFi. Make sure you\'re on the same network, or hold the BOOT button on the board for 5 seconds at power-on instead.',
                    'error'
                );
            }
            return;
        }

        setSaving(true);
        try {
            if (pendingAction === 'rename') {
                const { error } = await supabase
                    .from('devices')
                    .update({ name: deviceName.trim() })
                    .eq('id', deviceId);
                if (error) throw error;
                await writeAuditLog('rename', `Renamed to "${deviceName.trim()}"`);
                setDevice(prev => prev ? { ...prev, name: deviceName.trim() } : null);
                showSnackbar('Device renamed successfully.');
            }

            else if (pendingAction === 'remove') {
                await cancelActiveSessions();
                const { error } = await supabase
                    .from('devices')
                    .update({
                        farm_id:    null,
                        housing_id: null,
                        status:     'offline',
                    })
                    .eq('id', deviceId);
                if (error) throw error;
                await writeAuditLog('remove', 'Removed from farm by admin.');
                showSnackbar('Device removed from farm.');
                setTimeout(() => router.replace('/(devices)/DevicesScreen' as any), 1400);
            }

            else if (pendingAction === 'reset') {
                await cancelActiveSessions();
                const code = generateClaimCode();
                const now  = new Date().toISOString();
                const { error } = await supabase
                    .from('devices')
                    .update({
                        farm_id:       null,
                        housing_id:    null,
                        status:        'offline',
                        claim_code:    code,
                        last_reset_at: now,
                    })
                    .eq('id', deviceId);
                if (error) throw error;
                await writeAuditLog('reset', 'Factory reset — new claim code generated.');
                setNewClaimCode(code);
                setCodeCopied(false);
                setClaimModal(true);
            }
        } catch (err: any) {
            console.error('[DeviceSettingsScreen] action error:', err);
            showSnackbar(err?.message || 'Action failed. Please try again.', 'error');
        } finally {
            setSaving(false);
            setPendingAction(null);
        }
    };

    const copyClaimCode = async () => {
        await Clipboard.setStringAsync(newClaimCode);
        setCodeCopied(true);
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    const typeParam = params.type || '';
    const isFeedType = device ? device.type === 'anifeed' : (typeParam.toLowerCase() === 'anifeed');
    const typeLabel = isFeedType ? 'AniFeed' : 'AniWeigh';
    const typeColor = isFeedType ? '#10B981' : '#6C63FF';
    // Real status = manual flag + fresh heartbeat, not just the stored flag
    // (see src/lib/deviceStatus.ts — devices.status alone can go stale).
    const liveStatus = device ? getDeviceDisplayStatus(device.status, device.last_seen) : 'offline';

    return (
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>

                {/* ── Header ──────────────────────────────────────────────── */}
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton fallbackRoute="/(devices)/DevicesScreen" />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        {typeLabel} Settings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >

                    {/* ── Device type badge ─────────────────────────────── */}
                    <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{
                                backgroundColor: typeColor + '1A',
                                borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                            }}>
                                <DeviceIcon
                                    type={device?.type ?? (isFeedType ? 'AniFeed' : 'AniWeigh')}
                                    size={14}
                                />
                                <Text style={[textStyles.label, { color: typeColor, fontSize: 12 }]}>
                                    {typeLabel}
                                </Text>
                            </View>
                            <View style={{
                                backgroundColor: liveStatus === 'online' ? colors.primary + '1A' : colors.cardFill,
                                borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                            }}>
                                <View style={{
                                    width: 6, height: 6, borderRadius: 3,
                                    backgroundColor: liveStatus === 'online' ? colors.primary : colors.textGrey,
                                }} />
                                <Text style={[textStyles.label, {
                                    color: liveStatus === 'online' ? colors.primary : colors.textGrey,
                                    fontSize: 12,
                                }]}>
                                    {liveStatus === 'online' ? 'Online' : liveStatus === 'maintenance' ? 'Maintenance' : 'Offline'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Section 1: General Details ───────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>General Details</Text>
                        <Text style={styles.sectionDescription}>
                            Update the display name for this device.
                        </Text>
                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            <View style={styles.inputGroup}>
                                <FloatingLabelInput
                                    label="Device Name"
                                    icon="devices"
                                    value={deviceName}
                                    onChangeText={setDeviceName}
                                    backgroundColor={colors.surface}
                                />
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[styles.button, saving && { opacity: 0.6 }]}
                            activeOpacity={0.8}
                            onPress={handleRename}
                            disabled={saving}
                        >
                            {saving && pendingAction === 'rename'
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={styles.buttonText}>Save Changes</Text>
                            }
                        </TouchableOpacity>
                    </View>

                    {/* ── Section 2: Device Information ────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Device Information</Text>
                        <Text style={styles.sectionDescription}>
                            Technical details and current assignment.
                        </Text>
                        <View style={[styles.card, { paddingVertical: 16, gap: 14 }]}>
                            {[
                                { icon: 'fingerprint', label: 'Device ID',   value: device?.id || 'N/A' },
                                { icon: 'memory',      label: 'Serial Number', value: device?.serial_number || 'N/A' },
                                { icon: 'qr-code',     label: 'Sticker Code', value: device?.unique_code || 'N/A' },
                                { icon: 'home-work',   label: 'Farm',        value: device?.farm_name || 'Unassigned' },
                                { icon: 'house',       label: 'Housing',     value: device?.housing_name || 'Unassigned' },
                                { icon: 'developer-board', label: 'Firmware Version', value: device?.firmware_version || 'N/A' },
                                { icon: 'event',       label: 'Registered',  value: formatDate(device?.registered_at ?? null) },
                                { icon: 'restart-alt', label: 'Last Reset',  value: formatDate(device?.last_reset_at ?? null) },
                            ].map(row => (
                                <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                                    <View style={deviceStyles.deviceIconBox}>
                                        <MaterialIcons name={row.icon as any} size={20} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 14 }}>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                            {row.label}
                                        </Text>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 13, marginTop: 2 }]}
                                            numberOfLines={1}>
                                            {row.value}
                                        </Text>
                                    </View>
                                </View>
                            ))}

                            {/* Claim code (shown if already has one) */}
                            {device?.claim_code && (
                                <View style={{
                                    marginHorizontal: 16,
                                    backgroundColor: colors.warning + '15',
                                    borderWidth: 1, borderColor: colors.warning + '40',
                                    borderRadius: 12, padding: 12,
                                    flexDirection: 'row', alignItems: 'center', gap: 10,
                                }}>
                                    <MaterialIcons name="vpn-key" size={18} color={colors.warning} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.body, { color: colors.warning, fontSize: 11 }]}>
                                            Pending Claim Code
                                        </Text>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16, letterSpacing: 3, marginTop: 2 }]}>
                                            {device.claim_code}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={copyClaimCode} activeOpacity={0.7}>
                                        <MaterialIcons name="content-copy" size={18} color={colors.warning} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* ── Section 3: Network ───────────────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Network</Text>
                        <Text style={styles.sectionDescription}>
                            The WiFi network this device is currently connected to.
                        </Text>
                        <View style={[styles.card, { paddingVertical: 16, gap: 14 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                                <View style={deviceStyles.deviceIconBox}>
                                    <MaterialIcons name="wifi" size={20} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 14 }}>
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                        Connected Network
                                    </Text>
                                    {ssidLoading ? (
                                        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4, alignSelf: 'flex-start' }} />
                                    ) : (
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 13, marginTop: 2 }]} numberOfLines={1}>
                                            {liveSsid ?? 'Unknown — device unreachable'}
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity onPress={fetchLiveSsid} activeOpacity={0.7} disabled={ssidLoading}>
                                    <MaterialIcons name="refresh" size={18} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>
                            {!liveSsid && !ssidLoading && (
                                <Text style={{ marginHorizontal: 16, fontSize: 11, color: colors.textGrey }}>
                                    Only readable while your phone is on the same network as the device, or joined to its setup hotspot. This never leaves your device's local network — the password is never shown or stored, on the board or in the app.
                                </Text>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.button, { marginBottom: 10 }]}
                            activeOpacity={0.8}
                            onPress={() => router.push(
                                `/(devices)/AddDeviceScreen?existingDeviceId=${deviceId}&existingDeviceName=${encodeURIComponent(device?.name ?? '')}&existingDeviceType=${isFeedType ? 'AniFeed' : 'AniWeigh'}&existingDeviceCode=${encodeURIComponent(device?.unique_code ?? '')}` as any
                            )}
                        >
                            <Text style={styles.buttonText}>Change WiFi Network</Text>
                        </TouchableOpacity>

                        <View style={{
                            borderWidth: 1, borderColor: colors.warning + '50',
                            borderRadius: 16, overflow: 'hidden',
                        }}>
                            <View style={{ padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        backgroundColor: colors.warning + '15',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="wifi-off" size={18} color={colors.warning} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                            Reset WiFi Network
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 3, lineHeight: 18 }]}>
                                            Forgets the saved network and restarts into setup mode — use this when moving the device to a new location. The device stays registered to your farm.
                                        </Text>
                                        <View style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 5,
                                            marginTop: 8, backgroundColor: colors.cardFill,
                                            borderRadius: 8, padding: 8,
                                        }}>
                                            <MaterialIcons name="info-outline" size={13} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, flex: 1 }]}>
                                                Unreachable device? Hold the BOOT button on the board for 5s at power-on instead.
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={{
                                    borderTopWidth: 1, borderColor: colors.warning + '40',
                                    padding: 14, alignItems: 'center',
                                    backgroundColor: colors.warning + '08',
                                    flexDirection: 'row', justifyContent: 'center', gap: 6,
                                }}
                                activeOpacity={0.8}
                                onPress={handleResetWifiPress}
                                disabled={resettingWifi}
                            >
                                {resettingWifi
                                    ? <ActivityIndicator size="small" color={colors.warning} />
                                    : <>
                                        <MaterialIcons name="wifi-off" size={16} color={colors.warning} />
                                        <Text style={[textStyles.label, { color: colors.warning, fontSize: 13 }]}>
                                            Reset WiFi Network
                                        </Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Danger Zone ──────────────────────────────────── */}
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <MaterialIcons name="warning-amber" size={15} color={colors.error} />
                            <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
                        </View>
                        <Text style={styles.sectionDescription}>
                            These actions affect device ownership and registration. They cannot be undone.
                        </Text>

                        {/* Remove from farm */}
                        <View style={{
                            borderWidth: 1, borderColor: colors.stroke,
                            borderRadius: 16, overflow: 'hidden', marginBottom: 12,
                        }}>
                            <View style={{ padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        backgroundColor: colors.warning + '15',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="link-off" size={18} color={colors.warning} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                            Remove from Farm
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 3, lineHeight: 18 }]}>
                                            Unlinks this device from your farm. All historical logs (feed, weight) are preserved on your account. The device becomes unassigned and can be reclaimed.
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={{
                                    borderTopWidth: 1, borderColor: colors.stroke,
                                    padding: 14, alignItems: 'center',
                                    backgroundColor: colors.warning + '08',
                                    flexDirection: 'row', justifyContent: 'center', gap: 6,
                                }}
                                activeOpacity={0.8}
                                onPress={handleRemove}
                                disabled={saving}
                            >
                                {saving && pendingAction === 'remove'
                                    ? <ActivityIndicator size="small" color={colors.warning} />
                                    : <>
                                        <MaterialIcons name="link-off" size={16} color={colors.warning} />
                                        <Text style={[textStyles.label, { color: colors.warning, fontSize: 13 }]}>
                                            Remove Device
                                        </Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </View>

                        {/* Factory reset */}
                        <View style={{
                            borderWidth: 1, borderColor: colors.error + '50',
                            borderRadius: 16, overflow: 'hidden',
                        }}>
                            <View style={{ padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        backgroundColor: colors.error + '15',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="restart-alt" size={18} color={colors.error} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 14 }]}>
                                            Factory Reset
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginTop: 3, lineHeight: 18 }]}>
                                            Use when selling or transferring this device to a new owner. Clears farm &amp; housing assignment, cancels active sessions, and generates a new 8-digit claim code for re-registration.
                                        </Text>
                                        <View style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 5,
                                            marginTop: 8, backgroundColor: colors.cardFill,
                                            borderRadius: 8, padding: 8,
                                        }}>
                                            <MaterialIcons name="info-outline" size={13} color={colors.textGrey} />
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, flex: 1 }]}>
                                                Historical records stay on your farm — only the device link is removed.
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={{
                                    borderTopWidth: 1, borderColor: colors.error + '40',
                                    padding: 14, alignItems: 'center',
                                    backgroundColor: colors.error + '08',
                                    flexDirection: 'row', justifyContent: 'center', gap: 6,
                                }}
                                activeOpacity={0.8}
                                onPress={handleReset}
                                disabled={saving}
                            >
                                {saving && pendingAction === 'reset'
                                    ? <ActivityIndicator size="small" color={colors.error} />
                                    : <>
                                        <MaterialIcons name="restart-alt" size={16} color={colors.error} />
                                        <Text style={[textStyles.label, { color: colors.error, fontSize: 13 }]}>
                                            Factory Reset Device
                                        </Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>

                </ScrollView>
            </View>

            {/* ── Confirm modal ──────────────────────────────────────────── */}
            <ActionModal
                visible={modalVisible}
                type={modalType}
                title={modalTitle}
                message={modalMessage}
                confirmText={
                    pendingAction === 'rename' ? 'Save'
                    : pendingAction === 'remove' ? 'Remove'
                    : pendingAction === 'reset-wifi' ? 'Reset WiFi'
                    : 'Reset'
                }
                cancelText="Cancel"
                onConfirm={confirmAction}
                onCancel={() => { setModalVisible(false); setPendingAction(null); }}
            />

            {/* ── Claim-code success modal ───────────────────────────────── */}
            <Modal visible={claimModal} transparent animationType="fade">
                <View style={{
                    flex: 1, backgroundColor: '#00000080',
                    alignItems: 'center', justifyContent: 'center', padding: 24,
                }}>
                    <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 24, padding: 28, width: '100%', maxWidth: 360,
                        alignItems: 'center',
                    }}>
                        <View style={{
                            width: 56, height: 56, borderRadius: 16,
                            backgroundColor: colors.primary + '1A',
                            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                        }}>
                            <MaterialIcons name="restart-alt" size={28} color={colors.primary} />
                        </View>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, marginBottom: 6, textAlign: 'center' }]}>
                            Device Reset
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, textAlign: 'center', marginBottom: 24 }]}>
                            The device has been unlinked from your farm. Share this claim code with the new owner to re-register it.
                        </Text>

                        {/* Claim code box */}
                        <View style={{
                            width: '100%',
                            backgroundColor: colors.cardFill,
                            borderRadius: 16, padding: 20, alignItems: 'center',
                            borderWidth: 1, borderColor: colors.stroke, marginBottom: 16,
                        }}>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 6 }]}>
                                Claim Code
                            </Text>
                            <Text style={[textStyles.h1, {
                                color: colors.primary, fontSize: 28,
                                letterSpacing: 6, textAlign: 'center',
                            }]}>
                                {newClaimCode}
                            </Text>
                        </View>

                        <Pressable
                            onPress={copyClaimCode}
                            style={({ pressed }) => ({
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                backgroundColor: codeCopied ? colors.primary + '15' : colors.cardFill,
                                borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18,
                                marginBottom: 20, opacity: pressed ? 0.8 : 1,
                            })}
                        >
                            <MaterialIcons
                                name={codeCopied ? 'check-circle' : 'content-copy'}
                                size={16}
                                color={codeCopied ? colors.primary : colors.textGrey}
                            />
                            <Text style={[textStyles.label, {
                                color: codeCopied ? colors.primary : colors.textGrey, fontSize: 13,
                            }]}>
                                {codeCopied ? 'Copied!' : 'Copy Code'}
                            </Text>
                        </Pressable>

                        <TouchableOpacity
                            style={{
                                width: '100%', backgroundColor: colors.primary,
                                borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                            }}
                            activeOpacity={0.85}
                            onPress={() => {
                                setClaimModal(false);
                                router.replace('/(devices)/DevicesScreen' as any);
                            }}
                        >
                            <Text style={[textStyles.label, { color: '#FFF', fontSize: 14 }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </View>
    );
}
