// Playwright is installed in a temporary directory by verify.yml and resolved
// through NODE_PATH. The application's package files do not need test tooling.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const base = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3000';
const out = process.env.CANVAS_QA_ARTIFACT_DIR || path.join(os.tmpdir(), 'endurance-canvas-qa');
const report = {
  status: 'running', passed: false, startedAt: new Date().toISOString(),
  frontendCommit: process.env.GITHUB_SHA || null,
  backendCommit: process.env.BACKEND_REF || null,
  baseUrl: base, checks: [], pageErrors: [], consoleErrors: [], artifacts: [],
  scope: 'Production frontend build, pinned backend, and isolated MongoDB replica set in CI. Real owner setup, password/session checks, and durable quotas. Live AI responses are explicitly labelled test fixtures; no real model calls or hosted-deployment assertions.',
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
  // The status is deliberately hidden on phones, but its saved state still
  // proves the asynchronous IndexedDB write completed.
  await page.locator('.save-indicator.saved').waitFor({ state: 'attached' });
}

async function titleIs(value) {
  await page.waitForFunction(expected => document.querySelector('#lesson-title')?.textContent === expected, value);
}

async function generate(action, mode = 'demo') {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/generate' && response.request().method() === 'POST');
  await action();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'The real local generation proxy must succeed');
  const result = await response.json();
  assert.equal(result.mode, mode);
  Object.defineProperty(result, 'requestBody', { value: response.request().postDataJSON() });
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
      await page.locator('.toast[role="alert"]').filter({ hasText: 'This is not a supported Endurance Canvas lesson file.' }).waitFor();
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

    const creatorEmail = 'creator@example.invalid';
    let creatorPassword = `Canvas-test-${crypto.randomBytes(18).toString('hex')}`;
    const authHeaders = { Origin: base, 'Content-Type': 'application/json' };
    await check('Opening creator access immediately after an edit flushes the local draft', async () => {
      const title = 'Saved before opening creator access';
      await page.getByRole('tab', { name: 'Edit lesson', exact: true }).click();
      await page.getByLabel('Lesson title', { exact: true }).fill(title);
      await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
      await page.getByRole('link', { name: 'Creator access', exact: true }).click();
      await page.getByRole('heading', { name: 'Creator access.', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Back to studio', exact: true }).click();
      await titleIs(title);
      await saved();
    });

    await check('Guests cannot register publicly or request live generation', async () => {
      const signup = await context.request.post(`${base}/api/auth/sign-up/email`, {
        headers: authHeaders, data: { email: creatorEmail, name: 'Test creator', password: creatorPassword },
      });
      assert.equal(signup.status(), 404);
      const live = await context.request.post(`${base}/api/generate`, {
        headers: authHeaders, data: { mode: 'create', generationMode: 'live', prompt: 'Explain three training zones', requestId: 'unauthenticated-test' },
      });
      assert.equal(live.status(), 401);
      assert.equal((await live.json()).error.code, 'OWNER_REQUIRED');
    });

    await check('One-time owner setup clears its token from the URL and creates a sign-in account', async () => {
      assert.ok(process.env.CANVAS_TEST_SETUP_TOKEN, 'The CI fixture requires a temporary setup token');
      await page.goto(`${base}/creator#setup=${process.env.CANVAS_TEST_SETUP_TOKEN}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Make it your studio.', exact: true }).waitFor();
      assert.equal(new URL(page.url()).hash, '', 'Setup credentials must leave the address bar');
      await page.getByLabel('Name', { exact: true }).fill('Test creator');
      await page.getByLabel('Email', { exact: true }).fill(creatorEmail);
      await page.getByLabel('Password', { exact: true }).fill(creatorPassword);
      await page.getByRole('button', { name: 'Create creator account', exact: true }).click();
      await page.getByText('Your creator account is ready. Sign in to continue.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      const closed = await context.request.get(`${base}/api/creator`);
      const state = await closed.json();
      assert.equal(state.auth.setupAvailable, false);
      assert.equal(state.auth.signedIn, false);
      assert.equal(state.auth.user, undefined, 'Public status must not reveal the owner email');
    });

    await check('Creator signs in with an HttpOnly session that survives reload', async () => {
      await page.getByLabel('Email', { exact: true }).fill(creatorEmail);
      await page.getByLabel('Password', { exact: true }).fill(creatorPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
      const cookies = await context.cookies(base);
      const session = cookies.find(cookie => cookie.name.includes('endurance-canvas') && cookie.name.includes('session_token'));
      assert.ok(session, 'Sign-in must set the backend session cookie on the frontend origin');
      assert.equal(session.httpOnly, true);
      assert.equal(session.sameSite, 'Lax');
      // The CI fixture is HTTP localhost; production Secure-cookie behavior is
      // asserted independently in the backend integration suite.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
      await screenshot('creator-signed-in.png');
      await page.getByRole('link', { name: 'Continue to studio', exact: true }).click();
      await saved();
      await page.getByRole('button', { name: 'Live AI', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Guided demo', exact: true }).getAttribute('aria-pressed'), 'true');
    });

    let firstLiveRequest;
    await check('Live AI is explicit, labelled, and offers a candidate without changing the saved lesson', async () => {
      const previous = await snapshot();
      await page.getByRole('button', { name: 'Live AI', exact: true }).click();
      await page.getByText('LIVE AI', { exact: true }).waitFor();
      await page.getByLabel('Describe your idea or ask for a change').fill('Use a short story about two gates to introduce this illustration.');
      const result = await generate(() => page.getByRole('button', { name: 'Send message', exact: true }).click(), 'live');
      assert.equal(result.status, 'ok');
      assert.match(result.message, /test fixture/i);
      firstLiveRequest = result.requestBody;
      await page.getByText('CANVAS · AI GENERATED', { exact: true }).waitFor();
      await page.getByText('AI-generated suggestion', { exact: true }).waitFor();
      await page.getByText('2 of 3 attempts left today · 9 of 10 attempts left this month', { exact: true }).waitFor();
      await screenshot('studio-live-fixture.png');
      await page.getByRole('button', { name: 'Keep current', exact: true }).click();
      assert.deepEqual(await snapshot(), previous);
    });

    await check('Duplicate IDs, foreign origins, and exhausted quota cannot make extra AI attempts', async () => {
      const duplicate = await context.request.post(`${base}/api/generate`, { headers: authHeaders, data: firstLiveRequest });
      assert.equal(duplicate.status(), 409);
      assert.equal((await duplicate.json()).error.code, 'DUPLICATE_REQUEST');
      const foreign = await context.request.post(`${base}/api/generate`, {
        headers: { ...authHeaders, Origin: 'https://untrusted.example' },
        data: { ...firstLiveRequest, requestId: 'foreign-origin-attempt' },
      });
      assert.equal(foreign.status(), 403);
      for (let number = 2; number <= 3; number += 1) {
        await page.getByLabel('Describe your idea or ask for a change').fill(`Make the explanation clearer, revision ${number}.`);
        const result = await generate(() => page.getByRole('button', { name: 'Send message', exact: true }).click(), 'live');
        assert.equal(result.status, 'ok');
        await page.getByRole('button', { name: 'Keep current', exact: true }).click();
      }
      await page.getByText('0 of 3 attempts left today · 7 of 10 attempts left this month', { exact: true }).waitFor();
      const previous = await snapshot();
      const exhausted = await context.request.post(`${base}/api/generate`, {
        headers: authHeaders, data: { ...firstLiveRequest, requestId: 'over-quota-attempt' },
      });
      assert.equal(exhausted.status(), 429);
      assert.equal((await exhausted.json()).error.code, 'QUOTA_EXCEEDED');
      const status = await (await context.request.get(`${base}/api/creator`)).json();
      assert.equal(status.ai.limits.daily.used, 3);
      assert.equal(status.ai.limits.monthly.used, 3);
      assert.deepEqual(await snapshot(), previous);
      await page.getByRole('button', { name: 'Guided demo', exact: true }).click();
      const demo = await generate(() => page.getByRole('button', { name: 'Explain three training zones', exact: true }).click());
      assert.equal(demo.status, 'ok', 'An exhausted AI allowance must not disable the guided demo');
      await page.getByRole('button', { name: 'Keep current', exact: true }).click();
    });

    await check('Password change and sign-out work through the same-origin auth proxy', async () => {
      await page.goto(`${base}/creator`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
      const nextPassword = `Canvas-new-${crypto.randomBytes(18).toString('hex')}`;
      await page.getByLabel('Current password', { exact: true }).fill(creatorPassword);
      await page.getByLabel('New password', { exact: true }).fill(nextPassword);
      await page.getByRole('button', { name: 'Update password', exact: true }).click();
      await page.getByText(/password.*updated|password.*changed/i).waitFor();
      creatorPassword = nextPassword;
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      const state = await (await context.request.get(`${base}/api/creator`)).json();
      assert.equal(state.auth.signedIn, false);
      const live = await context.request.post(`${base}/api/generate`, {
        headers: authHeaders, data: { ...firstLiveRequest, requestId: 'signed-out-attempt' },
      });
      assert.equal(live.status(), 401, 'A revoked session must not reach generation or quotas');
      await page.getByLabel('Email', { exact: true }).fill(creatorEmail);
      await page.getByLabel('Password', { exact: true }).fill(creatorPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      await page.setViewportSize({ width: 360, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await screenshot('creator-mobile.png');
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await saved();
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
