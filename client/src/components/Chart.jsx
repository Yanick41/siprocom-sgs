import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The three charts this application draws, in SVG.
 *
 * Replaces recharts, which was 362 kB - larger than the rest of the dashboard
 * put together, and by a wide margin the biggest thing a magasinier's tablet
 * downloaded. What it was being asked to do is a line with two series, a
 * horizontal bar, and a grouped vertical bar. That is a few hundred lines of
 * SVG, and it does not need a layout engine.
 *
 * Deliberately not a chart library. There is no plugin surface, no animation
 * system and no automatic type inference, because the three call sites are all
 * in this repository and can simply be edited.
 *
 * Lines are straight between points, not smoothed. A monotone curve looks
 * better and is a lie: it draws stock levels between two days that nobody
 * measured, and on a movements curve the invented dip reads as a real one.
 */

const AXIS = '#64748b';
const GRID = '#e2e8f0';

/** Measures the container so text stays crisp instead of being scaled by a viewBox. */
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({ width: Math.round(box.width), height: Math.round(box.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Axis ticks a person would have chosen: 1, 2 or 5 times a power of ten.
 * Raw maxima give axes labelled 0, 317, 634, which nobody can read against.
 */
function niceTicks(max, count = 4) {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function Legend({ series }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-4">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Follows the pointer, clamped so it never leaves the card. */
function Tooltip({ x, y, width, children }) {
  const left = Math.min(Math.max(x, 8), Math.max(width - 8, 8));
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left, top: Math.max(y - 8, 8) }}
    >
      {children}
    </div>
  );
}

function EmptyPlot({ label }) {
  return <p className="flex h-full items-center justify-center text-sm text-slate-400">{label}</p>;
}

/* ------------------------------------------------------------------ line -- */

export function LineChart({ data, xKey, series, formatValue = String, emptyLabel = '' }) {
  const [ref, { width, height }] = useSize();
  const [hover, setHover] = useState(null);

  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const plotW = Math.max(width - pad.left - pad.right, 0);
  const plotH = Math.max(height - pad.top - pad.bottom, 0);

  const max = Math.max(1, ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  // A single point has no width to divide, so it sits in the middle.
  const xAt = (i) => (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yAt = (v) => plotH - ((Number(v) || 0) / top) * plotH;

  const onMove = useCallback(
    (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.left - pad.left;
      if (data.length === 0 || plotW <= 0) return;
      const step = data.length <= 1 ? plotW : plotW / (data.length - 1);
      const index = Math.min(data.length - 1, Math.max(0, Math.round(x / step)));
      setHover(index);
    },
    [data.length, plotW, pad.left]
  );

  if (data.length === 0) return <EmptyPlot label={emptyLabel} />;

  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="relative min-h-0 flex-1">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <g transform={`translate(${pad.left},${pad.top})`}>
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={0} x2={plotW} y1={yAt(tick)} y2={yAt(tick)} stroke={GRID} strokeDasharray="3 3" />
                  <text x={-8} y={yAt(tick) + 4} textAnchor="end" fontSize="11" fill={AXIS}>
                    {formatValue(tick)}
                  </text>
                </g>
              ))}

              {data.map((row, i) => {
                // Thin the labels rather than let them overlap into mush.
                const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64)));
                if (i % every !== 0) return null;
                return (
                  <text key={i} x={xAt(i)} y={plotH + 16} textAnchor="middle" fontSize="11" fill={AXIS}>
                    {row[xKey]}
                  </text>
                );
              })}

              {series.map((s) => (
                <polyline
                  key={s.key}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={data.map((row, i) => `${xAt(i)},${yAt(row[s.key])}`).join(' ')}
                />
              ))}

              {hover !== null && (
                <>
                  <line x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={plotH} stroke={GRID} />
                  {series.map((s) => (
                    <circle
                      key={s.key}
                      cx={xAt(hover)}
                      cy={yAt(data[hover][s.key])}
                      r="3.5"
                      fill="#fff"
                      stroke={s.color}
                      strokeWidth="2"
                    />
                  ))}
                </>
              )}
            </g>
          </svg>
        )}

        {hover !== null && (
          <Tooltip x={pad.left + xAt(hover)} y={pad.top} width={width}>
            <p className="font-semibold text-slate-900">{data[hover][xKey]}</p>
            {series.map((s) => (
              <p key={s.key} style={{ color: s.color }}>
                {s.name} : {formatValue(data[hover][s.key])}
              </p>
            ))}
          </Tooltip>
        )}
      </div>
      <Legend series={series} />
    </div>
  );
}

/* ------------------------------------------------------- grouped columns -- */

export function BarChart({ data, xKey, series, formatValue = String, emptyLabel = '' }) {
  const [ref, { width, height }] = useSize();
  const [hover, setHover] = useState(null);

  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const plotW = Math.max(width - pad.left - pad.right, 0);
  const plotH = Math.max(height - pad.top - pad.bottom, 0);

  const max = Math.max(1, ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, (slot * 0.62) / series.length);

  if (data.length === 0) return <EmptyPlot label={emptyLabel} />;

  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="relative min-h-0 flex-1">
        {width > 0 && (
          <svg width={width} height={height} role="img">
            <g transform={`translate(${pad.left},${pad.top})`}>
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={plotW}
                    y1={plotH - (tick / top) * plotH}
                    y2={plotH - (tick / top) * plotH}
                    stroke={GRID}
                    strokeDasharray="3 3"
                  />
                  <text x={-8} y={plotH - (tick / top) * plotH + 4} textAnchor="end" fontSize="11" fill={AXIS}>
                    {formatValue(tick)}
                  </text>
                </g>
              ))}

              {data.map((row, i) => (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {/* Full-height target: hovering a two-pixel bar is a fight. */}
                  <rect x={i * slot} y={0} width={slot} height={plotH} fill="transparent" />
                  {series.map((s, si) => {
                    const value = Number(row[s.key]) || 0;
                    const barH = (value / top) * plotH;
                    return (
                      <rect
                        key={s.key}
                        x={i * slot + slot * 0.19 + si * barW}
                        y={plotH - barH}
                        width={barW}
                        height={barH}
                        fill={s.color}
                        rx="2"
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                  <text x={i * slot + slot / 2} y={plotH + 16} textAnchor="middle" fontSize="11" fill={AXIS}>
                    {String(row[xKey]).slice(0, 12)}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )}

        {hover !== null && (
          <Tooltip x={pad.left + hover * slot + slot / 2} y={pad.top} width={width}>
            <p className="font-semibold text-slate-900">{data[hover][xKey]}</p>
            {series.map((s) => (
              <p key={s.key} style={{ color: s.color }}>
                {s.name} : {formatValue(data[hover][s.key])}
              </p>
            ))}
          </Tooltip>
        )}
      </div>
      <Legend series={series} />
    </div>
  );
}

/* ------------------------------------------------------ horizontal bars -- */

export function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  titleKey,
  color,
  name,
  formatValue = String,
  emptyLabel = '',
}) {
  const [ref, { width, height }] = useSize();
  const [hover, setHover] = useState(null);

  const pad = { top: 8, right: 12, bottom: 20, left: 76 };
  const plotW = Math.max(width - pad.left - pad.right, 0);
  const plotH = Math.max(height - pad.top - pad.bottom, 0);

  const max = Math.max(1, ...data.map((row) => Number(row[valueKey]) || 0));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1];

  const slot = data.length ? plotH / data.length : 0;
  const barH = Math.max(4, slot * 0.6);

  if (data.length === 0) return <EmptyPlot label={emptyLabel} />;

  return (
    <div ref={ref} className="relative h-full">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          <g transform={`translate(${pad.left},${pad.top})`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={(tick / top) * plotW}
                  x2={(tick / top) * plotW}
                  y1={0}
                  y2={plotH}
                  stroke={GRID}
                  strokeDasharray="3 3"
                />
                <text x={(tick / top) * plotW} y={plotH + 14} textAnchor="middle" fontSize="11" fill={AXIS}>
                  {formatValue(tick)}
                </text>
              </g>
            ))}

            {data.map((row, i) => {
              const value = Number(row[valueKey]) || 0;
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={0} y={i * slot} width={plotW} height={slot} fill="transparent" />
                  <text x={-8} y={i * slot + slot / 2 + 4} textAnchor="end" fontSize="11" fill={AXIS}>
                    {String(row[labelKey]).slice(0, 11)}
                  </text>
                  <rect
                    x={0}
                    y={i * slot + (slot - barH) / 2}
                    width={(value / top) * plotW}
                    height={barH}
                    fill={color}
                    rx="2"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {hover !== null && (
        <Tooltip x={pad.left + plotW / 2} y={pad.top + hover * slot + slot / 2} width={width}>
          <p className="font-semibold text-slate-900">{data[hover][titleKey] ?? data[hover][labelKey]}</p>
          <p style={{ color }}>
            {name} : {formatValue(data[hover][valueKey])}
          </p>
        </Tooltip>
      )}
    </div>
  );
}
