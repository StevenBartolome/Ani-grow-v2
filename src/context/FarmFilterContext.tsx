/**
 * FarmFilterContext
 *
 * Provides multi-farm awareness for Farm Admin users.
 *
 * How it works:
 * ─────────────
 * • On mount, reads the current user's role and farm_id from AuthContext.
 * • If the user is a farm_admin, fetches all rows from `farm_admin_farms`
 *   for their uid and resolves the matching farm names.
 * • If the table is empty for them, auto-seeds their own farm_id so they
 *   always have at least one farm entry.
 * • Workers (caretaker, etc.) always see exactly their one assigned farm
 *   and never see the filter drawer.
 *
 * Consumers call `useFarmFilter()` to get:
 *   activeFarmIds   — array to pass into Supabase `.in('farm_id', activeFarmIds)`
 *   managedFarms    — full list of farms the admin can access
 *   selectedFarmIds — which farms are checked in the filter drawer
 *   isFarmAdmin     — show/hide the filter drawer button
 *   isMultiFarm     — admin has more than one farm
 *   toggleFarm      — check/uncheck a farm
 *   selectAll       — check all farms
 *   isLoaded        — data is ready
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManagedFarm {
    id: string;
    name: string;
}

interface FarmFilterContextType {
    managedFarms: ManagedFarm[];
    selectedFarmIds: string[];
    activeFarmIds: string[];          // selectedFarmIds if non-empty, else all managed
    isFarmAdmin: boolean;
    isMultiFarm: boolean;
    isLoaded: boolean;
    toggleFarm: (id: string) => void;
    selectAll: () => void;
    clearAll: () => void;
    switchToFarm: (id: string) => void;   // select ONLY this farm (used from FarmsScreen)
    addManagedFarm: (farm: ManagedFarm) => void; // called after creating a new farm
    refreshFarms: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FarmFilterContext = createContext<FarmFilterContextType>({
    managedFarms: [],
    selectedFarmIds: [],
    activeFarmIds: [],
    isFarmAdmin: false,
    isMultiFarm: false,
    isLoaded: false,
    toggleFarm: () => {},
    selectAll: () => {},
    clearAll: () => {},
    switchToFarm: () => {},
    addManagedFarm: () => {},
    refreshFarms: async () => {},
});

export const useFarmFilter = () => useContext(FarmFilterContext);

// ─── Admin roles ──────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['super_admin', 'farm_admin', 'admin'];

// ─── Provider ─────────────────────────────────────────────────────────────────

export const FarmFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { profile } = useAuth();

    const userId     = (profile as any)?.uid || (profile as any)?.id || null;
    const farmId     = (profile as any)?.farm_id || null;
    const userRole   = (profile as any)?.role || '';
    const isFarmAdmin = ADMIN_ROLES.includes(userRole);

    const [managedFarms, setManagedFarms]       = useState<ManagedFarm[]>([]);
    const [selectedFarmIds, setSelectedFarmIds] = useState<string[]>([]);
    const [isLoaded, setIsLoaded]               = useState(false);

    // ── Load farms ────────────────────────────────────────────────────────────
    const loadFarms = useCallback(async () => {
        if (!userId) { setIsLoaded(true); return; }

        // Non-admin: just use their single farm
        if (!isFarmAdmin) {
            if (farmId) {
                // Fetch farm name
                const { data } = await supabase
                    .from('farms')
                    .select('id, name')
                    .eq('id', farmId)
                    .single();
                const farm: ManagedFarm = { id: farmId, name: data?.name || 'My Farm' };
                setManagedFarms([farm]);
                setSelectedFarmIds([farmId]);
            }
            setIsLoaded(true);
            return;
        }

        // Super admin: load ALL farms in the system
        if (userRole === 'super_admin') {
            try {
                const { data: allFarms, error: allFarmsErr } = await supabase
                    .from('farms')
                    .select('id, name');
                if (allFarmsErr) throw allFarmsErr;

                const farms: ManagedFarm[] = (allFarms || []).map((f: any) => ({
                    id: f.id,
                    name: f.name || 'Farm',
                }));
                setManagedFarms(farms);
                setSelectedFarmIds(farms.map(f => f.id));
            } catch (err) {
                console.error('[FarmFilterContext] loadFarms super_admin error:', err);
            } finally {
                setIsLoaded(true);
            }
            return;
        }

        try {
            // Fetch farm_admin_farms rows (mobile-created farms)
            const { data: links, error } = await supabase
                .from('farm_admin_farms')
                .select('farm_id, farms(id, name)')
                .eq('admin_user_id', userId);

            if (error) throw error;

            let farms: ManagedFarm[] = (links || [])
                .map((row: any) => ({
                    id:   row.farms?.id   || row.farm_id,
                    name: row.farms?.name || 'Farm',
                }))
                .filter((f: ManagedFarm) => f.id);

            // Also fetch farms created from the web (stored as admin_id on farms table)
            const { data: adminFarms } = await supabase
                .from('farms')
                .select('id, name')
                .eq('admin_id', userId);

            // Merge & deduplicate — web farms not yet in farm_admin_farms
            const knownIds = new Set(farms.map(f => f.id));
            const newFromWeb = (adminFarms || []).filter((f: any) => f.id && !knownIds.has(f.id));

            if (newFromWeb.length > 0) {
                // Auto-link them so future queries find them in both places
                await Promise.all(newFromWeb.map((f: any) =>
                    supabase.from('farm_admin_farms').upsert(
                        { admin_user_id: userId, farm_id: f.id },
                        { onConflict: 'admin_user_id,farm_id' }
                    )
                ));
                farms = [...farms, ...newFromWeb.map((f: any) => ({ id: f.id, name: f.name || 'Farm' }))];
            }

            // Auto-seed own farm if still empty
            if (farms.length === 0 && farmId) {
                const { data: farmData } = await supabase
                    .from('farms')
                    .select('id, name')
                    .eq('id', farmId)
                    .single();

                await supabase.from('farm_admin_farms').upsert(
                    { admin_user_id: userId, farm_id: farmId },
                    { onConflict: 'admin_user_id,farm_id' }
                );

                farms = [{ id: farmId, name: farmData?.name || 'My Farm' }];
            }

            setManagedFarms(farms);
            setSelectedFarmIds(farms.map(f => f.id)); // default: all selected
        } catch (err) {
            console.error('[FarmFilterContext] loadFarms error:', err);
            // Fallback: use single farm from profile
            if (farmId) {
                setManagedFarms([{ id: farmId, name: 'My Farm' }]);
                setSelectedFarmIds([farmId]);
            }
        } finally {
            setIsLoaded(true);
        }
    }, [userId, farmId, isFarmAdmin, userRole]);

    useEffect(() => {
        if (userId) { loadFarms(); }
    }, [userId, loadFarms]);

    // ── Toggle helpers ────────────────────────────────────────────────────────
    const toggleFarm = useCallback((id: string) => {
        setSelectedFarmIds(prev => {
            if (prev.includes(id)) {
                // Don't allow deselecting the last farm
                if (prev.length === 1) return prev;
                return prev.filter(f => f !== id);
            }
            return [...prev, id];
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedFarmIds(managedFarms.map(f => f.id));
    }, [managedFarms]);

    const clearAll = useCallback(() => {
        // Keep at least the first farm selected
        if (managedFarms.length > 0) {
            setSelectedFarmIds([managedFarms[0].id]);
        }
    }, [managedFarms]);

    /** Focus dashboard on a single farm (used when tapping a farm in FarmsScreen) */
    const switchToFarm = useCallback((id: string) => {
        setSelectedFarmIds([id]);
    }, []);

    /** Register a newly-created farm into context (called after insert succeeds) */
    const addManagedFarm = useCallback((farm: ManagedFarm) => {
        setManagedFarms(prev => {
            if (prev.some(f => f.id === farm.id)) return prev;
            return [...prev, farm];
        });
        setSelectedFarmIds(prev => [...prev, farm.id]);
    }, []);

    // activeFarmIds = selectedFarmIds if non-empty, else all (safety net)
    const activeFarmIds = useMemo(() =>
        selectedFarmIds.length > 0
            ? selectedFarmIds
            : managedFarms.map(f => f.id),
        [selectedFarmIds, managedFarms]
    );

    const isMultiFarm = managedFarms.length > 1;

    const value = useMemo(() => ({
        managedFarms,
        selectedFarmIds,
        activeFarmIds,
        isFarmAdmin,
        isMultiFarm,
        isLoaded,
        toggleFarm,
        selectAll,
        clearAll,
        switchToFarm,
        addManagedFarm,
        refreshFarms: loadFarms,
    }), [managedFarms, selectedFarmIds, activeFarmIds, isFarmAdmin, isMultiFarm, isLoaded, toggleFarm, selectAll, clearAll, switchToFarm, addManagedFarm, loadFarms]);

    return (
        <FarmFilterContext.Provider value={value}>
            {children}
        </FarmFilterContext.Provider>
    );
};
