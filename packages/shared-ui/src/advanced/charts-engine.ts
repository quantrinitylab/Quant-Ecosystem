// ============================================================================
// @quant/shared-ui - Advanced Charts Engine (SVG-based)
// ============================================================================

import { ChartConfig, DataSeries, DataPoint, AxisConfig, ChartPadding } from './types';

interface AxisData {
  ticks: number[];
  labels: string[];
  min: number;
  max: number;
  step: number;
}

interface ChartElement {
  type: 'path' | 'rect' | 'circle' | 'text' | 'line' | 'arc';
  attrs: Record<string, any>;
  data?: any;
}

interface TooltipData {
  x: number;
  y: number;
  point: DataPoint;
  series: string;
  formattedValue: string;
}

export class ChartsEngine {
  private config: ChartConfig;
  private series: DataSeries[] = [];
  private padding: ChartPadding;
  private chartWidth: number;
  private chartHeight: number;
  private colorPalette: string[] = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
  ];

  constructor(config: ChartConfig) {
    this.config = config;
    this.padding = config.padding || { top: 40, right: 40, bottom: 60, left: 60 };
    this.chartWidth = config.width - this.padding.left - this.padding.right;
    this.chartHeight = config.height - this.padding.top - this.padding.bottom;
  }

  // Set data series
  setData(series: DataSeries[]): void {
    this.series = series;
  }

  // Calculate nice axis ticks (multiples of 1, 2, 5)
  calculateAxis(values: number[], tickCount: number = 5, axisConfig?: AxisConfig): AxisData {
    let min = axisConfig?.min ?? Math.min(...values);
    let max = axisConfig?.max ?? Math.max(...values);

    if (min === max) {
      min -= 1;
      max += 1;
    }

    const range = max - min;
    const rawStep = range / (tickCount - 1);

    // Find nice step value (power of 10 * 1, 2, or 5)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;

    let niceStep: number;
    if (residual <= 1.5) niceStep = 1 * magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    // Compute nice min/max
    const niceMin = Math.floor(min / niceStep) * niceStep;
    const niceMax = Math.ceil(max / niceStep) * niceStep;

    // Generate ticks
    const ticks: number[] = [];
    const format = axisConfig?.format || ((v: number) => String(Math.round(v * 100) / 100));
    for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
      ticks.push(Math.round(v * 1000) / 1000);
    }

    return {
      ticks,
      labels: ticks.map(format),
      min: niceMin,
      max: niceMax,
      step: niceStep,
    };
  }

  // Map data value to pixel coordinate
  private mapX(value: number, xAxis: AxisData): number {
    const ratio = (value - xAxis.min) / (xAxis.max - xAxis.min);
    return this.padding.left + ratio * this.chartWidth;
  }

  private mapY(value: number, yAxis: AxisData): number {
    const ratio = (value - yAxis.min) / (yAxis.max - yAxis.min);
    return this.padding.top + this.chartHeight - ratio * this.chartHeight;
  }

  // Generate line chart path data
  generateLineChart(smooth: boolean = true): ChartElement[] {
    const elements: ChartElement[] = [];
    const allX = this.series.flatMap((s) => s.data.map((p) => p.x));
    const allY = this.series.flatMap((s) => s.data.map((p) => p.y));

    const xAxis = this.calculateAxis(allX, this.config.xAxis?.tickCount || 5, this.config.xAxis);
    const yAxis = this.calculateAxis(allY, this.config.yAxis?.tickCount || 5, this.config.yAxis);

    // Draw axes
    elements.push(...this.generateAxes(xAxis, yAxis));

    // Draw each series
    this.series.forEach((series, idx) => {
      const color = series.color || this.colorPalette[idx % this.colorPalette.length];
      const points = series.data.map((p) => ({
        x: this.mapX(p.x, xAxis),
        y: this.mapY(p.y, yAxis),
      }));

      if (points.length < 2) return;

      let path: string;
      if (smooth) {
        path = this.generateSmoothPath(points);
      } else {
        const first = points[0]!;
        path = `M ${first.x} ${first.y}`;
        for (let i = 1; i < points.length; i++) {
          const pt = points[i]!;
          path += ` L ${pt.x} ${pt.y}`;
        }
      }

      elements.push({
        type: 'path',
        attrs: { d: path, stroke: color, fill: 'none', strokeWidth: 2 },
        data: { series: series.name, type: 'line' },
      });

      // Data points
      points.forEach((point, i) => {
        elements.push({
          type: 'circle',
          attrs: { cx: point.x, cy: point.y, r: 4, fill: color },
          data: { series: series.name, point: series.data[i] },
        });
      });
    });

    return elements;
  }

  // Generate smooth Bezier curve path
  private generateSmoothPath(points: Array<{ x: number; y: number }>): string {
    if (points.length < 2) return '';
    const firstPoint = points[0]!;
    let path = `M ${firstPoint.x} ${firstPoint.y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const next = points[i + 1] ?? curr;
      const prevPrev = points[i - 2] ?? prev;

      // Calculate control points using Catmull-Rom spline
      const tension = 0.3;
      const cp1x = prev.x + (curr.x - prevPrev.x) * tension;
      const cp1y = prev.y + (curr.y - prevPrev.y) * tension;
      const cp2x = curr.x - (next.x - prev.x) * tension;
      const cp2y = curr.y - (next.y - prev.y) * tension;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }

    return path;
  }

  // Generate area chart
  generateAreaChart(smooth: boolean = true): ChartElement[] {
    const elements = this.generateLineChart(smooth);
    const allX = this.series.flatMap((s) => s.data.map((p) => p.x));
    const allY = this.series.flatMap((s) => s.data.map((p) => p.y));
    const xAxis = this.calculateAxis(allX, 5, this.config.xAxis);
    const yAxis = this.calculateAxis(allY, 5, this.config.yAxis);

    // Add fill areas below lines
    this.series.forEach((series, idx) => {
      const color = series.color || this.colorPalette[idx % this.colorPalette.length];
      const points = series.data.map((p) => ({
        x: this.mapX(p.x, xAxis),
        y: this.mapY(p.y, yAxis),
      }));

      if (points.length < 2) return;

      const baseline = this.mapY(yAxis.min, yAxis);
      const firstPt = points[0]!;
      const lastPt = points[points.length - 1]!;
      let areaPath = `M ${firstPt.x} ${baseline}`;
      areaPath += ` L ${firstPt.x} ${firstPt.y}`;
      for (let i = 1; i < points.length; i++) {
        const pt = points[i]!;
        areaPath += ` L ${pt.x} ${pt.y}`;
      }
      areaPath += ` L ${lastPt.x} ${baseline} Z`;

      elements.unshift({
        type: 'path',
        attrs: { d: areaPath, fill: color, opacity: 0.2, stroke: 'none' },
        data: { series: series.name, type: 'area' },
      });
    });

    return elements;
  }

  // Generate bar chart
  generateBarChart(stacked: boolean = false, grouped: boolean = false): ChartElement[] {
    const elements: ChartElement[] = [];
    const allX = this.series.flatMap((s) => s.data.map((p) => p.x));
    const allY = this.series.flatMap((s) => s.data.map((p) => p.y));
    const xAxis = this.calculateAxis(allX, allX.length, this.config.xAxis);
    const yAxis = this.calculateAxis([0, ...allY], 5, this.config.yAxis);

    elements.push(...this.generateAxes(xAxis, yAxis));

    const uniqueX = [...new Set(allX)].sort((a, b) => a - b);
    const barGroupWidth = (this.chartWidth / uniqueX.length) * 0.8;
    const barWidth = grouped ? barGroupWidth / this.series.length : barGroupWidth;
    const baseline = this.mapY(0, yAxis);

    uniqueX.forEach((xVal) => {
      let stackOffset = 0;
      this.series.forEach((series, sIdx) => {
        const point = series.data.find((p) => p.x === xVal);
        if (!point) return;

        const color = series.color || this.colorPalette[sIdx % this.colorPalette.length];
        const barHeight = Math.abs(this.mapY(point.y, yAxis) - baseline);
        let x: number;
        let y: number;

        if (grouped) {
          x = this.mapX(xVal, xAxis) - barGroupWidth / 2 + sIdx * barWidth;
          y = point.y >= 0 ? baseline - barHeight : baseline;
        } else if (stacked) {
          x = this.mapX(xVal, xAxis) - barWidth / 2;
          y = baseline - stackOffset - barHeight;
          stackOffset += barHeight;
        } else {
          x = this.mapX(xVal, xAxis) - barWidth / 2;
          y = point.y >= 0 ? baseline - barHeight : baseline;
        }

        elements.push({
          type: 'rect',
          attrs: { x, y, width: barWidth, height: barHeight, fill: color, rx: 2 },
          data: { series: series.name, point },
        });
      });
    });

    return elements;
  }

  // Generate pie/donut chart
  generatePieChart(donut: boolean = false): ChartElement[] {
    const elements: ChartElement[] = [];
    const firstSeries = this.series[0];
    if (!firstSeries || firstSeries.data.length === 0) return elements;

    const data = firstSeries.data;
    const total = data.reduce((sum, p) => sum + Math.abs(p.y), 0);
    if (total === 0) return elements;

    const cx = this.config.width / 2;
    const cy = this.config.height / 2;
    const outerRadius = Math.min(this.chartWidth, this.chartHeight) / 2 - 10;
    const innerRadius = donut ? outerRadius * 0.6 : 0;

    let startAngle = -Math.PI / 2;

    data.forEach((point, idx) => {
      const sliceAngle = (Math.abs(point.y) / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const color = this.colorPalette[idx % this.colorPalette.length];

      const path = this.generateArcPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle);

      elements.push({
        type: 'path',
        attrs: { d: path, fill: color, stroke: '#fff', strokeWidth: 2 },
        data: { point, percentage: ((Math.abs(point.y) / total) * 100).toFixed(1) },
      });

      startAngle = endAngle;
    });

    return elements;
  }

  // Generate SVG arc path for pie slices
  private generateArcPath(
    cx: number,
    cy: number,
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number,
  ): string {
    const startOuter = {
      x: cx + outerR * Math.cos(startAngle),
      y: cy + outerR * Math.sin(startAngle),
    };
    const endOuter = { x: cx + outerR * Math.cos(endAngle), y: cy + outerR * Math.sin(endAngle) };
    const startInner = { x: cx + innerR * Math.cos(endAngle), y: cy + innerR * Math.sin(endAngle) };
    const endInner = {
      x: cx + innerR * Math.cos(startAngle),
      y: cy + innerR * Math.sin(startAngle),
    };

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    if (innerR === 0) {
      return `M ${cx} ${cy} L ${startOuter.x} ${startOuter.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} Z`;
    }

    return `M ${startOuter.x} ${startOuter.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} L ${startInner.x} ${startInner.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y} Z`;
  }

  // Generate scatter plot
  generateScatterPlot(): ChartElement[] {
    const elements: ChartElement[] = [];
    const allX = this.series.flatMap((s) => s.data.map((p) => p.x));
    const allY = this.series.flatMap((s) => s.data.map((p) => p.y));
    const xAxis = this.calculateAxis(allX, 5, this.config.xAxis);
    const yAxis = this.calculateAxis(allY, 5, this.config.yAxis);

    elements.push(...this.generateAxes(xAxis, yAxis));

    this.series.forEach((series, idx) => {
      const color = series.color || this.colorPalette[idx % this.colorPalette.length];
      series.data.forEach((point) => {
        elements.push({
          type: 'circle',
          attrs: {
            cx: this.mapX(point.x, xAxis),
            cy: this.mapY(point.y, yAxis),
            r: 5,
            fill: color,
            opacity: 0.7,
          },
          data: { series: series.name, point },
        });
      });
    });

    return elements;
  }

  // Generate radar chart
  generateRadarChart(): ChartElement[] {
    const elements: ChartElement[] = [];
    if (this.series.length === 0) return elements;

    const firstRadarSeries = this.series[0]!;
    const cx = this.config.width / 2;
    const cy = this.config.height / 2;
    const radius = Math.min(this.chartWidth, this.chartHeight) / 2 - 20;
    const axes = firstRadarSeries.data.length;
    const angleStep = (2 * Math.PI) / axes;

    // Draw grid circles
    for (let level = 1; level <= 5; level++) {
      const r = (radius / 5) * level;
      let gridPath = '';
      for (let i = 0; i < axes; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        gridPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
      gridPath += ' Z';
      elements.push({
        type: 'path',
        attrs: { d: gridPath, stroke: '#ddd', fill: 'none', strokeWidth: 1 },
      });
    }

    // Draw axis lines
    for (let i = 0; i < axes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      elements.push({
        type: 'line',
        attrs: {
          x1: cx,
          y1: cy,
          x2: cx + radius * Math.cos(angle),
          y2: cy + radius * Math.sin(angle),
          stroke: '#ddd',
          strokeWidth: 1,
        },
      });
    }

    // Draw data polygons
    const maxVal = Math.max(...this.series.flatMap((s) => s.data.map((p) => p.y)));
    this.series.forEach((series, idx) => {
      const color = series.color || this.colorPalette[idx % this.colorPalette.length];
      let path = '';
      series.data.forEach((point, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (point.y / maxVal) * radius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      });
      path += ' Z';
      elements.push({
        type: 'path',
        attrs: { d: path, stroke: color, fill: color, fillOpacity: 0.2, strokeWidth: 2 },
        data: { series: series.name },
      });
    });

    return elements;
  }

  // Generate funnel chart
  generateFunnelChart(): ChartElement[] {
    const elements: ChartElement[] = [];
    const firstFunnelSeries = this.series[0];
    if (!firstFunnelSeries || firstFunnelSeries.data.length === 0) return elements;

    const data = firstFunnelSeries.data;
    const maxVal = Math.max(...data.map((p) => p.y));
    const sectionHeight = this.chartHeight / data.length;
    const cx = this.config.width / 2;

    data.forEach((point, idx) => {
      const currentWidth = (point.y / maxVal) * this.chartWidth;
      const nextPoint = data[idx + 1];
      const nextWidth =
        nextPoint !== undefined ? (nextPoint.y / maxVal) * this.chartWidth : currentWidth * 0.7;

      const y1 = this.padding.top + idx * sectionHeight;
      const y2 = y1 + sectionHeight;

      const path = `M ${cx - currentWidth / 2} ${y1} L ${cx + currentWidth / 2} ${y1} L ${cx + nextWidth / 2} ${y2} L ${cx - nextWidth / 2} ${y2} Z`;
      const color = this.colorPalette[idx % this.colorPalette.length];

      elements.push({
        type: 'path',
        attrs: { d: path, fill: color, stroke: '#fff', strokeWidth: 1 },
        data: { point },
      });
    });

    return elements;
  }

  // Generate axis elements
  private generateAxes(xAxis: AxisData, yAxis: AxisData): ChartElement[] {
    const elements: ChartElement[] = [];

    // X axis line
    elements.push({
      type: 'line',
      attrs: {
        x1: this.padding.left,
        y1: this.padding.top + this.chartHeight,
        x2: this.padding.left + this.chartWidth,
        y2: this.padding.top + this.chartHeight,
        stroke: '#333',
        strokeWidth: 1,
      },
    });

    // Y axis line
    elements.push({
      type: 'line',
      attrs: {
        x1: this.padding.left,
        y1: this.padding.top,
        x2: this.padding.left,
        y2: this.padding.top + this.chartHeight,
        stroke: '#333',
        strokeWidth: 1,
      },
    });

    // X axis ticks and labels
    xAxis.ticks.forEach((tick, i) => {
      const x = this.mapX(tick, xAxis);
      elements.push({
        type: 'text',
        attrs: {
          x,
          y: this.padding.top + this.chartHeight + 20,
          text: xAxis.labels[i] ?? '',
          anchor: 'middle',
        },
      });
      if (this.config.xAxis?.gridLines) {
        elements.push({
          type: 'line',
          attrs: {
            x1: x,
            y1: this.padding.top,
            x2: x,
            y2: this.padding.top + this.chartHeight,
            stroke: '#eee',
            strokeWidth: 1,
          },
        });
      }
    });

    // Y axis ticks and labels
    yAxis.ticks.forEach((tick, i) => {
      const y = this.mapY(tick, yAxis);
      elements.push({
        type: 'text',
        attrs: { x: this.padding.left - 10, y, text: yAxis.labels[i] ?? '', anchor: 'end' },
      });
      if (this.config.yAxis?.gridLines) {
        elements.push({
          type: 'line',
          attrs: {
            x1: this.padding.left,
            y1: y,
            x2: this.padding.left + this.chartWidth,
            y2: y,
            stroke: '#eee',
            strokeWidth: 1,
          },
        });
      }
    });

    return elements;
  }

  // Generate legend data
  generateLegend(): Array<{ label: string; color: string }> {
    return this.series.map((s, i) => ({
      label: s.name,
      color: s.color ?? this.colorPalette[i % this.colorPalette.length] ?? '#3b82f6',
    }));
  }

  // Calculate tooltip position
  calculateTooltipPosition(
    cursorX: number,
    cursorY: number,
    tooltipWidth: number = 150,
    tooltipHeight: number = 60,
  ): { x: number; y: number } {
    let x = cursorX + 10;
    let y = cursorY - tooltipHeight - 10;

    // Avoid right edge
    if (x + tooltipWidth > this.config.width) {
      x = cursorX - tooltipWidth - 10;
    }
    // Avoid top edge
    if (y < 0) {
      y = cursorY + 10;
    }

    return { x, y };
  }

  // Find nearest data point to cursor
  findNearestPoint(cursorX: number, cursorY: number): TooltipData | null {
    const allX = this.series.flatMap((s) => s.data.map((p) => p.x));
    const allY = this.series.flatMap((s) => s.data.map((p) => p.y));
    if (allX.length === 0) return null;

    const xAxis = this.calculateAxis(allX, 5, this.config.xAxis);
    const yAxis = this.calculateAxis(allY, 5, this.config.yAxis);

    let nearest: {
      distance: number;
      point: DataPoint;
      series: string;
      x: number;
      y: number;
    } | null = null;

    for (const series of this.series) {
      for (const point of series.data) {
        const px = this.mapX(point.x, xAxis);
        const py = this.mapY(point.y, yAxis);
        const distance = Math.sqrt((px - cursorX) ** 2 + (py - cursorY) ** 2);
        if (!nearest || distance < nearest.distance) {
          nearest = { distance, point, series: series.name, x: px, y: py };
        }
      }
    }

    if (!nearest || nearest.distance > 50) return null;

    return {
      x: nearest.x,
      y: nearest.y,
      point: nearest.point,
      series: nearest.series,
      formattedValue: `${nearest.series}: ${nearest.point.y}`,
    };
  }

  // Resize handler
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.chartWidth = width - this.padding.left - this.padding.right;
    this.chartHeight = height - this.padding.top - this.padding.bottom;
  }

  // Render chart based on config type
  render(): ChartElement[] {
    switch (this.config.type) {
      case 'line':
        return this.generateLineChart();
      case 'area':
        return this.generateAreaChart();
      case 'bar':
        return this.generateBarChart();
      case 'pie':
        return this.generatePieChart(false);
      case 'donut':
        return this.generatePieChart(true);
      case 'scatter':
        return this.generateScatterPlot();
      case 'radar':
        return this.generateRadarChart();
      case 'funnel':
        return this.generateFunnelChart();
      default:
        return this.generateLineChart();
    }
  }
}

export default ChartsEngine;
