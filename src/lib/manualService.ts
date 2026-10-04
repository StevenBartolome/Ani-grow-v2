import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export interface ManualCategory {
  id: string;
  parent_id?: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  target_module?: 'aniweigh' | 'anifeed' | 'general' | null;
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ManualItemType = 'pdf' | 'html' | 'youtube' | 'gdrive' | 'video' | 'link';

export interface ManualItem {
  id: string;
  category_id: string;
  title: string;
  description?: string | null;
  item_type: ManualItemType;
  content_url: string;
  file_path?: string | null;
  file_size_bytes?: number | null;
  duration_seconds?: number | null;
  sort_order: number;
  is_published: boolean;
  view_count: number;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  category?: ManualCategory | null;
}

/**
 * Fetch all active manual categories from Supabase
 */
export async function fetchManualCategories(): Promise<ManualCategory[]> {
  try {
    const { data, error } = await supabase
      .from('manual_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.warn('[manualService] Error fetching categories:', error.message);
      return [];
    }
    return (data as ManualCategory[]) || [];
  } catch (err) {
    console.error('[manualService] Failed to fetch manual categories:', err);
    return [];
  }
}

/**
 * Fetch published manual items with their associated category
 */
export async function fetchManualItems(categoryId?: string): Promise<ManualItem[]> {
  try {
    let query = supabase
      .from('manual_items')
      .select('*, category:manual_categories(*)')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[manualService] Error fetching manual items:', error.message);
      return [];
    }

    return (data as ManualItem[]) || [];
  } catch (err) {
    console.error('[manualService] Failed to fetch manual items:', err);
    return [];
  }
}

/**
 * Increment view count for an accessed item
 */
export async function incrementManualViewCount(item: ManualItem): Promise<void> {
  try {
    // Attempt standard update
    await supabase
      .from('manual_items')
      .update({ view_count: (item.view_count || 0) + 1 })
      .eq('id', item.id);
  } catch (err) {
    console.warn('[manualService] Error updating view count:', err);
  }
}

/**
 * Open manual item content URL in web browser or external viewer
 */
export async function openManualItem(item: ManualItem): Promise<boolean> {
  if (!item.content_url) return false;

  // Increment view count in background
  incrementManualViewCount(item).catch(() => {});

  let url = item.content_url.trim();

  // Ensure protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return true;
    }

    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: '#006400',
      controlsColor: '#FFFFFF',
      showTitle: true,
      enableBarCollapsing: true,
    });
    return true;
  } catch (error) {
    console.warn('[manualService] WebBrowser failed, falling back to Linking:', error);
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
    } catch (e) {
      console.error('[manualService] Linking fallback failed:', e);
    }
    return false;
  }
}

/**
 * Format bytes to readable size (e.g. 1.2 MB)
 */
export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format seconds to readable duration (e.g. 04:30 or 1h 12m)
 */
export function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs} min`;
}

/**
 * Get display metadata for each item type
 */
export function getItemTypeMeta(type: ManualItemType) {
  switch (type) {
    case 'youtube':
      return {
        label: 'YouTube Video',
        iconName: 'smart-display' as const,
        color: '#DC2626',
        bgColor: '#FEF2F2',
        borderColor: '#FECACA',
      };
    case 'video':
      return {
        label: 'Video',
        iconName: 'play-circle' as const,
        color: '#7C3AED',
        bgColor: '#F5F3FF',
        borderColor: '#DDD6FE',
      };
    case 'pdf':
      return {
        label: 'PDF Document',
        iconName: 'picture-as-pdf' as const,
        color: '#EA580C',
        bgColor: '#FFF7ED',
        borderColor: '#FED7AA',
      };
    case 'gdrive':
      return {
        label: 'Google Drive',
        iconName: 'folder-shared' as const,
        color: '#0284C7',
        bgColor: '#F0F9FF',
        borderColor: '#BAE6FD',
      };
    case 'html':
      return {
        label: 'Web Article',
        iconName: 'article' as const,
        color: '#059669',
        bgColor: '#ECFDF5',
        borderColor: '#A7F3D0',
      };
    case 'link':
    default:
      return {
        label: 'External Link',
        iconName: 'open-in-new' as const,
        color: '#0D9488',
        bgColor: '#F0FDFA',
        borderColor: '#99F6E4',
      };
  }
}
