(function () {
  const search = document.getElementById("county-search");
  const chips = document.getElementById("county-chips");
  const detail = document.getElementById("county-detail");
  const svg = document.getElementById("sc-map");
  const caption = document.getElementById("map-caption");
  let counties = [];
  let selected = "lexington";

  function statusLabel(status) {
    if (status === "live") return "Live";
    if (status === "researched") return "Page classified";
    return "Unknown";
  }

  function renderDetail(id) {
    const county = counties.find((c) => c.id === id);
    if (!county) return;
    selected = id;
    const links = [
      county.treasurerUrl ? '<a href="' + county.treasurerUrl + '">Treasurer</a>' : "",
      county.gisUrl ? '<a href="' + county.gisUrl + '">GIS</a>' : "",
      county.propertySearchUrl ? '<a href="' + county.propertySearchUrl + '">Property search</a>' : "",
    ].filter(Boolean).join(" · ");
    detail.hidden = false;
    detail.innerHTML =
      "<p class='eyebrow'>" + statusLabel(county.status) + " · FIPS " + county.fips + "</p>" +
      "<h3>" + county.name + " County</h3>" +
      "<p>" + county.notes + "</p>" +
      "<p class='meta'>Identifier: " + (county.identifier || "not set") +
      (county.adapter ? " · adapter " + county.adapter : " · no adapter") + "</p>" +
      (links ? "<p>" + links + "</p>" : "<p class='meta'>No treasurer or GIS URL in the registry.</p>");
    document.querySelectorAll("#sc-map path, #county-chips button").forEach((el) => {
      el.classList.toggle("is-on", el.getAttribute("data-id") === id);
    });
    caption.textContent = county.name + " County — " + statusLabel(county.status);
  }

  function renderChips(query) {
    const q = (query || "").trim().toLowerCase();
    const rows = counties.filter((c) => !q || c.name.toLowerCase().includes(q));
    chips.innerHTML = "";
    if (!rows.length) {
      chips.textContent = "No counties match.";
      return;
    }
    rows.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = c.name;
      btn.className = c.status + (c.id === selected ? " is-on" : "");
      btn.setAttribute("data-id", c.id);
      btn.addEventListener("click", () => renderDetail(c.id));
      chips.appendChild(btn);
    });
  }

  function drawMap(paths) {
    const byId = Object.fromEntries(counties.map((c) => [c.id, c]));
    paths.forEach((p) => {
      const county = byId[p.id];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", p.d);
      path.setAttribute("data-id", p.id);
      path.setAttribute("class", (county ? county.status : "unknown") + (p.id === selected ? " is-on" : ""));
      path.addEventListener("mouseenter", () => {
        caption.textContent = (county ? county.name : p.id) + " County — " + statusLabel(county && county.status);
      });
      path.addEventListener("click", () => renderDetail(p.id));
      svg.appendChild(path);
    });
  }

  Promise.all([
    fetch("data/sc.json").then((r) => r.json()),
    fetch("data/map-paths.json").then((r) => r.json()),
  ]).then(([registry, paths]) => {
    counties = registry.counties;
    const counts = { live: 0, researched: 0, unknown: 0 };
    counties.forEach((c) => { counts[c.status] += 1; });
    document.getElementById("stat-counties").textContent = String(counties.length);
    document.getElementById("stat-live").textContent = String(counts.live);
    document.getElementById("stat-researched").textContent = String(counts.researched);
    document.getElementById("stat-unknown").textContent = String(counts.unknown);
    drawMap(paths);
    renderChips("");
    renderDetail("lexington");
    search.addEventListener("input", () => renderChips(search.value));
  }).catch(() => {
    caption.textContent = "County registry failed to load.";
  });
})();
