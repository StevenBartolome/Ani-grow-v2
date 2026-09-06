// Shared "formal report" PDF generation, used by every report screen's Print
// button: GrowthReportScreen, PredictionReportScreen, HealthReportScreen,
// FeedReportScreen, SessionReportScreen, WeighingSessionsScreen.
//
// Uses expo-print (official Expo SDK module — bundled in Expo Go, no custom
// dev client needed, unlike most native modules this project has avoided)
// to render a formal HTML report to a real PDF file, then hands it to the
// native share/print sheet via expo-sharing so the user can save, print, or
// send it anywhere. On web, expo-print's printToFileAsync isn't supported,
// so we fall back to the browser's own print dialog, which itself offers
// "Save as PDF" — nothing breaks either way.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface ReportMetaRow {
    label: string;
    value: string;
}

export interface ReportStat {
    label: string;
    value: string;
    accent?: 'good' | 'warn' | 'bad';
}

export interface ReportTable {
    heading?: string;
    headers: string[];
    rows: (string | number)[][];
    note?: string;
}

export interface ReportSection {
    heading: string;
    stats?: ReportStat[];      // rendered as a stat grid
    table?: ReportTable;       // rendered as a formal striped data table
    paragraphs?: string[];     // rendered as body paragraphs
    bullets?: string[];        // rendered as a bullet list
}

export interface ReportDocument {
    reportTitle: string;          // e.g. "Growth Report"
    farmName: string;
    subtitle?: string;            // e.g. "Batch 3 · House A · Pigs"
    meta: ReportMetaRow[];        // key facts block under the letterhead
    sections: ReportSection[];
    generatedByName?: string;
}

function escapeHtml(s: string | number): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMeta(meta: ReportMetaRow[]): string {
    if (meta.length === 0) return '';
    const rows = meta.map(m => `
        <tr>
            <td class="label">${escapeHtml(m.label)}</td>
            <td>${escapeHtml(m.value)}</td>
        </tr>`).join('');
    return `<table class="meta"><tbody>${rows}</tbody></table>`;
}

function renderStats(stats: ReportStat[]): string {
    const boxes = stats.map(s => `
        <div class="stat-box${s.accent ? ' ' + s.accent : ''}">
            <div class="label">${escapeHtml(s.label)}</div>
            <div class="value">${escapeHtml(s.value)}</div>
        </div>`).join('');
    return `<div class="stat-grid">${boxes}</div>`;
}

function renderTable(table: ReportTable): string {
    const head = `<tr>${table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
    const body = table.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    return `
        ${table.heading ? `<div class="table-heading">${escapeHtml(table.heading)}</div>` : ''}
        <table class="data"><thead>${head}</thead><tbody>${body}</tbody></table>
        ${table.note ? `<div class="table-note">${escapeHtml(table.note)}</div>` : ''}`;
}

function renderSection(section: ReportSection): string {
    const parts: string[] = [`<h2>${escapeHtml(section.heading)}</h2>`];
    if (section.stats && section.stats.length > 0) parts.push(renderStats(section.stats));
    if (section.paragraphs) parts.push(...section.paragraphs.map(p => `<p class="body-text">${escapeHtml(p)}</p>`));
    if (section.bullets && section.bullets.length > 0) {
        parts.push(`<ul class="bullets">${section.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`);
    }
    if (section.table) parts.push(renderTable(section.table));
    return `<div class="section">${parts.join('')}</div>`;
}

export function buildReportHtml(doc: ReportDocument): string {
    const generatedAt = new Date().toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const reportId = `${Date.now().toString(36).toUpperCase()}`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
    @page { size: A4; margin: 20mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.5; margin: 0; padding: 0; }
    .letterhead { border-bottom: 3px solid #1B7A43; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .letterhead .brand { font-size: 20px; font-weight: 700; color: #1B7A43; letter-spacing: 0.3px; }
    .letterhead .brand small { display: block; font-size: 9.5px; font-weight: 400; color: #666; letter-spacing: 1px; text-transform: uppercase; margin-top: 3px; }
    .letterhead .doc-id { text-align: right; font-size: 9.5px; color: #777; line-height: 1.6; }
    h1.report-title { font-size: 21px; margin: 0 0 4px 0; color: #111; }
    .subtitle { font-size: 13px; color: #555; margin-bottom: 16px; }
    table.meta { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
    table.meta td { padding: 6px 10px; border: 1px solid #e2e2e2; font-size: 11px; }
    table.meta td.label { background: #F4F7F5; font-weight: 600; width: 32%; color: #333; }
    .section { margin-bottom: 22px; page-break-inside: avoid; }
    .section h2 { font-size: 13px; color: #1B7A43; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
    .stat-box { flex: 1 1 21%; border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px; background: #FAFBFA; }
    .stat-box .label { font-size: 8.5px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-box .value { font-size: 16px; font-weight: 700; color: #111; margin-top: 2px; }
    .stat-box.good .value { color: #1B7A43; }
    .stat-box.warn .value { color: #B8860B; }
    .stat-box.bad  .value { color: #C0392B; }
    .table-heading { font-size: 11px; font-weight: 600; color: #333; margin: 10px 0 6px 0; }
    table.data { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
    table.data th { background: #1B7A43; color: #fff; text-align: left; padding: 6px 8px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    table.data td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    table.data tr:nth-child(even) td { background: #F7F9F7; }
    .table-note { font-size: 9px; color: #888; margin-top: 4px; font-style: italic; }
    p.body-text { font-size: 11px; color: #333; margin: 0 0 8px 0; }
    ul.bullets { margin: 0 0 8px 18px; padding: 0; font-size: 11px; color: #333; }
    ul.bullets li { margin-bottom: 4px; }
    .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 8.5px; color: #999; display: flex; justify-content: space-between; }
</style>
</head>
<body>
    <div class="letterhead">
        <div class="brand">${escapeHtml(doc.farmName || 'AniGrow Farm')}<small>AniGrow Farm Management System</small></div>
        <div class="doc-id">Report ID: ${reportId}<br/>Generated: ${escapeHtml(generatedAt)}</div>
    </div>
    <h1 class="report-title">${escapeHtml(doc.reportTitle)}</h1>
    ${doc.subtitle ? `<div class="subtitle">${escapeHtml(doc.subtitle)}</div>` : ''}
    ${renderMeta(doc.meta)}
    ${doc.sections.map(renderSection).join('')}
    <div class="footer">
        <span>Generated by ${escapeHtml(doc.generatedByName || 'AniGrow')} on ${escapeHtml(generatedAt)}</span>
        <span>System-generated report — AniGrow Farm Management</span>
    </div>
</body>
</html>`;
}

export interface ExportResult {
    ok: boolean;
    error?: string;
}

export async function exportReportPdf(doc: ReportDocument): Promise<ExportResult> {
    try {
        const html = buildReportHtml(doc);

        if (Platform.OS === 'web') {
            // expo-print's printToFileAsync isn't supported on web; the browser's
            // own print dialog already offers "Save as PDF", so use that directly.
            await Print.printAsync({ html });
            return { ok: true };
        }

        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: doc.reportTitle,
                UTI: 'com.adobe.pdf',
            });
        } else {
            // No share sheet on this device — fall back to the native print
            // dialog, which still lets the user save/print the same PDF.
            await Print.printAsync({ uri });
        }
        return { ok: true };
    } catch (err: any) {
        console.error('[pdfReport] export error:', err);
        return { ok: false, error: err?.message || 'Failed to generate the PDF. Please try again.' };
    }
}
