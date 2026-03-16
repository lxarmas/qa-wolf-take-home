// EDIT THIS FILE TO COMPLETE ASSIGNMENT QUESTION 1
//
// WHAT THIS SCRIPT DOES:
// 1. Opens a headless (invisible) Chromium browser using Playwright
// 2. Navigates to Hacker News /newest page
// 3. Collects exactly 100 articles by paginating through multiple pages
// 4. Validates that articles are sorted from newest to oldest
// 5. Prints a detailed report of the results to the terminal

const { chromium } = require("playwright");

// ─── Config ───────────────────────────────────────────────────────────────────
// All magic numbers and URLs live here so they're easy to find and update

const TARGET_URL = "https://news.ycombinator.com/newest";
const REQUIRED_COUNT = 100;        // exact number of articles we must validate
const ARTICLES_PER_PAGE = 30;      // HN shows 30 articles per page, so we need 4 pages
const SORT_TOLERANCE_SECONDS = 60; // allow up to 60s difference — HN timestamps are
                                   // rounded, so "39 min" and "40 min" are effectively equal

// ─── Helper: parseAgeToSeconds ────────────────────────────────────────────────
// HN doesn't give us real timestamps — it gives human-readable strings like
// "3 minutes ago" or "2 hours ago". We can't compare those mathematically,
// so this function converts them all to a number of seconds.
// Lower seconds = newer article. Higher seconds = older article.

function parseAgeToSeconds(ageText) {
  // Use a regex to extract the number and the unit from the age string
  // e.g. "3 minutes ago" → match[1] = "3", match[2] = "minutes"
  const match = ageText.match(/(\d+)\s+(second|minute|hour|day|month|year)/i);

  // If the string doesn't match our pattern, return null instead of crashing
  if (!match) return null;

  // Convert the captured number from string "3" to integer 3
  const value = parseInt(match[1], 10);

  // Normalize the unit to lowercase so it matches our lookup table keys
  const unit = match[2].toLowerCase();

  // Lookup table: how many seconds is each unit worth?
  const multipliers = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    month: 2592000,  // ~30 days
    year: 31536000,
  };

  // Multiply value x unit seconds to get total seconds
  // ?? 0 is a safety fallback in case the unit isn't in our table
  return value * (multipliers[unit] ?? 0);
}

// ─── Helper: printBanner ──────────────────────────────────────────────────────
// Purely cosmetic — prints a nice box around a title in the terminal
// Makes the output easier to read at a glance

function printBanner(text) {
  // Make the top/bottom line wide enough to fit the text plus padding
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘\n`);
}

// ─── Helper: collectArticlesFromPage ─────────────────────────────────────────
// Reads the current browser page's HTML and extracts article data.
// Uses page.evaluate() to run code INSIDE the browser where document exists.
// Returns an array of { rank, title, ageText } — one object per article.

async function collectArticlesFromPage(page) {
  return page.evaluate(() => {
    // Find all article rows — HN marks each article row with class "athing"
    const rows = document.querySelectorAll("tr.athing");

    // Convert NodeList to a real Array so we can use .map()
    return Array.from(rows).map((row) => {

      // Grab the article rank number (1, 2, 3...) from the .rank element
      const rank = parseInt(row.querySelector(".rank")?.textContent ?? "0");

      // Grab the article title from the first <a> inside .titleline
      const title = row.querySelector(".titleline > a")?.textContent?.trim() ?? "(no title)";

      // The age is NOT in this row — it's in the very next row (HN's HTML structure)
      // nextElementSibling gives us the row immediately below the current one
      const subRow = row.nextElementSibling;

      // Grab the age text from the .age span inside the metadata row
      const ageText = subRow?.querySelector(".age")?.textContent?.trim() ?? "";

      // Return a clean object for this article
      return { rank, title, ageText };
    });
  });
}

// ─── Main Function ────────────────────────────────────────────────────────────
// Orchestrates everything: launches browser, collects articles, validates order,
// prints results, and closes the browser cleanly.

async function sortHackerNewsArticles() {
  printBanner("🐺 QA Wolf — Hacker News Sort Validator");

  // Launch Chromium in headless mode (invisible browser — no window opens)
  // Headless is standard for automated testing so nothing can interrupt it
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // If the page crashes for any reason, log it clearly
  page.on("crash", () => { console.error("❌ Page crashed!"); });

  // Navigate to HN newest page and wait for the HTML to fully load
  console.log(`📡 Navigating to ${TARGET_URL} ...\n`);
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // ── Step 1: Collect 100 articles by paginating ───────────────────────────
  // HN shows 30 articles per page, so we need to click "More" multiple times
  // until we have at least 100, then trim to exactly 100

  const allArticles = [];

  while (allArticles.length < REQUIRED_COUNT) {
    // Wait for articles to appear on the page before trying to read them
    await page.waitForSelector("tr.athing", { timeout: 10_000 });

    // Extract all articles from the current page
    const batch = await collectArticlesFromPage(page);
    allArticles.push(...batch);

    console.log(`  📄 Page loaded — collected ${batch.length} articles (total so far: ${allArticles.length})`);

    // Stop paginating once we have enough
    if (allArticles.length >= REQUIRED_COUNT) break;

    // Find the "More" link at the bottom of the page
    const moreLink = page.locator("a.morelink");
    const hasMore = await moreLink.count() > 0;

    // If there's no More link, we've run out of pages — stop early
    if (!hasMore) {
      console.warn("  ⚠️  No 'More' link found — stopping early.");
      break;
    }

    // Click More and wait for the next page to fully load
    await moreLink.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("tr.athing", { timeout: 15_000 });
  }

  // Trim the array to exactly 100 articles (we may have collected up to 120)
  const articles = allArticles.slice(0, REQUIRED_COUNT);

  // ── Step 2: Validate we got exactly 100 ─────────────────────────────────
  console.log(`\n🔢 Articles collected: ${articles.length} (expected: ${REQUIRED_COUNT})`);

  if (articles.length !== REQUIRED_COUNT) {
    console.error(`❌ FAIL — Expected exactly ${REQUIRED_COUNT} articles but got ${articles.length}.`);
    await browser.close();
    process.exit(1);
  }

  // ── Step 3: Convert age strings to seconds for comparison ───────────────
  // Add an ageSeconds field to each article so we can compare them numerically
  const articlesWithAge = articles.map((a) => ({
    ...a,                                      // keep all existing fields
    ageSeconds: parseAgeToSeconds(a.ageText),  // add the numeric age
  }));

  // ── Step 4: Validate sort order ─────────────────────────────────────────
  // Walk through articles one by one and compare each to the one before it.
  // A correctly sorted list should have ages that increase (get older) as we go down.
  console.log("\n🔍 Validating sort order (newest → oldest) ...\n");

  const violations = [];

  for (let i = 1; i < articlesWithAge.length; i++) {
    const prev = articlesWithAge[i - 1];
    const curr = articlesWithAge[i];

    // Skip this pair if either age couldn't be parsed
    if (prev.ageSeconds === null || curr.ageSeconds === null) continue;

    // HN timestamps are rounded (e.g. "39 min" vs "40 min" can be the same moment)
    // so we allow up to SORT_TOLERANCE_SECONDS difference before calling it a violation
    if (curr.ageSeconds < prev.ageSeconds - SORT_TOLERANCE_SECONDS) {
      violations.push({ index: i, prev, curr });
    }
  }

  // ── Step 5: Print results ────────────────────────────────────────────────

  if (violations.length === 0) {
    console.log("✅ PASS — All 100 articles are sorted from newest to oldest.\n");
  } else {
    console.error(`❌ FAIL — Found ${violations.length} sort order violation(s):\n`);
    violations.forEach(({ index, prev, curr }) => {
      console.error(
        `  • Article #${curr.rank} ("${curr.title.slice(0, 50)}...")\n` +
        `    Age: "${curr.ageText}" is NEWER than article #${prev.rank} above it ("${prev.ageText}")\n`
      );
    });
  }

  // Print a sample table of the first 10 articles so you can visually sanity-check
  console.log("─".repeat(72));
  console.log("📋 First 10 articles (sample):\n");
  console.log("  Rank  Age Text                    Title");
  console.log("  ────  ─────────────────────────   " + "─".repeat(35));
  articlesWithAge.slice(0, 10).forEach(({ rank, ageText, title }) => {
    const r = String(rank).padEnd(4);
    const a = ageText.padEnd(28);
    const t = title.slice(0, 35);
    console.log(`  ${r}  ${a} ${t}`);
  });
  console.log("─".repeat(72));

  console.log(`\n🏁 Validation complete. ${violations.length === 0 ? "All checks passed! 🎉" : "See violations above."}\n`);

  // Always close the browser cleanly at the end
  await browser.close();

  // Exit with code 1 if there were violations — signals failure to CI systems
  if (violations.length > 0) process.exit(1);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
// This is where the script starts. The IIFE (Immediately Invoked Function
// Expression) lets us use async/await at the top level.
// The try/catch ensures any unexpected crash prints a clean error message.

(async () => {
  try {
    await sortHackerNewsArticles();
  } catch (err) {
    console.error("\n❌ Unexpected error:", err.message);
    process.exit(1);
  }
})();
