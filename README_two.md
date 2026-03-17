# 🐺 QA Wolf Take-Home — HN Sort Validator

**by Alejandro Armas** · [github.com/lxarmas/qa-wolf-take-home](https://github.com/lxarmas/qa-wolf-take-home)

---

## What this does

Validates that the first 100 articles on [Hacker News /newest](https://news.ycombinator.com/newest) are sorted from newest to oldest — using Playwright to drive a real Chromium browser.

But more than that: it's built the way a real QA system should be built. Not just pass/fail — but **evidence, reporting, and resilience**.

---

## Why I built it this way

QA Wolf's mission is to help teams **ship faster with confidence**. A test that just prints "pass" or "fail" doesn't give you confidence — it gives you a boolean. Real confidence comes from:

- **Seeing the evidence** — every article, every age, every violation laid out clearly
- **Surviving real conditions** — flaky networks, slow pages, rounded timestamps
- **Running automatically** — not just when someone remembers to run it

That's what I tried to build here.

---

## Features

### ✅ Core validation
Collects exactly 100 articles across multiple pages and validates sort order. HN only shows 30 per page so the script paginates automatically by clicking "More".

### 📸 Screenshot on failure
If a sort violation is detected, the script captures a full-page screenshot (`violation-screenshot.png`) automatically. Real QA engineers always preserve evidence — a bug without a screenshot is just a story.

### 🔁 Automatic retry logic
Network hiccups happen. If a page fails to load, the script retries up to 3 times before giving up. This is what separates a script from a system.

### 📄 HTML report
After every run, a `report.html` file is generated and opened automatically in your browser. Every article is listed with its age and pass/fail status. Violations are highlighted in red.

### ⚙️ GitHub Actions CI
The validator runs automatically on every push and pull request via `.github/workflows/validate.yml`. It also runs on a daily schedule — so if HN ever breaks their sort order, we catch it without anyone having to manually trigger a run. The HTML report and screenshot are uploaded as workflow artifacts.

---

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Run the validator
node index.js
```

---

## How the sort validation works

HN doesn't expose timestamps — only human-readable strings like `"3 minutes ago"`. The script converts these to seconds using a lookup table, then walks through all 100 articles comparing each to the one before it.

A 60-second tolerance is applied because HN rounds its timestamps. Two articles posted almost simultaneously might show `"39 minutes ago"` and `"40 minutes ago"` — that's rounding, not a real sort violation.

---

## Project structure

```
├── index.js                          # main validator script
├── report.html                       # generated after each run
├── violation-screenshot.png          # generated only if violations found
├── .github/
│   └── workflows/
│       └── validate.yml              # GitHub Actions CI config
└── README.md
```

---

*Built with Playwright + Node.js · Runs on every push via GitHub Actions*
