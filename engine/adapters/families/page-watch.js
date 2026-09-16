"use strict";

/**
 * Page watcher for counties whose treasurer page is real but the file is
 * seasonal, in the newspaper, or behind bidder registration. It records
 * links. It does not download listing files.
 */

const LISTING_TEXT = /tax[\s-]*sale|delinquent|realad|forfeited land|bidder/i;
const FILE_EXT = /\.(pdf|xlsx|xls|csv|zip)(\?|#|$)/i;
const NEWSPAPER = /newspaper|legal notice|post and courier|the state|greenville news|horry independent|bamberg leader|times and democrat|index-journal/i;

function decode(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHrefs(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let href = raw;
    try {
      href = new URL(raw, baseUrl || "https://example.invalid/").href;
    } catch (_err) {
      href = raw;
    }
    const text = decode(match[2]).slice(0, 180);
    links.push({ text, href });
  }
  return links;
}

function inspectHtml(html, pageUrl) {
  const text = decode(html);
  const password = /<input\b[^>]*type=["']password["']/i.test(html);
  const captcha = /captcha|cf-turnstile|g-recaptcha|hcaptcha/i.test(html);
  const loginWall = password && /sign in|log in|password/i.test(text);
  const links = extractHrefs(html, pageUrl);
  const listingLinks = links.filter((link) => {
    const blob = link.text + " " + link.href;
    if (!LISTING_TEXT.test(blob)) return false;
    return FILE_EXT.test(link.href) || LISTING_TEXT.test(link.text);
  });
  let suggestedCollapse = null;
  if (listingLinks.some((link) => /\.xlsx?(\?|#|$)/i.test(link.href))) suggestedCollapse = "xlsx";
  else if (listingLinks.some((link) => /\.pdf(\?|#|$)/i.test(link.href))) suggestedCollapse = "county-pdf";
  else if (/<table\b/i.test(html) && /amount due|map #/i.test(text)) suggestedCollapse = "html-table";
  return {
    blocked: Boolean(captcha || loginWall),
    blockReason: captcha ? "captcha" : loginWall ? "login" : null,
    listingLinks,
    mentionsNewspaper: NEWSPAPER.test(text),
    mentionsTaxSale: /tax sale|delinquent tax/i.test(text),
    suggestedCollapse,
  };
}

module.exports = {
  id: "page-watch",
  inspectHtml,
  extractHrefs,
};
