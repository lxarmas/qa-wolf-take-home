// EDIT THIS FILE TO COMPLETE ASSIGNMENT QUESTION 1
const { chromium } = require("playwright");

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL = "https://news.ycombinator.com/newest";
const REQUIRED_COUNT = 100;
const ARTICLES_PER_PAGE = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a HN age string like "2 minutes ago" → a sortable numeric score.
 *  Higher = newer. We convert everything to seconds. */
function parseAgeToSeconds(ageText) {
  const match = ageText.match(/(\d+)\s+(second|minute|hour|day|month|year)/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    month: 2592000,  // ~30 days
    year: 31536000,
  };

  return value * (multipliers[unit] ?? 0);
}

/** Pretty console banner */
function printBanner(text) {
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘\n`);
}

/** Collect articles from the current page, returns array of { rank, title, ageText, ageSeconds } */
async function collectArticlesFromPage(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("tr.athing");
    return Array.from(rows).map((row) => {
      const rank = parseInt(row.querySelector(".rank")?.textContent ?? "0");
      const title = row.querySelector(".titleline > a")?.textContent?.trim() ?? "(no title)";

      // age is in the NEXT sibling row, inside .age
      const subRow = row.nextElementSibling;
      const ageText = subRow?.querySelector(".age")?.textContent?.trim() ?? "";

      return { rank, title, ageText };
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function sortHackerNewsArticles() {
  printBanner("🐺 QA Wolf — Hacker News Sort Validator");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Ensure browser cleanup even if something goes wrong
  page.on("crash", () => { console.error("❌ Page crashed!"); });

  console.log(`📡 Navigating to ${TARGET_URL} …\n`);
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // ── Collect 100 articles across multiple pages ───────────────────────────
  const allArticles = [];

  while (allArticles.length < REQUIRED_COUNT) {
    await page.waitForSelector("tr.athing", { timeout: 10_000 });

    const batch = await collectArticlesFromPage(page);
    allArticles.push(...batch);

    console.log(`  📄 Page loaded — collected ${batch.length} articles (total so far: ${allArticles.length})`);

    if (allArticles.length >= REQUIRED_COUNT) break;

    // Click "More" to go to the next page
    const moreLink = page.locator("a.morelink");
    const hasMore = await moreLink.count() > 0;
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

  // ── Validate count ───────────────────────────────────────────────────────
  console.log(`\n🔢 Articles collected: ${articles.length} (expected: ${REQUIRED_COUNT})`);
  if (articles.length !== REQUIRED_COUNT) {
    console.error(`❌ FAIL — Expected exactly ${REQUIRED_COUNT} articles but got ${articles.length}.`);
    await browser.close();
    process.exit(1);
  }

  // ── Parse ages ───────────────────────────────────────────────────────────
  const articlesWithAge = articles.map((a) => ({
    ...a,
    ageSeconds: parseAgeToSeconds(a.ageText),
  }));

  // ── Validate sort order ──────────────────────────────────────────────────
  console.log("\n🔍 Validating sort order (newest → oldest) …\n");

  const violations = [];

  for (let i = 1; i < articlesWithAge.length; i++) {
    const prev = articlesWithAge[i - 1];
    const curr = articlesWithAge[i];

    // Skip comparison if age couldn't be parsed
    if (prev.ageSeconds === null || curr.ageSeconds === null) continue;

    if (curr.ageSeconds < prev.ageSeconds) {
      violations.push({ index: i, prev, curr });
    }
  }

  // ── Results ──────────────────────────────────────────────────────────────
  if (violations.length === 0) {
    console.log("✅ PASS — All 100 articles are sorted from newest to oldest.\n");
  } else {
    console.error(`❌ FAIL — Found ${violations.length} sort order violation(s):\n`);
    violations.forEach(({ index, prev, curr }) => {
      console.error(
        `  • Article #${curr.rank} ("${curr.title.slice(0, 50)}…")\n` +
        `    Age: "${curr.ageText}" is NEWER than article #${prev.rank} above it ("${prev.ageText}")\n`
      );
    });
  }

  // ── Summary table (first 10 articles) ───────────────────────────────────
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

  await browser.close();
  if (violations.length > 0) process.exit(1);
}

(async () => {
  try {
    await sortHackerNewsArticles();
  } catch (err) {
    console.error("\n❌ Unexpected error:", err.message);
    process.exit(1);
  }
})();
