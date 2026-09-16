"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadSc() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "counties", "sc.json"), "utf8"));
}

function loadExtras() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "counties", "extras.json"), "utf8"));
}

function listCounties() {
  return loadSc().counties.slice();
}

function getCounty(id) {
  const key = String(id || "").trim().toLowerCase();
  return listCounties().find((c) => c.id === key) || null;
}

function countByStatus() {
  const counts = { live: 0, researched: 0, unknown: 0 };
  for (const c of listCounties()) {
    if (!Object.prototype.hasOwnProperty.call(counts, c.status)) {
      throw new Error("Unexpected status: " + c.status + " (" + c.id + ")");
    }
    counts[c.status] += 1;
  }
  return counts;
}

module.exports = {
  ROOT,
  loadSc,
  loadExtras,
  listCounties,
  getCounty,
  countByStatus,
};
