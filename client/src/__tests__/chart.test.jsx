/**
 * The hand-rolled charts.
 *
 * These replaced recharts, so the geometry is now ours: if a scale is wrong the
 * bars are simply the wrong length, and nothing throws to say so. A screen test
 * that only looks for a product reference would pass against a chart drawn
 * entirely inside its own axis.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { LineChart, BarChart, HorizontalBarChart } from '@/components/Chart';

const SERIES = [
  { key: 'totalIn', name: 'Entrées', color: '#0f766e' },
  { key: 'totalOut', name: 'Sorties', color: '#b45309' },
];

const CURVE = [
  { label: '09/08', totalIn: 50, totalOut: 30 },
  { label: '10/08', totalIn: 20, totalOut: 45 },
  { label: '11/08', totalIn: 0, totalOut: 10 },
];

describe('LineChart', () => {
  it('draws one polyline per series, with a point per row', () => {
    const { container } = render(<LineChart data={CURVE} xKey="label" series={SERIES} />);
    const lines = [...container.querySelectorAll('polyline')];

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.getAttribute('points').trim().split(/\s+/)).toHaveLength(CURVE.length);
    }
    expect(lines[0].getAttribute('stroke')).toBe('#0f766e');
  });

  it('puts the largest value at the top of the axis, not off it', () => {
    const { container } = render(<LineChart data={CURVE} xKey="label" series={SERIES} />);
    const ys = container
      .querySelector('polyline')
      .getAttribute('points')
      .split(/\s+/)
      .map((p) => Number(p.split(',')[1]));

    // SVG y grows downward, so every point must sit at or below the top edge
    // and at or above the baseline. A wrong scale puts them outside both.
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(400);
  });

  it('labels the axis with round numbers rather than the raw maximum', () => {
    const { container } = render(<LineChart data={CURVE} xKey="label" series={SERIES} />);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    // 50 is the max; a human axis tops out at 50 or 60, never at 50.0000001.
    expect(labels).toContain('0');
    expect(labels.some((l) => /^(50|60)$/.test(l))).toBe(true);
  });

  it('renders the empty label instead of an axis with nothing on it', () => {
    const { container } = render(
      <LineChart data={[]} xKey="label" series={SERIES} emptyLabel="Aucune donnée" />
    );
    expect(container.textContent).toContain('Aucune donnée');
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('survives a single point, which has no width to divide by', () => {
    const { container } = render(
      <LineChart data={[CURVE[0]]} xKey="label" series={SERIES} />
    );
    const points = container.querySelector('polyline').getAttribute('points');
    expect(points).not.toContain('NaN');
  });
});

describe('BarChart', () => {
  it('draws a bar per series per row', () => {
    const { container } = render(<BarChart data={CURVE} xKey="label" series={SERIES} />);
    const bars = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') !== 'transparent');
    expect(bars).toHaveLength(CURVE.length * SERIES.length);
  });

  it('gives a zero value no height, and never a negative one', () => {
    const { container } = render(<BarChart data={CURVE} xKey="label" series={SERIES} />);
    const heights = [...container.querySelectorAll('rect')]
      .filter((r) => r.getAttribute('fill') !== 'transparent')
      .map((r) => Number(r.getAttribute('height')));

    expect(Math.min(...heights)).toBe(0);
    expect(heights.every((h) => h >= 0)).toBe(true);
  });
});

describe('HorizontalBarChart', () => {
  const TRENDING = [
    { name: 'BOI-010', value: 318, full: 'Eau minérale 1.5L' },
    { name: 'ALI-001', value: 42, full: 'Tomate 400g' },
  ];

  it('draws a bar per row and labels each one', () => {
    const { container } = render(
      <HorizontalBarChart
        data={TRENDING}
        labelKey="name"
        valueKey="value"
        titleKey="full"
        color="#b45309"
        name="Sorties"
      />
    );
    const bars = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === '#b45309');
    expect(bars).toHaveLength(2);
    expect(container.textContent).toContain('BOI-010');
  });

  it('scales bar width by value, so the bigger number draws the longer bar', () => {
    const { container } = render(
      <HorizontalBarChart data={TRENDING} labelKey="name" valueKey="value" color="#b45309" name="Sorties" />
    );
    const [first, second] = [...container.querySelectorAll('rect')]
      .filter((r) => r.getAttribute('fill') === '#b45309')
      .map((r) => Number(r.getAttribute('width')));

    expect(first).toBeGreaterThan(second);
  });
});
