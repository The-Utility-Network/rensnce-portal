// @ts-nocheck
'use client';
import React, { useMemo, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  TimeScale,
  Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Legend too (needed for custom onClick)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  TimeScale,
  Legend
);

// -------------------- Types --------------------

export interface MetricConfig {
  /** key present on each history object  */
  key: string;
  /** Human-readable label */
  label: string;
  /** HEX/RGB colour to use for this line */
  color?: string;
}

export type PriceDataPoint = {
  timestamp: number;
  [key: string]: number; // metric values (price, supply, reserve…)
};

interface RedemptionPriceChartProps {
  /** Array of datapoints. `timestamp` must be seconds since epoch. */
  priceHistory: PriceDataPoint[];
  /** Optional custom metric configs. If omitted, we derive one per numeric key except `timestamp`. */
  metricConfigs?: MetricConfig[];
  /** Optional USDC decimals for formatting – retained for backwards compatibility. */
  usdcDecimals?: number;
}

// Fallback colour palette (tailwind-ish greys & accent colours)
const DEFAULT_COLOURS = [
  '#F43F5E', // rose-500
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
  '#EC4899', // pink-500
  '#A855F7', // purple-500
];

// Desired canonical key order
const KEY_ORDER = [
  'totalSupply',
  'mkvliInReserve',
  'mkvliBurned',
  'mkvliCirculatingSupply',
  'actualUsdcInContract',
  'usdcDeployedInVRDIs',
  'effectiveUsdcReserve',
  'redemptionPrice',
];

// Human-readable labels for the hover line
const LABELS: Record<string, string> = {
  totalSupply: 'TOTAL SUPPLY',
  mkvliInReserve: 'MKVLI IN RESERVE',
  mkvliBurned: 'MKVLI BURNED',
  mkvliCirculatingSupply: 'MKVLI CIRCULATING SUPPLY',
  actualUsdcInContract: 'ACTUAL USDC IN CONTRACT',
  usdcDeployedInVRDIs: 'USDC DEPLOYED IN VRDIs',
  effectiveUsdcReserve: 'EFFECTIVE USDC RESERVE',
  redemptionPrice: 'REDEMPTION PRICE',
};

// Utility: generate consistent colour for index
const colourForIndex = (i: number) => DEFAULT_COLOURS[i % DEFAULT_COLOURS.length];

const RedemptionPriceChart: React.FC<RedemptionPriceChartProps> = ({ priceHistory, metricConfigs, usdcDecimals }) => {
  // Always run hooks; decide what to render later
  const hasData = priceHistory && priceHistory.length > 0;

  // Derive metric configs if caller did not supply them.
  const derivedConfigs: MetricConfig[] = useMemo(() => {
    if (metricConfigs && metricConfigs.length) return metricConfigs;
    // Collect keys across all datapoints (excluding timestamp)
    const keySet = new Set<string>();
    priceHistory.forEach((p) => {
      Object.keys(p).forEach((k) => {
        if (k !== 'timestamp') keySet.add(k);
      });
    });
    const presentKeys = Array.from(keySet);
    const filtered = presentKeys.filter((k) => !/^\d+$/.test(k));
    const ordered = KEY_ORDER.filter((k) => filtered.includes(k)).concat(
      filtered.filter((k) => !KEY_ORDER.includes(k))
    );
    return ordered.map((k, idx) => ({
      key: k,
      label: LABELS[k] || k.replace(/([A-Z])/g, ' $1').toUpperCase(),
      color: colourForIndex(idx),
    }));
  }, [metricConfigs, priceHistory]);

  // ---------------- State for legend interaction ----------------
  const [activeKeys, setActiveKeys] = useState<string[]>([]); // highlighted lines (empty = none highlighted)
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]); // fully hidden lines
  const [hoveredKey, setHoveredKey] = useState<string | null>(null); // dataset currently hovered – controls axis label visibility
  const [legendHoverKey, setLegendHoverKey] = useState<string | null>(null);

  // ---------------- Dataset construction ----------------
  const datasets = useMemo(() => {
    const highlightKey = hoveredKey || legendHoverKey || null;
    const hasSinglePoint = priceHistory.length === 1;
    return derivedConfigs.map((cfg, idx) => {
      const hidden = hiddenKeys.includes(cfg.key);

      let isHighlighted: boolean;
      if (highlightKey) {
        isHighlighted = cfg.key === highlightKey;
      } else {
        isHighlighted = activeKeys.length === 0 || activeKeys.includes(cfg.key);
      }

      const opacity = hidden ? 0 : isHighlighted ? 1 : 0.25;

      const colour = cfg.color || colourForIndex(idx);
      const rgba = (alpha: number) => {
        // convert hex to rgba string
        const hex = colour.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };

      return {
        label: cfg.label,
        data: priceHistory.map((p) => ({ x: new Date(p.timestamp * 1000), y: (p as any)[cfg.key] })),
        fill: false,
        borderColor: rgba(opacity),
        backgroundColor: rgba(opacity),
        borderWidth: isHighlighted && !hidden ? 2 : 1,
        tension: 0.25,
        // Config for "nice dots" and easier hovering
        pointRadius: !hidden ? 3 : 0,           // Always visible dots
        pointHoverRadius: !hidden ? 6 : 0,      // Larger on hover
        pointHitRadius: 20,                     // Large hit area for easy interaction
        pointBackgroundColor: colour,           // Solid dots
        pointBorderColor: '#000',               // Contrast border
        pointBorderWidth: 1,
        showLine: true,
        hidden, // Chart.js will honour this
        yAxisID: cfg.key, // unique axis per metric
      } as any;
    });
  }, [derivedConfigs, priceHistory, activeKeys, hiddenKeys, hoveredKey, legendHoverKey]);

  // ---------------- Dynamic scales (one per metric) ----------------
  const scales = useMemo(() => {
    // Determine which single axis should be visible to prevent layout shifts.
    // Order of precedence: Hovered -> First Active -> 'redemptionPrice' (Default) -> First Available
    let primaryKey = hoveredKey;

    if (!primaryKey) {
      if (activeKeys.length > 0) {
        primaryKey = activeKeys[0];
      } else {
        // Default to redemptionPrice if available, otherwise first
        const hasRedemption = derivedConfigs.some(c => c.key === 'redemptionPrice');
        primaryKey = hasRedemption ? 'redemptionPrice' : derivedConfigs[0]?.key;
      }
    }

    const obj: Record<string, any> = {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          tooltipFormat: 'MMM dd, yy',
          displayFormats: { day: 'MMM dd' },
        },
        ticks: {
          color: '#525252',
          font: { size: 9, family: "'Courier New', Courier, monospace" },
          autoSkipPadding: 40,
          maxTicksLimit: 8,
        },
        grid: { color: 'rgba(115, 115, 115, 0.1)', drawBorder: false },
      },
    };

    derivedConfigs.forEach((cfg) => {
      const isPrimary = cfg.key === primaryKey;
      const isCurrency = cfg.key.toLowerCase().includes('usdc') || cfg.key.includes('redemptionPrice');

      obj[cfg.key] = {
        type: 'linear',
        display: isPrimary, // Always show exactly one axis to maintain layout
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: {
          count: 5,
          color: '#737373',
          font: { size: 8, family: "'Courier New', Courier, monospace" },
          callback: (val: any) => {
            if (isCurrency && typeof val === 'number') {
              return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
            }
            return val;
          }
        },
        title: {
          display: isPrimary,
          text: cfg.label,
          color: '#A3A3A3',
          font: { size: 9, family: "'Courier New', Courier, monospace" },
        },
      };
    });
    return obj;
  }, [derivedConfigs, activeKeys, hoveredKey]);

  // ---------------- Legend click handler (custom legend) ----------------
  const handleLegendClick = useCallback(
    (key: string) => {
      const isHidden = hiddenKeys.includes(key);
      const isActive = activeKeys.includes(key);

      if (isHidden) {
        setHiddenKeys((prev) => prev.filter((k) => k !== key));
        setActiveKeys((prev) => [...prev, key]);
        return;
      }

      if (isActive) {
        // Just remove from active keys (toggle off)
        // Do NOT add to hiddenKeys, as that creates a "disabled" state the user dislikes.
        setActiveKeys((prev) => prev.filter((k) => k !== key));
        return;
      }

      // precise toggle: add to active
      setActiveKeys((prev) => [...prev, key]);
    },
    [activeKeys, hiddenKeys]
  );

  // ---------------- Hover handler to control axis visibility ----------------
  const hoverHandler = useCallback(
    (event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const dsIndex = elements[0].datasetIndex;
        const key = derivedConfigs[dsIndex]?.key;
        if (key && key !== hoveredKey) setHoveredKey(key);
      } else {
        if (hoveredKey !== null) setHoveredKey(null);
      }
    },
    [derivedConfigs, hoveredKey]
  );

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    backgroundColor: 'rgba(0,0,0,0)',
    layout: { padding: { top: 5, right: 5, bottom: 5, left: 0 } },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        titleColor: '#D1D5DB',
        bodyColor: '#E5E5E5',
        padding: 8,
        cornerRadius: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 0.5,
        displayColors: false,
        titleFont: { size: 10, family: "'Courier New', Courier, monospace" },
        bodyFont: { size: 10, family: "'Courier New', Courier, monospace" },
        callbacks: {
          title: (tooltipItems: any[]) => {
            if (tooltipItems.length > 0) {
              const date = tooltipItems[0].parsed.x;
              return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
            }
            return '';
          },
          label: (context: any) => {
            const cfg = derivedConfigs[context.datasetIndex];
            const value = context.parsed.y;
            // Check if currency
            const isCurrency = cfg.key.toLowerCase().includes('usdc') || cfg.key.includes('redemptionPrice');

            let displayVal = value;
            if (isCurrency) {
              displayVal = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
            }

            return `${cfg.label}: ${displayVal}`;
          },
        },
      },
    },
    scales,
    onHover: hoverHandler,
  };

  // ---------------- Custom legend Title Logic ----------------
  // The user wants the title to "lock in" to selected charts, or show specific one on LEGEND hover only.
  // Chart hover should NOT affect the title (prevents layout shift).

  const effectiveActiveKeys = useMemo(() => {
    if (activeKeys.length > 0) return activeKeys;
    // If none explicitly active, all are active by default
    return derivedConfigs.map(c => c.key);
  }, [activeKeys, derivedConfigs]);

  const titleContent = useMemo(() => {
    // Priority 1: Legend Hover (Specific Item)
    if (legendHoverKey) {
      const cfg = derivedConfigs.find(c => c.key === legendHoverKey);
      return (
        <span style={{ color: cfg?.color }}>
          {cfg?.label}
        </span>
      );
    }

    // Priority 2: Selected Items (Legend Mode)
    // Filter derivedConfigs to maintain consistent order
    const activeConfigs = derivedConfigs.filter(cfg => effectiveActiveKeys.includes(cfg.key));

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {activeConfigs.map((cfg, idx) => (
          <span key={cfg.key} className="flex items-center">
            {idx > 0 && <span className="text-zinc-700 mr-2 opacity-50">•</span>}
            <span style={{ color: cfg.color }} className="whitespace-nowrap transition-colors duration-300">
              {cfg.label}
            </span>
          </span>
        ))}
      </div>
    );
  }, [legendHoverKey, effectiveActiveKeys, derivedConfigs]);

  const legendDots = (
    <div className="grid grid-cols-4 sm:flex sm:flex-wrap justify-center items-center gap-2">
      {derivedConfigs.map((cfg, idx) => {
        const hidden = hiddenKeys.includes(cfg.key);
        // "Active" for dots means it's in the activeKeys array OR activeKeys is empty (default all)
        const isDefaultAll = activeKeys.length === 0;
        const isActive = isDefaultAll || activeKeys.includes(cfg.key);

        const colour = cfg.color || colourForIndex(idx);
        return (
          <span
            key={cfg.key}
            onClick={() => handleLegendClick(cfg.key)}
            onMouseEnter={() => {
              if (legendHoverKey !== cfg.key) setLegendHoverKey(cfg.key);
              // We UPDATE the chart hover too, so the user sees the line highlighted
              if (hoveredKey !== cfg.key) setHoveredKey(cfg.key);
            }}
            onMouseLeave={() => {
              if (legendHoverKey !== null) setLegendHoverKey(null);
              if (hoveredKey !== null) setHoveredKey(null);
            }}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: colour,
              opacity: hidden ? 0.2 : isActive ? 1 : 0.4,
              cursor: 'pointer',
              display: 'inline-block',
              transition: 'opacity 0.2s ease',
              boxShadow: isActive ? `0 0 6px ${colour}` : 'none'
            }}
          ></span>
        );
      })}
    </div>
  );

  const headerRow = (
    <div className="flex flex-col gap-2 w-full mb-2">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
        {/* Title Area: Persistent and Stable */}
        <div className="text-[9px] sm:text-[10px] font-mono font-bold tracking-wider flex-1 min-h-[1.5em] flex items-center">
          {titleContent}
        </div>

        {/* Legend Dots */}
        <div className="flex-shrink-0 pt-1">
          {legendDots}
        </div>
      </div>
    </div>
  );

  if (!hasData) {
    return <p className="text-center text-neutral-400 text-xs text-zinc-500 font-mono">NO PRICE HISTORY DATA</p>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header: title + legend */}
      {headerRow}
      {/* Chart */}
      <div className="flex-1">
        <Line data={{ datasets }} options={options} />
      </div>
    </div>
  );
};

export default RedemptionPriceChart; 