import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const packageName = 'dom-to-pptx';
  const url = `https://api.npmjs.org/downloads/range/last-year/${packageName}`;
  console.log(`Fetching npm downloads from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`npm API responded with ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  const rawList = json.downloads || [];

  if (rawList.length === 0) {
    console.warn('No download data returned.');
    return;
  }

  // Aggregate daily downloads into weekly buckets (~52 buckets)
  const weeklyBuckets = [];
  const chunkSize = 7;
  for (let i = 0; i < rawList.length; i += chunkSize) {
    const chunk = rawList.slice(i, i + chunkSize);
    const sum = chunk.reduce((acc, c) => acc + c.downloads, 0);
    const startDate = chunk[0].day;
    weeklyBuckets.push({
      date: startDate,
      downloads: sum,
    });
  }

  const totalDownloads = rawList.reduce((acc, c) => acc + c.downloads, 0);
  const maxWeekly = Math.max(...weeklyBuckets.map((b) => b.downloads), 1);
  const avgWeekly = Math.round(totalDownloads / weeklyBuckets.length);

  // SVG dimensions & margins
  const width = 850;
  const height = 320;
  const margin = { top: 70, right: 30, bottom: 45, left: 65 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // Nice scale for Y-axis
  const yTicksCount = 4;
  const niceMax = Math.ceil(maxWeekly / 10000) * 10000 || maxWeekly;
  const getY = (val) => margin.top + chartH - (val / niceMax) * chartH;
  const getX = (index) => margin.left + (index / (weeklyBuckets.length - 1)) * chartW;

  // Build path coordinates
  const points = weeklyBuckets.map((b, i) => ({
    x: getX(i),
    y: getY(b.downloads),
  }));

  // Build smooth cubic curve
  let lineD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  // Area path closing down to baseline
  const baselineY = margin.top + chartH;
  const areaD = `${lineD} L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`;

  // Grid lines and labels
  let gridSvg = '';
  for (let i = 0; i <= yTicksCount; i++) {
    const val = Math.round((niceMax / yTicksCount) * i);
    const y = getY(val);
    const label = val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`;
    gridSvg += `
      <line class="grid" x1="${margin.left}" y1="${y.toFixed(1)}" x2="${margin.left + chartW}" y2="${y.toFixed(1)}" />
      <text class="text-axis" x="${margin.left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${label}</text>
    `;
  }

  // X-axis month labels (sampling ~6 evenly spaced dates)
  let xLabelsSvg = '';
  const monthIndices = [0, 10, 20, 30, 40, weeklyBuckets.length - 1];
  for (const idx of monthIndices) {
    if (idx < weeklyBuckets.length) {
      const b = weeklyBuckets[idx];
      const d = new Date(b.date);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const x = getX(idx);
      xLabelsSvg += `<text class="text-axis" x="${x.toFixed(1)}" y="${height - 15}" text-anchor="middle">${label}</text>`;
    }
  }

  const formatNum = (n) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.00"/>
    </linearGradient>
  </defs>

  <style>
    .bg { fill: #0d1117; stroke: #30363d; stroke-width: 1px; rx: 12px; }
    .grid { stroke: #21262d; stroke-dasharray: 4, 4; stroke-width: 1px; }
    .text-title { fill: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; }
    .text-stat-val { fill: #58a6ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; }
    .text-stat-lbl { fill: #8b949e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; }
    .text-axis { fill: #8b949e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; }
    .line { fill: none; stroke: #3b82f6; stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; }
    .area { fill: url(#chartGradient); }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #d0d7de; }
      .grid { stroke: #eaeef2; }
      .text-title { fill: #1f2328; }
      .text-stat-val { fill: #0969da; }
      .text-stat-lbl { fill: #656d76; }
      .text-axis { fill: #656d76; }
      .line { stroke: #0969da; }
    }
  </style>

  <rect width="${width}" height="${height}" class="bg" />

  <!-- Header -->
  <g transform="translate(${margin.left}, 32)">
    <text class="text-title" y="0">npm Download Trend</text>
    <text class="text-stat-lbl" y="16">last 12 months • rolling weekly volume</text>
  </g>

  <!-- Key Metrics (Top Right) -->
  <g transform="translate(${width - margin.right - 280}, 24)">
    <text class="text-stat-lbl" x="0" y="0">Total Annual</text>
    <text class="text-stat-val" x="0" y="20">${formatNum(totalDownloads)}</text>

    <text class="text-stat-lbl" x="100" y="0">Weekly Avg</text>
    <text class="text-stat-val" x="100" y="20">${formatNum(avgWeekly)}</text>

    <text class="text-stat-lbl" x="200" y="0">Peak / Wk</text>
    <text class="text-stat-val" x="200" y="20">${formatNum(maxWeekly)}</text>
  </g>

  <!-- Grid and Y-Axis -->
  ${gridSvg}

  <!-- Chart Area & Line -->
  <path class="area" d="${areaD}" />
  <path class="line" d="${lineD}" />

  <!-- X-Axis Labels -->
  ${xLabelsSvg}
</svg>
`;

  const outPath = path.resolve(__dirname, '..', 'assets', 'download-trend.svg');
  fs.writeFileSync(outPath, svg.trim() + '\n', 'utf8');
  console.log(`✅ Generated download chart at: ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to generate download chart:', err);
  process.exit(1);
});
