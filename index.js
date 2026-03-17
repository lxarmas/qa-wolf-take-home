// EDIT THIS FILE TO COMPLETE ASSIGNMENT QUESTION 1
//
// WHAT THIS SCRIPT DOES:
// 1. Opens a headless (invisible) Chromium browser using Playwright
// 2. Navigates to Hacker News /newest page
// 3. Collects exactly 100 articles by paginating through multiple pages
// 4. Validates that articles are sorted from newest to oldest
// 5. Prints a detailed report to the terminal
// 6. Generates a report.html file and opens it automatically in the browser

const { chromium } = require("playwright");
const fs   = require("fs");   // built-in Node.js module for writing files
const path = require("path"); // built-in Node.js module for file paths
const { exec } = require("child_process"); // built-in — lets us run shell commands

// ─── Config ───────────────────────────────────────────────────────────────────
// All magic numbers and URLs live here so they're easy to find and update

const TARGET_URL             = "https://news.ycombinator.com/newest";
const REQUIRED_COUNT         = 100;  // exact number of articles we must validate
const ARTICLES_PER_PAGE      = 30;   // HN shows 30 per page, so we need 4 pages
const SORT_TOLERANCE_SECONDS = 60;   // allow up to 60s difference — HN timestamps
                                     // are rounded, "39 min" and "40 min" are equal
const REPORT_PATH = path.join(__dirname, "report.html"); // where to save the report

// ─── Helper: parseAgeToSeconds ────────────────────────────────────────────────
// HN doesn't give us real timestamps — it gives human-readable strings like
// "3 minutes ago" or "2 hours ago". We can't compare those mathematically,
// so this function converts them all into a single unit: seconds.
// Lower seconds = newer article. Higher seconds = older article.

function parseAgeToSeconds(ageText) {
  // Regex extracts the number and unit — e.g. "3 minutes ago" → ["3", "minutes"]
  const match = ageText.match(/(\d+)\s+(second|minute|hour|day|month|year)/i);

  // If the string doesn't match our pattern, return null instead of crashing
  if (!match) return null;

  const value = parseInt(match[1], 10);   // "3" → 3
  const unit  = match[2].toLowerCase();   // "Minutes" → "minutes"

  // How many seconds each unit is worth
  const multipliers = {
    second: 1,
    minute: 60,
    hour:   3600,
    day:    86400,
    month:  2592000,  // ~30 days
    year:   31536000,
  };

  // e.g. 3 minutes → 3 * 60 = 180 seconds
  // ?? 0 is a safety fallback if the unit somehow isn't in the table
  return value * (multipliers[unit] ?? 0);
}

// ─── Helper: printBanner ──────────────────────────────────────────────────────
// Purely cosmetic — draws a unicode box around a string in the terminal

function printBanner(text) {
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘\n`);
}

// ─── Helper: collectArticlesFromPage ─────────────────────────────────────────
// Jumps into the browser with page.evaluate() and reads the live HTML.
// Returns an array of { rank, title, ageText } — one object per article row.

async function collectArticlesFromPage(page) {
  return page.evaluate(() => {
    // HN marks every article row with the class "athing"
    const rows = document.querySelectorAll("tr.athing");

    // querySelectorAll returns a NodeList — convert to Array to use .map()
    return Array.from(rows).map((row) => {
      const rank  = parseInt(row.querySelector(".rank")?.textContent ?? "0");
      const title = row.querySelector(".titleline > a")?.textContent?.trim() ?? "(no title)";

      // The age lives in the NEXT sibling row, not this one (HN's HTML structure)
      const subRow  = row.nextElementSibling;
      const ageText = subRow?.querySelector(".age")?.textContent?.trim() ?? "";

      return { rank, title, ageText };
    });
  });
}

// ─── Helper: generateReport ───────────────────────────────────────────────────
// Takes the validated articles + violations and writes a self-contained
// report.html file. No external dependencies — pure HTML + CSS + JS inline.
// The file opens automatically in the browser after the script finishes.

function generateReport({ articles, violations, durationMs }) {
  const passed    = violations.length === 0;
  const runTime   = (durationMs / 1000).toFixed(2);
  const timestamp = new Date().toLocaleString();

  // Build one <tr> per article — highlight violations in red
  const rows = articles.map((a) => {
    const isViolation = violations.some((v) => v.curr.rank === a.rank);
    const rowClass    = isViolation ? 'style="background:#fff0f0;"' : "";
    const badge       = isViolation
      ? '<span style="background:#ffd0d0;color:#c00;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">violation</span>'
      : '<span style="background:#e6f4ea;color:#1a7f37;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">ok</span>';

    return `
      <tr ${rowClass}>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#555;">${a.rank}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${a.title}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#888;white-space:nowrap;">${a.ageText}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${badge}</td>
      </tr>`;
  }).join("");

  // Full HTML document — entirely self-contained, no external requests
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>HN Sort Validator — Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f6f6ef; min-height: 100vh; padding: 2rem; color: #222; }
    .card { background: #fff; border-radius: 10px; padding: 2rem;
            max-width: 960px; margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem;
              padding-bottom: 1.5rem; border-bottom: 1px solid #f0f0f0; }
    .header h1 { font-size: 20px; font-weight: 600; }
    .header p  { font-size: 13px; color: #888; margin-top: 3px; }
    .status-badge { padding: 6px 16px; border-radius: 20px; font-size: 13px;
                    font-weight: 600; white-space: nowrap; margin-left: auto; }
    .status-pass { background: #e6f4ea; color: #1a7f37; }
    .status-fail { background: #ffd0d0; color: #c00; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr);
               gap: 12px; margin-bottom: 1.5rem; }
    .metric { background: #f9f9f9; border-radius: 8px; padding: 1rem; }
    .metric-label { font-size: 11px; color: #999; text-transform: uppercase;
                    letter-spacing: 0.05em; margin-bottom: 6px; }
    .metric-value { font-size: 24px; font-weight: 600; }
    .metric-value.green { color: #1a7f37; }
    .metric-value.red   { color: #c00; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600;
               color: #999; text-transform: uppercase; letter-spacing: 0.05em;
               border-bottom: 2px solid #f0f0f0; }
    tbody tr:hover { background: #fafafa; }
    .footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f0f0f0;
              font-size: 12px; color: #bbb; text-align: center; }
  </style>
</head>
<body>
  <div class="card">

    <div class="header">
      <div>
        <h1>🐺 Hacker News sort validator</h1>
        <p>Run at ${timestamp} &nbsp;·&nbsp; <a href="${TARGET_URL}" style="color:#ff6600;">${TARGET_URL}</a></p>
      </div>
      <span class="status-badge ${passed ? "status-pass" : "status-fail"}">
        ${passed ? "✓ PASS" : "✗ FAIL"}
      </span>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Status</div>
        <div class="metric-value ${passed ? "green" : "red"}">${passed ? "PASS" : "FAIL"}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Articles checked</div>
        <div class="metric-value">${articles.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Violations</div>
        <div class="metric-value ${violations.length === 0 ? "green" : "red"}">${violations.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Duration</div>
        <div class="metric-value">${runTime}s</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:48px">#</th>
          <th>Title</th>
          <th>Age</th>
          <th style="width:90px">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      Generated by QA Wolf take-home validator &nbsp;·&nbsp; Playwright + Node.js
    </div>

  </div>
</body>
</html>`;

  // Write the file to disk
  fs.writeFileSync(REPORT_PATH, html, "utf8");
  console.log(`\n📄 Report saved → ${REPORT_PATH}`);
}

// ─── Helper: openReport ───────────────────────────────────────────────────────
// Opens report.html in the default browser using the OS's open command.
// Works on macOS (open), Linux (xdg-open), and Windows (start).

function openReport() {
  const commands = {
    darwin: `open "${REPORT_PATH}"`,
    linux:  `xdg-open "${REPORT_PATH}"`,
    win32:  `start "" "${REPORT_PATH}"`,
  };
  const cmd = commands[process.platform];
  if (cmd) {
    exec(cmd);
    console.log("🌐 Opening report in your browser...\n");
  }
}

// ─── Main Function ────────────────────────────────────────────────────────────
// Orchestrates everything: launches browser, collects articles, validates,
// generates the HTML report, and opens it automatically.

async function sortHackerNewsArticles() {
  printBanner("🐺 QA Wolf — Hacker News Sort Validator");

  const startTime = Date.now(); // track how long the whole thing takes

  // Launch Chromium in headless mode — invisible, nothing can close it accidentally
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  page.on("crash", () => { console.error("❌ Page crashed!"); });

  console.log(`📡 Navigating to ${TARGET_URL} ...\n`);
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // ── Step 1: Collect 100 articles across multiple pages ───────────────────
  const allArticles = [];

  while (allArticles.length < REQUIRED_COUNT) {
    await page.waitForSelector("tr.athing", { timeout: 10_000 });

    const batch = await collectArticlesFromPage(page);
    allArticles.push(...batch); // spread unpacks the array into individual items

    console.log(`  📄 Page loaded — collected ${batch.length} articles (total: ${allArticles.length})`);

    if (allArticles.length >= REQUIRED_COUNT) break;

    const moreLink = page.locator("a.morelink");
    const hasMore  = await moreLink.count() > 0;
    if (!hasMore) {
      console.warn("  ⚠️  No 'More' link found — stopping early.");
      break;
    }

    // Click More, wait for the new page to load, then loop again
    await moreLink.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("tr.athing", { timeout: 15_000 });
  }

  // Trim to exactly 100 — we may have grabbed up to 120 across 4 pages
  const articles = allArticles.slice(0, REQUIRED_COUNT);

  // ── Step 2: Validate count ───────────────────────────────────────────────
  console.log(`\n🔢 Articles collected: ${articles.length} (expected: ${REQUIRED_COUNT})`);

  if (articles.length !== REQUIRED_COUNT) {
    console.error(`❌ FAIL — Expected ${REQUIRED_COUNT} articles but got ${articles.length}.`);
    await browser.close();
    process.exit(1);
  }

  // ── Step 3: Add numeric age to each article for comparison ───────────────
  const articlesWithAge = articles.map((a) => ({
    ...a,
    ageSeconds: parseAgeToSeconds(a.ageText),
  }));

  // ── Step 4: Validate sort order ─────────────────────────────────────────
  console.log("\n🔍 Validating sort order (newest → oldest) ...\n");

  const violations = [];

  for (let i = 1; i < articlesWithAge.length; i++) {
    const prev = articlesWithAge[i - 1];
    const curr = articlesWithAge[i];

    if (prev.ageSeconds === null || curr.ageSeconds === null) continue;

    // A violation = current article is more than 60s newer than the one above it
    if (curr.ageSeconds < prev.ageSeconds - SORT_TOLERANCE_SECONDS) {
      violations.push({ index: i, prev, curr });
    }
  }

  // ── Step 5: Print terminal results ──────────────────────────────────────
  if (violations.length === 0) {
    console.log("✅ PASS — All 100 articles are sorted from newest to oldest.\n");
  } else {
    console.error(`❌ FAIL — Found ${violations.length} sort order violation(s):\n`);
    violations.forEach(({ prev, curr }) => {
      console.error(
        `  • Article #${curr.rank} ("${curr.title.slice(0, 50)}...")\n` +
        `    "${curr.ageText}" appears newer than #${prev.rank} above it ("${prev.ageText}")\n`
      );
    });
  }

  // ── Step 6: Generate + open HTML report ─────────────────────────────────
  const durationMs = Date.now() - startTime;
  generateReport({ articles: articlesWithAge, violations, durationMs });
  openReport();

  console.log(`🏁 Done in ${(durationMs / 1000).toFixed(2)}s. ${violations.length === 0 ? "All checks passed! 🎉" : "See report for details."}\n`);

  await browser.close();
  if (violations.length > 0) process.exit(1);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
// IIFE (Immediately Invoked Function Expression) — lets us use async/await
// at the top level. try/catch gives clean error messages on unexpected failures.

(async () => {
  try {
    await sortHackerNewsArticles();
  } catch (err) {
    console.error("\n❌ Unexpected error:", err.message);
    process.exit(1);
  }
})();
