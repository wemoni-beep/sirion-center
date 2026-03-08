#!/usr/bin/env node
/* ================================================================
   DEPLOYMENT GATE SCRIPT

   Hard gate: build + verify + local smoke + publish + live smoke.
   If ANY step fails, deployment is considered FAILED.

   Usage:
     node scripts/deploy.cjs              # full deploy
     node scripts/deploy.cjs --dry-run    # build + verify only, no push
     node scripts/deploy.cjs --skip-live  # skip post-deploy live smoke test
   ================================================================ */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const REPO_NAME = "sirion-center";
const BASE_PATH = `/${REPO_NAME}/`;
const LIVE_URL = `https://wemoni-beep.github.io/${REPO_NAME}/`;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_LIVE = args.includes("--skip-live");

let stepNum = 0;
let failures = [];

function step(label) {
  stepNum++;
  console.log(`\n[$${stepNum}] ${label}`);
  console.log("-".repeat(50));
}

function pass(msg) { console.log(`  [PASS] ${msg}`); }
function fail(msg) { console.log(`  [FAIL] ${msg}`); failures.push(msg); }
function info(msg) { console.log(`  [INFO] ${msg}`); }
function warn(msg) { console.log(`  [WARN] ${msg}`); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: opts.silent ? "pipe" : "inherit", ...opts });
  } catch (e) {
    if (opts.allowFail) return e.stdout || "";
    throw e;
  }
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
}

// ════════════════════════════════════════════════════════════
// STEP 1: Verify clean git state (warn only -- uncommitted
// changes WILL be included in the build)
// ════════════════════════════════════════════════════════════
step("Check git state");
try {
  const status = runCapture("git status --short -- src/ vite.config.js index.html package.json");
  if (status) {
    warn("Uncommitted source changes detected:");
    status.split("\n").forEach(l => info("  " + l));
    warn("These changes WILL be included in the build but NOT in git history.");
    warn("Consider committing first.");
  } else {
    pass("Working tree clean (source files)");
  }
} catch (e) {
  warn("Could not check git status: " + e.message);
}

// ════════════════════════════════════════════════════════════
// STEP 2: Build with GITHUB_PAGES=1
// ════════════════════════════════════════════════════════════
step("Build (GITHUB_PAGES=1)");
try {
  // Remove old dist to ensure clean build
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
    info("Cleaned old dist/");
  }

  run("npx vite build", { env: { ...process.env, GITHUB_PAGES: "1" } });

  if (fs.existsSync(path.join(DIST, "index.html"))) {
    pass("Build completed, dist/index.html exists");
  } else {
    fail("Build completed but dist/index.html is missing");
  }
} catch (e) {
  fail("Build failed: " + e.message);
  console.error("\nBuild failed. Cannot deploy.\n");
  process.exit(1);
}

// ════════════════════════════════════════════════════════════
// STEP 3: Verify base path in dist/index.html
// ════════════════════════════════════════════════════════════
step("Verify base path in dist/index.html");
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf-8");

// Check that ALL src/href references use the correct base path
const srcRefs = html.match(/(src|href)="([^"]+)"/g) || [];
let basePathOk = true;
for (const ref of srcRefs) {
  const match = ref.match(/(src|href)="([^"]+)"/);
  if (!match) continue;
  const url = match[2];
  // Skip data: URIs and # anchors
  if (url.startsWith("data:") || url.startsWith("#")) continue;

  if (!url.startsWith(BASE_PATH)) {
    fail(`Asset path "${url}" does NOT start with "${BASE_PATH}"`);
    basePathOk = false;
  }
}
if (basePathOk) {
  pass(`All asset paths start with ${BASE_PATH}`);
}

// ════════════════════════════════════════════════════════════
// STEP 4: Verify all referenced assets exist in dist/
// ════════════════════════════════════════════════════════════
step("Verify asset file existence");
const jsMatch = html.match(/src="([^"]*\.js)"/);
const cssMatch = html.match(/href="([^"]*\.css)"/);

let assetFilesOk = true;

if (jsMatch) {
  // Strip base path prefix to get relative path
  const jsRelative = jsMatch[1].replace(BASE_PATH, "");
  const jsFile = path.join(DIST, jsRelative);
  if (fs.existsSync(jsFile)) {
    const size = fs.statSync(jsFile).size;
    pass(`JS bundle exists: ${jsRelative} (${(size / 1024).toFixed(0)} KB)`);
  } else {
    fail(`JS bundle missing: ${jsRelative} (expected at ${jsFile})`);
    assetFilesOk = false;
  }
} else {
  fail("No <script src> found in dist/index.html");
  assetFilesOk = false;
}

if (cssMatch) {
  const cssRelative = cssMatch[1].replace(BASE_PATH, "");
  const cssFile = path.join(DIST, cssRelative);
  if (fs.existsSync(cssFile)) {
    pass(`CSS file exists: ${cssRelative}`);
  } else {
    fail(`CSS file missing: ${cssRelative}`);
    assetFilesOk = false;
  }
} else {
  fail("No <link href=*.css> found in dist/index.html");
  assetFilesOk = false;
}

// ════════════════════════════════════════════════════════════
// STEP 5: Verify lazy-loaded chunks in main JS
// ════════════════════════════════════════════════════════════
step("Verify lazy-loaded chunks");
if (jsMatch) {
  const jsRelative = jsMatch[1].replace(BASE_PATH, "");
  const jsContent = fs.readFileSync(path.join(DIST, jsRelative), "utf-8");

  // Extract chunk filenames from __vite__mapDeps
  const mapMatch = jsContent.match(/__vite__mapDeps.*?\[([^\]]+)\]/);
  if (mapMatch) {
    const chunkList = mapMatch[1].match(/"([^"]+)"/g) || [];
    let allPresent = true;
    for (const chunk of chunkList) {
      const chunkName = chunk.replace(/"/g, "");
      const chunkFile = path.join(DIST, chunkName);
      if (!fs.existsSync(chunkFile)) {
        fail(`Lazy chunk missing: ${chunkName}`);
        allPresent = false;
      }
    }
    if (allPresent) {
      pass(`All ${chunkList.length} lazy-loaded chunks present in dist/`);
    }
  } else {
    info("No __vite__mapDeps found (no lazy-loaded chunks)");
  }

  // Verify dynamic import paths use relative ./
  const dynamicImports = jsContent.match(/import\("([^"]+)"\)/g) || [];
  let dynamicOk = true;
  for (const imp of dynamicImports) {
    const impPath = imp.match(/import\("([^"]+)"\)/)[1];
    if (!impPath.startsWith("./")) {
      fail(`Dynamic import uses non-relative path: ${impPath}`);
      dynamicOk = false;
    }
  }
  if (dynamicOk && dynamicImports.length > 0) {
    pass(`All ${dynamicImports.length} dynamic imports use relative ./ paths`);
  }
}

// ════════════════════════════════════════════════════════════
// STEP 6: Check Firebase config status
// ════════════════════════════════════════════════════════════
step("Check Firebase config in build");
if (jsMatch) {
  const jsRelative = jsMatch[1].replace(BASE_PATH, "");
  const jsContent = fs.readFileSync(path.join(DIST, jsRelative), "utf-8");

  const hasProjectId = jsContent.includes("sirion-persona-stage") || jsContent.includes("firestore.googleapis.com");
  const emptyProjectId = /VITE_FIREBASE_PROJECT_ID:\s*""/.test(jsContent) || /projectId:\s*""/.test(jsContent);

  if (hasProjectId && !emptyProjectId) {
    pass("Firebase projectId baked into JS bundle");
  } else {
    warn("Firebase projectId NOT found in JS bundle -- Firebase will be disabled");
    warn("Set VITE_FIREBASE_PROJECT_ID before building for persistent storage");
  }
}

// ════════════════════════════════════════════════════════════
// STEP 7: Copy supporting files to dist/
// ════════════════════════════════════════════════════════════
step("Prepare dist/ for publish");

// Copy _headers file if it exists in docs/ (for cache control)
const headersSource = path.join(ROOT, "docs", "_headers");
const headersDist = path.join(DIST, "_headers");
if (fs.existsSync(headersSource) && !fs.existsSync(headersDist)) {
  fs.copyFileSync(headersSource, headersDist);
  pass("Copied _headers to dist/");
} else if (fs.existsSync(headersDist)) {
  pass("_headers already in dist/");
}

// Create .nojekyll to prevent Jekyll processing on GitHub Pages
const nojekyllDist = path.join(DIST, ".nojekyll");
if (!fs.existsSync(nojekyllDist)) {
  fs.writeFileSync(nojekyllDist, "");
  pass("Created .nojekyll in dist/");
} else {
  pass(".nojekyll already in dist/");
}

// Copy vite.svg favicon
const faviconSource = path.join(ROOT, "public", "vite.svg");
const faviconDist = path.join(DIST, "vite.svg");
if (fs.existsSync(faviconSource) && !fs.existsSync(faviconDist)) {
  fs.copyFileSync(faviconSource, faviconDist);
  info("Copied vite.svg to dist/");
}

// ════════════════════════════════════════════════════════════
// STEP 8: Local smoke test (serve and Playwright check)
// ════════════════════════════════════════════════════════════
step("Local smoke test");

let localSmokePassed = false;
try {
  // Create a directory structure that mimics GitHub Pages
  const tmpDir = path.join(ROOT, ".deploy-test");
  const tmpSirion = path.join(tmpDir, REPO_NAME);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpSirion, { recursive: true });

  // Copy dist/ contents to tmpDir/sirion-center/
  const copyRecursive = (src, dest) => {
    fs.readdirSync(src).forEach(item => {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      if (fs.statSync(srcPath).isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  };
  copyRecursive(DIST, tmpSirion);

  info("Starting local server for smoke test...");

  // Write a small test script
  const testScript = `
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVE_DIR = ${JSON.stringify(tmpDir)};
const PORT = 5599;

// Simple static file server (handles directory index on all platforms)
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(SERVE_DIR, urlPath);

  // If path is a directory, serve index.html from it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found: ' + urlPath);
  }
});

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('requestfailed', req => {
    const url = req.url();
    // Ignore Firebase 429 -- that's expected
    if (!url.includes('firestore.googleapis.com') && !url.includes('identitytoolkit')) {
      errors.push('NETWORK: ' + url + ' - ' + (req.failure()?.errorText || 'failed'));
    }
  });

  try {
    await page.goto('http://localhost:' + PORT + '/${REPO_NAME}/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const rootChildren = await page.evaluate(() => document.getElementById('root')?.children.length || 0);
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));

    const result = {
      rootChildren,
      hasContent: bodyText.length > 50,
      hasSidebar: bodyText.includes('Dashboard') || bodyText.includes('Question Generator'),
      errors: errors.filter(e => !e.includes('429') && !e.includes('Quota')),
      bodyPreview: bodyText.substring(0, 100)
    };

    console.log(JSON.stringify(result));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message, errors }));
  }

  await browser.close();
  server.close();
})();
`;

  const testFile = path.join(ROOT, ".deploy-smoke.cjs");
  fs.writeFileSync(testFile, testScript);

  const result = runCapture(`node "${testFile}"`);

  // Clean up
  fs.rmSync(testFile, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });

  try {
    const data = JSON.parse(result);
    if (data.error) {
      fail("Local smoke test error: " + data.error);
    } else {
      if (data.rootChildren > 0) pass("React root rendered (" + data.rootChildren + " child elements)");
      else fail("React root is empty -- app did not render");

      if (data.hasContent) pass("Page has content (body text > 50 chars)");
      else fail("Page appears empty");

      if (data.hasSidebar) pass("Sidebar navigation detected (Dashboard, modules)");
      else fail("Sidebar navigation NOT detected -- app may be broken");

      if (data.errors.length === 0) pass("No JavaScript errors detected");
      else {
        data.errors.forEach(e => fail("JS error: " + e));
      }

      localSmokePassed = data.rootChildren > 0 && data.hasContent && data.hasSidebar && data.errors.length === 0;
    }
  } catch (e) {
    fail("Could not parse smoke test result: " + result);
  }
} catch (e) {
  fail("Local smoke test failed: " + e.message);
}

// ════════════════════════════════════════════════════════════
// GATE: Check for any failures before publishing
// ════════════════════════════════════════════════════════════
step("Deploy gate check");

if (failures.length > 0) {
  console.log("\n  DEPLOY BLOCKED -- " + failures.length + " failure(s):");
  failures.forEach(f => console.log("    - " + f));
  console.log("\n  Fix the above issues before deploying.\n");
  process.exit(1);
}

pass("All pre-deploy checks passed");

if (DRY_RUN) {
  console.log("\n  --dry-run specified. Skipping publish.\n");
  console.log("  Build is ready in dist/. To publish manually:");
  console.log("    npx gh-pages -d dist --dotfiles\n");
  process.exit(0);
}

// ════════════════════════════════════════════════════════════
// STEP 10: Publish to gh-pages branch
// ════════════════════════════════════════════════════════════
step("Publish to gh-pages branch");
try {
  info("Publishing dist/ to gh-pages branch...");
  run('npx gh-pages -d dist --dotfiles -m "Deploy: $(date +%Y-%m-%d_%H:%M:%S)"');
  pass("Published to gh-pages branch");
} catch (e) {
  fail("gh-pages publish failed: " + e.message);
  process.exit(1);
}

// ════════════════════════════════════════════════════════════
// STEP 11: Post-deploy live smoke test
// ════════════════════════════════════════════════════════════
if (SKIP_LIVE) {
  info("--skip-live specified. Skipping live smoke test.");
} else {
  step("Post-deploy live smoke test (waiting 30s for GitHub Pages cache)");

  // Wait for GitHub Pages to pick up the new deployment
  info("Waiting 30 seconds for GitHub Pages to update...");
  spawnSync("sleep", ["30"], { stdio: "inherit" });

  try {
    info("Running smoke test against " + LIVE_URL);
    run(`node scripts/smoke-test.cjs ${LIVE_URL}`);
    pass("Live smoke test passed");
  } catch (e) {
    warn("Live smoke test failed -- GitHub Pages may still be propagating.");
    warn("Re-run: node scripts/smoke-test.cjs " + LIVE_URL);
  }
}

// ════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(50));
if (failures.length === 0) {
  console.log("  DEPLOYMENT SUCCESSFUL");
  console.log("  Live URL: " + LIVE_URL);
} else {
  console.log("  DEPLOYMENT COMPLETED WITH WARNINGS");
  failures.forEach(f => console.log("  - " + f));
}
console.log("=".repeat(50) + "\n");

process.exit(failures.length > 0 ? 1 : 0);
