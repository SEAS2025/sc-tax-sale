"use strict";

/**
 * CSV helpers shared by county adapters.
 * Quoted-field parser matches the original CountySection.parseCsv behavior
 * (BOM strip, quoted commas). Does not download remote files.
 */

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).filter((line) => line.trim()).map((line) => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] != null ? vals[i].trim() : "";
    });
    return obj;
  });
}

function splitCsvLine(line) {
  const vals = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      vals.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur);
  return vals;
}

function parseAmount(str) {
  if (str == null || str === "") return 0;
  if (typeof str === "number") return str;
  return parseFloat(String(str).replace(/[$,]/g, "")) || 0;
}

/**
 * Split "Owner Name, 123 Main St" the way CountySection.parseOwnerLocation did.
 * Used for schema mapping. Callers that publish output should redact names.
 */
function parseOwnerLocation(str) {
  if (!str) return { owner: "", address: "" };
  const text = String(str).replace(/^\d+/, "").trim();
  const parts = text.split(",");
  if (parts.length > 1) {
    return { owner: parts[0].trim(), address: parts.slice(1).join(",").trim() };
  }
  const match = text.match(/^(.+?)(\d.*)$/);
  if (match) return { owner: match[1].trim(), address: match[2].trim() };
  return { owner: text, address: "" };
}

module.exports = { parseCsv, parseAmount, parseOwnerLocation };
