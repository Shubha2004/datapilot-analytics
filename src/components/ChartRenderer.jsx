/**
 * ChartRenderer.jsx — renders a ChartConfig against a Dataset with recharts v2.
 * Props: { config, dataset, height = 300 }.
 *
 * Styling-only layer: every number, aggregation and statistic comes from
 * utils/chartData.js (buildChartData) and is untouched here. This file owns
 * ONE shared visual theme that is applied uniformly to all 9 chart types:
 * categorical palette, font sizes, grid/axis/tooltip styling, legend
 * treatment and margins.
 */
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { buildChartData } from '../utils/chartData';
import { useData } from '../context/DataContext';

/**
 * Categorical palette — distinct hues, all saturated enough to read on both
 * light (white/slate-100) and dark (slate-950) surfaces. Never invents data:
 * series i always maps to palette[i], so colors are stable across chart types.
 */
const CHART_PALETTE = [
  '#6366f1', // indigo-500
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
];

const CHART_FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** The single shared recharts theme. `theme` is the DataContext theme string. */
function getChartTheme(theme) {
  const dark = theme !== 'light';
  return {
    dark,
    palette: CHART_PALETTE,
    fontFamily: CHART_FONT,
    tick: dark ? '#94a3b8' : '#64748b',
    legendText: dark ? '#cbd5e1' : '#475569',
    grid: dark ? '#1e293b' : '#e2e8f0',
    axisLine: dark ? '#334155' : '#cbd5e1',
    cursorFill: dark ? '#94a3b8' : '#64748b',
    tickFontSize: 12,
    smallTickFontSize: 11,
    margin: { top: 8, right: 16, bottom: 8, left: 8 },
  };
}

const seriesColor = (i) => CHART_PALETTE[i % CHART_PALETTE.length];

function truncateLabel(value, max = 18) {
  const s = String(value);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function compactNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function tickLabel(v) {
  const n = Number(v);
  if (Number.isFinite(n)) {
    const r = Math.round(n * 100) / 100;
    return r.toLocaleString('en-US');
  }
  return String(v);
}

/**
 * Shared custom tooltip for every chart type. Colors come from the CSS
 * variables defined in index.css (:root / .dark), which flip with the
 * `dark` class DataContext toggles on <html> — so the tooltip always
 * matches the active theme without JS color branching here.
 *
 * Axis labels are shown in full (never truncated), so long category names
 * that get an ellipsis on the axis remain fully readable on hover.
 */
function ChartTooltip({ active, payload, label, scatter = false, seriesColors }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const showTitle = !scatter && label !== undefined && label !== null && label !== '';
  return (
    <div className="dp-chart-tooltip">
      {showTitle ? (
        <div className="dp-chart-tooltip-title">{String(label)}</div>
      ) : null}
      <div className="dp-chart-tooltip-rows">
        {payload.map((entry, i) => {
          const dotColor =
            (seriesColors && seriesColors[i]) ||
            entry.color ||
            entry.payload?.fill ||
            entry.fill ||
            seriesColor(i);
          const name =
            entry.name !== undefined && entry.name !== null && entry.name !== ''
              ? String(entry.name)
              : entry.dataKey !== undefined && entry.dataKey !== null
                ? String(entry.dataKey)
                : '';
          const value = scatter
            ? `x: ${tickLabel(entry.payload?.x)}, y: ${tickLabel(entry.payload?.y)}`
            : tickLabel(entry.value);
          return (
            <div key={i} className="dp-chart-tooltip-row">
              <span
                className="dp-chart-tooltip-dot"
                style={{ backgroundColor: dotColor }}
                aria-hidden="true"
              />
              {name ? <span className="dp-chart-tooltip-name">{name}</span> : null}
              <span className="dp-chart-tooltip-value">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Custom SVG box plot (recharts has no box plot in v2). */
function BoxPlotSVG({ data, height, theme }) {
  const W = 600;
  const padL = 52;
  const padR = 16;
  const padT = 20;
  const padB = 52;
  const clean = (Array.isArray(data) ? data : []).filter((d) =>
    [d.min, d.q1, d.median, d.q3, d.max].every(
      (v) => typeof v === 'number' && Number.isFinite(v)
    )
  );
  if (clean.length === 0) return null;

  const all = clean.flatMap((d) => [d.min, d.max]);
  let gmin = Math.min(...all);
  let gmax = Math.max(...all);
  if (gmin === gmax) {
    gmin -= 1;
    gmax += 1;
  }
  const plotH = Math.max(40, height - padT - padB);
  const y = (v) => padT + (1 - (v - gmin) / (gmax - gmin)) * plotH;
  const slot = (W - padL - padR) / clean.length;
  const boxW = Math.max(14, Math.min(56, slot * 0.45));
  const capW = boxW * 0.6;
  const color = theme.palette[0];
  const tickFill = theme.tick;
  const labelStyle = { fontFamily: theme.fontFamily };

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Box plot"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = gmin + f * (gmax - gmin);
        const yy = y(v);
        return (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={theme.grid} strokeDasharray="3 3" />
            <text x={padL - 6} y={yy + 3.5} textAnchor="end" fontSize={10} fill={tickFill} style={labelStyle}>
              {tickLabel(v)}
            </text>
          </g>
        );
      })}
      {clean.map((d, i) => {
        const cx = padL + slot * (i + 0.5);
        return (
          <g key={d.group}>
            <title>{String(d.group)}</title>
            <line x1={cx} x2={cx} y1={y(d.min)} y2={y(d.max)} stroke={color} strokeWidth={1.5} />
            <line
              x1={cx - capW / 2}
              x2={cx + capW / 2}
              y1={y(d.min)}
              y2={y(d.min)}
              stroke={color}
              strokeWidth={1.5}
            />
            <line
              x1={cx - capW / 2}
              x2={cx + capW / 2}
              y1={y(d.max)}
              y2={y(d.max)}
              stroke={color}
              strokeWidth={1.5}
            />
            <rect
              x={cx - boxW / 2}
              y={y(d.q3)}
              width={boxW}
              height={Math.max(1, y(d.q1) - y(d.q3))}
              fill={color}
              fillOpacity={0.25}
              stroke={color}
              strokeWidth={1.5}
            />
            <line
              x1={cx - boxW / 2}
              x2={cx + boxW / 2}
              y1={y(d.median)}
              y2={y(d.median)}
              stroke={color}
              strokeWidth={2}
            />
            <text x={cx} y={y(d.median) - 6} textAnchor="middle" fontSize={10} fill={tickFill} style={labelStyle}>
              {tickLabel(d.median)}
            </text>
            <text
              x={cx}
              y={height - padB + 20}
              textAnchor="middle"
              fontSize={theme.smallTickFontSize}
              fill={tickFill}
              style={labelStyle}
            >
              {truncateLabel(d.group, 16)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ChartRenderer({ config, dataset, height = 300 }) {
  // Called unconditionally at the top: this component always renders inside
  // DataProvider, and hooks must not be called inside try/catch blocks.
  const { theme } = useData();

  const { data, seriesKeys, error } = useMemo(
    () => buildChartData(dataset, config),
    [dataset, config]
  );

  // Read-only: honor the OS reduced-motion preference by disabling recharts'
  // JS-driven animations (CSS alone cannot stop them). Computed once.
  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const animationProps = reduceMotion ? { isAnimationActive: false } : {};

  const t = getChartTheme(theme);

  const axisTick = { fill: t.tick, fontSize: t.tickFontSize, fontFamily: t.fontFamily };
  const smallAxisTick = {
    fill: t.tick,
    fontSize: t.smallTickFontSize,
    fontFamily: t.fontFamily,
  };

  const legendProps = {
    wrapperStyle: {
      fontSize: t.tickFontSize,
      lineHeight: '20px',
      paddingTop: 6,
      fontFamily: t.fontFamily,
    },
    formatter: (value) => (
      <span style={{ color: t.legendText }}>{truncateLabel(value, 28)}</span>
    ),
    iconSize: 10,
  };

  const barCursor = { fill: t.cursorFill, fillOpacity: 0.15 };
  const lineCursor = { stroke: t.grid };

  // Shared axis prop bundles — one definition, used by every cartesian chart.
  const categoryXAxis = {
    dataKey: 'x',
    tick: axisTick,
    tickLine: false,
    axisLine: { stroke: t.axisLine },
    interval: 'preserveStart',
    minTickGap: 24,
    tickMargin: 8,
    tickFormatter: (v) => truncateLabel(v),
  };
  const valueYAxis = {
    tick: axisTick,
    tickLine: false,
    axisLine: false,
    tickFormatter: compactNumber,
  };

  const placeholderStyle = {
    height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    border: `1px dashed ${t.grid}`,
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
    color: t.tick,
    fontSize: 13,
    fontFamily: t.fontFamily,
  };

  if (error) {
    return (
      <div className="recharts-export" style={placeholderStyle}>
        <AlertTriangle size={20} color="#f59e0b" />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not build this chart</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="recharts-export" style={placeholderStyle}>
        <BarChart3 size={20} />
        <div>No data to display for this configuration.</div>
      </div>
    );
  }

  const showLegend = seriesKeys.length > 1;
  const seriesColors = seriesKeys.map((_, i) => seriesColor(i));

  const renderChart = () => {
    switch (config && config.type) {
      case 'bar':
        return (
          <BarChart data={data} margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis {...categoryXAxis} />
            <YAxis {...valueYAxis} />
            <Tooltip
              content={<ChartTooltip seriesColors={seriesColors} />}
              cursor={barCursor}
            />
            {showLegend && <Legend {...legendProps} />}
            {seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                fill={seriesColor(i)}
                radius={[4, 4, 0, 0]}
                {...animationProps}
              />
            ))}
          </BarChart>
        );
      case 'hbar':
        return (
          <BarChart data={data} layout="vertical" margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" {...valueYAxis} axisLine={{ stroke: t.axisLine }} />
            <YAxis
              type="category"
              dataKey="x"
              width={110}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => truncateLabel(v)}
            />
            <Tooltip
              content={<ChartTooltip seriesColors={seriesColors} />}
              cursor={barCursor}
            />
            {showLegend && <Legend {...legendProps} />}
            {seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                fill={seriesColor(i)}
                radius={[0, 4, 4, 0]}
                {...animationProps}
              />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data} margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis {...categoryXAxis} />
            <YAxis {...valueYAxis} />
            <Tooltip
              content={<ChartTooltip seriesColors={seriesColors} />}
              cursor={lineCursor}
            />
            {showLegend && <Legend {...legendProps} />}
            {seriesKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={seriesColor(i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                {...animationProps}
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data} margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis {...categoryXAxis} />
            <YAxis {...valueYAxis} />
            <Tooltip
              content={<ChartTooltip seriesColors={seriesColors} />}
              cursor={lineCursor}
            />
            {showLegend && <Legend {...legendProps} />}
            {seriesKeys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={seriesColor(i)}
                fill={seriesColor(i)}
                fillOpacity={0.25}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                {...animationProps}
              />
            ))}
          </AreaChart>
        );
      case 'pie':
      case 'donut': {
        const sliceColors = data.map((_, i) => seriesColor(i));
        return (
          <PieChart>
            <Tooltip content={<ChartTooltip seriesColors={sliceColors} />} />
            <Legend {...legendProps} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="x"
              innerRadius={config.type === 'donut' ? '45%' : 0}
              outerRadius="80%"
              paddingAngle={2}
              {...animationProps}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={sliceColors[i]} />
              ))}
            </Pie>
          </PieChart>
        );
      }
      case 'scatter': {
        const grouped = Boolean(config.groupKey) && seriesKeys.length > 1;
        return (
          <ScatterChart margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={config.xKey}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: t.axisLine }}
              tickMargin={8}
              tickFormatter={compactNumber}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={config.yKey}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
            />
            <Tooltip
              content={<ChartTooltip scatter seriesColors={seriesColors} />}
              cursor={lineCursor}
            />
            {showLegend && <Legend {...legendProps} />}
            {grouped
              ? seriesKeys.map((sk, i) => (
                  <Scatter
                    key={sk}
                    name={sk}
                    data={data.filter((p) => p.group === sk)}
                    fill={seriesColor(i)}
                    {...animationProps}
                  />
                ))
              : (
                <Scatter
                  name={config.yKey || 'values'}
                  data={data}
                  fill={seriesColor(0)}
                  {...animationProps}
                />
              )}
          </ScatterChart>
        );
      }
      case 'histogram':
        return (
          <BarChart data={data} margin={t.margin}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={smallAxisTick}
              tickLine={false}
              axisLine={{ stroke: t.axisLine }}
              interval="preserveStart"
              minTickGap={16}
              tickMargin={8}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip seriesColors={[seriesColor(0)]} />}
              cursor={barCursor}
            />
            <Bar dataKey="count" fill={seriesColor(0)} radius={[4, 4, 0, 0]} {...animationProps} />
          </BarChart>
        );
      case 'box':
        return <BoxPlotSVG data={data} height={height} theme={t} />;
      default:
        return null;
    }
  };

  const chart = renderChart();
  if (!chart) {
    return (
      <div className="recharts-export" style={placeholderStyle}>
        <AlertTriangle size={20} color="#f59e0b" />
        <div>Unsupported chart type.</div>
      </div>
    );
  }

  return (
    <div className="recharts-export">
      {config.type === 'box' ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  );
}
