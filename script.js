const formatOrder = ["Vinyl", "Tape", "CD / Disc", "Digital Download", "Streaming"];
const labels = {
  Vinyl: "Vinyl",
  Tape: "Tape",
  "CD / Disc": "CD / Disc",
  "Digital Download": "Digital Download",
  Streaming: "Streaming",
};
const colors = {
  Vinyl: "#f97316",
  Tape: "#22c55e",
  "CD / Disc": "#facc15",
  "Digital Download": "#60a5fa",
  Streaming: "#c084fc",
};
const dashboardStoryRecaps = {
  Vinyl:
    "Vinyl defined the early music industry and represented the era of physical ownership before portable formats emerged.",
  Tape:
    "Cassette tapes surpassed vinyl by offering portability and convenience, becoming the dominant format of the late 1980s.",
  "CD / Disc":
    "CDs generated the highest revenue in music industry history and marked the peak of physical media sales.",
  "Digital Download":
    "Digital downloads introduced online music purchases but failed to fully replace declining CD revenue.",
  Streaming:
    "Streaming transformed music into an on-demand service and became the dominant source of industry revenue.",
};
const donutFormatInsights = {
  Streaming: [
    "The dominant format in {year}.",
    "More than all other formats combined.",
  ],
  "CD / Disc": [
    "Once the industry's largest format,",
    "but largely replaced by streaming.",
  ],
  Vinyl: ["Experienced a niche revival in the streaming era."],
  Tape: ["No longer a meaningful revenue source."],
  "Digital Download": ["Peaked in the late 2000s before streaming took over."],
};

function formatRevenueShort(valueInMillions) {
  return `$${d3.format(".1f")(valueInMillions / 1000)}B`;
}

function getDashboardStoryRecap(format) {
  return dashboardStoryRecaps[format] || "";
}
const CHART_CONTAINER_IDS = [
  "stacked-area",
  "vinyl-tape-line",
  "cd-revolution",
  "disruption-timeline",
  "streaming-dominance",
  "interactive-dashboard",
];
let cachedData = null;
let resizeTimer = null;

function classifyFormat(rawFormat) {
  const f = rawFormat.toLowerCase();
  if (f.includes("lp/ep") || f.includes("vinyl")) return "Vinyl";
  if (f.includes("cassette") || f.includes("8 - track") || f.includes("other tapes") || f.includes("tape")) return "Tape";
  if (f.includes("cd") || f.includes("disc")) return "CD / Disc";
  if (f.includes("download")) return "Digital Download";
  if (f.includes("streaming") || f.includes("subscription") || f.includes("soundexchange")) return "Streaming";
  return null;
}

function toNumeric(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadStoryData() {
  const raw = await d3.csv("./musicdata.csv");
  const valueRows = raw.filter((d) => d.metric === "Value");
  const byYear = d3.group(valueRows, (d) => Number.parseInt(d.year, 10));
  const wideData = [];

  byYear.forEach((rows, year) => {
    if (!Number.isFinite(year)) return;
    const point = { Year: year };
    formatOrder.forEach((k) => {
      point[k] = 0;
    });

    rows.forEach((r) => {
      const category = classifyFormat(r.format);
      if (!category) return;
      point[category] += toNumeric(r.value_actual);
    });

    point.total = formatOrder.reduce((acc, k) => acc + point[k], 0);
    wideData.push(point);
  });

  wideData.sort((a, b) => a.Year - b.Year);
  return wideData;
}

function drawAxes(svg, xScale, yScale, width, height, margin) {
  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(() => ""));

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(() => ""));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(5));
}

function createSvg(containerId, minHeight = 320) {
  const container = document.getElementById(containerId);
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(minHeight, 300);
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  return { svg, width, height };
}

// 1. Stacked area chart
// Transformation of the Music Industry by Format
// Animated timeline reveal, annotations, legend, replay
function renderStackedArea(wideData) {
  const { svg, width, height } = createSvg("stacked-area");
  const vizContainer = d3.select("#stacked-area");
  const compact = width < 760;
  const legendWidth = compact ? 140 : 150;
  const margin = { top: 30, right: legendWidth + 24, bottom: 50, left: 70 };
  const series = d3.stack().keys(formatOrder)(wideData);
  const x = d3
    .scaleLinear()
    .domain(d3.extent(wideData, (d) => d.Year))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1]))])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const area = d3
    .area()
    .x((d) => x(d.data.Year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveLinear);

  const paths = svg
    .append("g")
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("fill", (d) => colors[d.key])
    .attr("opacity", 0.85)
    .attr("d", area);

  const clip = svg.append("clipPath").attr("id", "timeline-reveal");
  const clipRect = clip
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", 0)
    .attr("height", height - margin.top - margin.bottom);
  paths.attr("clip-path", "url(#timeline-reveal)");

  const annotations = [
    {
      year: 1977,
      text: "Vinyl & Tape dominate",
      format: "Vinyl",
      dx: 22,
      dy: -42,
      textColor: colors.Vinyl,
    },
    {
      year: 1990,
      text: "CD / Disc dominates",
      format: "CD / Disc",
      dx: 12,
      dy: -28,
      textColor: colors["CD / Disc"],
    },
    {
      year: 2000,
      text: "CD revenue drops",
      format: "CD / Disc",
      dx: 24,
      dy: 26,
      textColor: colors["CD / Disc"],
    },
    {
      year: 2015,
      text: "Streaming rises rapidly",
      format: "Streaming",
      dx: -78,
      dy: -42,
      textColor: colors.Streaming,
    },
  ];
  const compactAdjustments = {
    "Vinyl & Tape dominate": { dx: 10, dy: -28 },
    "CD / Disc dominates": { dx: 8, dy: -18 },
    "CD revenue drops": { dx: 15, dy: 18 },
    "Streaming rises rapidly": { dx: -46, dy: -30 },
  };

  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 10)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#dbe6ff");

  function getAnnotationPoint(format, year) {
    const targetSeries = series.find((s) => s.key === format);
    if (!targetSeries) return null;
    const point = targetSeries.find((d) => d.data.Year === year);
    if (!point) return null;
    return { x: x(year), y: y(point[1]) };
  }

  const annotationGroups = svg
    .append("g")
    .attr("class", "annotations")
    .selectAll("g")
    .data(annotations)
    .join("g")
    .attr("opacity", 0);

  annotationGroups.each(function eachAnnotation(a) {
    const point = getAnnotationPoint(a.format, a.year);
    if (!point) return;

    const g = d3.select(this);
    const adjust = compact ? compactAdjustments[a.text] : null;
    const labelX = point.x + (adjust ? adjust.dx : a.dx);
    const labelY = point.y + (adjust ? adjust.dy : a.dy);

    g.append("line")
      .attr("x1", labelX)
      .attr("y1", labelY + 8)
      .attr("x2", point.x)
      .attr("y2", point.y)
      .attr("stroke", "#dbe6ff")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    g.append("text")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("font-size", compact ? 11 : 13)
      .attr("font-weight", "bold")
      .attr("fill", a.textColor)
      .text(a.text);
  });

  const marker = svg
    .append("line")
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#f8fbff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.6);

  const eraLabel = svg
    .append("text")
    .attr("x", margin.left + 10)
    .attr("y", margin.top + 25)
    .attr("font-size", 18)
    .attr("font-weight", "bold")
    .text("Vinyl Era")
    .attr("fill", colors.Vinyl);

  const yearLabel = svg
    .append("text")
    .attr("x", width - margin.right - 12)
    .attr("y", margin.top + 34)
    .attr("text-anchor", "end")
    .attr("font-size", compact ? 22 : 44)
    .attr("font-weight", "800")
    .attr("fill", "#eef2ff")
    .attr("opacity", 0.82)
    .text(d3.min(wideData, (d) => d.Year));

  const replayButton = vizContainer
    .append("button")
    .attr("class", "replay-btn")
    .style("display", "none")
    .text("Replay animation");

  function runStackedAreaAnimation() {
    clipRect.interrupt();
    annotationGroups.interrupt();
    marker.interrupt();

    clipRect.attr("width", 0);
    annotationGroups.attr("opacity", 0);
    const startYear = d3.min(wideData, (d) => d.Year);
    marker.attr("x1", x(startYear)).attr("x2", x(startYear));
    eraLabel.text("Vinyl Era").attr("fill", colors.Vinyl);
    yearLabel.text(startYear);
    replayButton.style("display", "none");

    clipRect
      .transition()
      .duration(10000)
      .ease(d3.easeLinear)
      .attrTween("width", function attrTweenWidth() {
        const start = d3.min(wideData, (d) => d.Year);
        const end = d3.max(wideData, (d) => d.Year);
        const totalWidth = width - margin.left - margin.right;
        return function update(t) {
          const currentYear = Math.round(start + t * (end - start));
          const currentX = x(currentYear);
          yearLabel.text(currentYear);
          marker.attr("x1", currentX).attr("x2", currentX);
          const passed = annotations.filter((a) => currentYear >= a.year);
          const activeYear = passed.length ? passed[passed.length - 1].year : null;
          annotationGroups.attr("opacity", (d) => (d.year === activeYear ? 1 : 0));

          if (currentYear < 1980) {
            eraLabel.text("Vinyl Era").attr("fill", colors.Vinyl);
          } else if (currentYear < 1990) {
            eraLabel.text("Tape Era").attr("fill", colors.Tape);
          } else if (currentYear < 2005) {
            eraLabel.text("CD Dominance").attr("fill", colors["CD / Disc"]);
          } else if (currentYear < 2015) {
            eraLabel.text("Digital Download Era").attr("fill", colors["Digital Download"]);
          } else {
            eraLabel.text("Streaming Era").attr("fill", colors.Streaming);
          }
          return t * totalWidth;
        };
      })
      .on("end", () => {
        annotationGroups.attr("opacity", 1);
        yearLabel.text(d3.max(wideData, (d) => d.Year));
        replayButton.style("display", "inline-flex");
      });
  }

  replayButton.on("click", () => {
    runStackedAreaAnimation();
  });

  runStackedAreaAnimation();

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 20)
    .attr("font-size", 18)
    .attr("font-weight", "bold")
    .attr("fill", "#eef2ff")
    .text("Transformation of the Music Industry by Format");

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", height - 10)
    .attr("fill", "#afbddf")
    .text("Year");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("transform", "rotate(-90)")
    .attr("fill", "#afbddf")
    .text("Revenue (value)");

  const legendX = width - margin.right + 20;
  const legendY = compact ? margin.top + 44 : margin.top;
  const legend = svg.append("g").attr("transform", `translate(${legendX}, ${legendY})`);
  legend
    .selectAll("g")
    .data(formatOrder)
    .join("g")
    .attr("transform", (d, i) => `translate(0, ${i * (compact ? 23 : 30)})`)
    .call((g) => {
      g.append("rect")
        .attr("width", compact ? 14 : 18)
        .attr("height", compact ? 14 : 18)
        .attr("fill", (d) => colors[d]);
      g.append("text")
        .attr("x", compact ? 20 : 26)
        .attr("y", compact ? 12 : 15)
        .attr("font-size", compact ? 13 : 16)
        .attr("fill", "#dbe6ff")
        .text((d) => d);
    });
}

// 2. Line chart
// Format revenue in the physical-first years (Vinyl vs Tape, ≤1995)
function renderVinylTapeLine(data) {
  const { svg, width, height } = createSvg("vinyl-tape-line");
  const margin = { top: 15, right: 20, bottom: 35, left: 64 };
  const filtered = data.filter((d) => d.Year <= 1995);
  const x = d3.scaleLinear().domain(d3.extent(filtered, (d) => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(filtered, (d) => Math.max(d.Vinyl, d.Tape)) * 1.1]).range([height - margin.bottom, margin.top]);
  drawAxes(svg, x, y, width, height, margin);

  ["Vinyl", "Tape"].forEach((key) => {
    const line = d3
      .line()
      .x((d) => x(d.Year))
      .y((d) => y(d[key]))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(filtered)
      .attr("fill", "none")
      .attr("stroke", colors[key])
      .attr("stroke-width", 3)
      .attr("d", line);
  });

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Year");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Revenue (value)");
}

// 3. Area/line chart
// CD revenue surge and peak

function renderCdRevolution(data) {
  const { svg, width, height } = createSvg("cd-revolution");
  const margin = { top: 15, right: 20, bottom: 35, left: 64 };
  const cdRevenue = data.map((d) => ({ year: d.Year, value: d["CD / Disc"] }));
  const x = d3.scaleLinear().domain(d3.extent(cdRevenue, (d) => d.year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(cdRevenue, (d) => d.value) * 1.1]).range([height - margin.bottom, margin.top]);
  drawAxes(svg, x, y, width, height, margin);

  const area = d3
    .area()
    .x((d) => x(d.year))
    .y0(y(0))
    .y1((d) => y(d.value))
    .curve(d3.curveMonotoneX);

  svg.append("path").datum(cdRevenue).attr("fill", "rgba(250, 204, 21, 0.25)").attr("d", area);
  svg
    .append("path")
    .datum(cdRevenue)
    .attr("fill", "none")
    .attr("stroke", colors["CD / Disc"])
    .attr("stroke-width", 3)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.year))
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX)
    );

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Year");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Revenue (value)");
}

// Section 4: Revenue collapse chart — "Industry revenue collapse (1995–2010)"
// Container: #disruption-timeline | Total revenue + digital download overlay from CSV
function renderRevenueCollapse(data) {
  const { svg, width, height } = createSvg("disruption-timeline");
  const margin = { top: 72, right: 28, bottom: 40, left: 64 };
  const filtered = data.filter((d) => d.Year >= 1995 && d.Year <= 2010);
  const peakRow = filtered.reduce((best, d) => (d.total > best.total ? d : best), filtered[0]);

  const x = d3
    .scaleLinear()
    .domain([1995, 2010])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(filtered, (d) => d.total) * 1.12])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const legend = svg.append("g").attr("transform", `translate(${width - margin.right}, 12)`);
  [
    { label: "Total industry revenue", color: "#f87171", dashed: false },
    { label: "Digital download revenue", color: colors["Digital Download"], dashed: true },
  ].forEach((item, i) => {
    const g = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
    g.append("line")
      .attr("x1", -150)
      .attr("x2", -132)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", item.color)
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", item.dashed ? "6,4" : null);
    g.append("text")
      .attr("x", -126)
      .attr("y", 4)
      .attr("text-anchor", "start")
      .attr("fill", "#ded6ff")
      .attr("font-size", 11)
      .text(item.label);
  });

  drawAxes(svg, x, y, width, height, margin);

  const area = d3
    .area()
    .x((d) => x(d.Year))
    .y0(y(0))
    .y1((d) => y(d.total))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(filtered)
    .attr("fill", "rgba(248, 113, 113, 0.22)")
    .attr("d", area);

  svg
    .append("path")
    .datum(filtered)
    .attr("fill", "none")
    .attr("stroke", "#f87171")
    .attr("stroke-width", 3)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.Year))
        .y((d) => y(d.total))
        .curve(d3.curveMonotoneX)
    );

  svg
    .append("path")
    .datum(filtered)
    .attr("fill", "none")
    .attr("stroke", colors["Digital Download"])
    .attr("stroke-width", 2.5)
    .attr("stroke-dasharray", "6,4")
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.Year))
        .y((d) => y(d["Digital Download"]))
        .curve(d3.curveMonotoneX)
    );

  svg
    .append("circle")
    .attr("cx", x(peakRow.Year))
    .attr("cy", y(peakRow.total))
    .attr("r", 5)
    .attr("fill", "#f87171")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);

  svg
    .append("line")
    .attr("x1", x(1999))
    .attr("x2", x(1999))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#22d3ee")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4,4")
    .attr("opacity", 0.85);

  svg
    .append("text")
    .attr("x", x(1999))
    .attr("y", margin.top - 14)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("font-weight", "bold")
    .attr("fill", "#67e8f9")
    .text("Napster appears");

  const annotations = [
    {
      year: peakRow.Year,
      value: peakRow.total,
      text: `Revenue peaks around ${peakRow.Year}`,
      dx: 14,
      dy: -22,
      color: "#fca5a5",
      anchor: "start",
    },
  ];

  annotations.forEach((a) => {
    const px = x(a.year);
    const py = y(a.value);
    const lx = Math.max(margin.left + 4, px + a.dx);
    const ly = Math.max(margin.top + 4, Math.min(py + a.dy, height - margin.bottom - 4));

    svg
      .append("line")
      .attr("x1", lx)
      .attr("y1", ly + (a.dy < 0 ? 6 : -4))
      .attr("x2", px)
      .attr("y2", py)
      .attr("stroke", a.color)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.9);

    svg
      .append("text")
      .attr("x", lx)
      .attr("y", ly)
      .attr("text-anchor", a.anchor)
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .attr("fill", a.color)
      .text(a.text);
  });

  const declineYear = 2005;
  const declineRow = filtered.find((d) => d.Year === declineYear);
  if (declineRow) {
    const px = x(declineYear);
    const py = y(declineRow.total);
    const lx = margin.left + 10;
    const ly = height - margin.bottom - 68;

    svg
      .append("line")
      .attr("x1", lx + 162)
      .attr("y1", ly - 5)
      .attr("x2", px)
      .attr("y2", py)
      .attr("stroke", "#fca5a5")
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.9);

    svg
      .append("text")
      .attr("x", lx)
      .attr("y", ly)
      .attr("text-anchor", "start")
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .attr("fill", "#fca5a5")
      .text("Revenue declines dramatically");
  }

  const downloadYear = 2010;
  const downloadRow = filtered.find((d) => d.Year === downloadYear);
  if (downloadRow) {
    const px = x(downloadYear);
    const py = y(downloadRow["Digital Download"]);
    const lx = width - margin.right - 10;
    const ly = height - margin.bottom - 48;

    svg
      .append("line")
      .attr("x1", lx - 168)
      .attr("y1", ly - 5)
      .attr("x2", px)
      .attr("y2", py)
      .attr("stroke", colors["Digital Download"])
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.9);

    svg
      .append("text")
      .attr("x", lx)
      .attr("y", ly)
      .attr("text-anchor", "end")
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .attr("fill", colors["Digital Download"])
      .text("Downloads too small to compensate");
  }

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Year");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Revenue (value)");
}

// Section 5: Market share donut — "Streaming dominates the modern industry"
// Container: #streaming-dominance | Format revenue share (2015–present, latest year)
function renderStreamingDominance(data) {
  const { svg, width, height } = createSvg("streaming-dominance");
  const vizContainer = d3.select("#streaming-dominance");
  const modern = data.filter((d) => d.Year >= 2015);
  const latest = modern[modern.length - 1];
  if (!latest) return;

  const total = latest.total || d3.sum(formatOrder, (k) => latest[k]);
  const shareData = formatOrder.map((label) => ({
    label,
    value: latest[label],
    pct: total > 0 ? (latest[label] / total) * 100 : 0,
  }));

  const cx = width * 0.38;
  const cy = height / 2 + 8;
  const outerRadius = Math.min(width * 0.34, height * 0.38);
  const innerRadius = outerRadius * 0.58;

  const pie = d3
    .pie()
    .value((d) => d.value)
    .sort(null);
  const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
  const hoverArc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius * 1.06);
  const labelArc = d3
    .arc()
    .innerRadius(outerRadius + 8)
    .outerRadius(outerRadius + 8);

  const chart = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);
  const pieData = pie(shareData);

  const slices = chart
    .selectAll("path.slice")
    .data(pieData)
    .join("path")
    .attr("class", "slice")
    .attr("fill", (d) => colors[d.data.label])
    .attr("stroke", "#1a1033")
    .attr("stroke-width", 1.5)
    .attr("d", arc)
    .style("cursor", "pointer");

  const sliceLabels = chart
    .selectAll("text.slice-label")
    .data(pieData.filter((d) => d.data.pct >= 6))
    .join("text")
    .attr("class", "slice-label")
    .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("font-weight", "bold")
    .attr("fill", "#f8f4ff")
    .text((d) => `${d.data.pct.toFixed(0)}%`);

  const tooltip = vizContainer
    .append("div")
    .attr("class", "donut-tooltip")
    .style("opacity", 0);

  function resetSliceHighlight() {
    slices.interrupt().transition().duration(200).attr("d", arc).attr("opacity", 1);
    sliceLabels.interrupt().transition().duration(200).attr("opacity", 1);
    tooltip.style("opacity", 0);
  }

  function showDonutTooltip(event, d) {
    const insightLines = (donutFormatInsights[d.data.label] || []).map((line) =>
      line.replace("{year}", latest.Year)
    );
    const insightHtml = insightLines.length
      ? `<div class="donut-tooltip__note">${insightLines.join("<br>")}</div>`
      : "";

    tooltip.html(`
      <div class="donut-tooltip__title" style="color:${colors[d.data.label]}">${d.data.label}</div>
      <div class="donut-tooltip__share">Market Share: ${d.data.pct.toFixed(1)}%</div>
      ${insightHtml}
    `);

    const bounds = vizContainer.node().getBoundingClientRect();
    const tooltipNode = tooltip.node();
    const offsetX = event.clientX - bounds.left + 16;
    const offsetY = event.clientY - bounds.top - 12;
    const maxLeft = bounds.width - tooltipNode.offsetWidth - 8;
    const maxTop = bounds.height - tooltipNode.offsetHeight - 8;

    tooltip
      .style("left", `${Math.max(8, Math.min(offsetX, maxLeft))}px`)
      .style("top", `${Math.max(8, Math.min(offsetY, maxTop))}px`)
      .style("opacity", 1);
  }

  slices
    .on("mouseenter", function onSliceEnter(event, d) {
      d3.select(this).raise().transition().duration(200).attr("d", hoverArc);
      slices
        .filter((slice) => slice !== d)
        .transition()
        .duration(200)
        .attr("opacity", 0.35);
      sliceLabels
        .transition()
        .duration(200)
        .attr("opacity", (label) => (label.data.label === d.data.label ? 1 : 0.35));
      showDonutTooltip(event, d);
    })
    .on("mousemove", (event, d) => {
      showDonutTooltip(event, d);
    })
    .on("mouseleave", resetSliceHighlight);

  const streamingPct = shareData.find((d) => d.label === "Streaming")?.pct ?? 0;
  chart
    .append("text")
    .attr("text-anchor", "middle")
    .attr("y", -6)
    .attr("font-size", 22)
    .attr("font-weight", "800")
    .attr("fill", colors.Streaming)
    .text(`${streamingPct.toFixed(0)}%`);
  chart
    .append("text")
    .attr("text-anchor", "middle")
    .attr("y", 16)
    .attr("font-size", 12)
    .attr("fill", "#ded6ff")
    .text("Streaming");
  chart
    .append("text")
    .attr("text-anchor", "middle")
    .attr("y", 34)
    .attr("font-size", 11)
    .attr("fill", "#afbddf")
    .text(`${latest.Year} market share`);

  const legend = svg.append("g").attr("transform", `translate(${width * 0.68}, ${height * 0.22})`);
  shareData.forEach((d, i) => {
    const g = legend.append("g").attr("transform", `translate(0, ${i * 28})`);
    g.append("rect")
      .attr("width", 14)
      .attr("height", 14)
      .attr("rx", 3)
      .attr("fill", colors[d.label]);
    g.append("text")
      .attr("x", 22)
      .attr("y", 12)
      .attr("fill", "#ded6ff")
      .attr("font-size", 12)
      .text(`${d.label} — ${d.pct.toFixed(1)}%`);
  });
}

// 6. Interactive multi-format line chart
// Custom multi-format comparison
// interactive-dashboar
function renderDashboard(data) {
  const controls = d3.select("#controls");
  const vizContainer = d3.select("#interactive-dashboard");
  const selected = new Set(formatOrder);
  formatOrder.forEach((f) => {
    controls
      .append("button")
      .attr("class", `chip ${selected.has(f) ? "active" : ""}`)
      .text(labels[f])
      .on("click", function onClick() {
        if (selected.has(f)) {
          selected.delete(f);
        } else {
          selected.add(f);
        }
        d3.select(this).classed("active", selected.has(f));
        clearHighlight();
        draw(selected);
      });
  });

  const { svg, width, height } = createSvg("interactive-dashboard");
  const margin = { top: 15, right: 20, bottom: 35, left: 64 };
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.Year)).range([margin.left, width - margin.right]);
  const yMax = d3.max(data, (d) => d3.max(formatOrder, (k) => d[k]));
  const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height - margin.bottom, margin.top]);
  drawAxes(svg, x, y, width, height, margin);

  const yearBisect = d3.bisector((d) => d.Year).center;
  const tooltip = vizContainer
    .append("div")
    .attr("class", "dashboard-tooltip")
    .style("opacity", 0);

  const focus = svg.append("g").attr("class", "dashboard-focus").style("opacity", 0);
  focus
    .append("line")
    .attr("class", "dashboard-hover-line")
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#f8fbff")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 4")
    .attr("pointer-events", "none");
  focus
    .append("circle")
    .attr("class", "dashboard-focus-dot")
    .attr("r", 5)
    .attr("stroke", "#f8f4ff")
    .attr("stroke-width", 2)
    .attr("pointer-events", "none");

  function showDashboardTooltip(event, formatKey, yearRow) {
    const revenue = yearRow[formatKey];
    if (!revenue) return;

    tooltip.html(`
      <div class="dashboard-tooltip__title" style="color:${colors[formatKey]}">${labels[formatKey]}</div>
      <div class="dashboard-tooltip__revenue">Revenue: ${formatRevenueShort(revenue)}</div>
      <div class="dashboard-tooltip__year">Year: ${yearRow.Year}</div>
      <div class="dashboard-tooltip__recap-label">Story Recap:</div>
      <div class="dashboard-tooltip__recap">${getDashboardStoryRecap(formatKey)}</div>
    `);

    const bounds = vizContainer.node().getBoundingClientRect();
    const tooltipNode = tooltip.node();
    const offsetX = event.clientX - bounds.left + 16;
    const offsetY = event.clientY - bounds.top - 12;
    const maxLeft = bounds.width - tooltipNode.offsetWidth - 8;
    const maxTop = bounds.height - tooltipNode.offsetHeight - 8;

    tooltip
      .style("left", `${Math.max(8, Math.min(offsetX, maxLeft))}px`)
      .style("top", `${Math.max(8, Math.min(offsetY, maxTop))}px`)
      .style("opacity", 1);
  }

  function setHighlight(formatKey, yearRow, event) {
    svg
      .selectAll("path.dashboard-line")
      .attr("opacity", (d) => (d === formatKey ? 1 : 0.35))
      .attr("stroke-width", (d) => (d === formatKey ? 4 : 3));

    const yearX = x(yearRow.Year);
    const valueY = y(yearRow[formatKey]);
    focus.style("opacity", 1);
    focus.raise();
    focus.select(".dashboard-hover-line").attr("x1", yearX).attr("x2", yearX);
    focus
      .select(".dashboard-focus-dot")
      .attr("cx", yearX)
      .attr("cy", valueY)
      .attr("fill", colors[formatKey]);
    showDashboardTooltip(event, formatKey, yearRow);
  }

  function clearHighlight() {
    svg.selectAll("path.dashboard-line").attr("opacity", 1).attr("stroke-width", 3);
    focus.style("opacity", 0);
    tooltip.style("opacity", 0);
  }

  function linePath(key) {
    return d3
      .line()
      .x((d) => x(d.Year))
      .y((d) => y(d[key]))
      .curve(d3.curveMonotoneX)(data);
  }

  function draw(activeFormats) {
    const entries = [...activeFormats];

    svg
      .selectAll("path.dashboard-line")
      .data(entries, (d) => d)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "dashboard-line")
            .attr("fill", "none")
            .attr("stroke-width", 3)
            .attr("stroke", (d) => colors[d])
            .attr("d", (key) => linePath(key)),
        (update) =>
          update
            .transition()
            .duration(280)
            .attr("stroke", (d) => colors[d])
            .attr("d", (key) => linePath(key)),
        (exit) => exit.remove()
      );

    svg
      .selectAll("path.dashboard-line-hit")
      .data(entries, (d) => d)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "dashboard-line-hit")
            .attr("fill", "none")
            .attr("stroke", "transparent")
            .attr("stroke-width", 18)
            .attr("pointer-events", "stroke")
            .style("cursor", "pointer")
            .attr("d", (key) => linePath(key))
            .on("mousemove", (event, key) => {
              const [pointerX] = d3.pointer(event);
              const yearRow = data[yearBisect(data, Math.round(x.invert(pointerX)))];
              if (!yearRow || !yearRow[key]) return;
              setHighlight(key, yearRow, event);
            })
            .on("mouseleave", clearHighlight),
        (update) =>
          update
            .transition()
            .duration(280)
            .attr("d", (key) => linePath(key)),
        (exit) => exit.remove()
      );
  }

  draw(selected);

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Year");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#afbddf")
    .attr("font-size", 12)
    .text("Revenue (value)");
}

function activateOnScroll() {
  const sections = document.querySelectorAll(".story-section");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.style.opacity = entry.isIntersecting ? "1" : "0.6";
        entry.target.style.transform = entry.isIntersecting ? "translateY(0)" : "translateY(8px)";
      });
    },
    { threshold: 0.2 }
  );

  sections.forEach((section) => {
    section.style.transition = "opacity 280ms ease, transform 280ms ease";
    observer.observe(section);
  });
}

async function init() {
  cachedData = await loadStoryData();
  renderAllCharts(cachedData);
  activateOnScroll();
  window.addEventListener("resize", () => {
    if (!cachedData) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderAllCharts(cachedData);
    }, 180);
  });
}

window.addEventListener("DOMContentLoaded", init);

function clearChartContainers() {
  CHART_CONTAINER_IDS.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.innerHTML = "";
  });
  const controls = document.getElementById("controls");
  if (controls) controls.innerHTML = "";
}

// Renders all six charts (called on load and window resize)
function renderAllCharts(data) {
  clearChartContainers();
  renderStackedArea(data);
  renderVinylTapeLine(data);
  renderCdRevolution(data);
  renderRevenueCollapse(data);
  renderStreamingDominance(data);
  renderDashboard(data);
}
