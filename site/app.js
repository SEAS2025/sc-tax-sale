(function () {
  const search = document.getElementById("county-search");
  const chips = document.getElementById("county-chips");
  const detail = document.getElementById("county-detail");
  const svg = document.getElementById("sc-map");
  const caption = document.getElementById("map-caption");
  const adBody = document.querySelector("#ad-table tbody");
  const repeatBody = document.querySelector("#repeat-table tbody");
  const repeatIds = document.getElementById("repeat-ids");
  let counties = [];
  let adsById = {};
  let repeatById = {};
  let adsMeta = null;
  let repeatMeta = null;
  let selected = "lexington";
  let adFilter = "due";
  let repeatFilter = "both";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function adFor(id) {
    return adsById[id] || null;
  }

  function adClass(ad) {
    if (!ad) return "unknown";
    if (ad.listStatus === "posted") return "live";
    if (ad.listStatus === "held") return "held";
    if (ad.windowOpen || ad.due) return "researched";
    if (ad.listStatus === "scheduled" || ad.listStatus === "rule") return "scheduled";
    return "unknown";
  }

  function statusLabel(status) {
    if (status === "live") return "Live";
    if (status === "researched") return "Page classified";
    return "Unknown";
  }

  function listLabel(ad) {
    if (!ad) return "Not scanned";
    if (ad.listStatus === "posted") return "Posted";
    if (ad.listStatus === "held") return "Held";
    if (ad.due) return ad.catchUntil ? "Catch through " + formatDate(ad.catchUntil) : "Catch window";
    if (ad.listStatus === "scheduled") return ad.windowOpen ? "Window open" : "Scheduled";
    if (ad.listStatus === "rule") return "Weekday rule";
    if (ad.listStatus === "leftover") return "2025 leftover";
    if (ad.listStatus === "flyer") return "Flyer only";
    return "Waiting";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[Number(m) - 1] + " " + Number(d) + ", " + y;
  }

  function saleCell(ad) {
    if (!ad) return "—";
    const shown = (ad.saleDates && ad.saleDates.length ? ad.saleDates : (ad.saleDate ? [ad.saleDate] : []));
    if (!shown.length) return escapeHtml(ad.saleNote || "—");
    const label = shown.map(formatDate).join(" · ");
    const prefix = ad.datePrecision === "implied" ? "Typically " : "";
    return prefix + escapeHtml(label) + (ad.saleNote ? "<div class='muted'>" + escapeHtml(ad.saleNote) + "</div>" : "");
  }

  function adCell(ad) {
    if (!ad) return "—";
    const dates = (ad.adDates || []).map(formatDate).join(" · ");
    const outlet = ad.adOutlet ? escapeHtml(ad.adOutlet) : "";
    if (!outlet && !dates) return ad.listPromised ? "List promised " + formatDate(ad.listPromised) : "—";
    return (outlet || "Newspaper") + (dates ? "<div class='muted'>" + escapeHtml(dates) + "</div>" : "");
  }

  function scanCell(ad) {
    if (!ad || !ad.lastScan) return "<span class='muted'>Seed calendar</span>";
    const scan = ad.lastScan;
    if (scan.blocked) return "Blocked (" + escapeHtml(scan.blockReason || "wall") + ")";
    if (scan.error) return "<span class='muted'>" + escapeHtml(scan.error) + "</span>";
    const when = scan.at ? formatDate(scan.at.slice(0, 10)) : "";
    const bits = [when, scan.httpStatus ? "HTTP " + scan.httpStatus : ""].filter(Boolean);
    if (scan.listingLinkCount) bits.push(scan.listingLinkCount + " link" + (scan.listingLinkCount === 1 ? "" : "s"));
    return escapeHtml(bits.join(" · ") || "Scanned");
  }

  function pillClass(ad) {
    if (!ad) return "";
    if (ad.listStatus === "posted") return " posted";
    if (ad.windowOpen || ad.due) return " open";
    if (ad.listStatus === "held") return " held";
    return "";
  }

  function matchesFilter(ad, filter) {
    if (filter === "all") return true;
    if (filter === "posted") return ad && ad.listStatus === "posted";
    if (filter === "held") return ad && ad.listStatus === "held";
    if (filter === "due") return ad && ad.due && ad.listStatus !== "held" && ad.listStatus !== "posted";
    if (filter === "upcoming") {
      return ad && (ad.listStatus === "scheduled" || ad.listStatus === "rule") && !ad.windowOpen;
    }
    return true;
  }

  function renderDetail(id) {
    const county = counties.find((c) => c.id === id);
    if (!county) return;
    selected = id;
    const ad = adFor(id);
    const links = [
      county.treasurerUrl ? '<a href="' + escapeHtml(county.treasurerUrl) + '">Treasurer</a>' : "",
      county.gisUrl ? '<a href="' + escapeHtml(county.gisUrl) + '">GIS</a>' : "",
      county.propertySearchUrl ? '<a href="' + escapeHtml(county.propertySearchUrl) + '">Property search</a>' : "",
    ].filter(Boolean).join(" · ");
    const listingLinks = ad && ad.lastScan && ad.lastScan.listingLinks
      ? ad.lastScan.listingLinks.slice(0, 4).map((link) => (
        '<a href="' + escapeHtml(link.href) + '">' + escapeHtml(link.text || "listing") + "</a>"
      )).join(" · ")
      : "";
    detail.hidden = false;
    detail.innerHTML =
      "<p class='eyebrow'>" + escapeHtml(listLabel(ad)) + " · FIPS " + escapeHtml(county.fips) + "</p>" +
      "<h3>" + escapeHtml(county.name) + " County</h3>" +
      "<p>" + escapeHtml(county.notes) + "</p>" +
      "<p><span class='pill" + pillClass(ad) + "'>" + escapeHtml(listLabel(ad)) + "</span></p>" +
      "<p class='meta'>2026 sale: " + (ad ? saleCell(ad) : "—") + "</p>" +
      "<p class='meta'>Ads: " + (ad ? adCell(ad) : "—") + "</p>" +
      "<p class='meta'>Identifier: " + escapeHtml(county.identifier || "not set") +
      (county.adapter ? " · adapter " + escapeHtml(county.adapter) : " · no adapter") + "</p>" +
      (links ? "<p>" + links + "</p>" : "<p class='meta'>No treasurer or GIS URL in the registry.</p>") +
      (listingLinks ? "<p class='meta'>Scan found: " + listingLinks + "</p>" : "") +
      repeatDetail(id);
    document.querySelectorAll("#sc-map path, #county-chips button").forEach((el) => {
      el.classList.toggle("is-on", el.getAttribute("data-id") === id);
    });
    caption.textContent = county.name + " County — " + listLabel(ad);
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
      btn.className = adClass(adFor(c.id)) + (c.id === selected ? " is-on" : "");
      btn.setAttribute("data-id", c.id);
      btn.addEventListener("click", () => renderDetail(c.id));
      chips.appendChild(btn);
    });
  }

  function repeatFor(id) {
    return repeatById[id] || null;
  }

  function money(value) {
    if (value == null) return "";
    return "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function repeatDetail(id) {
    const row = repeatFor(id);
    if (!row) return "";
    if (row.bothCount) {
      return "<p class='meta'>5-year file: <strong>" + row.bothCount + "</strong> parcel IDs on both the " +
        escapeHtml(String(row.recent && row.recent.year || "newest")) + " list and the " +
        escapeHtml(String(row.historic && row.historic.year || "historic")) + " list.</p>";
    }
    if (row.recent) return "<p class='meta'>Newest list is in (" + escapeHtml(String(row.recent.year)) + "). Waiting on a ~5-year file.</p>";
    if (row.historic) return "<p class='meta'>Historic list is in (" + escapeHtml(String(row.historic.year)) + "). Waiting on this year’s posting.</p>";
    return "<p class='meta'>No hosted pair yet. The scanner will fill this when both lists appear.</p>";
  }

  function matchesRepeatFilter(row, filter) {
    if (filter === "all") return true;
    if (filter === "both") return row && row.bothCount;
    if (filter === "recent") return row && row.recent && !row.bothCount;
    if (filter === "waiting") return !row || (!row.recent && !row.historic);
    return true;
  }

  function showRepeatIds(id) {
    const row = repeatFor(id);
    if (!repeatIds || !row || !row.bothCount) {
      if (repeatIds) repeatIds.hidden = true;
      return;
    }
    repeatIds.hidden = false;
    const items = (row.both || []).map((item) => (
      "<li><code>" + escapeHtml(item.tms) + "</code>" +
      (item.amountRecent != null ? " <span class='muted'>" + money(item.amountRecent) + "</span>" : "") +
      "</li>"
    )).join("");
    repeatIds.innerHTML =
      "<p class='eyebrow'>Identifiers only</p>" +
      "<h3>" + escapeHtml(row.name) + " — " + row.bothCount + " in both years</h3>" +
      "<p class='meta'>Newest " + escapeHtml(String(row.recent && row.recent.year || "")) +
      " · historic " + escapeHtml(String(row.historic && row.historic.year || "")) +
      ". Owner names are not stored.</p>" +
      "<ul class='id-grid'>" + items + "</ul>";
  }

  function renderRepeat() {
    if (!repeatBody) return;
    const rows = counties
      .map((c) => repeatFor(c.id) || { id: c.id, name: c.name, bothCount: 0, recent: null, historic: null })
      .filter((row) => matchesRepeatFilter(row, repeatFilter))
      .sort((a, b) => (b.bothCount || 0) - (a.bothCount || 0) || a.name.localeCompare(b.name));
    repeatBody.innerHTML = "";
    if (!rows.length) {
      repeatBody.innerHTML = "<tr><td colspan='4' class='muted'>Nothing in this filter. The scanner writes a row when a county posts a pair of lists.</td></tr>";
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const newest = row.recent ? escapeHtml(String(row.recent.year)) + " · " + (row.recent.idCount || 0) + " IDs" : "—";
      const old = row.historic ? escapeHtml(String(row.historic.year)) + " · " + (row.historic.idCount || 0) + " IDs" : "—";
      tr.innerHTML =
        "<td><button type='button' class='linkish' data-id='" + escapeHtml(row.id) + "'>" + escapeHtml(row.name) + "</button></td>" +
        "<td>" + newest + "</td>" +
        "<td>" + old + "</td>" +
        "<td>" + (row.bothCount ? "<strong class='repeat-count'>" + row.bothCount + "</strong>" : "<span class='muted'>0</span>") + "</td>";
      tr.querySelector("button").addEventListener("click", () => {
        renderDetail(row.id);
        showRepeatIds(row.id);
        document.getElementById("repeat").scrollIntoView({ behavior: "smooth" });
      });
      repeatBody.appendChild(tr);
    });
  }

  function renderAds() {
    if (!adBody) return;
    const rows = counties
      .map((c) => adFor(c.id) || { id: c.id, name: c.name, listStatus: "unknown" })
      .filter((ad) => matchesFilter(ad, adFilter))
      .sort((a, b) => String(a.saleDate || "9999").localeCompare(String(b.saleDate || "9999")) || a.name.localeCompare(b.name));
    adBody.innerHTML = "";
    if (!rows.length) {
      adBody.innerHTML = "<tr><td colspan='5' class='muted'>Nothing in this filter today. The scanner will flip a row when the official page grows a 2026 listing link.</td></tr>";
      return;
    }
    rows.forEach((ad) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td><button type='button' class='linkish' data-id='" + escapeHtml(ad.id) + "'>" + escapeHtml(ad.name) + "</button></td>" +
        "<td>" + saleCell(ad) + "</td>" +
        "<td>" + adCell(ad) + "</td>" +
        "<td><span class='pill" + pillClass(ad) + "'>" + escapeHtml(listLabel(ad)) + "</span></td>" +
        "<td>" + scanCell(ad) + "</td>";
      tr.querySelector("button").addEventListener("click", () => {
        renderDetail(ad.id);
        document.getElementById("coverage").scrollIntoView({ behavior: "smooth" });
      });
      adBody.appendChild(tr);
    });
  }

  function drawMap(paths) {
    const byId = Object.fromEntries(counties.map((c) => [c.id, c]));
    paths.forEach((p) => {
      const county = byId[p.id];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", p.d);
      path.setAttribute("data-id", p.id);
      path.setAttribute("class", adClass(adFor(p.id)) + (p.id === selected ? " is-on" : ""));
      path.addEventListener("mouseenter", () => {
        caption.textContent = (county ? county.name : p.id) + " County — " + listLabel(adFor(p.id));
      });
      path.addEventListener("click", () => renderDetail(p.id));
      svg.appendChild(path);
    });
  }

  document.querySelectorAll("#repeat-filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      repeatFilter = btn.getAttribute("data-repeat-filter");
      document.querySelectorAll("#repeat-filters button").forEach((el) => {
        el.classList.toggle("is-on", el === btn);
      });
      renderRepeat();
    });
  });

  document.querySelectorAll("#ad-filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      adFilter = btn.getAttribute("data-filter");
      document.querySelectorAll("#ad-filters button").forEach((el) => {
        el.classList.toggle("is-on", el === btn);
      });
      renderAds();
    });
  });

  Promise.all([
    fetch("data/sc.json").then((r) => r.json()),
    fetch("data/map-paths.json").then((r) => r.json()),
    fetch("data/ads.json").then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch("data/repeat.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  ]).then(([registry, paths, ads, repeat]) => {
    counties = registry.counties;
    if (ads && ads.counties) {
      adsMeta = ads;
      ads.counties.forEach((row) => { adsById[row.id] = row; });
      document.getElementById("stat-windows").textContent = String(ads.counts.windowOpen || 0);
      document.getElementById("stat-posted").textContent = String(ads.counts.posted || 0);
      const lead = document.getElementById("ads-lead");
      if (lead) {
        lead.textContent = "Season " + ads.season + ". Daily scan of all 46 pages. A county stays due for seven days after its promised ad or list date so a late posting is still caught. Owner names stay off this site.";
      }
    }
    if (repeat && repeat.counties) {
      repeatMeta = repeat;
      repeat.counties.forEach((row) => { repeatById[row.id] = row; });
      const stat = document.getElementById("stat-repeat");
      if (stat) stat.textContent = String(repeat.bothCount || 0);
      const lead = document.getElementById("repeat-lead");
      if (lead && repeat.generatedAt) {
        lead.textContent = "Last rebuild " + formatDate(repeat.generatedAt.slice(0, 10)) +
          ". " + (repeat.withBoth || 0) + " counties have both a newest list and a ~5-year list, " +
          (repeat.bothCount || 0) + " parcel IDs in both. Owner names stay off this site.";
      }
    }
    const note = document.getElementById("scan-note");
    if (note) {
      const bits = [];
      if (adsMeta && adsMeta.generatedAt) bits.push("ads " + formatDate(adsMeta.generatedAt.slice(0, 10)));
      if (repeatMeta && repeatMeta.generatedAt) bits.push("5-year file " + formatDate(repeatMeta.generatedAt.slice(0, 10)));
      note.textContent = bits.length
        ? "Last scan: " + bits.join(" · ") + ". New official lists rebuild the statewide file."
        : "The scanner refreshes ads and the 5-year file when a new official list appears.";
    }
    document.getElementById("stat-counties").textContent = String(counties.length);
    drawMap(paths);
    renderChips("");
    renderAds();
    renderRepeat();
    renderDetail("lexington");
    showRepeatIds("lexington");
    search.addEventListener("input", () => renderChips(search.value));
  }).catch(() => {
    caption.textContent = "County registry failed to load.";
  });
})();
