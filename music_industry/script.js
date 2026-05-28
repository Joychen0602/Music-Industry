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

function renderDisruptionTimeline() {
  const { svg, width, height } = createSvg("disruption-timeline", 280);
  const margin = { top: 30, right: 20, bottom: 35, left: 35 };
  const x = d3.scaleLinear().domain([1998, 2024]).range([margin.left, width - margin.right]);
  const y = height / 2;

  svg
    .append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", y)
    .attr("y2", y)
    .attr("stroke", "#9db2e7")
    .attr("stroke-width", 2);

  const events = [
    { year: 1999, label: "Napster" },
    { year: 2003, label: "iTunes Store" },
    { year: 2008, label: "Spotify Launch" },
    { year: 2015, label: "Mobile Streaming Scale" },
    { year: 2020, label: "Subscription Mainstream" },
  ];

  svg
    .selectAll("circle.event")
    .data(events)
    .join("circle")
    .attr("class", "event")
    .attr("cx", (d) => x(d.year))
    .attr("cy", y)
    .attr("r", 7)
    .attr("fill", "#06b6d4");

  svg
    .selectAll("text.event-label")
    .data(events)
    .join("text")
    .attr("x", (d) => x(d.year))
    .attr("y", (d, i) => (i % 2 ? y + 34 : y - 18))
    .attr("text-anchor", "middle")
    .attr("fill", "#d7e4ff")
    .attr("font-size", 12)
    .text((d) => `${d.year} ${d.label}`);
}

function renderStreamingDominance(data) {
  const { svg, width, height } = createSvg("streaming-dominance");
  const margin = { top: 15, right: 20, bottom: 35, left: 64 };
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => Math.max(d["CD / Disc"], d.Streaming)) * 1.1]).range([height - margin.bottom, margin.top]);
  drawAxes(svg, x, y, width, height, margin);

  ["CD / Disc", "Streaming"].forEach((key) => {
    const line = d3
      .line()
      .x((d) => x(d.Year))
      .y((d) => y(d[key]))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(data)
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

function renderDashboard(data) {
  const controls = d3.select("#controls");
  const selected = new Set(["Vinyl", "CD / Disc", "Streaming"]);
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
        draw(selected);
      });
  });

  const { svg, width, height } = createSvg("interactive-dashboard");
  const margin = { top: 15, right: 20, bottom: 35, left: 64 };
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.Year)).range([margin.left, width - margin.right]);
  const yMax = d3.max(data, (d) => d3.max(formatOrder, (k) => d[k]));
  const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height - margin.bottom, margin.top]);
  drawAxes(svg, x, y, width, height, margin);

  function draw(activeFormats) {
    const entries = [...activeFormats];
    const group = svg.selectAll("path.dashboard-line").data(entries, (d) => d);
    group
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "dashboard-line")
            .attr("fill", "none")
            .attr("stroke-width", 3)
            .attr("stroke", (d) => colors[d])
            .attr("d", (key) =>
              d3
                .line()
                .x((d) => x(d.Year))
                .y((d) => y(d[key]))
                .curve(d3.curveMonotoneX)(data)
            ),
        (update) =>
          update
            .transition()
            .duration(280)
            .attr("stroke", (d) => colors[d])
            .attr("d", (key) =>
              d3
                .line()
                .x((d) => x(d.Year))
                .y((d) => y(d[key]))
                .curve(d3.curveMonotoneX)(data)
            ),
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

function renderAllCharts(data) {
  clearChartContainers();
  renderStackedArea(data);
  renderVinylTapeLine(data);
  renderCdRevolution(data);
  renderDisruptionTimeline();
  renderStreamingDominance(data);
  renderDashboard(data);
}
