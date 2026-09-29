import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { USER_MANUAL_HTML } from '@/constants/userManualHtml';

let cachedProcessedHtml: string | null = null;

/**
 * Returns the User Manual HTML enriched with section anchor IDs and navigation listener scripts
 * for in-app WebView / iframe rendering.
 */
export function getManualHtmlWithAnchors(): string {
    if (cachedProcessedHtml) return cachedProcessedHtml;

    let html = USER_MANUAL_HTML;

    // Inject anchor IDs for section jumping
    html = html
        .replace('<h2>1.0 Hardware Device Registration</h2>', '<h2 id="sec-hardware">1.0 Hardware Device Registration</h2>')
        .replace('<h2>2.0 Wi-Fi Setup & Network Connection</h2>', '<h2 id="sec-wifi">2.0 Wi-Fi Setup & Network Connection</h2>')
        .replace('<h2>3.0 Automated Feed Scheduling for Poultry & Livestock (AniFeed)</h2>', '<h2 id="sec-anifeed">3.0 Automated Feed Scheduling for Poultry & Livestock (AniFeed)</h2>')
        .replace('<h2>4.0 Smart Poultry & Livestock Weighing (AniWeigh)</h2>', '<h2 id="sec-aniweigh">4.0 Smart Poultry & Livestock Weighing (AniWeigh)</h2>')
        .replace('<h2>5.0 Troubleshooting & Support</h2>', '<h2 id="sec-troubleshoot">5.0 Troubleshooting & Support</h2>')
        .replace('<div class="paper-page cover-page">', '<div id="sec-cover" class="paper-page cover-page">');

    // Inject smooth scrolling and cross-platform message listener
    const injection = `
    <style>
      html {
        scroll-behavior: smooth !important;
      }
      body {
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior-y: contain;
        padding-top: 10px !important;
      }
      .no-print {
        display: none !important;
      }
    </style>
    <script>
      function scrollToSec(id) {
        if (!id || id === 'sec-cover' || id === 'all') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        var el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      window.addEventListener('message', function(e) {
        try {
          var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data && data.type === 'SCROLL_TO') {
            scrollToSec(data.sectionId);
          }
        } catch (err) {}
      });
      document.addEventListener('message', function(e) {
        try {
          var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data && data.type === 'SCROLL_TO') {
            scrollToSec(data.sectionId);
          }
        } catch (err) {}
      });
    </script>
    `;

    html = html.replace('</head>', `${injection}\n</head>`);
    cachedProcessedHtml = html;
    return cachedProcessedHtml;
}

/**
 * Opens the Ani-Grow Official User Manual outside the app or shares it as a PDF.
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
                    newTab.document.write(getManualHtmlWithAnchors());
                    newTab.document.close();
                    return true;
                }
            }
            return false;
        }

        // On Native (Android / iOS)
        const { uri } = await Print.printToFileAsync({
            html: getManualHtmlWithAnchors(),
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
        Alert.alert('Error', 'Unable to export User Manual. Please try again.');
        return false;
    }
}
