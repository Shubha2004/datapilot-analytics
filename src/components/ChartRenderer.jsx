/**
 * ChartRenderer.jsx — renders a ChartConfig against a Dataset with recharts v2.
 * Props: { config, dataset, height = 300 }.
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

const PALETTE = [
  '#6366f1',
  '#818cf8',
  '#a5b3fc',
  '#c7d2fe',
  '#4f46e5',
  '#8b5cf6',
  '#a78bfa',
  '#c4b5fd',
];

const AXIS_MARGIN = { top: 8, right: 16, bottom: 8, left: 8 };

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

/** Custom SVG box plot (recharts has no box plot in v2). */
function BoxPlotSVG({ data, height, tick, grid }) {
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
  const color = PALETTE[0];

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
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={grid} strokeDasharray="3 3" />
            <text x={padL - 6} y={yy + 3.5} textAnchor="end" fontSize={10} fill={tick}>
              {tickLabel(v)}
            </text>
          </g>
        );
      })}
      {clean.map((d, i) => {
        const cx = padL + slot * (i + 0.5);
        return (
          <g key={d.group}>
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
            <text x={cx} y={y(d.median) - 6} textAnchor="middle" fontSize={10} fill={tick}>
              {tickLabel(d.median)}
            </text>
            <text
              x={cx}
              y={height - padB + 20}
              textAnchor="middle"
              fontSize={11}
              fill={tick}
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

  const dark = theme !== 'light';
  const tick = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#1e293b' : '#e2e8f0';

  const tooltipStyle = {
    backgroundColor: dark ? '#0f172a' : '#ffffff',
    border: `1px solid ${grid}`,
    borderRadius: 8,
    color: dark ? '#e2e8f0' : '#0f172a',
    fontSize: 12,
  };

  const placeholderStyle = {
    height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    border: `1px dashed ${grid}`,
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
    color: tick,
    fontSize: 13,
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
  const axisTick = { fill: tick, fontSize: 12 };

  const renderChart = () => {
    switch (config && config.type) {
      case 'bar':
        return (
          <BarChart data={data} margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStart"
              tickFormatter={(v) => truncateLabel(v)}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, fillOpacity: 0.2 }} />
            {showLegend && <Legend />}
            {seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                fill={PALETTE[i % PALETTE.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
      case 'hbar':
        return (
          <BarChart data={data} layout="vertical" margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: grid }}
              tickFormatter={compactNumber}
            />
            <YAxis
              type="category"
              dataKey="x"
              width={110}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => truncateLabel(v)}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, fillOpacity: 0.2 }} />
            {showLegend && <Legend />}
            {seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                fill={PALETTE[i % PALETTE.length]}
                radius={[0, 4, 4, 0]}
              />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data} margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStart"
              tickFormatter={(v) => truncateLabel(v)}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: grid }} />
            {showLegend && <Legend />}
            {seriesKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data} margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStart"
              tickFormatter={(v) => truncateLabel(v)}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: grid }} />
            {showLegend && <Legend />}
            {seriesKeys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.25}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        );
      case 'pie':
      case 'donut':
        return (
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Pie
              data={data}
              dataKey="value"
              nameKey="x"
              innerRadius={config.type === 'donut' ? '45%' : 0}
              outerRadius="80%"
              paddingAngle={2}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        );
      case 'scatter': {
        const grouped = Boolean(config.groupKey) && seriesKeys.length > 1;
        return (
          <ScatterChart margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={config.xKey}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: grid }}
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
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: grid }} />
            {showLegend && <Legend />}
            {grouped
              ? seriesKeys.map((sk, i) => (
                  <Scatter
                    key={sk}
                    name={sk}
                    data={data.filter((p) => p.group === sk)}
                    fill={PALETTE[i % PALETTE.length]}
                  />
                ))
              : (
                <Scatter
                  name={config.yKey || 'values'}
                  data={data}
                  fill={PALETTE[0]}
                />
              )}
          </ScatterChart>
        );
      }
      case 'histogram':
        return (
          <BarChart data={data} margin={AXIS_MARGIN}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStart"
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactNumber}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, fillOpacity: 0.2 }} />
            <Bar dataKey="count" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case 'box':
        return <BoxPlotSVG data={data} height={height} tick={tick} grid={grid} />;
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
