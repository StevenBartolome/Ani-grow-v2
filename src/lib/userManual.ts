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

    // Inject data-label on doc-table cells for responsive card view without horizontal scrolling
    html = html.replace(/<table class="doc-table">([\s\S]*?)<\/table>/g, (match: string, inner: string) => {
        const headMatch = inner.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/);
        if (!headMatch) return match;
        const headers = [...headMatch[1].matchAll(/<th>([\s\S]*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

        let body = inner.replace(/<tbody>([\s\S]*?)<\/tbody>/, (_bMatch: string, bInner: string) => {
            let rows = bInner.replace(/<tr>([\s\S]*?)<\/tr>/g, (_rMatch: string, rInner: string) => {
                let colIdx = 0;
                let newCells = rInner.replace(/<td>([\s\S]*?)<\/td>/g, (_tdMatch: string, tdInner: string) => {
                    const label = headers[colIdx] || '';
                    colIdx++;
                    return `<td data-label="${label}">${tdInner}</td>`;
                });
                return `<tr>${newCells}</tr>`;
            });
            return `<tbody>${rows}</tbody>`;
        });
        return `<table class="doc-table">${body}</table>`;
    });

    // Inject smooth scrolling, mobile responsive layout fixes, and cross-platform message listener
    const injection = `
    <style>
      html {
        scroll-behavior: smooth !important;
        box-sizing: border-box !important;
      }
      *, *:before, *:after {
        box-sizing: inherit !important;
      }
      body {
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior-y: contain;
        padding: 8px 4px !important;
        background-color: #f1f5f9 !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
        margin: 0 !important;
      }
      .paper-page {
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
        margin: 0 0 16px 0 !important;
        padding: 16px 12px !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
      }
      .toc-block {
        width: 100% !important;
        max-width: 100% !important;
        padding: 12px 10px !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
      }
      .toc-table {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
      }
      .toc-table td {
        padding: 6px 2px !important;
        font-size: 0.82rem !important;
        vertical-align: top !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      .toc-sec-num {
        width: 32px !important;
        min-width: 32px !important;
        max-width: 36px !important;
        font-size: 0.8rem !important;
        font-weight: 700 !important;
      }
      .toc-sec-title {
        font-size: 0.8rem !important;
        line-height: 1.3 !important;
        padding-right: 4px !important;
      }
      .toc-page-num {
        width: 52px !important;
        min-width: 48px !important;
        font-size: 0.76rem !important;
        white-space: nowrap !important;
        text-align: right !important;
      }
      .cover-meta-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
        padding: 12px !important;
        box-sizing: border-box !important;
      }
      .cover-title {
        font-size: 1.65rem !important;
        line-height: 1.2 !important;
        word-break: break-word !important;
      }
      .cover-subtitle {
        font-size: 0.95rem !important;
      }
      .step-card {
        padding: 10px 12px !important;
        gap: 10px !important;
        box-sizing: border-box !important;
      }
      .callout {
        padding: 10px 12px !important;
        gap: 8px !important;
        box-sizing: border-box !important;
      }
      /* Non-scrollable responsive doc-table cards */
      .table-frame {
        width: 100% !important;
        overflow: visible !important;
        max-width: 100% !important;
        border: none !important;
        background: transparent !important;
        margin: 12px 0 !important;
        box-sizing: border-box !important;
      }
      .doc-table {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        border: none !important;
      }
      .doc-table thead {
        display: none !important;
      }
      .doc-table tbody {
        display: block !important;
        width: 100% !important;
      }
      .doc-table tr {
        display: block !important;
        width: 100% !important;
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-left: 4px solid #006400 !important;
        margin-bottom: 12px !important;
        padding: 10px 12px !important;
        box-sizing: border-box !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.04) !important;
      }
      .doc-table td {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        justify-content: flex-start !important;
        width: 100% !important;
        padding: 6px 0 !important;
        border: none !important;
        border-bottom: 1px dashed #e2e8f0 !important;
        font-size: 0.88rem !important;
        box-sizing: border-box !important;
        word-break: break-word !important;
      }
      .doc-table td:last-child {
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }
      .doc-table td:first-child {
        padding-top: 0 !important;
      }
      .doc-table td::before {
        content: attr(data-label);
        display: block !important;
        font-size: 0.72rem !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: #64748b !important;
        margin-bottom: 2px !important;
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
