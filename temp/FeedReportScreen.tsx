import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AdminSidebar from '../../../components/AdminSidebar';
import MobileHeader from '../../../components/MobileHeader';
import { AIInsightCard } from '../../../components/AIInsightCard';
import { useTheme } from '../../../context/ThemeContext';
import { useDashboardStyles } from '../../../styles/dashboardStyles';
import { supabase } from '../../../lib/supabase';
import ExportReportButton from '../../../components/ExportReportButton';
import type { ExportReportData } from '../../../utils/reportExport';

interface Props {
    onNavigate: (screen: any, params?: any) => void;
    params?: any;
}

interface HousingInfo {
    id: string;
    name: string;
    animal_type: string;
    status: string;
    current_count: number;
}

interface BatchInfo {
    id: string;
    name: string;
    estimated_count: number;
    current_count: number;
    arrival_date: string;
    age_at_arrival_days: number;
    status: string;
    housing_id: string;
}

interface FeedItemBreakdown {
    feedId: string;
    category: string;
    feedName: string;
    brand: string;
    consumption: number; // in kg (dispensed)
    stockKg: number;
    percentage: number;
}

export interface PeriodOption {
    id: string; // 'current_month' | 'this_week' | 'YYYY-MM'
    label: string;
    shortLabel: string;
    isCurrentMonth: boolean;
    isWeek: boolean;
    year: number;
    month: number;
    daysInMonth: number;
    startDate: Date;
    endDate: Date;
}

function getPeriodOptions(availablePastMonths: string[] = []): PeriodOption[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // 1. Current Month (Priority)
    const curStart = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const curEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    const curDays = curEnd.getDate();
    const curMonthName = curStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const curMonthShort = curStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // 2. This Week
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);

    const options: PeriodOption[] = [
        {
            id: 'current_month',
            label: `Current Month (${curMonthName})`,
            shortLabel: `${curMonthShort} (Current)`,
            isCurrentMonth: true,
            isWeek: false,
            year: currentYear,
            month: currentMonth,
            daysInMonth: curDays,
            startDate: curStart,
            endDate: now < curEnd ? now : curEnd,
        },
        {
            id: 'this_week',
            label: 'This Week (Last 7 Days)',
            shortLabel: 'This Week',
            isCurrentMonth: false,
            isWeek: true,
            year: currentYear,
            month: currentMonth,
            daysInMonth: 7,
            startDate: weekStart,
            endDate: weekEnd,
        },
    ];

    // 3. Only Previous Months that have records
    availablePastMonths.forEach(ym => {
        const [yearStr, monthStr] = ym.split('-');
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10) - 1; // 0-indexed
        if (isNaN(y) || isNaN(m)) return;

        const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
        const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
        const mDays = monthEnd.getDate();
        const mName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const mShort = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        options.push({
            id: ym,
            label: mName,
            shortLabel: mShort,
            isCurrentMonth: false,
            isWeek: false,
            year: y,
            month: m,
            daysInMonth: mDays,
            startDate: monthStart,
            endDate: monthEnd,
        });
    });

    return options;
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────

function SVGLineChart({ data, height = 220, yAxisSuffix = '', surfaceColor, textColor, lineColor }: {
    data: { labels: string[]; datasets: { data: number[]; strokeWidth?: number }[] } | null;
    height?: number;
    yAxisSuffix?: string;
    surfaceColor: string;
    textColor: string;
    lineColor: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(320);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => { for (const e of entries) setContainerWidth(e.contentRect.width); });
        ro.observe(containerRef.current);
        setContainerWidth(containerRef.current.clientWidth);
        return () => ro.disconnect();
    }, []);

    if (!data || data.datasets.length === 0) return null;

    const padL = 52, padR = 32, padT = 16, padB = 36;
    const chartW = Math.max(10, containerWidth - padL - padR);
    const chartH = height - padT - padB;
    const allValues = data.datasets.flatMap(d => d.data).filter(v => isFinite(v));
    const maxVal = Math.max(...allValues, 0.1) * 1.15;
    const minVal = 0;
    const range = maxVal - minVal || 1;

    const toX = (i: number, total: number) => padL + (i / Math.max(total - 1, 1)) * chartW;
    const toY = (v: number) => padT + chartH - ((v - minVal) / range) * chartH;

    const makePath = (pts: { x: number; y: number }[]) => {
        if (pts.length < 2) return '';
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i - 1], c = pts[i], cpx = (p.x + c.x) / 2;
            d += ` C ${cpx},${p.y} ${cpx},${c.y} ${c.x},${c.y}`;
        }
        return d;
    };

    const yTicks = 4;
    const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
        const v = minVal + (range * i) / yTicks;
        return { y: toY(v), label: v.toFixed(1) + yAxisSuffix };
    });

    const labels = data.labels;
    const step = labels.length > 7 ? Math.ceil(labels.length / 6) : 1;
    const pts = data.datasets[0].data.map((v, i) => ({ x: toX(i, data.datasets[0].data.length), y: toY(v) }));

    return (
        <div ref={containerRef} style={{ width: '100%', maxWidth: '100%', minWidth: 0, position: 'relative', userSelect: 'none', overflow: 'hidden' }}>
            <svg width={containerWidth} height={height} viewBox={`0 0 ${containerWidth} ${height}`} style={{ display: 'block', maxWidth: '100%', width: '100%', height: 'auto', overflow: 'visible' }}>
                <defs>
                    <linearGradient id="feedChartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
                    </linearGradient>
                </defs>
                {yLabels.map((yl, i) => (
                    <g key={i}>
                        <line x1={padL} y1={yl.y} x2={padL + chartW} y2={yl.y} stroke="rgba(128,128,128,0.15)" strokeWidth={1} />
                        <text x={padL - 6} y={yl.y + 4} textAnchor="end" fill={textColor} fontSize={10} fontFamily="Poppins, sans-serif">{yl.label}</text>
                    </g>
                ))}
                {labels.map((lbl, i) => {
                    if (i % step !== 0 && i !== labels.length - 1) return null;
                    const isFirst = i === 0;
                    const isLast = i === labels.length - 1;
                    const textAnchor = isLast ? 'end' : isFirst ? 'start' : 'middle';
                    const xPos = isLast
                        ? toX(i, labels.length) + 6
                        : isFirst
                            ? toX(i, labels.length) - 6
                            : toX(i, labels.length);

                    return (
                        <text
                            key={i}
                            x={xPos}
                            y={padT + chartH + 18}
                            textAnchor={textAnchor}
                            fill={textColor}
                            fontSize={10}
                            fontFamily="Poppins, sans-serif"
                        >
                            {lbl}
                        </text>
                    );
                })}
                {/* Fill area */}
                {pts.length >= 2 && (
                    <path d={`${makePath(pts)} L ${pts[pts.length - 1].x},${padT + chartH} L ${pts[0].x},${padT + chartH} Z`} fill="url(#feedChartGrad)" />
                )}
                <path d={makePath(pts)} fill="none" stroke={lineColor} strokeWidth={data.datasets[0].strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((pt, pi) => (
                    <circle key={pi} cx={pt.x} cy={pt.y} r={5} fill={surfaceColor} stroke={lineColor} strokeWidth={2.5} style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setTooltip({ x: pt.x, y: pt.y, value: data.datasets[0].data[pi], label: labels[pi] ?? '' })}
                        onMouseLeave={() => setTooltip(null)} />
                ))}
                {tooltip && (() => {
                    const tw = 84, th = 40;
                    const tx = tooltip.x + tw + 8 > containerWidth ? tooltip.x - tw - 6 : tooltip.x - tw / 2;
                    const ty = tooltip.y - th - 10 < 0 ? tooltip.y + 8 : tooltip.y - th - 8;
                    return (
                        <g style={{ pointerEvents: 'none' }}>
                            <rect x={tx} y={ty} width={tw} height={th} rx={8} fill={textColor} opacity={0.96} />
                            <text x={tx + tw / 2} y={ty + 16} textAnchor="middle" fill={surfaceColor} fontSize={12} fontWeight={700} fontFamily="Poppins, sans-serif">{tooltip.value.toFixed(1)}{yAxisSuffix}</text>
                            <text x={tx + tw / 2} y={ty + 30} textAnchor="middle" fill={surfaceColor} fontSize={9.5} opacity={0.8} fontFamily="Poppins, sans-serif">{tooltip.label}</text>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function FeedReportScreen({ onNavigate, params }: Props) {
    const { colors, isDark, isMobile, userData, farmName } = useTheme();
    const dashStyles = useDashboardStyles();
    const [farmId, setFarmId] = useState<string>(userData?.farm_id || '');

    // Resolve active farmId if not directly populated on userData
    useEffect(() => {
        if (userData?.farm_id) {
            setFarmId(userData.farm_id);
        } else if (userData?.id) {
            supabase
                .from('users')
                .select('farm_id')
                .eq('id', userData.id)
                .single()
                .then(({ data }) => {
                    if (data?.farm_id) {
                        setFarmId(data.farm_id);
                    } else {
                        supabase
                            .from('farms')
                            .select('id')
                            .eq('admin_id', userData.id)
                            .order('created_at', { ascending: true })
                            .limit(1)
                            .then(({ data: fData }) => {
                                if (fData && fData.length > 0) {
                                    setFarmId(fData[0].id);
                                }
                            });
                    }
                });
        }
    }, [userData?.farm_id, userData?.id]);

    const type = params?.type;
    const initialType = typeof type === 'string'
        ? (type.toLowerCase().includes('chicken') ? 'chicken' : 'pig')
        : 'pig';

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [animalType, setAnimalType] = useState<'pig' | 'chicken'>(initialType);
    const [allHousings, setAllHousings] = useState<HousingInfo[]>([]);
    const [selectedHousingId, setSelectedHousingId] = useState<string | null>(null);
    const [allBatches, setAllBatches] = useState<BatchInfo[]>([]);
    const [reportData, setReportData] = useState<FeedItemBreakdown[]>([]);
    const [totalDispenses, setTotalDispenses] = useState<number>(0);
    const [availablePastMonths, setAvailablePastMonths] = useState<string[]>([]);
    const periodOptions = useMemo(() => getPeriodOptions(availablePastMonths), [availablePastMonths]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('current_month');
    const activePeriod = useMemo(() => {
        return periodOptions.find(p => p.id === selectedPeriodId) || periodOptions[0];
    }, [periodOptions, selectedPeriodId]);
    const timeframe = activePeriod.label;
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [chartData, setChartData] = useState<{ labels: string[]; datasets: { data: number[]; strokeWidth?: number }[] } | null>(null);

    // Filtered housings based on selected animal type (pig/chicken)
    const filteredHousings = useMemo(() => {
        return allHousings.filter(h => h.animal_type === animalType);
    }, [allHousings, animalType]);

    const selectedHousing = useMemo(() => {
        return allHousings.find(h => h.id === selectedHousingId) ?? null;
    }, [allHousings, selectedHousingId]);

    // Active batch in the selected housing (latest active batch)
    const activeBatch = useMemo(() => {
        if (!selectedHousingId) return null;
        return allBatches.find(b => b.housing_id === selectedHousingId) || null;
    }, [allBatches, selectedHousingId]);

    // Calculate current age of the batch in days (exactly matching mobile)
    const batchAgeDays = useMemo(() => {
        if (!activeBatch) return null;
        const arrival = new Date(activeBatch.arrival_date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.floor((today.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)));
        return (activeBatch.age_at_arrival_days || 0) + diffDays;
    }, [activeBatch]);

    const headCount = activeBatch?.current_count || selectedHousing?.current_count || 0;

    // ─── Fetch Housings & Batches ────────────────────────────────
    const fetchHousingsAndBatches = useCallback(async () => {
        if (!farmId) {
            setIsLoading(false);
            return;
        }
        try {
            const [housingsRes, batchesRes] = await Promise.all([
                supabase
                    .from('housings')
                    .select('id, name, animal_type, status, current_count')
                    .eq('farm_id', farmId)
                    .ilike('status', 'Active')
                    .order('name', { ascending: true }),
                supabase
                    .from('batches')
                    .select('id, name, estimated_count, current_count, arrival_date, age_at_arrival_days, status, housing_id')
                    .eq('farm_id', farmId)
                    .ilike('status', 'active')
                    .order('arrival_date', { ascending: false }),
            ]);

            if (housingsRes.error) throw housingsRes.error;
            if (batchesRes.error) throw batchesRes.error;

            setAllHousings((housingsRes.data || []) as HousingInfo[]);
            setAllBatches((batchesRes.data || []) as BatchInfo[]);
        } catch (err) {
            console.error('[FeedReportScreen] error loading housings and batches:', err);
        }
    }, [farmId]);

    useEffect(() => {
        fetchHousingsAndBatches();
    }, [fetchHousingsAndBatches]);

    // ─── Fetch Available Historical Months with Records ───────────
    const fetchAvailablePastMonths = useCallback(async (housingId: string) => {
        if (!housingId) {
            setAvailablePastMonths([]);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('dispense_records')
                .select('dispensed_at')
                .eq('housing_id', housingId)
                .eq('status', 'success')
                .order('dispensed_at', { ascending: false });

            if (error) throw error;

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const currentMonthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);

            const pastSet = new Set<string>();
            (data || []).forEach((r: any) => {
                if (!r.dispensed_at) return;
                const d = new Date(r.dispensed_at);
                if (d < currentMonthStart) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    pastSet.add(`${y}-${m}`);
                }
            });

            const sorted = Array.from(pastSet).sort().reverse();
            setAvailablePastMonths(sorted);

            setSelectedPeriodId(prev => {
                if (prev === 'current_month' || prev === 'this_week') return prev;
                return sorted.includes(prev) ? prev : 'current_month';
            });
        } catch (err) {
            console.error('[FeedReportScreen] error loading available past months:', err);
            setAvailablePastMonths([]);
        }
    }, []);

    useEffect(() => {
        if (selectedHousingId) {
            fetchAvailablePastMonths(selectedHousingId);
        } else {
            setAvailablePastMonths([]);
        }
    }, [selectedHousingId, fetchAvailablePastMonths]);

    // ─── Resolve selected housing when animal type or housings change ─
    useEffect(() => {
        if (filteredHousings.length > 0) {
            const exists = filteredHousings.some(h => h.id === selectedHousingId);
            if (!exists) {
                setSelectedHousingId(filteredHousings[0].id);
            }
        } else {
            setSelectedHousingId(null);
        }
    }, [animalType, filteredHousings, selectedHousingId]);

    // ─── Fetch Feed Dispense Records ──────────────────────────────
    // Matches selected timeframe/month precisely (with current month priority)
    const fetchConsumption = useCallback(async () => {
        if (!selectedHousingId) {
            setReportData([]);
            setChartData(null);
            setTotalDispenses(0);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const { startDate, endDate } = activePeriod;

            const { data, error } = await supabase
                .from('dispense_records')
                .select(`
                    id,
                    grams_dispensed,
                    dispensed_at,
                    feed_id,
                    status,
                    triggered_by,
                    feeds (
                        id,
                        name,
                        brand,
                        category,
                        stock_kg
                    )
                `)
                .eq('housing_id', selectedHousingId)
                .eq('status', 'success')
                .gte('dispensed_at', startDate.toISOString())
                .lte('dispensed_at', endDate.toISOString())
                .order('dispensed_at', { ascending: true });

            if (error) throw error;

            const records = data || [];
            setTotalDispenses(records.length);

            // Calculate total dispensed
            let totalGrams = 0;
            const groupedMap = new Map<string, {
                feedId: string;
                category: string;
                feedName: string;
                brand: string;
                consumption: number;
                stockKg: number;
            }>();

            records.forEach((record: any) => {
                const feed = record.feeds;
                const grams = record.grams_dispensed || 0;
                totalGrams += grams;
                const kg = grams / 1000;

                const categoryName = feed?.category || 'General';
                const feedTitle = feed?.name || 'General Feed';
                const brandName = feed?.brand || '';
                const stock = Number(feed?.stock_kg || 0);

                const key = feed?.id || `${categoryName}-${feedTitle}`;
                if (groupedMap.has(key)) {
                    const existing = groupedMap.get(key)!;
                    existing.consumption += kg;
                } else {
                    groupedMap.set(key, {
                        feedId: feed?.id || key,
                        category: categoryName,
                        feedName: feedTitle,
                        brand: brandName,
                        consumption: kg,
                        stockKg: stock,
                    });
                }
            });

            const totalKg = totalGrams / 1000;
            const breakdownList: FeedItemBreakdown[] = Array.from(groupedMap.values()).map(item => ({
                ...item,
                percentage: totalKg > 0 ? Math.round((item.consumption / totalKg) * 100) : 0,
            }));

            setReportData(breakdownList);

            // ─── Generate Chart Data ─────────────────────────────────────
            const chartLabels: string[] = [];
            const chartValues: number[] = [];

            if (activePeriod.isWeek) {
                const now = new Date();
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(now.getDate() - i);
                    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
                    chartLabels.push(label);

                    const startOfDay = new Date(d);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(d);
                    endOfDay.setHours(23, 59, 59, 999);

                    const sumGrams = records.reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startOfDay && rDate <= endOfDay) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(Math.round((sumGrams / 1000) * 10) / 10);
                }
            } else {
                // Monthly view: divided into 6 balanced intervals across the month
                const totalDays = activePeriod.daysInMonth;
                const intervals = 6;
                const daysPerInterval = Math.floor(totalDays / intervals);

                for (let i = 0; i < intervals; i++) {
                    const startDay = i * daysPerInterval + 1;
                    const endDay = i === intervals - 1 ? totalDays : (i + 1) * daysPerInterval;
                    const startRange = new Date(activePeriod.year, activePeriod.month, startDay, 0, 0, 0, 0);
                    const endRange = new Date(activePeriod.year, activePeriod.month, endDay, 23, 59, 59, 999);
                    const mShort = startRange.toLocaleDateString('en-US', { month: 'short' });
                    const label = `${mShort} ${startDay}–${endDay}`;
                    chartLabels.push(label);

                    const sumGrams = records.reduce((sum: number, r: any) => {
                        const rDate = new Date(r.dispensed_at);
                        if (rDate >= startRange && rDate <= endRange) {
                            return sum + (r.grams_dispensed || 0);
                        }
                        return sum;
                    }, 0);

                    chartValues.push(Math.round((sumGrams / 1000) * 10) / 10);
                }
            }

            setChartData({
                labels: chartLabels,
                datasets: [
                    {
                        data: chartValues,
                        strokeWidth: 3,
                    }
                ]
            });
        } catch (err) {
            console.error('[FeedReportScreen] error loading consumption:', err);
            setChartData(null);
        } finally {
            setIsLoading(false);
        }
    }, [selectedHousingId, activePeriod]);

    useEffect(() => {
        fetchConsumption();
    }, [fetchConsumption]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchHousingsAndBatches();
        if (selectedHousingId) {
            await fetchAvailablePastMonths(selectedHousingId);
        }
        await fetchConsumption();
        setRefreshing(false);
    }, [fetchHousingsAndBatches, selectedHousingId, fetchAvailablePastMonths, fetchConsumption]);

    // Helpers
    const getCategoryColor = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('booster') || cat.includes('pre-starter')) return colors.secondary;
        if (cat.includes('finisher')) return colors.warning;
        if (cat.includes('starter')) return colors.info;
        return colors.primary;
    };

    const totalConsumption = useMemo(() => {
        return reportData.reduce((sum, item) => sum + item.consumption, 0);
    }, [reportData]);

    // ─── Dynamic Feed Analysis & Descriptive Insights ─────────────
    // Exact 1-to-1 match with mobile calculation logic
    const feedAnalysis = useMemo(() => {
        if (reportData.length === 0 || totalConsumption <= 0) {
            return null;
        }

        const daysCount = activePeriod.isWeek
            ? 7
            : activePeriod.isCurrentMonth
                ? Math.max(1, Math.min(new Date().getDate(), activePeriod.daysInMonth))
                : activePeriod.daysInMonth;
        const avgDailyKg = totalConsumption / daysCount;
        const count = headCount > 0 ? headCount : (animalType === 'chicken' ? 30 : 10);
        const dailyDispensedPerHeadGrams = Math.round((avgDailyKg * 1000) / count);

        let stageName = '';
        let targetDispenseGrams = 0;
        let stageDesc = '';

        if (animalType === 'chicken') {
            if (!batchAgeDays || batchAgeDays > 24) {
                stageName = 'Broiler Finisher Stage';
                targetDispenseGrams = 160;
                stageDesc = 'Finisher pellets provide high metabolizable energy and balanced protein for optimal muscle gain as birds approach target market weight.';
            } else if (batchAgeDays > 10) {
                stageName = 'Broiler Starter Stage';
                targetDispenseGrams = 85;
                stageDesc = 'Starter crumbles support rapid skeleton development and lean muscle frame formation.';
            } else {
                stageName = 'Chick Booster Stage';
                targetDispenseGrams = 35;
                stageDesc = 'Booster micro-crumbles provide concentrated nutrients for vital organ and immune system establishment.';
            }
        } else {
            if (!batchAgeDays || batchAgeDays > 90) {
                stageName = 'Swine Finisher Stage';
                targetDispenseGrams = 2800;
                stageDesc = 'Finishing ration delivers high energy density for maximum weight gain and optimal backfat thickness.';
            } else if (batchAgeDays > 60) {
                stageName = 'Swine Grower Stage';
                targetDispenseGrams = 1800;
                stageDesc = 'Grower pellets promote lean muscle deposition and skeletal expansion.';
            } else if (batchAgeDays > 30) {
                stageName = 'Pig Starter Stage';
                targetDispenseGrams = 1000;
                stageDesc = 'Post-weaning starter ration strengthens intestinal villi and transitions weanlings smoothly to solid dry feed.';
            } else {
                stageName = 'Pig Pre-Starter Stage';
                targetDispenseGrams = 350;
                stageDesc = 'Creep pre-starter features milk proteins and easily digestible cooked grains for young piglets.';
            }
        }

        // Benchmark comparison
        const benchmarkRatio = targetDispenseGrams > 0 ? (dailyDispensedPerHeadGrams / targetDispenseGrams) : 1;
        let appetiteStatus = 'Optimal Dispense';
        let appetiteColor = colors.primary;
        let appetiteBadgeText = 'Healthy Dispense';

        if (benchmarkRatio > 1.15) {
            appetiteStatus = 'Elevated Dispense';
            appetiteColor = colors.info;
            appetiteBadgeText = 'High Feed Demand';
        } else if (benchmarkRatio < 0.85) {
            appetiteStatus = 'Sub-Optimal Dispense';
            appetiteColor = colors.warning;
            appetiteBadgeText = 'Dispense Monitored';
        }

        // Trajectory calculation (first half vs second half of chart values)
        let trajectoryStatus = 'Consistent Daily Dispense';
        if (chartData && chartData.datasets[0]?.data.length >= 4) {
            const dataArr = chartData.datasets[0].data;
            const mid = Math.floor(dataArr.length / 2);
            const firstHalf = dataArr.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
            const secondHalf = dataArr.slice(mid).reduce((a, b) => a + b, 0) / (dataArr.length - mid);
            const pctDiff = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

            if (pctDiff >= 8) {
                trajectoryStatus = `+${Math.round(pctDiff)}% Rising Dispense`;
            } else if (pctDiff <= -8) {
                trajectoryStatus = `${Math.round(pctDiff)}% Slowing Dispense`;
            } else {
                trajectoryStatus = 'Consistent Daily Dispense';
            }
        }

        const sortedFeeds = [...reportData].sort((a, b) => b.consumption - a.consumption);
        const topFeed = sortedFeeds[0];
        const topPct = totalConsumption > 0 ? Math.round((topFeed.consumption / totalConsumption) * 100) : 0;

        const totalRemainingStock = reportData.reduce((sum, item) => sum + (item.stockKg || 0), 0);
        const estimatedRunwayDays = avgDailyKg > 0 ? Math.max(1, Math.round(totalRemainingStock / avgDailyKg)) : 30;

        return {
            stageName,
            stageDesc,
            dailyDispensedPerHeadGrams,
            dailyIntakePerHeadGrams: dailyDispensedPerHeadGrams,
            targetDispenseGrams,
            targetIntakeGrams: targetDispenseGrams,
            benchmarkRatio,
            avgDailyKg,
            appetiteStatus,
            appetiteColor,
            appetiteBadgeText,
            trajectoryStatus,
            topFeedName: topFeed.feedName,
            topFeedBrand: topFeed.brand,
            topFeedCategory: topFeed.category,
            topPct,
            totalDispenses,
            estimatedRunwayDays,
            totalRemainingStock,
        };
    }, [reportData, totalConsumption, activePeriod, headCount, animalType, batchAgeDays, chartData, colors, totalDispenses]);

    // Dynamic AI Insights text for AniBot card
    const getBotAnalysis = () => {
        if (!feedAnalysis) {
            return `No feed dispense records found for ${selectedHousing ? selectedHousing.name : 'this house'} in ${activePeriod.label}.`;
        }

        const animalLabel = animalType === 'pig' ? 'pigs' : 'chickens';
        return `In ${selectedHousing?.name ?? 'this house'}, ${headCount} ${animalLabel} were dispensed a total of ${totalConsumption.toFixed(1)} kg during ${activePeriod.label}. Daily feed dispense averages ${feedAnalysis.dailyDispensedPerHeadGrams} g/head (${Math.round(feedAnalysis.benchmarkRatio * 100)}% of the ${feedAnalysis.targetDispenseGrams} g standard). Primary diet is ${feedAnalysis.topFeedName} (${feedAnalysis.topFeedCategory}), accounting for ${feedAnalysis.topPct}% of total dispensed with approximately ${feedAnalysis.estimatedRunwayDays} days of storage remaining.`;
    };

    // ─── Export Data Builder ──────────────────────────────────────
    const getExportData = (): ExportReportData => {
        const sorted = [...reportData].sort((a, b) => b.consumption - a.consumption);
        const topFeed = sorted.length > 0 ? sorted[0] : null;

        return {
            title: `${animalType === 'pig' ? 'Pigs' : 'Chickens'} Feed Report`,
            subtitle: `Feed dispense, nutritional performance, and storage runway for ${selectedHousing?.name ?? 'Selected House'} (${activePeriod.label})`,
            farmName: farmName || 'AniGrow Farm',
            generatedBy: userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.email : undefined,
            fileNamePrefix: `${animalType}_feed_report_${selectedHousing?.name ?? 'house'}_${activePeriod.shortLabel.replace(/\s+/g, '_')}`,
            filters: [
                { label: 'Animal Type', value: animalType === 'pig' ? 'Pigs' : 'Chickens' },
                { label: 'Housing', value: selectedHousing ? `${selectedHousing.name} (${headCount} head)` : 'None' },
                { label: 'Active Batch', value: activeBatch ? `${activeBatch.name}${batchAgeDays !== null ? ` (Day ${batchAgeDays})` : ''}` : 'No Active Batch' },
                { label: 'Feeding Period', value: activePeriod.label },
                { label: 'Total Dispenses', value: `${totalDispenses} records` },
            ],
            metrics: [
                { label: 'Total Feed Dispensed', value: `${totalConsumption.toFixed(1)} kg`, subtext: `${totalDispenses} automated dispenses` },
                { label: 'Avg Daily / Head', value: feedAnalysis ? `${feedAnalysis.dailyDispensedPerHeadGrams} g/day` : '—', subtext: feedAnalysis ? `Standard: ~${feedAnalysis.targetDispenseGrams} g` : undefined },
                { label: 'Appetite Status', value: feedAnalysis ? feedAnalysis.appetiteStatus : 'Normal', subtext: feedAnalysis?.trajectoryStatus },
                { label: 'Feed Runway', value: feedAnalysis ? `~${feedAnalysis.estimatedRunwayDays} days` : '—', subtext: feedAnalysis ? `${Math.round(feedAnalysis.totalRemainingStock)} kg remaining` : undefined },
                { label: 'Active Animals', value: `${headCount} heads` },
                { label: 'Top Diet', value: topFeed ? topFeed.feedName : 'None', subtext: topFeed ? `${topFeed.category} (${topFeed.percentage}%)` : undefined },
                { label: 'Active Rations', value: reportData.length },
            ],
            insights: `${getBotAnalysis()}\n\n${feedAnalysis?.stageDesc || ''}`,
            table: {
                title: 'Feed Dispense & Inventory Breakdown',
                headers: ['Feed & Brand', 'Category', 'Dispensed (kg)', 'Share of Diet (%)', 'Storage Stock (kg)'],
                rows: sorted.map(item => [
                    item.brand ? `${item.feedName} (${item.brand})` : item.feedName,
                    item.category,
                    item.consumption.toFixed(2),
                    `${item.percentage}%`,
                    item.stockKg > 0 ? `${item.stockKg} kg` : '0 kg'
                ])
            },
            secondaryTable: chartData && chartData.labels.length > 0 ? {
                title: `${activePeriod.shortLabel} Dispense Distribution`,
                headers: ['Period / Date', 'Dispensed Amount (kg)'],
                rows: chartData.labels.map((label, idx) => [
                    label,
                    (chartData.datasets[0]?.data[idx] ?? 0).toFixed(1)
                ])
            } : undefined
        };
    };

    const cardStyle: React.CSSProperties = {
        backgroundColor: colors.surface,
        border: `1.5px solid ${colors.stroke}`,
        borderRadius: isMobile ? '16px' : '20px',
        padding: isMobile ? '16px 14px' : '20px',
        boxShadow: isDark ? 'none' : '0 2px 10px rgba(0,0,0,0.02)',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        textAlign: 'left',
    };

    return (
        <div style={dashStyles.pageWrapper}>
            <MobileHeader onMenuClick={() => setIsSidebarOpen(true)} />
            <AdminSidebar onNavigate={onNavigate} activeItem="feeding" isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main style={dashStyles.contentArea}>
                {/* ─── 1. PAGE HEADER & ACTIONS ──────────────────────────────── */}
                <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: isMobile ? '12px' : '16px',
                    paddingBottom: '16px',
                    borderBottom: `1px solid ${colors.stroke}`,
                    marginBottom: '4px'
                }}>
                    <div>
                        <h1 style={{ ...dashStyles.welcomeTitle, margin: 0, textAlign: 'left' }}>
                            {animalType === 'pig' ? 'Pigs' : 'Chickens'} Feed Report
                        </h1>
                        <p style={{ ...dashStyles.welcomeSubtitle, margin: '4px 0 0', textAlign: 'left' }}>
                            Monitor feeding efficiency, daily dispense per head, and ration stock for your {animalType === 'pig' ? 'pigs' : 'chickens'}.
                        </p>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                        width: isMobile ? '100%' : 'auto',
                        justifyContent: isMobile ? 'space-between' : 'flex-end',
                    }}>
                        {/* Minimalist Dispensed Badge */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            backgroundColor: '#F59E0B15',
                            border: '1px solid #F59E0B30',
                            flexShrink: 0
                        }}>
                            <span className="material-symbols-rounded" style={{ fontSize: '16px', color: '#F59E0B' }}>restaurant</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#F59E0B', fontFamily: 'inherit' }}>
                                Dispensed: {totalConsumption.toFixed(1)} kg
                            </span>
                        </div>

                        {/* Export Report Button */}
                        <ExportReportButton
                            getData={getExportData}
                            disabled={isLoading || reportData.length === 0}
                        />
                    </div>
                </div>

                {/* ─── 2. UNIFIED FILTER COMMAND CARD ──────────────────────────── */}
                <div style={{
                    backgroundColor: colors.surface,
                    borderRadius: '18px',
                    border: `1.5px solid ${colors.stroke}`,
                    padding: isMobile ? '14px' : '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginBottom: '20px',
                    boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    {/* Animal Type Section */}
                    <div style={{ width: isMobile ? '100%' : 'auto' }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 800, color: colors.textGrey, marginBottom: '8px', display: 'block', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                            Choose Animal Type
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                            {(['pig', 'chicken'] as const).map(t => {
                                const isSelected = animalType === t;
                                return (
                                    <button
                                        key={t}
                                        onClick={() => setAnimalType(t)}
                                        style={{
                                            flex: isMobile ? 1 : 'none',
                                            padding: '8px 18px',
                                            borderRadius: '20px',
                                            backgroundColor: isSelected ? colors.primary : (isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB'),
                                            border: `1.5px solid ${isSelected ? colors.primary : colors.stroke}`,
                                            cursor: 'pointer',
                                            fontSize: '12.5px',
                                            fontWeight: 700,
                                            color: isSelected ? colors.onPrimary : colors.textGrey,
                                            transition: 'all 0.15s ease',
                                            fontFamily: 'inherit',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <span>{t === 'pig' ? 'Pigs' : 'Chickens'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Housing, Month & Refresh Section */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '12px',
                        flexWrap: 'wrap',
                        flex: isMobile ? '1 1 100%' : '1',
                        justifyContent: isMobile ? 'stretch' : 'flex-end'
                    }}>
                        {/* Select House */}
                        <div style={{ minWidth: isMobile ? '100%' : '190px', maxWidth: isMobile ? '100%' : '260px', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <label style={{ fontSize: '10.5px', fontWeight: 800, color: colors.textGrey, margin: 0, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                                    Select a House
                                </label>
                                {activeBatch && (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: colors.primary }}>
                                        {activeBatch.name} · {headCount} heads {batchAgeDays !== null ? `· Day ${batchAgeDays}` : ''}
                                    </span>
                                )}
                            </div>
                            <select
                                value={selectedHousingId ?? ''}
                                onChange={e => setSelectedHousingId(e.target.value || null)}
                                disabled={filteredHousings.length === 0}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: `1.5px solid ${colors.stroke}`,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                                    color: colors.text,
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    fontFamily: 'inherit',
                                    cursor: filteredHousings.length > 0 ? 'pointer' : 'not-allowed',
                                    opacity: filteredHousings.length > 0 ? 1 : 0.6,
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            >
                                {filteredHousings.length === 0 && <option value="">No Houses Found</option>}
                                {filteredHousings.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                            </select>
                        </div>

                        {/* Feeding Period / Month Filter */}
                        <div style={{ minWidth: isMobile ? '100%' : '230px', maxWidth: isMobile ? '100%' : '300px', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <label style={{ fontSize: '10.5px', fontWeight: 800, color: colors.textGrey, margin: 0, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                                    Feeding Period
                                </label>
                            </div>
                            <select
                                value={selectedPeriodId}
                                onChange={e => setSelectedPeriodId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: `1.5px solid ${colors.stroke}`,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                                    color: colors.text,
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <optgroup label="Active Period">
                                    <option value="current_month">{periodOptions[0].label}</option>
                                    <option value="this_week">{periodOptions[1].label}</option>
                                </optgroup>
                                {periodOptions.length > 2 && (
                                    <optgroup label="Previous Months">
                                        {periodOptions.slice(2).map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={onRefresh}
                            disabled={refreshing}
                            title="Refresh Analytics"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                border: `1.5px solid ${colors.stroke}`,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                                cursor: refreshing ? 'not-allowed' : 'pointer',
                                color: colors.textGrey,
                                opacity: refreshing ? 0.5 : 1,
                                flexShrink: 0
                            }}
                        >
                            <span className={`material-symbols-rounded${refreshing ? ' animate-spin' : ''}`} style={{ fontSize: '19px' }}>refresh</span>
                        </button>
                    </div>
                </div>

                {/* Loading */}
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', border: `3px solid ${colors.stroke}`, borderTop: `3px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ color: colors.textGrey, fontSize: '14px', fontWeight: 600 }}>Loading report details...</span>
                    </div>
                ) : filteredHousings.length === 0 ? (
                    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', textAlign: 'center' }}>
                        <span className="material-symbols-rounded" style={{ fontSize: '48px', color: colors.textGrey, opacity: 0.5 }}>home</span>
                        <h3 style={{ color: colors.text, marginTop: '16px', marginBottom: '6px' }}>No Houses Found</h3>
                        <p style={{ color: colors.textGrey, textAlign: 'center', fontSize: '13px', margin: 0 }}>
                            There are no active houses registered for {animalType === 'pig' ? 'pigs' : 'chickens'} on this farm yet.
                        </p>
                    </div>
                ) : reportData.length === 0 ? (
                    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', textAlign: 'center' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '30px', backgroundColor: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                            <span className="material-symbols-rounded" style={{ fontSize: '32px', color: colors.primary }}>grain</span>
                        </div>
                        <h3 style={{ color: colors.text, marginTop: '8px', marginBottom: '6px' }}>No Feed Logs Found</h3>
                        <p style={{ color: colors.textGrey, textAlign: 'center', fontSize: '13px', margin: 0, maxWidth: '440px', lineHeight: 1.5 }}>
                            No successful feed dispense records were found for {selectedHousing?.name} in <strong>{activePeriod.label}</strong>.
                        </p>
                        {!activePeriod.isCurrentMonth && (
                            <button
                                onClick={() => setSelectedPeriodId('current_month')}
                                style={{
                                    marginTop: '16px',
                                    padding: '8px 16px',
                                    borderRadius: '10px',
                                    backgroundColor: colors.primary,
                                    border: 'none',
                                    color: '#FFFFFF',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                }}
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>calendar_month</span>
                                Switch to Current Month
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* ─── Historical Month Information Banner ──────────────── */}
                        {!activePeriod.isCurrentMonth && !activePeriod.isWeek && (
                            <div style={{
                                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF',
                                border: '1.2px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '14px',
                                padding: '10px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px',
                                marginBottom: '18px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-symbols-rounded" style={{ fontSize: '20px', color: '#3B82F6' }}>history</span>
                                    <span style={{ fontSize: '13px', color: colors.text, fontWeight: 600 }}>
                                        Viewing Historical Feed Dispense Report for <strong style={{ color: '#2563EB' }}>{activePeriod.label}</strong>
                                    </span>
                                </div>
                                <button
                                    onClick={() => setSelectedPeriodId('current_month')}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        backgroundColor: colors.primary,
                                        border: 'none',
                                        color: '#FFFFFF',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>arrow_back</span>
                                    Return to Current Month
                                </button>
                            </div>
                        )}
                        {/* ─── 3. METRICS OVERVIEW 4-KPI GRID ──────────────────── */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                            gap: '12px',
                            marginBottom: '20px'
                        }}>
                            {/* Card 1: Total Dispensed */}
                            <div style={{ ...cardStyle, padding: isMobile ? '14px 12px' : '16px 18px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Total Dispensed
                                    </span>
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px', color: colors.primary }}>inventory_2</span>
                                </div>
                                <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 900, color: colors.primary, marginTop: '6px', lineHeight: 1, fontFamily: 'Poppins, sans-serif' }}>
                                    {totalConsumption.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textGrey }}>kg</span>
                                </div>
                                <span style={{ fontSize: '10.5px', color: colors.textGrey, marginTop: '4px', display: 'block' }}>
                                    {totalDispenses} dispenses
                                </span>
                            </div>

                            {/* Card 2: Daily Dispensed / Head */}
                            <div style={{ ...cardStyle, padding: isMobile ? '14px 12px' : '16px 18px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Avg Daily / Head
                                    </span>
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px', color: colors.info }}>speed</span>
                                </div>
                                <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 900, color: colors.text, marginTop: '6px', lineHeight: 1, fontFamily: 'Poppins, sans-serif' }}>
                                    {feedAnalysis?.dailyDispensedPerHeadGrams ?? 0} <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textGrey }}>g/d</span>
                                </div>
                                <span style={{ fontSize: '10.5px', color: colors.textGrey, marginTop: '4px', display: 'block' }}>
                                    Target: ~{feedAnalysis?.targetDispenseGrams ?? 0} g
                                </span>
                            </div>

                            {/* Card 3: Appetite Status */}
                            <div style={{ ...cardStyle, padding: isMobile ? '14px 12px' : '16px 18px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Appetite
                                    </span>
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px', color: feedAnalysis?.appetiteColor || colors.primary }}>check_circle</span>
                                </div>
                                <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 800, color: feedAnalysis?.appetiteColor || colors.primary, marginTop: '6px', lineHeight: 1.2, fontFamily: 'Poppins, sans-serif' }}>
                                    {feedAnalysis?.appetiteStatus || 'Normal'}
                                </div>
                                <span style={{ fontSize: '10.5px', color: colors.textGrey, marginTop: '4px', display: 'block' }}>
                                    {feedAnalysis?.trajectoryStatus || 'Steady Dispense'}
                                </span>
                            </div>

                            {/* Card 4: Feed Runway */}
                            <div style={{ ...cardStyle, padding: isMobile ? '14px 12px' : '16px 18px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: colors.textGrey, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Runway
                                    </span>
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px', color: colors.warning }}>schedule</span>
                                </div>
                                <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 900, color: colors.text, marginTop: '6px', lineHeight: 1, fontFamily: 'Poppins, sans-serif' }}>
                                    ~{feedAnalysis?.estimatedRunwayDays ?? 30} <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textGrey }}>days</span>
                                </div>
                                <span style={{ fontSize: '10.5px', color: colors.textGrey, marginTop: '4px', display: 'block' }}>
                                    {Math.round(feedAnalysis?.totalRemainingStock ?? 0)} kg left
                                </span>
                            </div>
                        </div>

                        {/* ─── 4. TIMEFRAME & FEED DISPENSE CHART ────────────── */}
                        <div style={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'space-between',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            gap: isMobile ? '10px' : '0',
                            marginBottom: '14px'
                        }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 800, color: colors.text, margin: 0, fontFamily: 'Poppins, sans-serif' }}>
                                    Daily Feed Dispensed
                                </h2>
                                <span style={{ fontSize: '12px', color: colors.textGrey }}>
                                    Dispense distribution for {activePeriod.label}
                                </span>
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.stroke}`,
                                borderRadius: '10px',
                                padding: '3px',
                                width: isMobile ? '100%' : 'auto',
                                flexWrap: 'wrap',
                            }}>
                                {/* Priority Current Month */}
                                <button
                                    onClick={() => setSelectedPeriodId('current_month')}
                                    style={{
                                        flex: isMobile ? 1 : 'none',
                                        padding: '6px 12px',
                                        borderRadius: '7px',
                                        border: 'none',
                                        backgroundColor: activePeriod.isCurrentMonth ? `${colors.primary}1A` : 'transparent',
                                        color: activePeriod.isCurrentMonth ? colors.primary : colors.textGrey,
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        fontFamily: 'Poppins, sans-serif',
                                        textAlign: 'center',
                                    }}
                                >
                                    Current Month
                                </button>

                                {/* This Week */}
                                <button
                                    onClick={() => setSelectedPeriodId('this_week')}
                                    style={{
                                        flex: isMobile ? 1 : 'none',
                                        padding: '6px 12px',
                                        borderRadius: '7px',
                                        border: 'none',
                                        backgroundColor: activePeriod.isWeek ? `${colors.primary}1A` : 'transparent',
                                        color: activePeriod.isWeek ? colors.primary : colors.textGrey,
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        fontFamily: 'Poppins, sans-serif',
                                        textAlign: 'center',
                                    }}
                                >
                                    This Week
                                </button>

                                {/* Previous Months Dropdown (only rendered if previous months with records exist) */}
                                {periodOptions.length > 2 && (
                                    <select
                                        value={!activePeriod.isCurrentMonth && !activePeriod.isWeek ? selectedPeriodId : ''}
                                        onChange={e => {
                                            if (e.target.value) {
                                                setSelectedPeriodId(e.target.value);
                                            }
                                        }}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '7px',
                                            border: 'none',
                                            backgroundColor: !activePeriod.isCurrentMonth && !activePeriod.isWeek ? `${colors.primary}1A` : 'transparent',
                                            color: !activePeriod.isCurrentMonth && !activePeriod.isWeek ? colors.primary : colors.textGrey,
                                            fontSize: '11.5px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontFamily: 'Poppins, sans-serif',
                                            outline: 'none',
                                        }}
                                    >
                                        <option value="" disabled>Previous Months</option>
                                        {periodOptions.slice(2).map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {chartData && (
                            <div style={{ ...cardStyle, padding: '16px 16px 8px', marginBottom: '22px' }}>
                                <SVGLineChart
                                    data={chartData}
                                    height={230}
                                    yAxisSuffix=" kg"
                                    surfaceColor={colors.surface}
                                    textColor={colors.textGrey}
                                    lineColor={colors.primary}
                                />
                            </div>
                        )}

                        {/* ─── 5. IN-DEPTH FEED DISPENSE & APPETITE ANALYSIS CARD ── */}
                        {feedAnalysis && (
                            <div style={{
                                ...cardStyle,
                                padding: isMobile ? '16px 14px' : '22px 24px',
                                marginBottom: '22px',
                            }}>
                                {/* Header with Icon and Appetite Badge */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '12px',
                                            backgroundColor: `${colors.primary}18`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: colors.primary,
                                            flexShrink: 0
                                        }}>
                                            <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>restaurant</span>
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '16px', fontWeight: 800, color: colors.text, margin: 0, fontFamily: 'Poppins, sans-serif' }}>
                                                Feed Dispense & Appetite
                                            </h3>
                                            <p style={{ fontSize: '12px', color: colors.textGrey, margin: '2px 0 0' }}>
                                                Nutritional Trajectory & Growth
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{
                                        backgroundColor: `${feedAnalysis.appetiteColor}18`,
                                        padding: '5px 12px',
                                        borderRadius: '20px',
                                        border: `1px solid ${feedAnalysis.appetiteColor}30`,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: feedAnalysis.appetiteColor }} />
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: feedAnalysis.appetiteColor, fontFamily: 'Poppins, sans-serif' }}>
                                            {feedAnalysis.appetiteBadgeText}
                                        </span>
                                    </div>
                                </div>

                                {/* Quick Metric Pills */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                                    gap: '10px',
                                    marginBottom: '18px'
                                }}>
                                    <div style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${colors.stroke}` }}>
                                        <span style={{ fontSize: '11px', color: colors.textGrey, display: 'block', fontWeight: 600 }}>Daily Dispense / Head</span>
                                        <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text, marginTop: '3px', display: 'block', fontFamily: 'Poppins, sans-serif' }}>
                                            {feedAnalysis.dailyDispensedPerHeadGrams} g/day
                                        </span>
                                    </div>
                                    <div style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${colors.stroke}` }}>
                                        <span style={{ fontSize: '11px', color: colors.textGrey, display: 'block', fontWeight: 600 }}>Feeding Stage</span>
                                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: colors.text, marginTop: '3px', display: 'block', fontFamily: 'Poppins, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {feedAnalysis.stageName}
                                        </span>
                                    </div>
                                    <div style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${colors.stroke}` }}>
                                        <span style={{ fontSize: '11px', color: colors.textGrey, display: 'block', fontWeight: 600 }}>Appetite Trend</span>
                                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: feedAnalysis.appetiteColor, marginTop: '3px', display: 'block', fontFamily: 'Poppins, sans-serif' }}>
                                            {feedAnalysis.trajectoryStatus}
                                        </span>
                                    </div>
                                    <div style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${colors.stroke}` }}>
                                        <span style={{ fontSize: '11px', color: colors.textGrey, display: 'block', fontWeight: 600 }}>Target Standard</span>
                                        <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text, marginTop: '3px', display: 'block', fontFamily: 'Poppins, sans-serif' }}>
                                            ~{feedAnalysis.targetDispenseGrams} g/head
                                        </span>
                                    </div>
                                </div>

                                <div style={{ height: '1px', backgroundColor: colors.stroke, marginBottom: '16px' }} />

                                {/* Detailed Narrative Explanation */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <p style={{ fontSize: '13px', color: colors.text, lineHeight: 1.6, margin: 0 }}>
                                        In <strong>{selectedHousing?.name}</strong>, the active flock of <strong>{headCount} {animalType === 'pig' ? 'pigs' : 'chickens'}</strong> {activeBatch ? `(${activeBatch.name}${batchAgeDays !== null ? `, Day ${batchAgeDays}` : ''})` : ''} was dispensed a total of <strong style={{ color: colors.primary }}>{totalConsumption.toFixed(1)} kg</strong> of feed across {totalDispenses} automated dispenses during <strong>{activePeriod.label}</strong>. Daily feed dispense averages <strong>{feedAnalysis.dailyDispensedPerHeadGrams} g/head/day</strong> ({feedAnalysis.avgDailyKg.toFixed(1)} kg/day house dispense).
                                    </p>

                                    <p style={{ fontSize: '13px', color: colors.text, lineHeight: 1.6, margin: 0 }}>
                                        <strong>Growth Alignment: </strong>
                                        {feedAnalysis.stageDesc} The primary diet currently being dispensed is <strong>{feedAnalysis.topFeedName}</strong> ({feedAnalysis.topFeedCategory}), representing <strong style={{ color: colors.primary }}>{feedAnalysis.topPct}%</strong> of total dispensed.
                                    </p>

                                    <p style={{ fontSize: '13px', color: colors.text, lineHeight: 1.6, margin: 0 }}>
                                        <strong>Appetite Assessment: </strong>
                                        Dispense is running at <strong style={{ color: feedAnalysis.appetiteColor }}>{Math.round(feedAnalysis.benchmarkRatio * 100)}% of the target standard</strong> (~{feedAnalysis.targetDispenseGrams} g/day). {feedAnalysis.benchmarkRatio >= 0.9 && feedAnalysis.benchmarkRatio <= 1.15 ? 'Feeding rhythm is stable and healthy across morning, midday, and evening automated dispenses.' : feedAnalysis.benchmarkRatio > 1.15 ? 'Feed demand is vigorous, indicating high metabolic rate and accelerated growth rate.' : 'Dispense is slightly below target; verify water supply, pen temperature, and feeder hopper clearance.'}
                                    </p>

                                    {/* Actionable Farm Management Guidance */}
                                    <div style={{
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.bgLight,
                                        borderRadius: '14px',
                                        padding: '14px 16px',
                                        marginTop: '4px',
                                        border: `1px solid ${colors.stroke}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span className="material-symbols-rounded" style={{ fontSize: '18px', color: colors.warning }}>lightbulb</span>
                                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: colors.text, fontFamily: 'Poppins, sans-serif' }}>
                                                Farm Management Guidance
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: colors.textGrey, lineHeight: 1.6 }}>
                                            <div>• Ensure constant access to cool drinking water ({animalType === 'chicken' ? 'broilers require 1.8–2.0x water to feed ratio' : 'swine require 2.0–2.5x water to feed ratio'}).</div>
                                            <div style={{ marginTop: '3px' }}>• Feeder hopper inventory has approximately <strong style={{ color: colors.text }}>~{feedAnalysis.estimatedRunwayDays} days of feed remaining</strong> at current daily dispense rates.</div>
                                            <div style={{ marginTop: '3px' }}>• Clean feeder trays regularly to avoid dust accumulation and optimize feed conversion ratio (FCR).</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── 6. FEED RATIONS USED & STOCK BREAKDOWN CARD ─────── */}
                        <div style={{
                            ...cardStyle,
                            padding: '20px',
                            marginBottom: '22px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: colors.text, margin: 0, fontFamily: 'Poppins, sans-serif' }}>
                                        Feed Rations Used
                                    </h3>
                                    <p style={{ fontSize: '12px', color: colors.textGrey, margin: '2px 0 0' }}>
                                        Detailed share and stock availability by feed type
                                    </p>
                                </div>
                                <div style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    backgroundColor: `${colors.primary}15`,
                                    border: `1px solid ${colors.primary}25`
                                }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: colors.primary, fontFamily: 'Poppins, sans-serif' }}>
                                        {reportData.length} active {reportData.length === 1 ? 'ration' : 'rations'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {reportData.map((item) => {
                                    const catColor = getCategoryColor(item.category);
                                    const isLowStock = item.stockKg <= 50 && item.stockKg > 0;
                                    return (
                                        <div
                                            key={item.feedId}
                                            style={{
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.bgLight,
                                                padding: '14px 16px',
                                                borderRadius: '14px',
                                                border: `1px solid ${colors.stroke}`
                                            }}
                                        >
                                            {/* Top row: Name + Category Pill + Kg */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                                <div style={{ flex: 1, minWidth: '180px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text, fontFamily: 'Poppins, sans-serif' }}>
                                                            {item.feedName}
                                                        </span>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            backgroundColor: `${catColor}18`,
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            color: catColor
                                                        }}>
                                                            {item.category}
                                                        </span>
                                                    </div>
                                                    {item.brand && (
                                                        <span style={{ fontSize: '12px', color: colors.textGrey, marginTop: '2px', display: 'block' }}>
                                                            Brand: {item.brand}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text, display: 'block', fontFamily: 'Poppins, sans-serif' }}>
                                                        {item.consumption.toFixed(1)} kg
                                                    </span>
                                                    <span style={{ fontSize: '11.5px', color: colors.textGrey }}>
                                                        {item.percentage}% of diet
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div style={{
                                                height: '7px',
                                                borderRadius: '4px',
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
                                                overflow: 'hidden',
                                                margin: '6px 0'
                                            }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${Math.min(100, Math.max(4, item.percentage))}%`,
                                                    backgroundColor: catColor,
                                                    borderRadius: '4px',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>

                                            {/* Bottom row: Storage stock indicator + reorder badge */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                <span style={{ fontSize: '11.5px', color: colors.textGrey }}>
                                                    Storage Stock: <strong style={{ color: item.stockKg <= 50 ? colors.warning : colors.text }}>{item.stockKg} kg</strong>
                                                </span>
                                                {isLowStock && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        color: colors.warning,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>warning</span>
                                                        Reorder Soon
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─── 7. ANIBOT AI FEEDING ADVICE CARD ───────────────── */}
                        <AIInsightCard
                            title="AniBot Feeding Advice"
                            category="feed_report"
                            farmId={farmId}
                            subKey={activeBatch?.id ? `${activeBatch.id}_${animalType}` : (selectedHousingId ? `${selectedHousingId}_${animalType}` : animalType)}
                            staticContent={getBotAnalysis()}
                            context={{
                                type: 'feed',
                                animalType,
                                housingName: selectedHousing?.name,
                                data: {
                                    batchId: activeBatch?.id,
                                    housingId: selectedHousingId,
                                    totalConsumption,
                                    totalDispenses,
                                    headCount,
                                    batchAgeDays,
                                    timeframe,
                                    appetiteStatus: feedAnalysis?.appetiteStatus,
                                    dailyDispensedPerHeadGrams: feedAnalysis?.dailyDispensedPerHeadGrams,
                                    dailyIntakePerHeadGrams: feedAnalysis?.dailyDispensedPerHeadGrams,
                                    reportSummary: reportData.map(r => ({ id: r.feedId, name: r.feedName, kg: r.consumption })),
                                }
                            }}
                            variant="orange"
                        />
                    </>
                )}
            </main>
        </div>
    );
}
