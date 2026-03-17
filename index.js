// EDIT THIS FILE TO COMPLETE ASSIGNMENT QUESTION 1
//
// WHAT THIS SCRIPT DOES:
// 1. Opens a headless Chromium browser using Playwright
// 2. Navigates to Hacker News /newest with automatic retry on failure
// 3. Collects exactly 100 articles by paginating through multiple pages
// 4. Validates articles are sorted from newest to oldest
// 5. Takes a screenshot if violations are found (evidence capture)
// 6. Prints a detailed terminal report
// 7. Generates a report.html and opens it automatically in the browser

const { chromium } = require("playwright");
const fs            = require("fs");
const path          = require("path");
const { exec }      = require("child_process");

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_URL             = "https://news.ycombinator.com/newest";
const REQUIRED_COUNT         = 100;
const SORT_TOLERANCE_SECONDS = 60;  // HN rounds timestamps — 60s wiggle room
const MAX_RETRIES            = 3;   // auto-retry up to 3 times on network failure
const REPORT_PATH            = path.join(__dirname, "report.html");
const SCREENSHOT_PATH        = path.join(__dirname, "violation-screenshot.png");

// ─── Helper: parseAgeToSeconds ────────────────────────────────────────────────
// HN shows relative times like "3 minutes ago" — not real timestamps.
// Converts them to seconds so we can compare articles mathematically.
// Lower seconds = newer. Higher seconds = older.

function parseAgeToSeconds(ageText) {
  const match = ageText.match(/(\d+)\s+(second|minute|hour|day|month|year)/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit  = match[2].toLowerCase();

  const multipliers = {
    second: 1,
    minute: 60,
    hour:   3600,
    day:    86400,
    month:  2592000,
    year:   31536000,
  };

  return value * (multipliers[unit] ?? 0);
}

// ─── Helper: printBanner ──────────────────────────────────────────────────────
// Draws a unicode box around a string in the terminal — purely cosmetic

function printBanner(text) {
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘\n`);
}

// ─── Helper: collectArticlesFromPage ─────────────────────────────────────────
// Jumps into the browser with page.evaluate() and reads the live HTML.
// Returns an array of { rank, title, ageText } — one object per article.

async function collectArticlesFromPage(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("tr.athing");
    return Array.from(rows).map((row) => {
      const rank  = parseInt(row.querySelector(".rank")?.textContent ?? "0");
      const title = row.querySelector(".titleline > a")?.textContent?.trim() ?? "(no title)";
      const subRow  = row.nextElementSibling;
      const ageText = subRow?.querySelector(".age")?.textContent?.trim() ?? "";
      return { rank, title, ageText };
    });
  });
}

// ─── Helper: withRetry ────────────────────────────────────────────────────────
// Wraps any async function with automatic retry logic.
// If it fails, waits 2 seconds and tries again up to MAX_RETRIES times.
// Real QA systems must handle flaky networks — this is how.

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`  ⚠️  ${label} failed (attempt ${attempt}/${MAX_RETRIES}) — retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ─── Helper: generateReport ───────────────────────────────────────────────────
// Builds a self-contained HTML report file showing all 100 articles.
// Violations are highlighted in red. No external dependencies.

function generateReport({ articles, violations, durationMs }) {
  const passed    = violations.length === 0;
  const runTime   = (durationMs / 1000).toFixed(2);
  const timestamp = new Date().toLocaleString();

  const rows = articles.map((a) => {
    const isViolation = violations.some((v) => v.curr.rank === a.rank);
    const rowStyle    = isViolation ? 'style="background:#fff0f0;"' : "";
    const badge       = isViolation
      ? '<span style="background:#ffd0d0;color:#c00;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">violation</span>'
      : '<span style="background:#e6f4ea;color:#1a7f37;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">ok</span>';

    return `
      <tr ${rowStyle}>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#555;">${a.rank}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#888;white-space:nowrap;">${a.ageText}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${badge}</td>
      </tr>`;
  }).join("");

  const screenshotNote = !passed && fs.existsSync(SCREENSHOT_PATH)
    ? `<div style="margin-bottom:1.5rem;padding:1rem;background:#fff8e1;border-radius:8px;font-size:13px;color:#888;">
        📸 A screenshot of the violation was saved to <code>violation-screenshot.png</code>
       </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
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
    .pass { background: #e6f4ea; color: #1a7f37; }
    .fail { background: #ffd0d0; color: #c00; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr);
               gap: 12px; margin-bottom: 1.5rem; }
    .metric { background: #f9f9f9; border-radius: 8px; padding: 1rem; }
    .metric-label { font-size: 11px; color: #999; text-transform: uppercase;
                    letter-spacing: 0.05em; margin-bottom: 6px; }
    .metric-value { font-size: 24px; font-weight: 600; }
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
      <span class="status-badge ${passed ? "pass" : "fail"}">${passed ? "✓ PASS" : "✗ FAIL"}</span>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Status</div>
        <div class="metric-value ${passed ? "pass" : "fail"}" style="color:${passed ? "#1a7f37" : "#c00"}">${passed ? "PASS" : "FAIL"}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Articles checked</div>
        <div class="metric-value">${articles.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Violations</div>
        <div class="metric-value" style="color:${violations.length === 0 ? "#1a7f37" : "#c00"}">${violations.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Duration</div>
        <div class="metric-value">${runTime}s</div>
      </div>
    </div>

    ${screenshotNote}

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

  fs.writeFileSync(REPORT_PATH, html, "utf8");
  console.log(`\n📄 Report saved → ${REPORT_PATH}`);
}

// ─── Helper: openReport ───────────────────────────────────────────────────────
// Opens report.html in the default browser.
// Detects the OS and runs the right shell command.

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

async function sortHackerNewsArticles() {
  printBanner("🐺 QA Wolf — Hacker News Sort Validator");

  const startTime = Date.now();

  // Launch headless Chromium — invisible, nothing can close it accidentally
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  page.on("crash", () => console.error("❌ Page crashed!"));

  // Navigate with retry — handles flaky networks gracefully
  console.log(`📡 Navigating to ${TARGET_URL} ...\n`);
  await withRetry(
    () => page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 }),
    "Navigation"
  );

  // ── Step 1: Collect 100 articles across multiple pages ───────────────────
  const allArticles = [];

  while (allArticles.length < REQUIRED_COUNT) {
    await withRetry(
      () => page.waitForSelector("tr.athing", { timeout: 10_000 }),
      "Waiting for articles"
    );

    const batch = await collectArticlesFromPage(page);
    allArticles.push(...batch);

    console.log(`  📄 Page loaded — collected ${batch.length} articles (total: ${allArticles.length})`);

    if (allArticles.length >= REQUIRED_COUNT) break;

    const moreLink = page.locator("a.morelink");
    const hasMore  = await moreLink.count() > 0;
    if (!hasMore) {
      console.warn("  ⚠️  No 'More' link found — stopping early.");
      break;
    }

    await moreLink.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("tr.athing", { timeout: 15_000 });
  }

  // Trim to exactly 100
  const articles = allArticles.slice(0, REQUIRED_COUNT);

  // ── Step 2: Validate count ───────────────────────────────────────────────
  console.log(`\n🔢 Articles collected: ${articles.length} (expected: ${REQUIRED_COUNT})`);
  if (articles.length !== REQUIRED_COUNT) {
    console.error(`❌ FAIL — Expected ${REQUIRED_COUNT} articles but got ${articles.length}.`);
    await browser.close();
    process.exit(1);
  }

  // ── Step 3: Add numeric age for comparison ───────────────────────────────
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

    // Flag only if current is more than SORT_TOLERANCE_SECONDS newer than previous
    if (curr.ageSeconds < prev.ageSeconds - SORT_TOLERANCE_SECONDS) {
      violations.push({ index: i, prev, curr });
    }
  }

  // ── Step 5: Screenshot on violation — capture evidence ───────────────────
  // A real QA engineer always saves evidence when something fails
  if (violations.length > 0) {
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`📸 Violation screenshot saved → ${SCREENSHOT_PATH}\n`);
  }

  // ── Step 6: Print terminal results ──────────────────────────────────────
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

  // ── Step 7: Generate + open HTML report ─────────────────────────────────
  const durationMs = Date.now() - startTime;
  generateReport({ articles: articlesWithAge, violations, durationMs });
  openReport();

  console.log(`🏁 Done in ${(durationMs / 1000).toFixed(2)}s. ${violations.length === 0 ? "All checks passed! 🎉" : "See report for details."}\n`);

  await browser.close();
  if (violations.length > 0) process.exit(1);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
// IIFE lets us use async/await at the top level.
// try/catch gives clean error messages on unexpected failures.

(async () => {
  try {
    await sortHackerNewsArticles();
  } catch (err) {
    console.error("\n❌ Unexpected error:", err.message);
    process.exit(1);
  }
})();
