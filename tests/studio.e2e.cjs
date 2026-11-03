// Playwright is installed in a temporary directory by verify.yml and resolved
// through NODE_PATH. The application's package files do not need test tooling.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const base = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3000';
const out = process.env.CANVAS_QA_ARTIFACT_DIR || path.join(os.tmpdir(), 'endurance-canvas-qa');
const report = {
  status: 'running', passed: false, startedAt: new Date().toISOString(),
  frontendCommit: process.env.GITHUB_SHA || null,
  backendCommit: process.env.BACKEND_REF || null,
  baseUrl: base, checks: [], pageErrors: [], consoleErrors: [], artifacts: [],
  scope: 'Production frontend build and pinned guided-demo backend running locally in CI. No real model calls or hosted-deployment assertions.',
  visualReview: 'Screenshots and the exported PNG are evidence for human visual review; automated checks do not establish typography or scientific quality.'
};
let browser, context, page;

async function writeReport() {
  await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

async function check(name, operation) {
  const result = { name, status: 'running' };
  report.checks.push(result);
  await writeReport();
  const start = Date.now();
  try {
    await operation();
    result.status = 'passed';
    console.log(`PASS: ${name}`);
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    throw error;
  } finally {
    result.durationMs = Date.now() - start;
    await writeReport();
  }
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(out, name), fullPage: true, animations: 'disabled' });
}

async function range(value) {
  await page.getByRole('slider', { name: 'Explore the intensity' }).evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function saved() {
  await page.getByText('Saved on this device', { exact: true }).waitFor();
}

async function titleIs(value) {
  await page.waitForFunction(expected => document.querySelector('#lesson-title')?.textContent === expected, value);
}

async function generate(action) {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/generate' && response.request().method() === 'POST');
  await action();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'The real local generation proxy must succeed');
  const result = await response.json();
  assert.equal(result.mode, 'demo');
  return result;
}

async function download(kind, name) {
  await page.getByRole('button', { name: 'Export lesson', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: `Export ${kind}`, exact: false }).click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  const destination = path.join(out, name);
  await file.saveAs(destination);
  return destination;
}

async function snapshot() {
  return {
    title: await page.locator('#lesson-title').innerText(),
    text: await page.locator('.lesson-intro').innerText(),
    power: await page.getByRole('slider').inputValue(),
    revision: (await page.locator('.canvas-footer').innerText()).match(/Revision \d+/)?.[0]
  };
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  await writeReport();
  try {
    await check('Launch bundled Chromium and connect the guided-demo studio', async () => {
      const { chromium } = require('playwright');
      report.playwrightVersion = require('playwright/package.json').version;
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({ viewport: { width: 1440, height: 1120 }, acceptDownloads: true });
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(30000);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await saved();
      await page.getByText('Lesson service connected', { exact: true }).waitFor();
      await page.getByText('GUIDED DEMO', { exact: true }).waitFor();
      report.initialTitle = await page.locator('#lesson-title').innerText();
      await screenshot('studio-desktop.png');
    });

    await check('Exact LT1/LT2 boundaries, keyboard input, and temporary viewer state', async () => {
      for (const [value, expected, zone] of [[179, 'Below the first threshold', 1], [180, 'At LT1', 2], [240, 'At LT2', 2], [241, 'Above the second threshold', 3]]) {
        await range(value);
        await page.locator('.zone-result strong').filter({ hasText: expected }).waitFor();
        assert.equal(await page.getByRole('slider').inputValue(), String(value));
        assert.match(await page.getByRole('slider').getAttribute('aria-valuetext'), new RegExp(`Zone ${zone}`));
      }
      await page.getByRole('button', { name: 'Reset to 200 W', exact: true }).click();
      await page.getByRole('slider').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('slider').inputValue(), '201');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await saved();
      assert.equal(await page.getByRole('slider').inputValue(), '200', 'Exploration must not overwrite the authored default');
    });

    await check('Guided creation-style request and refinement through the real proxy', async () => {
      const first = await generate(() => page.getByRole('button', { name: 'Explain three training zones', exact: true }).click());
      assert.equal(first.status, 'ok');
      await page.getByRole('button', { name: 'Use this version', exact: true }).waitFor();
      assert.match(await page.locator('.conversation-scroll').innerText(), /Guided demo/);
      await page.getByRole('button', { name: 'Use this version', exact: true }).click();
      const refinement = await generate(() => page.getByRole('button', { name: 'Show an example above LT2', exact: true }).click());
      assert.equal(refinement.status, 'ok');
      await page.getByRole('button', { name: 'Use this version', exact: true }).waitFor();
      assert.ok(Number(await page.getByRole('slider').inputValue()) > 240);
      await screenshot('studio-suggestion.png');
      await page.getByRole('button', { name: 'Use this version', exact: true }).click();
    });

    await check('Unsupported requests preserve the authored lesson', async () => {
      const previous = await snapshot();
      await page.getByLabel('Describe your idea or ask for a change').fill('What is the weather in Brussels?');
      const response = await generate(() => page.getByRole('button', { name: 'Send message', exact: true }).click());
      assert.equal(response.status, 'unsupported');
      await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
      assert.deepEqual(await snapshot(), previous);
      assert.equal(await page.getByRole('button', { name: 'Use this version', exact: true }).count(), 0);
    });

    const editedTitle = 'Milan’s first zone explanation';
    await check('Immediate lesson switching preserves an edit, then reload restores it', async () => {
      await page.getByRole('tab', { name: 'Edit lesson', exact: true }).click();
      await page.getByLabel('Lesson title', { exact: true }).fill(editedTitle);
      await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
      await page.getByRole('button', { name: 'New lesson', exact: true }).click();
      await titleIs(report.initialTitle);
      await page.getByRole('button', { name: 'My lessons', exact: true }).click();
      await page.getByRole('button', { name: editedTitle, exact: true }).click();
      await titleIs(editedTitle);
      await saved();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await titleIs(editedTitle);
      await saved();
    });

    await check('Review is local to a revision; JSON round trip starts unreviewed', async () => {
      await page.getByRole('tab', { name: 'Sources', exact: true }).click();
      await page.getByRole('button', { name: 'Mark as reviewed', exact: true }).click();
      await page.getByText('Reviewed by you', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Preview', exact: true }).click();
      const file = await download('JSON', 'lesson-roundtrip.json');
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      assert.equal(record.content.title, editedTitle);
      assert.ok(record.evidenceSnapshot.sources.length > 0);
      assert.equal(record.reviewedRevision, undefined);
      await page.getByLabel('Import lesson JSON file', { exact: true }).setInputFiles(file);
      await page.getByText('Draft · review before sharing', { exact: true }).waitFor();
      await titleIs(editedTitle);
    });

    await check('Invalid JSON import keeps the current lesson intact', async () => {
      const previous = await snapshot();
      await page.getByLabel('Import lesson JSON file', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":true}') });
      await page.getByRole('alert').waitFor();
      assert.deepEqual(await snapshot(), previous);
      await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    });

    await check('Duplicate creates a separate draft and Undo restores its content', async () => {
      await page.getByRole('button', { name: 'Duplicate lesson', exact: true }).click();
      await titleIs(`${editedTitle} — copy`);
      await page.getByRole('tab', { name: 'Edit lesson', exact: true }).click();
      await page.getByLabel('Lesson title', { exact: true }).fill('Temporary renamed explanation');
      await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
      await titleIs('Temporary renamed explanation');
      await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
      await titleIs(`${editedTitle} — copy`);
    });

    await check('PNG export downloads a nonempty 1080 × 1350 image', async () => {
      const file = await download('PNG', 'lesson-export.png');
      const bytes = await fs.readFile(file);
      assert.ok(bytes.length > 20000);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16), 1080);
      assert.equal(bytes.readUInt32BE(20), 1350);
    });

    await check('360 px canvas and conversation stay usable without horizontal overflow', async () => {
      const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
      if (await dismiss.count()) await dismiss.click();
      await page.setViewportSize({ width: 360, height: 900 });
      await page.getByRole('slider', { name: 'Explore the intensity' }).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await screenshot('studio-mobile.png');
      await page.getByRole('tab', { name: 'Conversation', exact: true }).click();
      await page.getByLabel('Describe your idea or ask for a change').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await screenshot('conversation-mobile.png');
    });

    await check('No uncaught browser errors', async () => assert.deepEqual(report.pageErrors, []));
    report.status = 'passed';
    report.passed = true;
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack || error.message;
    process.exitCode = 1;
    console.error(error);
    if (page && !page.isClosed()) await screenshot('failure.png').catch(() => {});
  } finally {
    if (context) await context.tracing.stop({ path: path.join(out, 'browser-trace.zip') }).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    report.artifacts = (await fs.readdir(out)).filter(name => !name.endsWith('.pid')).sort();
    await writeReport();
    console.log(JSON.stringify({ status: report.status, completedChecks: report.checks.filter(item => item.status === 'passed').length, report: path.join(out, 'report.json') }));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
