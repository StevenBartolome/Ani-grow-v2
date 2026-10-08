// Shared "formal report" PDF generation, used by every report screen's Print
// button: GrowthReportScreen, PredictionReportScreen, HealthReportScreen,
// FeedReportScreen, SessionReportScreen, WeighingSessionsScreen.
//
// Formal Word-document styling:
// - Crisp black & grayscale color palette (no ink-heavy web tints)
// - Prominent Farm Name in header
// - Formal Arial typography throughout
// - Vector AniGrow logo embedded in letterhead
// - Print-friendly A4 layout with clean black borders
// - Interactive section customization & embedded vector charts
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
    benchmark?: string;
}

export interface ReportTable {
    heading?: string;
    headers: string[];
    rows: (string | number)[][];
    note?: string;
    columnAlignments?: ('left' | 'center' | 'right')[];
}

export interface ReportChartSeries {
    name: string;
    color?: string;
    data: number[];
}

export interface ReportChart {
    type: 'line' | 'bar';
    title?: string;
    labels: string[];
    series: ReportChartSeries[];
    yAxisLabel?: string;
    unit?: string;
    height?: number;
}

export interface ReportSection {
    id?: string;
    heading: string;
    stats?: ReportStat[];
    table?: ReportTable;
    chart?: ReportChart;
    paragraphs?: string[];
    bullets?: string[];
    isChartSection?: boolean;
}

export interface ReportSignature {
    title: string;
    name?: string;
    role?: string;
    date?: string;
}

export interface ReportDocument {
    reportTitle: string;
    farmName: string;
    subtitle?: string;
    documentRef?: string;
    meta: ReportMetaRow[];
    summaryText?: string;
    sections: ReportSection[];
    charts?: ReportChart[];
    signatures?: ReportSignature[];
    generatedByName?: string;
    generatedByRole?: string;
}

export function formatReportUserRole(role?: string | null): string {
    if (!role) return 'Farm Staff';
    const roleMap: Record<string, string> = {
        super_admin: 'Super Admin',
        farm_admin: 'Farm Admin',
        admin: 'Admin',
        caretaker: 'Caretaker',
        veterinarian: 'Veterinarian',
        flockman: 'Flockman',
        manager: 'Farm Manager',
        worker: 'Farm Worker',
        employee: 'Employee',
    };
    const key = role.toLowerCase().trim();
    if (roleMap[key]) return roleMap[key];
    return role
        .replace(/_/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

export function formatReportUserName(profile?: any): string {
    if (!profile) return 'Authorized User';
    const first = profile.firstName || profile.first_name || '';
    const last = profile.lastName || profile.last_name || '';
    const full = `${first} ${last}`.trim();
    if (full) return full;
    return profile.displayName || profile.display_name || profile.name || (profile.email ? profile.email.split('@')[0] : 'Authorized User');
}

export interface ReportExportOptions {
    includeMeta?: boolean;
    includeSummary?: boolean;
    includeCharts?: boolean;
    includeSignatures?: boolean;
    selectedSectionHeadings?: string[];
}

const ANIGROW_LOGO_SVG = `<svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="58" height="58" style="display: block; width: 58px; height: 58px;">
    <g id="Layer 1">
        <path fill-rule="evenodd" fill="#16492a" d="m539.7 1063.8c-297.82 0-538.55-233.93-538.55-523.33 0-289.4 240.73-523.33 538.55-523.33 297.82 0 538.55 233.93 538.55 523.33 0 289.4-240.73 523.33-538.55 523.33z"/>
        <path fill-rule="evenodd" fill="#ffe6a4" d="m539.09 1021.21c-273.89 0-495.28-215.14-495.28-481.29 0-266.15 221.39-481.28 495.28-481.28 273.89 0 495.28 215.13 495.28 481.28 0 266.15-221.39 481.29-495.28 481.29z"/>
        <path fill-rule="evenodd" fill="#87a93d" d="m78.35 717.7c129.98 3.24 215.69 19.05 394.87 13.64 218.75-6.59 228.65-21.98 422.12-16.48 45.62 1.29 79.86-0.69 93.58 4.21 6.12 2.19 14.8-10.75 7.2 6.89-74.74 173.56-251.04 295.25-457.03 295.25-220.68 0-407.27-139.66-471.45-333.13"/>
        <path fill-rule="evenodd" fill="#feae1a" d="m527.22 718.06c-53.31-15.81-28.57-167.6-123.47-26.12-76.44 113.96-235.18-88.1-235.18-231.32 0-199.35 165.82-360.48 370.96-360.48 205.14 0 370.96 161.13 370.96 360.48 0 140.69-115.34 165.97-236.06 225.38-50.33 24.77-89.34 49.22-147.21 32.06z"/>
        <path fill-rule="evenodd" fill="#ffe6a5" d="m967.18 418.31l-4.51 309.54-76.19-9.74-164.05-3.49-219.03 22.69-354.28-27.92-37.3-291.08z"/>
        <path fill-rule="evenodd" fill="#ffe6a4" d="m220.84 265.95l294.94 8.91-323.88 19.66z"/>
        <path fill-rule="evenodd" fill="#ffe6a4" d="m179.29 368.35l223.34 7.05-237.81 14.83z"/>
        <path fill-rule="evenodd" fill="#ffe6a4" d="m534.33 316.78l372.1-10.02-2.23 31.17z"/>
        <path fill-rule="evenodd" fill="#154928" stroke="#09371a" stroke-miterlimit="10" d="m245.67 702.83c0 0 3.53-24.87-15.21-34.33-18.75-9.47-34.89-17.26-39.9-33.97-5.02-16.7-5.9-22.1-12.12-25.81-6.22-3.71-6.87-6.5-6.13-8.63 0.74-2.14-2.14-3.44-4.09-7.34-1.95-3.9-1.85-9.84-1.3-12.81 0.56-2.97-1.48-7.99-1.94-14.21-0.47-6.22 5.29-8.54 5.29-8.54 0 0-7.99-2.13-7.15-6.96 0.83-4.83 8.63-5.94 8.63-5.94 0 0-3.53-2.97-2.78-6.41 0.74-3.43 6.87-4.55 6.87-4.55 0 0-6.97-5.47-3.99-9.84 2.97-4.36 11.23-6.03 21.63-0.18 10.39 5.85 11.6 12.62 11.6 12.62 0 0 1.12 7.52 4.18 8.82 3.06 1.3 11.42 11.61 15.13 15.6 3.72 3.99 6.97 4.92 6.97 4.92 0 0 24.49 0.67 37.45-3.55 12.96-4.23 33.01-15.97 36.15-21.22 3.13-5.25 2.59-11.8 4.5-28.71 1.91-16.92 12.82-26.74 22.1-33.56 9.27-6.82 12.55-8.09 12.39-14.45-0.16-6.37 2.39-8.76 5.17-9.32 2.79-0.55 2.31 5.66 2.31 5.66 0 0-1.51 3.02 0.88 4.69 2.38 1.67 5.75 3.71 6.79-0.73 1.04-4.43-1.89-7.36 2.27-9.06 4.15-1.7 8.2 1.14 6.32 3.78-1.89 2.64 0.09 3.21 2.55 3.21 2.45 0 9.61 3.53 9.04 5.64-0.57 2.1-3.72 1.78-2.83 3.23 0.89 1.46 2.91 0.81 2.59 2.83-0.33 2.03-6.8 2.51-9.31 1.54-2.51-0.97 15.62 4.73 23.98 16.1 9.55 12.98 3.09 4.59-20.14 5.12-12.56 0.28-5.07 1.4-1.21 9.73 2.27 4.88 4.48 7.99 2.2 10.71-2.28 2.73-15.29 2.38-17.04 0.36-1.76-2.03 23.61 45.13 19.4 74.63-4.22 29.49-36.12 58.39-54.78 65.01-18.66 6.62-33.71 25.89-19.27 47.26 14.45 21.37-18.36 0.6-18.36 0.6l-2.1-12.94c0 0-7.23-15.66-11.44-14.45-4.22 1.2-7.83 3.91-7.53 12.94 0.3 9.03-0.9 16.86-0.9 16.86z"/>
        <path fill-rule="evenodd" fill="#154928" stroke="#09371a" stroke-miterlimit="10" d="m681.99 707.06c0 0 2.83-58.97 3.92-67.68 1.08-8.7 1.08-12.62 1.08-12.62 0 0 57.24 13.27 81.18 9.57 23.93-3.7 47.22-7.83 47.22-7.83 0 0 17.41 18.72 16.1 33.08-1.3 14.36-18.06 42.43-18.06 42.43l26.11 0.87c0 0 5.66-13.49 12.19-22.63 6.53-9.14 9.79-13.27 8.05-20.24-1.74-6.96-2.39-14.14-2.39-14.14 0 0 5.22 3.48 11.32 7.83 6.09 4.35 14.36 15.45 13.92 25.68-0.43 10.23-1.96 25.9-1.96 25.9l22.42 1.3 2.39-41.34c0 0-1.3-3.49 0.22-5.88 1.52-2.39 9.79-12.62 4.13-19.59-5.65-6.96-11.75-15.88-7.18-21.54 4.57-5.66 21.43-32.15 25.49-57.02 4.06-24.88 0.76-40.36 0.76-40.36 0 0 11.24-3.73 19.45 5.26 8.21 8.99 2.51 29.29-10.11 30.94-12.62 1.64 5.62 3.28 8.99 2.68 3.37-0.61 16.84-6.15 13.67-22.14-3.18-15.99-21.28-21.16-21.28-21.16 0 0-10.47-1.77-12.7-1.77-2.23 0-1.29-6.46-4.82-12.58-3.53-6.11-0.57-42.85-168.44-37.1-167.87 5.76-161.13 9.96-171.29 7.93-10.16-2.03-15.87-3.93-18.66-7.62-2.8-3.68-3.27-6.35-7.93-8.77-4.67-2.41-2.07 7.26-5.01 6.57-2.94-0.69-14.86-2.59-20.73-5.88-5.87-3.28-16.76-6.73-15.38-0.86 1.39 5.87 6.4 9.68 6.4 9.68 0 0-7.43-3.63-5.88 2.93 1.56 6.57 8.29 16.24 10.37 16.93 2.07 0.69 5.53 6.91 3.97 9.5-1.55 2.59-14.16 9.33-17.45 13.33-3.3 3.99-37.84 29.61-45.36 30.78-7.53 1.18-5.41 7.99-3.3 11.76 2.12 3.76 3.06 18.8 14.58 24.67 11.51 5.88 50.36 20.69 71.08 23.45 20.72 2.76 29.7 0.69 43.17 7.25 13.47 6.56 28.17 6.44 23 44.04-5.17 37.61-11.51 61.34-11.51 61.34l24.44-1.64 25.62-65.34c0 0 7.52 37.61 6.34 50.53-1.17 12.93-0.23 17.39-0.23 17.39z"/>
        <path fill-rule="evenodd" fill="#154928" d="m71.01 706.65c0 0 386.37-61.6 610.75 95.08 224.37 156.68 165.8 136.9 165.8 136.9l-95.83 50.2-7.09-3.15c0 0-89.07-104.43-180.32-153.19-91.24-48.76-180.4-91.25-302.99-98.91-122.59-7.66-183.89 3.48-183.89 3.48z"/>
        <path fill-rule="evenodd" fill="#154928" d="m594.89 1024.87c0 0-139.75-196.78-338.59-236.55-198.83-39.76-175.74-28.86-175.74-28.86l33.99 31.43c0 0 54.52-1.92 168.05 57.09 113.53 59 168.05 185.36 168.05 185.36l148.16-5.13z"/>
        <path fill-rule="evenodd" fill="#154928" d="m1007.26 713.76l-14.65 31.24c0 0-302.64-37.84-435.59 3.65-132.95 41.49-62.7-24.98-62.7-24.98 0 0 1.41-3.78 50.91-10.38 49.51-6.6 195.66-18.85 276.75-13.67 81.09 5.19 185.28 14.14 185.28 14.14z"/>
    </g>
</svg>`;

function escapeHtml(s: string | number | undefined | null): string {
    if (s === undefined || s === null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMeta(meta: ReportMetaRow[]): string {
    if (meta.length === 0) return '';
    const rows: string[] = [];
    for (let i = 0; i < meta.length; i += 2) {
        const m1 = meta[i];
        const m2 = meta[i + 1];
        if (m2) {
            rows.push(`
                <tr>
                    <td class="meta-label">${escapeHtml(m1.label)}:</td>
                    <td class="meta-value">${escapeHtml(m1.value)}</td>
                    <td class="meta-label">${escapeHtml(m2.label)}:</td>
                    <td class="meta-value">${escapeHtml(m2.value)}</td>
                </tr>`);
        } else {
            rows.push(`
                <tr>
                    <td class="meta-label">${escapeHtml(m1.label)}:</td>
                    <td class="meta-value" colspan="3">${escapeHtml(m1.value)}</td>
                </tr>`);
        }
    }
    return `
        <div class="meta-container">
            <div class="meta-heading">DOCUMENT &amp; FACILITY SPECIFICATIONS</div>
            <table class="meta-table"><tbody>${rows.join('')}</tbody></table>
        </div>`;
}

function renderStats(stats: ReportStat[]): string {
    if (!stats || stats.length === 0) return '';
    
    const rows: string[] = [];
    for (let i = 0; i < stats.length; i += 2) {
        const s1 = stats[i];
        const s2 = stats[i + 1];
        if (s2) {
            rows.push(`
                <tr>
                    <td class="stat-name">${escapeHtml(s1.label)}:</td>
                    <td class="stat-val">${escapeHtml(s1.value)}</td>
                    <td class="stat-name">${escapeHtml(s2.label)}:</td>
                    <td class="stat-val">${escapeHtml(s2.value)}</td>
                </tr>`);
        } else {
            rows.push(`
                <tr>
                    <td class="stat-name">${escapeHtml(s1.label)}:</td>
                    <td class="stat-val" colspan="3">${escapeHtml(s1.value)}</td>
                </tr>`);
        }
    }
    return `
        <table class="stat-table">
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>`;
}

function renderTable(table: ReportTable): string {
    const head = `<tr>${table.headers.map((h, idx) => {
        const align = table.columnAlignments?.[idx] || (idx === 0 ? 'left' : 'center');
        return `<th style="text-align: ${align};">${escapeHtml(h)}</th>`;
    }).join('')}</tr>`;

    const body = table.rows.map((row, rIdx) => {
        const cells = row.map((cell, cIdx) => {
            const align = table.columnAlignments?.[cIdx] || (cIdx === 0 ? 'left' : 'center');
            return `<td style="text-align: ${align};">${escapeHtml(cell)}</td>`;
        }).join('');
        return `<tr class="${rIdx % 2 === 1 ? 'even-row' : 'odd-row'}">${cells}</tr>`;
    }).join('');

    return `
        ${table.heading ? `<div class="table-heading">${escapeHtml(table.heading)}</div>` : ''}
        <table class="data-table">
            <thead>${head}</thead>
            <tbody>${body}</tbody>
        </table>
        ${table.note ? `<div class="table-note">${escapeHtml(table.note)}</div>` : ''}`;
}

export function renderChartSvg(chart: ReportChart): string {
    if (!chart || !chart.labels || chart.labels.length === 0 || !chart.series || chart.series.length === 0) {
        return '';
    }

    const svgWidth = 640;
    const svgHeight = chart.height || 210;
    const padLeft = 45;
    const padRight = 20;
    const padTop = chart.title ? 28 : 18;
    const padBottom = 34;

    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    // Determine min and max across all series data
    let allValues: number[] = [];
    chart.series.forEach(s => {
        allValues.push(...(s.data || []));
    });
    if (allValues.length === 0) allValues = [0];

    let minVal = Math.min(0, ...allValues);
    let maxVal = Math.max(...allValues);
    if (maxVal === minVal) {
        maxVal = minVal + 10;
    }
    // Add 12% headroom
    maxVal = maxVal > 0 ? maxVal * 1.12 : 10;

    // Grid ticks (4 intervals)
    const gridCount = 4;
    const gridLines: string[] = [];
    for (let i = 0; i <= gridCount; i++) {
        const val = minVal + (maxVal - minVal) * (i / gridCount);
        const y = padTop + plotHeight - (plotHeight * (i / gridCount));
        const formattedVal = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val % 1 === 0 ? val.toString() : val.toFixed(1);
        gridLines.push(`
            <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotWidth}" y2="${y}" stroke="#d1d5db" stroke-dasharray="${i === 0 ? 'none' : '3,3'}" stroke-width="${i === 0 ? '1.5' : '1'}" />
            <text x="${padLeft - 6}" y="${y + 3.5}" font-size="8" fill="#374151" text-anchor="end" font-family="Arial, sans-serif">${formattedVal}${chart.unit ? ' ' + chart.unit : ''}</text>
        `);
    }

    // X-axis step
    const xCount = chart.labels.length;
    const xLabels: string[] = [];
    const labelStep = Math.max(1, Math.ceil(xCount / 10));
    chart.labels.forEach((label, idx) => {
        if (idx % labelStep === 0 || idx === xCount - 1) {
            const x = padLeft + (xCount > 1 ? idx * (plotWidth / (xCount - 1)) : plotWidth / 2);
            xLabels.push(`
                <text x="${x}" y="${padTop + plotHeight + 16}" font-size="8" fill="#374151" text-anchor="middle" font-family="Arial, sans-serif">${escapeHtml(label)}</text>
            `);
        }
    });

    const defaultColors = ['#16492a', '#2980b9', '#e74c3c', '#e67e22', '#8e44ad', '#10b981'];
    let seriesSvg = '';

    if (chart.type === 'bar') {
        const barGroupWidth = plotWidth / xCount;
        const seriesCount = chart.series.length;
        const barWidth = Math.max(4, Math.min(24, (barGroupWidth * 0.7) / seriesCount));
        const groupInnerPad = (barGroupWidth - (barWidth * seriesCount)) / 2;

        chart.series.forEach((s, sIdx) => {
            const color = s.color || defaultColors[sIdx % defaultColors.length];
            (s.data || []).forEach((val, dIdx) => {
                if (dIdx >= xCount) return;
                const h = Math.max(2, ((val - minVal) / (maxVal - minVal)) * plotHeight);
                const x = padLeft + (dIdx * barGroupWidth) + groupInnerPad + (sIdx * barWidth);
                const y = padTop + plotHeight - h;
                const valLabel = val % 1 === 0 ? val.toString() : val.toFixed(1);

                seriesSvg += `
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="2" />
                    ${val > 0 && xCount <= 12 ? `<text x="${x + barWidth / 2}" y="${y - 4}" font-size="7.5" fill="#111827" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${valLabel}</text>` : ''}
                `;
            });
        });
    } else {
        // Line chart
        chart.series.forEach((s, sIdx) => {
            const color = s.color || defaultColors[sIdx % defaultColors.length];
            const points: { x: number; y: number; val: number }[] = [];

            (s.data || []).forEach((val, dIdx) => {
                if (dIdx >= xCount) return;
                const x = padLeft + (xCount > 1 ? dIdx * (plotWidth / (xCount - 1)) : plotWidth / 2);
                const y = padTop + plotHeight - (((val - minVal) / (maxVal - minVal)) * plotHeight);
                points.push({ x, y, val });
            });

            if (points.length > 0) {
                const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                seriesSvg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;

                // Data point dots
                points.forEach(p => {
                    const valLabel = p.val % 1 === 0 ? p.val.toString() : p.val.toFixed(1);
                    seriesSvg += `
                        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#ffffff" stroke="${color}" stroke-width="2" />
                        ${xCount <= 12 ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 6).toFixed(1)}" font-size="7.5" fill="#111827" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${valLabel}</text>` : ''}
                    `;
                });
            }
        });
    }

    // Legend
    let legendHtml = '';
    if (chart.series.length > 1 || (chart.series.length === 1 && chart.series[0].name)) {
        const legendItems = chart.series.map((s, idx) => {
            const color = s.color || defaultColors[idx % defaultColors.length];
            return `
                <div style="display:inline-flex; align-items:center; margin-right:14px; font-size:8pt; font-family:Arial, sans-serif; color:#000;">
                    <span style="display:inline-block; width:10px; height:10px; background-color:${color}; border-radius:2px; margin-right:4px;"></span>
                    <span>${escapeHtml(s.name)}</span>
                </div>
            `;
        }).join('');
        legendHtml = `<div style="text-align:right; margin-bottom:4px; margin-top:2px;">${legendItems}</div>`;
    }

    return `
        <div class="chart-container no-break" style="margin-top:10px; margin-bottom:12px; border:1pt solid #000; padding:10px; background-color:#fff;">
            ${chart.title ? `<div style="font-weight:bold; font-size:8.5pt; text-transform:uppercase; margin-bottom:4px; font-family:Arial, sans-serif; color:#000;">${escapeHtml(chart.title)}</div>` : ''}
            ${legendHtml}
            <div style="width:100%; overflow:hidden;">
                <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="${svgHeight}" style="display:block; width:100%; max-width:${svgWidth}px; margin:0 auto;">
                    ${gridLines.join('')}
                    ${seriesSvg}
                    ${xLabels.join('')}
                </svg>
            </div>
            ${chart.yAxisLabel ? `<div style="font-size:7.5pt; color:#6b7280; font-style:italic; text-align:left; margin-top:3px;">Vertical scale: ${escapeHtml(chart.yAxisLabel)}</div>` : ''}
        </div>
    `;
}

function renderSignatures(signatures?: ReportSignature[], generatedByName?: string, generatedByRole?: string): string {
    const defaultRole = generatedByRole ? formatReportUserRole(generatedByRole) : 'Farm Staff';
    const items = signatures && signatures.length > 0 ? signatures : [
        { title: 'PREPARED BY:', name: generatedByName || 'AUTHORIZED USER', role: defaultRole, date: 'Date: ________________________' },
        { title: 'REVIEWED & CERTIFIED BY:', name: '___________________________', role: 'Farm Manager / Supervising Veterinarian', date: 'Date: ________________________' }
    ];

    const cols = items.map(sig => `
        <td class="sig-column">
            <div class="sig-title">${escapeHtml(sig.title)}</div>
            <div class="sig-line"></div>
            <div class="sig-name">${escapeHtml(sig.name)}</div>
            <div class="sig-role">${escapeHtml(sig.role)}</div>
            <div class="sig-date">${escapeHtml(sig.date || 'Date: ________________________')}</div>
        </td>
    `).join('');

    return `
        <div class="authorization-section no-break">
            <div class="auth-heading">DOCUMENT AUTHORIZATION &amp; SIGN-OFF</div>
            <table class="sig-table">
                <tr>${cols}</tr>
            </table>
        </div>`;
}

function renderSection(section: ReportSection, index: number, options?: ReportExportOptions): string {
    const sectionNum = `${index + 1}.0`;
    const parts: string[] = [`<div class="section-title">${sectionNum} ${escapeHtml(section.heading.toUpperCase())}</div>`];
    
    if (section.paragraphs && section.paragraphs.length > 0) {
        parts.push(...section.paragraphs.map(p => `<p class="body-paragraph">${escapeHtml(p)}</p>`));
    }
    if (section.stats && section.stats.length > 0) {
        parts.push(renderStats(section.stats));
    }
    if (options?.includeCharts !== false && section.chart) {
        parts.push(renderChartSvg(section.chart));
    }
    if (section.bullets && section.bullets.length > 0) {
        parts.push(`<ul class="bullet-list">${section.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`);
    }
    if (section.table) {
        parts.push(renderTable(section.table));
    }
    return `<div class="report-section no-break">${parts.join('')}</div>`;
}

export function buildReportHtml(doc: ReportDocument, options?: ReportExportOptions): string {
    const now = new Date();
    const generatedAt = now.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
    }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const reportId = doc.documentRef || `ANIGROW-RPT-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const farmDisplayName = (doc.farmName || 'FARM OPERATIONS').trim().toUpperCase();

    // Filter sections if user specified custom selection
    let filteredSections = doc.sections || [];
    if (options?.selectedSectionHeadings && options.selectedSectionHeadings.length > 0) {
        filteredSections = filteredSections.filter(s => options.selectedSectionHeadings!.includes(s.heading));
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.reportTitle)}</title>
<style>
    /* ── Formal Word Document Print Layout: Pure Black Arial ─────────── */
    @page {
        size: A4 portrait;
        margin: 20mm 18mm 20mm 18mm;
    }
    
    * {
        box-sizing: border-box;
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    
    html {
        background-color: #f3f4f6;
    }

    body {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        color: #000000;
        font-size: 9.5pt;
        line-height: 1.45;
        margin: 20px auto;
        padding: 32px 36px 48px 36px;
        background-color: #ffffff;
        max-width: 820px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        border: 1px solid #e5e7eb;
    }

    @media print {
        html {
            background-color: #ffffff !important;
        }
        body {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
        }
    }
    
    /* ── Formal Letterhead Header with Logo & Prominent Farm Name ────── */
    .formal-letterhead {
        border-bottom: 2.5pt solid #000000;
        padding-bottom: 12px;
        margin-bottom: 14px;
    }
    
    .letterhead-table {
        width: 100%;
        border-collapse: collapse;
    }
    
    .logo-cell {
        width: 66px;
        vertical-align: middle;
        padding-right: 12px;
    }
    
    .letterhead-brand {
        vertical-align: middle;
        text-align: left;
    }
    
    .brand-eyebrow {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 8pt;
        font-weight: bold;
        color: #000000;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 2px;
    }

    .farm-title {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 18pt;
        font-weight: 800;
        color: #000000;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        line-height: 1.15;
        margin: 0 0 2px 0;
    }
    
    .system-sub {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 8.5pt;
        font-weight: 600;
        color: #000000;
        text-transform: uppercase;
        letter-spacing: 0.8px;
    }
    
    .letterhead-docinfo {
        vertical-align: middle;
        text-align: right;
        width: 36%;
    }
    
    .doc-control-box {
        display: inline-block;
        border: 1.5pt solid #000000;
        background-color: #ffffff;
        padding: 6px 10px;
        text-align: left;
        font-size: 8pt;
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
    }
    
    .doc-control-row {
        margin-bottom: 2px;
    }
    .doc-control-row:last-child {
        margin-bottom: 0;
    }
    .doc-control-lbl {
        font-weight: bold;
        color: #000000;
        display: inline-block;
        width: 86px;
    }
    .doc-control-val {
        color: #000000;
        font-weight: bold;
    }

    /* ── Document Title Block ────────────────────────────────────────── */
    .title-block {
        margin-bottom: 12px;
        text-align: left;
    }
    
    .report-main-title {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 14pt;
        font-weight: bold;
        color: #000000;
        margin: 0 0 3px 0;
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }
    
    .report-subtitle {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 9pt;
        color: #000000;
        font-weight: normal;
        margin-bottom: 4px;
    }

    /* ── Executive Summary Narrative ─────────────────────────────────── */
    .executive-summary-box {
        border: 1.5pt solid #000000;
        border-left: 5pt solid #000000;
        background-color: #ffffff;
        padding: 9px 12px;
        margin-bottom: 14px;
        font-size: 9pt;
        color: #000000;
        line-height: 1.45;
        text-align: justify;
    }

    /* ── Specifications Metadata Table ───────────────────────────────── */
    .meta-container {
        margin-bottom: 14px;
        page-break-inside: avoid;
    }
    
    .meta-heading {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 8.5pt;
        font-weight: bold;
        color: #000000;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 4px;
    }
    
    .meta-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
        border: 1.5pt solid #000000;
    }
    
    .meta-table td {
        padding: 5px 8px;
        border: 1pt solid #000000;
        color: #000000;
    }
    
    .meta-table td.meta-label {
        background-color: #ffffff;
        font-weight: bold;
        color: #000000;
        width: 22%;
        text-transform: uppercase;
        font-size: 8pt;
    }
    
    .meta-table td.meta-value {
        background-color: #ffffff;
        color: #000000;
        font-weight: normal;
        width: 28%;
    }

    /* ── Section Titles ──────────────────────────────────────────────── */
    .report-section {
        margin-bottom: 14px;
        page-break-inside: avoid;
    }
    
    .section-title {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 10.5pt;
        font-weight: bold;
        color: #000000;
        border-bottom: 1.5pt solid #000000;
        padding-bottom: 2px;
        margin-top: 14px;
        margin-bottom: 8px;
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }

    /* ── Formal Stat Table ───────────────────────────────────────────── */
    .stat-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
        margin-bottom: 8px;
        border: 1.5pt solid #000000;
    }
    
    .stat-table td {
        padding: 6px 8px;
        border: 0.75pt solid #000000;
        color: #000000;
    }
    
    .stat-table td.stat-name {
        font-weight: bold;
        width: 24%;
        background-color: #ffffff;
        font-size: 8pt;
        text-transform: uppercase;
    }
    
    .stat-table td.stat-val {
        font-weight: bold;
        width: 26%;
        background-color: #ffffff;
        font-size: 9.5pt;
    }

    /* ── Formal Data Table ───────────────────────────────────────────── */
    .table-heading {
        font-weight: bold;
        font-size: 8.5pt;
        text-transform: uppercase;
        margin-bottom: 4px;
        color: #000000;
    }
    
    .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
        margin-bottom: 4px;
        border: 1.5pt solid #000000;
    }
    
    .data-table th {
        background-color: #000000;
        color: #ffffff;
        font-weight: bold;
        padding: 5px 6px;
        border: 1pt solid #000000;
        text-transform: uppercase;
        font-size: 7.5pt;
        letter-spacing: 0.3px;
    }
    
    .data-table td {
        padding: 5px 7px;
        border: 0.75pt solid #000000;
        color: #000000;
        background-color: #ffffff;
    }
    
    .data-table tr.even-row td {
        background-color: #ffffff;
    }
    
    .data-table tr.odd-row td {
        background-color: #ffffff;
    }
    
    .table-note {
        font-size: 7.5pt;
        color: #000000;
        font-style: italic;
        margin-top: 3px;
    }

    /* ── Text Content ────────────────────────────────────────────────── */
    p.body-paragraph {
        font-size: 8.5pt;
        color: #000000;
        margin: 0 0 5px 0;
        line-height: 1.45;
        text-align: justify;
    }
    
    ul.bullet-list {
        margin: 0 0 6px 18px;
        padding: 0;
        font-size: 8.5pt;
        color: #000000;
    }
    
    ul.bullet-list li {
        margin-bottom: 3px;
        line-height: 1.4;
    }

    /* ── Authorization & Signatures Block ────────────────────────────── */
    .authorization-section {
        margin-top: 22px;
        padding-top: 10px;
        border-top: 2pt solid #000000;
        page-break-inside: avoid;
    }
    
    .auth-heading {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 8pt;
        font-weight: bold;
        color: #000000;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 24px;
    }
    
    .sig-table {
        width: 100%;
        border-collapse: collapse;
    }
    
    .sig-column {
        width: 50%;
        vertical-align: top;
        padding-right: 28px;
    }
    .sig-column:last-child {
        padding-right: 0;
        padding-left: 28px;
    }
    
    .sig-title {
        font-size: 8pt;
        font-weight: bold;
        color: #000000;
        margin-bottom: 30px;
        text-transform: uppercase;
    }
    
    .sig-line {
        border-top: 1.5pt solid #000000;
        width: 100%;
        margin-bottom: 5px;
    }
    
    .sig-name {
        font-size: 8.5pt;
        font-weight: bold;
        color: #000000;
    }
    
    .sig-role {
        font-size: 8pt;
        color: #000000;
        margin-bottom: 3px;
    }
    
    .sig-date {
        font-size: 8pt;
        color: #000000;
    }

    /* ── Document Footer ─────────────────────────────────────────────── */
    .formal-footer {
        margin-top: 18px;
        padding-top: 6px;
        border-top: 1.5pt solid #000000;
        font-size: 7.5pt;
        color: #000000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
    }

    .no-break {
        page-break-inside: avoid;
    }
</style>
</head>
<body>
    <!-- Formal Document Letterhead with Logo & Farm Name -->
    <div class="formal-letterhead">
        <table class="letterhead-table">
            <tr>
                <td class="logo-cell">
                    ${ANIGROW_LOGO_SVG}
                </td>
                <td class="letterhead-brand">
                    <div class="brand-eyebrow">ANIGROW LIVESTOCK SYSTEMS</div>
                    <div class="farm-title">${escapeHtml(farmDisplayName)}</div>
                    <div class="system-sub">Official Biometric Records &amp; Performance Audit</div>
                </td>
                <td class="letterhead-docinfo">
                    <div class="doc-control-box">
                        <div class="doc-control-row"><span class="doc-control-lbl">Document Ref:</span> <span class="doc-control-val">${escapeHtml(reportId)}</span></div>
                        <div class="doc-control-row"><span class="doc-control-lbl">Date Issued:</span> <span class="doc-control-val">${escapeHtml(now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }))}</span></div>
                        <div class="doc-control-row"><span class="doc-control-lbl">Classification:</span> <span class="doc-control-val">OFFICIAL AUDIT</span></div>
                    </div>
                </td>
            </tr>
        </table>
    </div>

    <!-- Title Block -->
    <div class="title-block">
        <h1 class="report-main-title">${escapeHtml(doc.reportTitle)}</h1>
        ${doc.subtitle ? `<div class="report-subtitle">${escapeHtml(doc.subtitle)}</div>` : ''}
    </div>

    <!-- Executive Summary Narrative -->
    ${options?.includeSummary !== false && doc.summaryText ? `<div class="executive-summary-box">${escapeHtml(doc.summaryText)}</div>` : ''}

    <!-- Specifications Table -->
    ${options?.includeMeta !== false ? renderMeta(doc.meta) : ''}

    <!-- Standalone Document Level Charts (if any) -->
    ${options?.includeCharts !== false && doc.charts && doc.charts.length > 0 ? doc.charts.map(c => renderChartSvg(c)).join('') : ''}

    <!-- Formal Sections -->
    ${filteredSections.map((section, idx) => renderSection(section, idx, options)).join('')}

    <!-- Document Authorization Sign-off -->
    ${options?.includeSignatures !== false ? renderSignatures(doc.signatures, doc.generatedByName, doc.generatedByRole) : ''}

    <!-- Formal Footer -->
    <div class="formal-footer">
        <span>Confidential &amp; Official Audit Document — AniGrow Livestock Management System</span>
        <span>Generated: ${escapeHtml(generatedAt)}</span>
    </div>
</body>
</html>`;
}

export interface ExportResult {
    ok: boolean;
    error?: string;
}

export async function exportReportPdf(doc: ReportDocument, options?: ReportExportOptions): Promise<ExportResult> {
    try {
        const html = buildReportHtml(doc, options);

        if (Platform.OS === 'web') {
            try {
                // Use a hidden iframe to isolate the formal report HTML and trigger
                // printing of the document rather than the active browser app screen.
                const iframe = document.createElement('iframe');
                iframe.setAttribute('style', 'visibility:hidden; height:0; width:0; position:absolute; left:-9999px; border:0;');
                document.body.appendChild(iframe);

                const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
                if (!iframeDoc) {
                    throw new Error('Unable to access iframe document');
                }

                iframeDoc.open();
                iframeDoc.write(html);
                iframeDoc.close();

                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        try {
                            iframe.contentWindow?.focus();
                            iframe.contentWindow?.print();
                        } catch (e) {
                            console.error('[pdfReport] iframe print error:', e);
                        }
                        setTimeout(() => {
                            try {
                                if (document.body.contains(iframe)) {
                                    document.body.removeChild(iframe);
                                }
                            } catch (_) {}
                            resolve();
                        }, 1500);
                    }, 400);
                });

                return { ok: true };
            } catch (webErr) {
                console.warn('[pdfReport] iframe print fallback to new window:', webErr);
                const printWin = window.open('', '_blank');
                if (printWin) {
                    printWin.document.open();
                    printWin.document.write(html);
                    printWin.document.close();
                    printWin.focus();
                    setTimeout(() => {
                        printWin.print();
                    }, 400);
                    return { ok: true };
                }
                return { ok: false, error: 'Could not open print dialog.' };
            }
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
            await Print.printAsync({ uri });
        }
        return { ok: true };
    } catch (err: any) {
        console.error('[pdfReport] export error:', err);
        return { ok: false, error: err?.message || 'Failed to generate the PDF. Please try again.' };
    }
}
