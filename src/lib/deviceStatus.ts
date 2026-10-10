/**
 * deviceStatus — derives whether an IoT device is *actually* reachable.
 *
 * `devices.status` in Supabase is only ever set by a human action (the
 * Connect/Disconnect toggle, provisioning, factory reset) — it never gets
 * flipped back automatically if a device loses power or WiFi. Trusting it
 * alone means a device can show "Online" for hours after it went dark.
 *
 * board1.ino now posts a heartbeat to `devices.last_seen` every ~30s while
 * it has WiFi (see record_device_heartbeat in the database repo). Real
 * "online" status = the human hasn't explicitly disconnected/reset it AND
 * a heartbeat has landed recently.
 */

/**
 * Heartbeats fire every 30s while the board's main loop is free to run —
 * but a full sort cycle (gates + pushers + exit wait + tare) can block
 * that loop for 2+ minutes straight, during which no heartbeat can fire
 * even though the board is very much alive and working. This threshold
 * needs to comfortably outlast the worst-case cycle, not just a couple of
 * missed 30s beats, or an actively-weighing device flaps to "Offline".
 */
export const DEVICE_ONLINE_THRESHOLD_MS = 75_000;

export type RawDeviceStatus = 'online' | 'offline' | 'maintenance' | string | null | undefined;

/**
 * True only if the device hasn't been manually taken offline/into
 * maintenance AND its last heartbeat is still fresh.
 */
export function isDeviceOnline(
    status: RawDeviceStatus,
    lastSeen: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (status === 'offline' || status === 'maintenance') return false;
    if (!lastSeen) return false;
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isNaN(lastSeenMs)) return false;
    return now - lastSeenMs < DEVICE_ONLINE_THRESHOLD_MS;
}

export type DeviceDisplayStatus = 'online' | 'offline' | 'maintenance';

/** Status to actually show in the UI — collapses staleness into 'offline'. */
export function getDeviceDisplayStatus(
    status: RawDeviceStatus,
    lastSeen: string | null | undefined,
    now: number = Date.now(),
): DeviceDisplayStatus {
    if (status === 'maintenance') return 'maintenance';
    return isDeviceOnline(status, lastSeen, now) ? 'online' : 'offline';
}
