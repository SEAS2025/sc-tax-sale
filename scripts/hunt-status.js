#!/usr/bin/env node
"use strict";

/**
 * Write docs/HUNT_STATUS.md: one row per county showing whether a recent list
 * and a ~5-year-old archive are hosted, how many identifiers appear on both,
 * and why a county is still empty. Facts come from the snapshot and the hunt
 * state file, never from guesses.
 */

const fs = require("fs");
const path = require("path");
const calendar = require("../engine/ads-calendar");

const ROOT = path.join(__dirname, "..");

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function reasonFor(row, hunt, seed) {
  if (row.bothCount) return "paired";
  const blocked = (hunt && hunt.blocked) || [];
  if (!row.recent && !row.historic) {
    if (blocked.length) return "blocked: " + blocked.join("; ").slice(0, 70);
    const status = (seed && seed.listStatus) || "unknown";
    const sale = seed && seed.saleDate;
    if (status === "rule" || status === "scheduled") {
      return "no list hosted yet" + (sale ? "; sale " + sale : "") + (seed && seed.adOutlet ? "; ad in " + seed.adOutlet : "");
    }
    return "nothing hosted found";
  }
  if (row.recent && !row.historic) return "have " + row.recent.year + "; no 2020-2022 archive found";
  if (!row.recent && row.historic) return "have " + row.historic.year + " archive; no current list hosted";
  return "both sides hosted but no identifier overlap";
}

function main() {
  const snapshot = loadJson(path.join(ROOT, "site", "data", "repeat.json"), null);
  if (!snapshot) {
    console.error("no site/data/repeat.json yet");
    process.exit(1);
  }
  const state = loadJson(path.join(ROOT, "inbox", "hunt", "state.json"), { counties: {} });
  const lines = [];
  lines.push("# Hunt status");
  lines.push("");
  lines.push("Generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC from `site/data/repeat.json` and `inbox/hunt/state.json`.");
  lines.push("");
  lines.push("A county is **paired** only when an officially hosted current list and an officially");
  lines.push("hosted 2020-2022 list share parcel identifiers. Counties with no hosted list are");
  lines.push("reported as empty; nothing here is inferred or filled in.");
  lines.push("");
  lines.push("- Paired counties: **" + snapshot.withBoth + "** of " + snapshot.counties.length);
  lines.push("- Repeat parcels: **" + snapshot.bothCount.toLocaleString("en-US") + "**");
  lines.push("- Counties with a recent list: " + snapshot.withRecent);
  lines.push("- Counties with a historic list: " + snapshot.withHistoric);
  lines.push("");
  lines.push("| County | Recent list | Historic list | Repeat parcels | Status |");
  lines.push("| --- | --- | --- | ---: | --- |");
  for (const row of snapshot.counties) {
    const hunt = state.counties[row.id];
    const seed = calendar.getSeed(row.id);
    const recent = row.recent ? row.recent.year + " (" + row.recent.idCount.toLocaleString("en-US") + " ids)" : "—";
    const historic = row.historic ? row.historic.year + " (" + row.historic.idCount.toLocaleString("en-US") + " ids)" : "—";
    lines.push("| " + row.name + " | " + recent + " | " + historic + " | "
      + (row.bothCount ? row.bothCount.toLocaleString("en-US") : "—") + " | "
      + reasonFor(row, hunt, seed) + " |");
  }
  lines.push("");
  lines.push("Sources are official county hosts, their document centers, public object-storage");
  lines.push("prefixes, and Wayback captures of those same hosts. Owner names are never stored.");
  lines.push("Not for commercial solicitation (S.C. Code § 30-2-50).");
  lines.push("");
  const dest = path.join(ROOT, "docs", "HUNT_STATUS.md");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, lines.join("\n"));
  console.log("wrote", dest, "-", snapshot.withBoth, "paired,", snapshot.bothCount, "parcels");
}

main();
