/**
 * Music Industry Storytelling — D3 visualization logic.
 *
 * Data flow: music_data.csv (long RIAA rows) → loadStoryData() 
 * 
 */

// Canonical format categories used as stack keys and chart series
const formatOrder = ["Vinyl", "Tape", "CD / Disc", "Digital Download", "Streaming"];

// labels for tooltips, legends, and dashboard chips
const labels = {
  Vinyl: "Vinyl",
  Tape: "Tape",
  "CD / Disc": "CD / Disc",
  "Digital Download": "Digital Download",
  Streaming: "Streaming",
  TotalCPI: "CPI Adjusted",
  TotalRaw: "Raw Revenue",
  Ownership: "Ownership",
  Access: "Access (Stream)"
};

// Color palette keyed 
const colors = {
  Vinyl: "#f97316",
  Tape: "#22c55e",
  "CD / Disc": "#facc15",
  "Digital Download": "#60a5fa",
  Streaming: "#c084fc",
  TotalCPI: "#f8fafc",
  TotalRaw: "#64748b",
  Ownership: "#f43f5e",
  Access: "#c084fc",
  Other: "#334155" 
};

let cachedData = null;
let resizeTimer = null;

/**
 * Maps RIAA format strings to one of five canonical categories.
 * Uses substring matching because the source CSV has inconsistent naming
 * Returns null for rows we intentionally exclude, such as Synchronization revenue.
 */
function classifyFormat(riaaFormatName) {
  const normalizedFormat = String(riaaFormatName).toLowerCase();
  if (normalizedFormat.includes("lp/ep") || normalizedFormat.includes("vinyl")) return "Vinyl";
  if (normalizedFormat.includes("cassette") || normalizedFormat.includes("8 - track") || normalizedFormat.includes("other tapes") || normalizedFormat.includes("tape")) return "Tape";
  if (normalizedFormat.includes("cd") || normalizedFormat.includes("disc") || normalizedFormat.includes("sacd")) return "CD / Disc";
  if (normalizedFormat.includes("download") || normalizedFormat.includes("kiosk") || normalizedFormat.includes("ringtones") || normalizedFormat.includes("other digital")) return "Digital Download";
  if (normalizedFormat.includes("streaming") || normalizedFormat.includes("subscription") || normalizedFormat.includes("soundexchange") || normalizedFormat.includes("on-demand")) return "Streaming";
  return null;
}

// Parses a dollar string from the CSV and converts it to billions of USD
function parseRevenueToBillions(revenueString) {
  if (!revenueString) return 0;
  return (Number.parseFloat(String(revenueString).replace(/[^0-9.-]+/g, "")) / 1e9) || 0;
}

/**
 * Loads RIAA data and pivots from long format (one row per format per year)
 * to wide format (one object per year with a property per format).
 *
 * Derived fields per year:
 * - TotalCPI: sum of inflation-adjusted revenue across the five formats
 * - TotalRaw: sum of nominal revenue across the five formats
 * - Ownership: all non-streaming CPI-adjusted revenue
 * - Access: streaming-only CPI-adjusted revenue
 */
async function loadStoryData() {
  const response = await fetch("./music_data.csv");
  const text = await response.text();
  const csvRows = text.includes("\t") ? d3.tsvParse(text) : d3.csvParse(text);

  // Column names vary slightly across exports; resolve them dynamically.
  const headers = Object.keys(csvRows[0]);
  const yearColumn = headers.find(k => k.toLowerCase().includes("year"));
  const formatColumn = headers.find(k => k.toLowerCase().includes("format") && !k.toLowerCase().includes("format2"));
  const cpiAdjustedColumn = headers.find(k => k.toLowerCase().includes("cpi"));
  const nominalRevenueColumn = headers.find(k => k.toLowerCase() === "revenue" || k.toLowerCase() === "value");

  const rowsByYear = d3.group(csvRows, (row) => Number.parseInt(row[yearColumn], 10));
  const yearlyData = [];

  rowsByYear.forEach((rowsForYear, year) => {
    if (!year) return;

    const yearPoint = { Year: year, TotalCPI: 0, TotalRaw: 0, Ownership: 0, Access: 0 };
    formatOrder.forEach(formatKey => yearPoint[formatKey] = 0);

    rowsForYear.forEach((row) => {
    
      if (row[formatColumn] && String(row[formatColumn]).toLowerCase() === "total") return;

      const formatCategory = classifyFormat(row[formatColumn]);
      if (formatCategory) {
        const adjustedRevenue = parseRevenueToBillions(row[cpiAdjustedColumn]);
        const nominalRevenue = parseRevenueToBillions(row[nominalRevenueColumn]);

        yearPoint[formatCategory] += adjustedRevenue;
        yearPoint.TotalCPI += adjustedRevenue;
        yearPoint.TotalRaw += nominalRevenue;

        // Ownership vs. access is a narrative split, not an RIAA category.
        if (formatCategory === "Streaming") yearPoint.Access += adjustedRevenue;
        else yearPoint.Ownership += adjustedRevenue;
      }
    });
    yearlyData.push(yearPoint);
  });

  return yearlyData.sort((a, b) => a.Year - b.Year);
}

// Draws horizontal grid, vertical grid, and labeled x/y axes on an SVG. 
function drawAxes(svg, xScale, yScale, width, height, margin) {
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(() => ""));
  svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(() => ""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format("d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => "$" + d));
}

// Clears a chart container and returns a fresh SVG with its dimensions. 
function createSvg(containerId, minHeight = 340) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(minHeight, 340);
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  return { svg, width, height, container: d3.select(container) };
}

/**
 * Reveals chart lines left-to-right using a clip-path wipe animation.
 * Elements with .delayed-label and .delayed-interactivity stay hidden/disabled
 * until the wipe finishes so users cannot hover before the story beat plays.
 */
function setupAnimation(svg, container, paths, width, height, margin, duration = 4000) {
  const clipId = `clip-${Math.random().toString(36).slice(2, 11)}`;
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect")
    .attr("x", margin.left).attr("y", margin.top).attr("width", 0).attr("height", height - margin.top - margin.bottom);

  paths.attr("clip-path", `url(#${clipId})`);
  const delayedElements = svg.selectAll(".delayed-label").attr("opacity", 0);
  const playButton = container.append("button").attr("class", "play-overlay").text("▶ Play Animation");

  playButton.on("click", () => {
    playButton.style("display", "none");
    clipRect.transition().duration(duration).ease(d3.easeLinear).attr("width", width - margin.left - margin.right)
      .on("end", () => {
          delayedElements.transition().duration(800).attr("opacity", 1);
          svg.selectAll(".delayed-interactivity").style("pointer-events", "all");
      });
  });
}

/**
 * Adds a crosshair and HTML tooltip that snap to the nearest year on mousemove.
 * When isDelayed is true, pointer events are disabled until setupAnimation completes.
 */
function addHoverTooltip(svg, container, width, height, margin, data, formatKeys, isDelayed = false) {
  container.style("position", "relative");
  const tooltip = container.append("div").attr("class", "viz-tooltip").style("opacity", 0);
  const crosshair = svg.append("line").attr("y1", margin.top).attr("y2", height - margin.bottom)
    .attr("stroke", "#ffffff").attr("stroke-width", 1).attr("stroke-dasharray", "4,4").style("opacity", 0).style("pointer-events", "none");

  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, width - margin.right]);
  const bisectYear = d3.bisector(d => d.Year).left;
  const overlay = svg.append("rect").attr("width", width).attr("height", height).style("fill", "none");

  if (isDelayed) overlay.attr("class", "delayed-interactivity").style("pointer-events", "none");
  else overlay.style("pointer-events", "all");

  overlay.on("mousemove", (event) => {
    const mouseX = d3.pointer(event)[0];
    const x0 = x.invert(mouseX);
    
    if (x0 < data[0].Year || x0 > data[data.length - 1].Year) {
      tooltip.style("opacity", 0);
      crosshair.style("opacity", 0);
      return;
    }

    const i = bisectYear(data, x0, 1);
    const d0 = data[i - 1];
    const d1 = data[i] || d0;
    const currentData = x0 - d0.Year > d1.Year - x0 ? d1 : d0;
    const currentX = x(currentData.Year);

    crosshair.attr("x1", currentX).attr("x2", currentX).style("opacity", 0.6);

    const sortedKeys = [...formatKeys].sort((a, b) => currentData[b] - currentData[a]);
    let html = `<strong style="color: #fff; font-size: 1.1rem;">Year: ${currentData.Year}</strong><br/>
                <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">`;
    
    sortedKeys.forEach(key => {
        const val = currentData[key];
        if (val > 0) {
            html += `<div style="color: #e2e8f0; font-size: 0.95rem; display: flex; align-items: center;">
                      <span style="display:inline-block; width:10px; height:10px; background:${colors[key] || colors.Other}; margin-right:8px; border-radius:50%;"></span>
                      <span>${labels[key] || key}: <b style="color: #fff;">$${val.toFixed(2)}B</b></span>
                    </div>`;
        }
    });
    html += `</div>`;

    let tooltipX = mouseX + 20;
    if (tooltipX + 160 > width) tooltipX = mouseX - 180; 

    tooltip.html(html).style("left", tooltipX + "px").style("top", "20px").style("opacity", 1);
  });

  overlay.on("mouseout", () => {
    tooltip.style("opacity", 0);
    crosshair.style("opacity", 0);
  });
}

// --- Story section charts  ---

// compares nominal vs. inflation-adjusted total industry revenue
function renderHookChart(data) {
  const c = createSvg("hook-chart");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 20, right: 40, bottom: 40, left: 60 };
  
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.TotalCPI) * 1.1]).range([height - margin.bottom, margin.top]);
  
  drawAxes(svg, x, y, width, height, margin);

  const lineRaw = d3.line().x(d => x(d.Year)).y(d => y(d.TotalRaw)).curve(d3.curveMonotoneX);
  const lineCPI = d3.line().x(d => x(d.Year)).y(d => y(d.TotalCPI)).curve(d3.curveMonotoneX);

  const g = svg.append("g");
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors.TotalRaw).attr("stroke-width", 3).attr("stroke-dasharray", "6,6").attr("d", lineRaw);
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors.TotalCPI).attr("stroke-width", 4).attr("d", lineCPI);

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  const legend = svg.append("g").attr("transform", `translate(${margin.left + 20}, ${margin.top})`);
  const legendData = [{ label: labels.TotalCPI, color: colors.TotalCPI, dash: "none" }, { label: labels.TotalRaw, color: colors.TotalRaw, dash: "6,6" }];

  legend.selectAll("g").data(legendData).join("g").attr("transform", (d, i) => `translate(0, ${i * 24})`).call(grp => {
      grp.append("line").attr("x1", 0).attr("x2", 24).attr("y1", 4).attr("y2", 4).attr("stroke", d => d.color).attr("stroke-width", 3).attr("stroke-dasharray", d => d.dash);
      grp.append("text").attr("x", 34).attr("y", 9).attr("font-size", "13px").attr("font-weight", "bold").attr("fill", d => d.color).text(d => d.label);
  });

  setupAnimation(svg, container, g, width, height, margin);
  addHoverTooltip(svg, container, width, height, margin, data, ["TotalCPI", "TotalRaw"], true);
}

// Section 1: vinyl resurgence plotted against cassette/tape revenue
function renderVinylRebirth(data) {
  const c = createSvg("vinyl-rebirth");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 20, right: 40, bottom: 40, left: 60 };
  
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.Vinyl, d.Tape)) * 1.1]).range([height - margin.bottom, margin.top]);
  
  drawAxes(svg, x, y, width, height, margin);

  const lineVinyl = d3.line().x(d => x(d.Year)).y(d => y(d.Vinyl)).curve(d3.curveMonotoneX);
  const lineTape = d3.line().x(d => x(d.Year)).y(d => y(d.Tape)).curve(d3.curveMonotoneX);

  const g = svg.append("g");
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors.Vinyl).attr("stroke-width", 4).attr("d", lineVinyl);
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors.Tape).attr("stroke-width", 4).attr("d", lineTape);

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  const legend = svg.append("g").attr("transform", `translate(${margin.left + 20}, ${margin.top})`);
  const legendData = [{ label: labels.Vinyl, color: colors.Vinyl }, { label: labels.Tape, color: colors.Tape }];

  legend.selectAll("g").data(legendData).join("g").attr("transform", (d, i) => `translate(0, ${i * 24})`).call(grp => {
      grp.append("line").attr("x1", 0).attr("x2", 24).attr("y1", 4).attr("y2", 4).attr("stroke", d => d.color).attr("stroke-width", 4);
      grp.append("text").attr("x", 34).attr("y", 9).attr("font-size", "13px").attr("font-weight", "bold").attr("fill", d => d.color).text(d => d.label);
  });

  addHoverTooltip(svg, container, width, height, margin, data, ["Vinyl", "Tape"]);
}

// Section 2: CD revenue peak in 1999 against total industry
function renderCDPeak(data) {
  const c = createSvg("cd-peak");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 20, right: 120, bottom: 40, left: 60 };
  
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.TotalCPI) * 1.1]).range([height - margin.bottom, margin.top]);
  
  drawAxes(svg, x, y, width, height, margin);

  const areaTotal = d3.area().x(d => x(d.Year)).y0(y(0)).y1(d => y(d.TotalCPI)).curve(d3.curveMonotoneX);
  const areaCD = d3.area().x(d => x(d.Year)).y0(y(0)).y1(d => y(d["CD / Disc"])).curve(d3.curveMonotoneX);

  const g = svg.append("g");
  g.append("path").datum(data).attr("fill", "rgba(248, 250, 252, 0.1)").attr("d", areaTotal);
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors.TotalCPI).attr("stroke-width", 2).attr("stroke-dasharray", "4,4").attr("d", d3.line().x(d => x(d.Year)).y(d => y(d.TotalCPI)).curve(d3.curveMonotoneX));
  g.append("path").datum(data).attr("fill", "rgba(250, 204, 21, 0.25)").attr("d", areaCD);
  g.append("path").datum(data).attr("fill", "none").attr("stroke", colors["CD / Disc"]).attr("stroke-width", 3).attr("d", d3.line().x(d => x(d.Year)).y(d => y(d["CD / Disc"])).curve(d3.curveMonotoneX));

  svg.append("text").attr("x", width - margin.right + 10).attr("y", y(data[data.length-1].TotalCPI)).attr("fill", colors.TotalCPI).attr("font-size", "12px").text("Total Industry");
  svg.append("text").attr("x", x(1999)).attr("y", y(data.find(d => d.Year === 1999)["CD / Disc"]) - 15).attr("text-anchor", "middle").attr("fill", colors["CD / Disc"]).attr("font-weight", "bold").attr("font-size", "14px").text("CD Revenue Peak");
  
  svg.append("line").attr("x1", x(1999)).attr("x2", x(1999)).attr("y1", y(0)).attr("y2", y(0) - 30).attr("stroke", "#fff").attr("stroke-dasharray", "2,2").attr("opacity", 0.4);
  svg.append("circle").attr("cx", x(1999)).attr("cy", y(0)).attr("r", 4).attr("fill", "#fff");
  svg.append("text").attr("x", x(1999)).attr("y", y(0) - 38).attr("text-anchor", "middle").attr("fill", "#e2e8f0").attr("font-size", "11px").text("Napster (1999)");

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  addHoverTooltip(svg, container, width, height, margin, data, ["TotalCPI", "CD / Disc"]);
}

//Section 3: digital download rise and fall
function renderDownloadMountain(data) {
  const c = createSvg("download-mountain");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 20, right: 80, bottom: 40, left: 60 };
  
  const filtered = data.filter(d => d.Year >= 1998 && d.Year <= 2025);
  const x = d3.scaleLinear().domain(d3.extent(filtered, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(filtered, d => d["Digital Download"]) * 1.1]).range([height - margin.bottom, margin.top]);
  
  drawAxes(svg, x, y, width, height, margin);

  const area = d3.area().x(d => x(d.Year)).y0(y(0)).y1(d => y(d["Digital Download"])).curve(d3.curveMonotoneX);
  const line = d3.line().x(d => x(d.Year)).y(d => y(d["Digital Download"])).curve(d3.curveMonotoneX);

  const g = svg.append("g");
  g.append("path").datum(filtered).attr("fill", "rgba(96, 165, 250, 0.25)").attr("d", area);
  g.append("path").datum(filtered).attr("fill", "none").attr("stroke", colors["Digital Download"]).attr("stroke-width", 4).attr("d", line);

  svg.append("text").attr("x", x(2012)).attr("y", y(filtered.find(d => d.Year === 2012)["Digital Download"]) - 15).attr("text-anchor", "middle").attr("fill", colors["Digital Download"]).attr("font-weight", "bold").attr("font-size", "14px").text("Downloads Peak");
  
  svg.append("line").attr("x1", x(2003)).attr("x2", x(2003)).attr("y1", y(0)).attr("y2", y(0) - 30).attr("stroke", "#fff").attr("stroke-dasharray", "2,2").attr("opacity", 0.4);
  svg.append("circle").attr("cx", x(2003)).attr("cy", y(0)).attr("r", 4).attr("fill", "#fff");
  svg.append("text").attr("x", x(2003)).attr("y", y(0) - 38).attr("text-anchor", "middle").attr("fill", "#e2e8f0").attr("font-size", "11px").text("iTunes Store (2003)");
  
  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  addHoverTooltip(svg, container, width, height, margin, filtered, ["Digital Download"]);
}

// Section 4: ownership vs. access
function renderOwnershipAccess(data) {
  const c = createSvg("ownership-access");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 20, right: 40, bottom: 40, left: 60 };
  
  const filtered = data.filter(d => d.Year >= 2000);
  const x = d3.scaleLinear().domain(d3.extent(filtered, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(filtered, d => Math.max(d.Ownership, d.Access)) * 1.1]).range([height - margin.bottom, margin.top]);
  
  drawAxes(svg, x, y, width, height, margin);

  const lineOwn = d3.line().x(d => x(d.Year)).y(d => y(d.Ownership)).curve(d3.curveMonotoneX);
  const lineAccess = d3.line().x(d => x(d.Year)).y(d => y(d.Access)).curve(d3.curveMonotoneX);

  const g = svg.append("g");
  g.append("path").datum(filtered).attr("fill", "none").attr("stroke", colors.Ownership).attr("stroke-width", 4).attr("d", lineOwn);
  g.append("path").datum(filtered).attr("fill", "none").attr("stroke", colors.Access).attr("stroke-width", 4).attr("d", lineAccess);

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  const legend = svg.append("g").attr("transform", `translate(${margin.left + 20}, ${margin.top})`);
  const legendData = [{ label: labels.Ownership, color: colors.Ownership }, { label: labels.Access, color: colors.Access }];

  legend.selectAll("g").data(legendData).join("g").attr("transform", (d, i) => `translate(0, ${i * 24})`).call(grp => {
      grp.append("line").attr("x1", 0).attr("x2", 24).attr("y1", 4).attr("y2", 4).attr("stroke", d => d.color).attr("stroke-width", 4);
      grp.append("text").attr("x", 34).attr("y", 9).attr("font-size", "13px").attr("font-weight", "bold").attr("fill", d => d.color).text(d => d.label);
  });

  const timelineEvents = [
    { year: 2008, text: "Spotify Launch (2008)", offset: 30 },
    { year: 2015, text: "Mobile Streaming Scale (2015)", offset: 60 },
    { year: 2020, text: "Subscription Mainstream (2020)", offset: 30 }
  ];

  timelineEvents.forEach(e => {
    svg.append("line").attr("x1", x(e.year)).attr("x2", x(e.year)).attr("y1", y(0)).attr("y2", y(0) - e.offset).attr("stroke", "#fff").attr("stroke-dasharray", "2,2").attr("opacity", 0.4);
    svg.append("circle").attr("cx", x(e.year)).attr("cy", y(0)).attr("r", 4).attr("fill", "#fff");
    svg.append("text").attr("x", x(e.year)).attr("y", y(0) - e.offset - 8).attr("text-anchor", "middle").attr("fill", "#e2e8f0").attr("font-size", "11px").text(e.text);
  });

  addHoverTooltip(svg, container, width, height, margin, filtered, ["Ownership", "Access"]);
}

//Final section: stacked area chart
function renderStackedArea(data) {
  const c = createSvg("stacked-area");
  if (!c) return;
  const { svg, width, height, container } = c;
  const margin = { top: 30, right: 120, bottom: 40, left: 60 };
  
  const series = d3.stack().keys(formatOrder)(data);
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(series, s => d3.max(s, d => d[1]))]).range([height - margin.bottom, margin.top]);

  drawAxes(svg, x, y, width, height, margin);

  const area = d3.area().x(d => x(d.data.Year)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);

  const paths = svg.append("g").selectAll("path").data(series).join("path").attr("fill", d => colors[d.key]).attr("opacity", 0.85).attr("d", area);

  const clipId = `clip-stacked-${Math.random().toString(36).slice(2, 11)}`;
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect")
    .attr("x", margin.left).attr("y", margin.top).attr("width", 0).attr("height", height - margin.top - margin.bottom);
  paths.attr("clip-path", `url(#${clipId})`);

  const marker = svg.append("line").attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", "#f8fbff").attr("stroke-width", 1.5).attr("opacity", 0);
  const eraLabel = svg.append("text").attr("x", margin.left + 10).attr("y", margin.top + 25).attr("font-size", 18).attr("font-weight", "bold").text("");
  const yearLabel = svg.append("text").attr("x", width - margin.right - 12).attr("y", margin.top + 34).attr("text-anchor", "end").attr("font-size", 24).attr("font-weight", "800").attr("fill", "#eef2ff").attr("opacity", 0.82).text("");

  const replayButton = container.append("button").attr("class", "replay-btn").text("▶ Play 50-Year History");

  // Animates the clip reveal while updating a scrubber line and era label.
  function runStackedAnimation() {
    clipRect.interrupt();
    replayButton.style("display", "none");
    marker.attr("opacity", 0.6);

    clipRect.attr("width", 0);
    const startYear = d3.min(data, d => d.Year);
    const endYear = d3.max(data, d => d.Year);

    clipRect.transition().duration(8000).ease(d3.easeLinear)
      .attrTween("width", function() {
        const totalWidth = width - margin.left - margin.right;
        return function(progress) {
          const currentYear = Math.round(startYear + progress * (endYear - startYear));
          const currentX = x(currentYear);

          yearLabel.text(currentYear);
          marker.attr("x1", currentX).attr("x2", currentX);

          // Era breakpoints mirror the narrative sections in index.html.
          if (currentYear < 1980) eraLabel.text("Vinyl Era").attr("fill", colors.Vinyl);
          else if (currentYear < 1990) eraLabel.text("Tape Era").attr("fill", colors.Tape);
          else if (currentYear < 2005) eraLabel.text("CD Dominance").attr("fill", colors["CD / Disc"]);
          else if (currentYear < 2015) eraLabel.text("Digital Transition").attr("fill", colors["Digital Download"]);
          else eraLabel.text("Streaming Era").attr("fill", colors.Streaming);

          return progress * totalWidth;
        };
      })
      .on("end", () => {
        replayButton.text("↻ Replay").style("display", "inline-flex");
        marker.transition().duration(500).attr("opacity", 0);
      });
  }

  replayButton.on("click", runStackedAnimation);

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  const legend = svg.append("g").attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);
  legend.selectAll("g").data(formatOrder.slice().reverse()).join("g").attr("transform", (d, i) => `translate(0, ${i * 24})`).call(g => {
      g.append("rect").attr("width", 14).attr("height", 14).attr("fill", d => colors[d]);
      g.append("text").attr("x", 20).attr("y", 12).attr("font-size", 12).attr("fill", "#dbe6ff").text(d => d);
  });
}

/**
 * Interactive dashboard: multi-select format chips, line chart, and donut pie.
 * Line chart uses CPI-adjusted per-format values; pie center shows nominal TotalRaw.
 * The "Other Formats" slice fills the gap between selected formats and total nominal revenue.
 */
function renderDashboard(data) {
  const controls = d3.select("#controls");
  controls.html("");
  const selectedFormats = new Set(["Vinyl", "CD / Disc", "Streaming"]);
  
  formatOrder.forEach((formatName) => {
    controls.append("button").attr("class", `chip ${selectedFormats.has(formatName) ? "active" : ""}`).text(labels[formatName]).on("click", function () {
        if (selectedFormats.has(formatName)) selectedFormats.delete(formatName);
        else selectedFormats.add(formatName);
        d3.select(this).classed("active", selectedFormats.has(formatName));
        drawLineChart(selectedFormats);
      });
  });

  const c = createSvg("interactive-dashboard", 400); 
  if (!c) return;
  const { svg, width, height, container } = c;
  
  const lineChartWidth = width * 0.65;
  const pieChartWidth = width * 0.35;
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  
  container.style("position", "relative");

  const tooltip = container.append("div").attr("class", "viz-tooltip").style("opacity", 0);
  
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.Year)).range([margin.left, lineChartWidth - margin.right]);
  const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);
  
  const xAxisGroup = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`);
  const yAxisGroup = svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`);
  const yGridGroup = svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`);
  const linesGroup = svg.append("g"); 

  svg.append("text").attr("x", -height / 2).attr("y", 20).attr("transform", "rotate(-90)").attr("text-anchor", "middle").attr("fill", "#afbddf").attr("font-size", 12).text("Revenue (Billions USD)");

  const crosshair = svg.append("line").attr("y1", margin.top).attr("y2", height - margin.bottom)
    .attr("stroke", "#ffffff").attr("stroke-width", 1).attr("stroke-dasharray", "4,4").style("opacity", 0);

  const overlay = svg.append("rect").attr("width", lineChartWidth).attr("height", height).style("fill", "none").style("pointer-events", "all");

  const pieRadius = Math.min(pieChartWidth, height - margin.top - margin.bottom) / 2.2;
  const pieGroup = svg.append("g").attr("transform", `translate(${lineChartWidth + pieChartWidth / 2 - margin.right + 20}, ${height / 2})`);
    
  const pieGenerator = d3.pie().value(d => d.value).sort(null);
  const arcGenerator = d3.arc().innerRadius(pieRadius * 0.6).outerRadius(pieRadius);
  
  const pieCenterYear = pieGroup.append("text").attr("text-anchor", "middle").attr("y", -5).attr("font-size", "24px").attr("font-weight", "bold").attr("fill", "#fff");
  const pieCenterTotal = pieGroup.append("text").attr("text-anchor", "middle").attr("y", 15).attr("font-size", "12px").attr("fill", "#afbddf");

  function drawLineChart(activeFormats) {
    const activeFormatList = [...activeFormats];

    const maxRevenue = activeFormatList.length > 0 ? d3.max(data, d => d3.max(activeFormatList, formatKey => d[formatKey])) : 1;
    y.domain([0, maxRevenue * 1.1]);

    xAxisGroup.call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));
    yAxisGroup.transition().duration(500).call(d3.axisLeft(y).ticks(5).tickFormat(d => "$" + d));
    yGridGroup.transition().duration(500).call(d3.axisLeft(y).ticks(5).tickSize(-(lineChartWidth - margin.left - margin.right)).tickFormat(() => ""));

    const group = linesGroup.selectAll("path.dashboard-line").data(activeFormatList, formatKey => formatKey);
    group.join(
      enter => enter.append("path").attr("class", "dashboard-line").attr("fill", "none").attr("stroke-width", 3).attr("stroke", formatKey => colors[formatKey]).attr("d", formatKey => d3.line().x(d => x(d.Year)).y(d => y(d[formatKey])).curve(d3.curveMonotoneX)(data)).style("opacity", 0).call(enter => enter.transition().duration(500).style("opacity", 1)),
      update => update.transition().duration(500).attr("stroke", formatKey => colors[formatKey]).attr("d", formatKey => d3.line().x(d => x(d.Year)).y(d => y(d[formatKey])).curve(d3.curveMonotoneX)(data)),
      exit => exit.transition().duration(300).style("opacity", 0).remove()
    );

    // Default pie view shows the most recent year until the user drags the scrubber.
    updatePieChart(data[data.length - 1], activeFormatList);
  }

  function updatePieChart(yearData, activeFormats) {
    let selectedFormatsRevenue = 0;
    const pieSlices = [];

    activeFormats.forEach(formatKey => {
      const formatRevenue = yearData[formatKey];
      if (formatRevenue > 0) {
        pieSlices.push({ label: formatKey, value: formatRevenue, color: colors[formatKey] });
        selectedFormatsRevenue += formatRevenue;
      }
    });

    // Remaining nominal revenue not covered by the selected format lines.
    const unselectedRevenue = yearData.TotalRaw - selectedFormatsRevenue;
    if (unselectedRevenue > 0.01) pieSlices.push({ label: "Other Formats", value: unselectedRevenue, color: colors.Other });
    
    pieCenterYear.text(yearData.Year);
    pieCenterTotal.text(`Total: $${yearData.TotalRaw.toFixed(1)}B`);

    const slices = pieGroup.selectAll("path.slice").data(pieGenerator(pieSlices), d => d.data.label)
      .join(
        enter => enter.append("path").attr("class", "slice").attr("fill", d => d.data.color).attr("d", arcGenerator).attr("stroke", "#0a0b10").attr("stroke-width", 2).style("cursor", "pointer"),
        update => update.attr("d", arcGenerator),
        exit => exit.remove()
      );

    slices
      .on("mousemove", function(event, d) {
        const total = d3.sum(pieSlices, slice => slice.value);
        const pct = ((d.data.value / total) * 100).toFixed(1);
        
        let html = `<strong style="color: #fff; font-size: 1.1rem;">${labels[d.data.label] || d.data.label}</strong><br/>
                    <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                      <div style="color: #e2e8f0; font-size: 0.95rem; display: flex; align-items: center;">
                        <span style="display:inline-block; width:10px; height:10px; background:${d.data.color}; margin-right:8px; border-radius:50%;"></span>
                        <span>Revenue: <b style="color: #fff;">$${d.data.value.toFixed(2)}B</b></span>
                      </div>
                      <div style="color: #e2e8f0; font-size: 0.95rem; padding-left: 18px;">
                        Market Share: <b style="color: #fff;">${pct}%</b>
                      </div>
                    </div>`;
                    
        const bounds = container.node().getBoundingClientRect();
        let tooltipX = event.clientX - bounds.left + 20;
        let tooltipY = event.clientY - bounds.top - 20;
        
        if (tooltipX + 180 > width) tooltipX = event.clientX - bounds.left - 180;
        
        tooltip.html(html).style("left", tooltipX + "px").style("top", tooltipY + "px").style("opacity", 1);
        d3.select(this).attr("opacity", 0.7); 
      })
      .on("mouseout", function() {
        tooltip.style("opacity", 0);
        d3.select(this).attr("opacity", 1); 
      });
  }

  drawLineChart(selectedFormats);

  const bisectYear = d3.bisector(d => d.Year).left;

  // Dragging across the line chart scrubs the year and updates the pie in sync.
  const dragScrubber = d3.drag()
    .on("start drag", (event) => {
      if (selectedFormats.size === 0) return;

      const clampedX = Math.max(margin.left, Math.min(event.x, lineChartWidth - margin.right));
      const x0 = x.invert(clampedX);

      if (x0 < data[0].Year || x0 > data[data.length - 1].Year) return;

      const i = bisectYear(data, x0, 1);
      const d0 = data[i - 1];
      const d1 = data[i] || d0;
      const currentData = x0 - d0.Year > d1.Year - x0 ? d1 : d0;
      const currentX = x(currentData.Year);

      crosshair.attr("x1", currentX).attr("x2", currentX).style("opacity", 0.6);

      updatePieChart(currentData, [...selectedFormats]);

      const activeSorted = [...selectedFormats].sort((a, b) => currentData[b] - currentData[a]);
      let html = `<strong style="color: #fff; font-size: 1.1rem;">Year: ${currentData.Year}</strong><br/>
                  <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">`;
      
      activeSorted.forEach(key => {
          const val = currentData[key];
          if (val > 0) {
              html += `<div style="color: #e2e8f0; font-size: 0.95rem; display: flex; align-items: center;">
                        <span style="display:inline-block; width:10px; height:10px; background:${colors[key]}; margin-right:8px; border-radius:50%;"></span>
                        <span>${labels[key]}: <b style="color: #fff;">$${val.toFixed(2)}B</b></span>
                      </div>`;
          }
      });
      html += `</div>`;

      let tooltipX = clampedX + 20;
      if (tooltipX + 160 > lineChartWidth) tooltipX = clampedX - 180; 

      tooltip.html(html).style("left", tooltipX + "px").style("top", "20px").style("opacity", 1);
    });

  overlay.style("cursor", "ew-resize").call(dragScrubber);
}

// Fades and shifts story sections as they enter the viewport
function activateOnScroll() {
  const sections = document.querySelectorAll(".story-section");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.style.opacity = entry.isIntersecting ? "1" : "0.6";
      entry.target.style.transform = entry.isIntersecting ? "translateY(0)" : "translateY(8px)";
    });
  }, { threshold: 0.2 });

  sections.forEach((section) => {
    section.style.transition = "opacity 280ms ease, transform 280ms ease";
    observer.observe(section);
  });
}

async function init() {
  cachedData = await loadStoryData();
  renderAllCharts(cachedData);
  activateOnScroll();

  const startButton = document.getElementById("start-btn");
  if (startButton) {
    startButton.addEventListener("click", (event) => {
      event.preventDefault();
      document.body.classList.remove("scroll-locked");
      document.querySelector("#section-hook").scrollIntoView({ behavior: "smooth" });
    });
  }

  // Debounce resize to avoid re-rendering every pixel of a window drag.
  window.addEventListener("resize", () => {
    if (!cachedData) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderAllCharts(cachedData), 180);
  });
}

window.addEventListener("DOMContentLoaded", init);

// Re-renders every chart; called on load and after window resize
function renderAllCharts(data) {
  if (!data || data.length === 0) return;
  renderHookChart(data);
  renderVinylRebirth(data);
  renderCDPeak(data);
  renderDownloadMountain(data);
  renderOwnershipAccess(data);
  renderStackedArea(data);
  renderDashboard(data);
}