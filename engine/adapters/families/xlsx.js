"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { parseAmount } = require("../../csv");

const ID_HEADERS = /map|parcel|pin|tms|account|item/i;
const AMOUNT_HEADERS = /amount|due|total/i;
const NAME_HEADERS = /name|owner/i;

function unzipText(file, entry) {
  return execFileSync("unzip", ["-p", file, entry], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function unzipList(file) {
  return execFileSync("unzip", ["-Z1", file], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean);
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function sharedStrings(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = re.exec(xml))) {
    const parts = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(match[1]))) parts.push(decodeXml(t[1]));
    out.push(parts.join(""));
  }
  return out;
}

function colIndex(ref) {
  const letters = String(ref || "").replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(xml, strings) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let row;
  while ((row = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cell;
    while ((cell = cellRe.exec(row[1]))) {
      const attrs = cell[1];
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || "";
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      const at = colIndex(ref);
      let value = "";
      if (type === "inlineStr") {
        value = decodeXml(((cell[2].match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || "");
      } else if (type === "s") {
        const idx = Number(((cell[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1]) || "");
        value = strings[idx] || "";
      } else {
        value = decodeXml(((cell[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1]) || "");
      }
      if (at >= 0) cells[at] = value.trim();
    }
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

function firstSheetPath(file) {
  const names = unzipList(file);
  const rels = names.find((n) => n === "xl/_rels/workbook.xml.rels");
  const book = names.find((n) => n === "xl/workbook.xml");
  if (rels && book) {
    const relXml = unzipText(file, rels);
    const bookXml = unzipText(file, book);
    const rid = (bookXml.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    if (rid) {
      const target = (relXml.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1]
        || (relXml.match(new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"')) || [])[1];
      if (target) {
        const clean = target.replace(/^\//, "").replace(/^xl\//, "");
        const full = target.startsWith("/") ? target.slice(1) : "xl/" + clean;
        if (names.includes(full)) return full;
      }
    }
  }
  return names.find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)) || null;
}

function rowsFromFile(file) {
  const sheet = firstSheetPath(file);
  if (!sheet) throw new Error("xlsx has no worksheet");
  let strings = [];
  const names = unzipList(file);
  if (names.includes("xl/sharedStrings.xml")) {
    strings = sharedStrings(unzipText(file, "xl/sharedStrings.xml"));
  }
  return sheetRows(unzipText(file, sheet), strings);
}

function parseRows(matrix, county) {
  const headers = (matrix[0] || []).map((h) => String(h || "").trim());
  const idAt = headers.findIndex((h) => ID_HEADERS.test(h) && !/item/i.test(h)) >= 0
    ? headers.findIndex((h) => ID_HEADERS.test(h) && !/item/i.test(h))
    : headers.findIndex((h) => ID_HEADERS.test(h));
  const amountAt = headers.findIndex((h) => AMOUNT_HEADERS.test(h));
  const nameAt = headers.findIndex((h) => NAME_HEADERS.test(h));
  const missing = [];
  if (idAt < 0) missing.push("pin/tms/map");
  if (amountAt < 0) missing.push("amount");
  const rows = missing.length ? [] : matrix.slice(1).map((cells) => ({
    tms: String(cells[idAt] || "").trim(),
    amount: parseAmount(cells[amountAt]),
    hasOwner: nameAt >= 0 && Boolean(cells[nameAt]),
  })).filter((row) => row.tms);
  return {
    family: "xlsx",
    countyId: county && county.id ? county.id : null,
    rowCount: rows.length,
    amountTotal: rows.reduce((sum, row) => sum + row.amount, 0),
    recognizedIds: rows.filter((row) => row.tms).length,
    missingColumns: missing,
    columns: headers,
    rows,
  };
}

function parseFile(file, county) {
  return parseRows(rowsFromFile(file), county);
}

function colRef(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[^\x09\x0a\x0d\x20-\uD7FF\uE000-\uFFFD]/g, "");
}

function sheetName(name, used) {
  let base = String(name || "Sheet").replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = " " + n;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function writeWorkbook(dest, sheets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-book-"));
  const strings = [];
  function sid(value) {
    const text = String(value == null ? "" : value);
    let i = strings.indexOf(text);
    if (i < 0) {
      strings.push(text);
      i = strings.length - 1;
    }
    return i;
  }
  const usedNames = new Set();
  const named = (sheets || []).map((sheet, i) => ({
    name: sheetName(sheet.name || ("Sheet" + (i + 1)), usedNames),
    headers: sheet.headers || [],
    rows: sheet.rows || [],
  }));
  const sheetFiles = {};
  const workbookSheets = [];
  const rels = [];
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
  ];
  named.forEach((sheet, i) => {
    const part = "worksheets/sheet" + (i + 1) + ".xml";
    const rid = "rId" + (i + 1);
    workbookSheets.push('<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="' + rid + '"/>');
    rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="' + part + '"/>');
    overrides.push('<Override PartName="/xl/' + part + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    const all = [sheet.headers].concat(sheet.rows);
    const rowsXml = all.map((row, r) => {
      const cells = (row || []).map((value, c) => {
        const ref = colRef(c) + (r + 1);
        if (typeof value === "number" && Number.isFinite(value)) {
          return '<c r="' + ref + '"><v>' + value + "</v></c>";
        }
        if (value == null || value === "") return '<c r="' + ref + '"/>';
        return '<c r="' + ref + '" t="s"><v>' + sid(value) + "</v></c>";
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");
    sheetFiles["xl/" + part] = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml + "</sheetData></worksheet>";
  });
  rels.push('<Relationship Id="rId' + (named.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>');
  const files = Object.assign({
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + overrides.join("") + "</Types>",
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + workbookSheets.join("") + "</sheets></workbook>",
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join("") + "</Relationships>",
    "xl/sharedStrings.xml": '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">' + strings.map((s) => "<si><t>" + xmlEscape(s) + "</t></si>").join("") + "</sst>",
  }, sheetFiles);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  execFileSync("zip", ["-qr", dest, "."], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  return dest;
}

function writeFixture(dest, headers, dataRows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-fixture-"));
  const strings = [];
  function sid(value) {
    const text = String(value);
    let i = strings.indexOf(text);
    if (i < 0) {
      strings.push(text);
      i = strings.length - 1;
    }
    return i;
  }
  const all = [headers].concat(dataRows);
  const sheetRowsXml = all.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = String.fromCharCode(65 + c) + (r + 1);
      return '<c r="' + ref + '" t="s"><v>' + sid(value) + "</v></c>";
    }).join("");
    return '<row r="' + (r + 1) + '">' + cells + "</row>";
  }).join("");
  const files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Delinquent" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + strings.map((s) => "<si><t>" + s.replace(/&/g, "&amp;") + "</t></si>").join("") + "</sst>",
    "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRowsXml + "</sheetData></worksheet>",
  };
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync("zip", ["-qr", dest, "."], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  return dest;
}

module.exports = {
  id: "xlsx",
  parseFile,
  parseRows,
  writeFixture,
  writeWorkbook,
  colRef,
};
