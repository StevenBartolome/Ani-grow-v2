import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { USER_MANUAL_HTML } from '@/constants/userManualHtml';

/**
 * Opens the Ani-Grow Official User Manual outside the app.
 * - On Web: Opens directly in a new browser tab with full HTML/CSS formatting.
 * - On Mobile (iOS/Android): Compiles the manual to an official PDF and opens it
 *   via the native system viewer / sharing handler.
 */
export async function openUserManual(): Promise<boolean> {
    try {
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.open();
                    newTab.document.write(USER_MANUAL_HTML);
                    newTab.document.close();
                    return true;
                }
            }
            return false;
        }

        // On Native (Android / iOS)
        const { uri } = await Print.printToFileAsync({
            html: USER_MANUAL_HTML,
            base64: false,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Ani-Grow Official User Manual',
                UTI: 'com.adobe.pdf',
            });
            return true;
        } else {
            Alert.alert('User Manual Saved', `PDF saved successfully at:\n${uri}`);
            return true;
        }
    } catch (error) {
        console.error('[userManual] Failed to open manual:', error);
        Alert.alert('Error', 'Unable to open User Manual. Please try again.');
        return false;
    }
}
