import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { USER_MANUAL_HTML } from '@/constants/userManualHtml';

let cachedHtmlEn: string | null = null;
let cachedHtmlFil: string | null = null;

const FILIPINO_MANUAL_DICTIONARY: [string, string][] = [
    ['Official Product Manual', 'Opisyal na Gabay sa Produkto'],
    ['Official User & Hardware Operation Manual', 'Opisyal na Gabay sa Paggamit at Pagpapatakbo ng Hardware'],
    ['Official Printable User Manual', 'Opisyal na Gabay sa Paggamit (User Manual)'],
    ['Complete Farm Administrator & Livestock Monitoring Guide', 'Kumpletong Gabay para sa Tagapamahala ng Sakahan at Pagsubaybay sa mga Alaga'],
    ['Target System', 'Sistemang Sakop'],
    ['Poultry & Livestock Farm Admin Web Portal & Mobile App', 'Web Portal at Mobile App para sa Manukan at Babuyan'],
    ['Document Ref', 'Sanggunian ng Dokumento'],
    ['Revision', 'Rebisyon'],
    ['Effective Date', 'Petsa ng Pagpapatupad'],
    ['Manual Table of Contents', 'Talaan ng Nilalaman ng Gabay'],
    ['Hardware Device Registration (Web Portal)', 'Pagpaparehistro ng Hardware Device (Web Portal)'],
    ['Wi-Fi Setup & Network Connection (Mobile App)', 'Pag-setup ng Wi-Fi at Koneksyon sa Network (Mobile App)'],
    ['Automated Feed Scheduling for Poultry & Livestock', 'Awtomatikong Iskedyul ng Pagpapakain para sa Manok at Baboy'],
    ['Smart Poultry & Livestock Weighing (AniWeigh)', 'Matalinong Pagtitimbang sa Manok at Baboy (AniWeigh)'],
    ['Troubleshooting & Frequently Asked Questions', 'Pag-troubleshoot at mga Madalas Itanong'],
    ['Troubleshooting & Support', 'Pag-troubleshoot at Suporta'],
    ['Ani-Grow™ — Operational Manual', 'Ani-Grow™ — Gabay sa Operasyon'],
    ['Page 1 of 5', 'Pahina 1 ng 5'],
    ['Page 2 of 5', 'Pahina 2 ng 5'],
    ['Page 3 of 5', 'Pahina 3 ng 5'],
    ['Page 4 of 5', 'Pahina 4 ng 5'],
    ['Page 5 of 5', 'Pahina 5 ng 5'],
    ['Page 2', 'Pahina 2'],
    ['Page 3', 'Pahina 3'],
    ['Page 4', 'Pahina 4'],
    ['Page 5', 'Pahina 5'],
    ['1.0 Hardware Device Registration', '1.0 Pagpaparehistro ng Hardware Device'],
    ['2.0 Wi-Fi Setup & Network Connection', '2.0 Pag-setup ng Wi-Fi at Koneksyon sa Network'],
    ['3.0 Automated Feed Scheduling for Poultry & Livestock (AniFeed)', '3.0 Awtomatikong Iskedyul ng Pagpapakain (AniFeed)'],
    ['4.0 Smart Poultry & Livestock Weighing (AniWeigh)', '4.0 Matalinong Pagtitimbang sa Manok at Baboy (AniWeigh)'],
    ['5.0 Troubleshooting & Support', '5.0 Pag-troubleshoot at Suporta'],
    ['Overview & Requirements', 'Pangkalahatang-ideya at mga Kinakailangan'],
    ['Step-by-step guide to pair and register new physical feeder and scale units', 'Hakbang-hakbang na gabay sa pagpares at pagrehistro ng mga bagong feeder at weighing scale'],
    ['Connect farm hardware to local 2.4 GHz Wi-Fi networks via the Mobile App', 'Ikonekta ang mga hardware sa lokal na 2.4 GHz Wi-Fi network gamit ang Mobile App'],
    ['Configure custom feeding times, portion weights, and dispense alarms', 'I-configure ang mga oras ng pagpapakain, sukat ng bahagi, at mga alerto sa pagdispensa'],
    ['Live weight sampling, tare calibration, and growth performance tracking', 'Live na pagtitimbang, pag-calibrate ng tare, at pagsubaybay sa paglaki ng alaga'],
    ['Registration Procedure', 'Pamamaraan sa Pagpaparehistro'],
    ['Equipment Type', 'Uri ng Kagamitan'],
    ['Sample Sticker Code', 'Halimbawang Sticker Code'],
    ['Device Function Description', 'Deskripsyon ng Gamit ng Device'],
    ['Automated feeding dispenser for poultry & livestock', 'Awtomatikong dispenser ng pagkain para sa manok at baboy'],
    ['Smart weighing platform scale for poultry & livestock', 'Matalinong timbangan para sa manok at baboy'],
    ['Network Requirements', 'Mga Kinakailangan sa Network'],
    ['Mobile Pairing Procedure', 'Pamamaraan sa Pagpares sa Mobile'],
    ['Configuring Feed Times & Portions', 'Pag-configure ng mga Oras at Sukat ng Pagpapakain'],
    ['Sample Feeding Schedule Configuration Table', 'Talaan ng Halimbawang Iskedyul ng Pagpapakain'],
    ['Animal Category', 'Kategorya ng Hayop'],
    ['Housing Location', 'Lokasyon ng Kulungan'],
    ['Daily Frequency', 'Dalas Bawat Araw'],
    ['Portion / Meal', 'Bahagi / Bawat Kain'],
    ['Scheduled Feeding Times', 'Mga Nakaiskedyul na Oras ng Pagkain'],
    ['Total Daily Feed', 'Kabuuang Pagkain Bawat Araw'],
    ['Broiler Chickens (Poultry)', 'Mga Broiler Chicken (Manok)'],
    ['Grower Pigs (Livestock)', 'Mga Grower Pig (Baboy)'],
    ['Breeding Sows (Livestock)', 'Mga Inahing Baboy (Breeding Sows)'],
    ['4 times daily', '4 na beses bawat araw'],
    ['3 times daily', '3 beses bawat araw'],
    ['2 times daily', '2 beses bawat araw'],
    ['times daily', 'beses bawat araw'],
    ['Performing a Live Weight Session', 'Pagsasagawa ng Sesyon ng Pagtitimbang'],
    ['Weight Classification & Performance Guidelines', 'Pag-uuri ng Timbang at mga Gabay sa Pagganap'],
    ['Weight Category', 'Kategorya ng Timbang'],
    ['Target Condition Rule', 'Patakaran sa Target na Kondisyon'],
    ['Poultry Setting (Chicken)', 'Setting sa Manok (Chicken)'],
    ['Livestock Setting (Pig)', 'Setting sa Baboy (Pig)'],
    ['Recommended Farm Action', 'Inirerekomendang Aksyon sa Sakahan'],
    ['Underweight', 'Kulang sa Timbang (Underweight)'],
    ['Normal', 'Normal / Malusog (Normal)'],
    ['Overweight', 'Sobra sa Timbang (Overweight)'],
    ['Below target minimum', 'Mababa sa pinakamababang target'],
    ['Within healthy range', 'Nasa loob ng malusog na agwat'],
    ['Above target maximum', 'Mataas sa pinakamataas na target'],
    ['Flag for extra feed & health check', 'Markahan para sa dagdag na pagkain at pagsusuri sa kalusugan'],
    ['Continue standard feeding & growth plan', 'Ipagpatuloy ang karaniwang pagpapakain at plano ng paglaki'],
    ['Adjust portion size for balanced growth', 'Ayusin ang sukat ng pagkain para sa balanseng paglaki'],
    ['Issue / Symptom', 'Problema / Sintomas'],
    ['Probable Cause', 'Malamang na Sanhi'],
    ['Recommended Resolution', 'Inirerekomendang Solusyon'],
    ['Feeder not dispensing at scheduled time', 'Hindi naglalabas ng pagkain ang feeder sa takdang oras'],
    ['Scale readings are erratic or fluctuating', 'Pabagobago o hindi matatag ang basa ng timbangan'],
    ['Device shows Offline in app', 'Nakalagay na Offline ang device sa app'],
    ['Download PDF Manual', 'I-download ang PDF'],
    ['Print / Save PDF', 'I-print / I-save ang PDF'],
];

/**
 * Returns the User Manual HTML enriched with section anchor IDs, responsive card styles,
 * and language translation for in-app WebView / iframe rendering.
 */
export function getManualHtmlWithAnchors(language: string = 'en'): string {
    if (!USER_MANUAL_HTML || !USER_MANUAL_HTML.trim()) {
        return '';
    }
    const isFilipino = language === 'fil';
    if (isFilipino && cachedHtmlFil) return cachedHtmlFil;
    if (!isFilipino && cachedHtmlEn) return cachedHtmlEn;

    let html: string = USER_MANUAL_HTML;

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

    // If Filipino language is active, apply translation dictionary
    if (isFilipino) {
        FILIPINO_MANUAL_DICTIONARY.forEach(([en, fil]) => {
            html = html.split(en).join(fil);
        });
    }

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
    if (isFilipino) {
        cachedHtmlFil = html;
        return cachedHtmlFil;
    } else {
        cachedHtmlEn = html;
        return cachedHtmlEn;
    }
}

/**
 * Opens the Ani-Grow Official User Manual outside the app or shares it as a PDF.
 * - On Web: Opens directly in a new browser tab with full HTML/CSS formatting.
 * - On Mobile (iOS/Android): Compiles the manual to an official PDF and opens it
 *   via the native system viewer / sharing handler.
 */
export async function openUserManual(language: string = 'en'): Promise<boolean> {
    try {
        const manualHtml = getManualHtmlWithAnchors(language);
        if (!manualHtml) {
            Alert.alert(
                language === 'fil' ? 'Paalala' : 'Notice',
                language === 'fil' ? 'Kasalukuyang walang nakaimbak na gabay sa paggamit.' : 'No user manual is currently available.'
            );
            return false;
        }
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.open();
                    newTab.document.write(manualHtml);
                    newTab.document.close();
                    return true;
                }
            }
            return false;
        }

        // On Native (Android / iOS)
        const { uri } = await Print.printToFileAsync({
            html: manualHtml,
            base64: false,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: language === 'fil' ? 'Ani-Grow Opisyal na Gabay sa Paggamit' : 'Ani-Grow Official User Manual',
                UTI: 'com.adobe.pdf',
            });
            return true;
        } else {
            Alert.alert(
                language === 'fil' ? 'Na-save ang User Manual' : 'User Manual Saved',
                language === 'fil' ? `Matagumpay na na-save ang PDF sa:\n${uri}` : `PDF saved successfully at:\n${uri}`
            );
            return true;
        }
    } catch (error) {
        console.error('[userManual] Failed to open manual:', error);
        Alert.alert(
            language === 'fil' ? 'Error' : 'Error',
            language === 'fil' ? 'Hindi mabuksan ang User Manual. Pakisubukan muli.' : 'Unable to export User Manual. Please try again.'
        );
        return false;
    }
}
