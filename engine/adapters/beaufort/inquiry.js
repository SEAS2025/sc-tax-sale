"use strict";

/**
 * Treasurer inquiry draft.
 * Pattern from beaufort-tax-pdfs/generate_treasurer_inquiry.js.
 * Returns text only. Does not write owner files. Owner names are omitted
 * from the letter body; the caller can attach their own working file.
 */

const { parseCsv, parseAmount } = require("../../csv");

function draftInquiry(text, options) {
  const opts = options || {};
  const count = Math.max(1, Math.min(500, parseInt(opts.count || "10", 10)));
  const countyName = opts.countyName || "County";
  const identifierLabel = opts.identifierLabel || "PIN";
  const rows = parseCsv(text);
  const with25 = rows.filter((r) => Number.isFinite(parseAmount(r.amount_2025_REALAD)) && parseAmount(r.amount_2025_REALAD) > 0);
  with25.sort((a, b) => {
    const da = parseAmount(a.amount_2025_REALAD);
    const db = parseAmount(b.amount_2025_REALAD);
    if (da !== db) return da - db;
    return String(a.tms || "").localeCompare(String(b.tms || ""));
  });
  const sample = with25.slice(0, count);
  const lines = [];
  lines.push(
    "Subject: Inquiry — " +
      sample.length +
      " lowest 2025 REALAD delinquent amounts (research list)"
  );
  lines.push("");
  lines.push("Dear " + countyName + " Treasurer / Delinquent Tax Office,");
  lines.push("");
  lines.push(
    "I am writing about " +
      sample.length +
      " real property parcels (" +
      identifierLabel +
      " below). They are the smallest 2025 REALAD delinquent amounts on my research list — sorted by that 2025 amount only (lowest first). Parcels without a parseable 2025 REALAD amount were not included."
  );
  lines.push("");
  lines.push(
    "I would like official guidance on current balances/payoff, tax sale or redemption status if applicable, and whom to contact for additional parcels."
  );
  lines.push("");
  lines.push("Lowest 2025 REALAD amounts first:");
  sample.forEach((r, i) => {
    lines.push(
      "  " +
        (i + 1) +
        ". " +
        (r.tms || "") +
        " — 2025 REALAD: " +
        (r.amount_2025_REALAD || "") +
        " (2022 list: " +
        (r.amount_2022_list || "n/a") +
        ")"
    );
  });
  lines.push("");
  lines.push("Thank you,");
  lines.push("");
  lines.push("[Your name]");
  lines.push("[Your phone]");
  lines.push("[Your email]");
  lines.push("");
  lines.push("---");
  lines.push("Pool: " + with25.length + " parcels had a parseable 2025 REALAD amount");
  lines.push("Public-record research draft. Not legal advice. Confirm with the treasurer before sending.");
  return {
    sampleSize: sample.length,
    pool: with25.length,
    text: lines.join("\n"),
  };
}

module.exports = { draftInquiry };
