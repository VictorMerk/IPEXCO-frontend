import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

if (Number(process.versions.node.split('.')[0]) < 22 || !globalThis.WebSocket) {
  throw new Error('The navigation smoke test requires Node.js 22 or newer.');
}
if (spawnSync('google-chrome', ['--version']).status !== 0) {
  throw new Error('The navigation smoke test requires google-chrome on PATH.');
}

const token = requiredEnv('IPEXCO_UI_TOKEN');
const projectId = requiredEnv('IPEXCO_PROJECT_ID');
const baseUrl = (process.env.IPEXCO_UI_URL ?? 'http://127.0.0.1:4200').replace(/\/+$/, '');
const baseOrigin = new URL(baseUrl).origin;
const planPilotUrl = (process.env.PLANPILOT_URL ?? 'http://127.0.0.1:5000').replace(/\/+$/, '');
const port = Number(process.env.IPEXCO_CHROME_DEBUG_PORT ?? 12000 + process.pid % 30000);
await assertPortAvailable(port);

const profile = mkdtempSync(join(tmpdir(), 'ipexco-navigation-smoke-'));
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--disable-breakpad',
  '--disable-crash-reporter',
  '--no-default-browser-check',
  '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });
let cdp;

try {
  const target = await waitForTarget(port);
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__navigationSmokeRequest = { method: String(method).toUpperCase(), url: String(url) };
        this.addEventListener('load', () => {
          if (this.__navigationSmokeRequest?.method !== 'POST'
            || !/\\/api\\/planpilot\\/sessions\\/?$/.test(this.__navigationSmokeRequest.url)) return;
          try { window.__navigationSmokeRunId = JSON.parse(this.responseText).runId ?? null; } catch {}
        }, { once: true });
        return originalOpen.call(this, method, url, ...rest);
      };
    })();`,
  });

  await cdp.call('Page.navigate', { url: baseUrl });
  await waitForExpression(
    cdp,
    `location.origin === ${JSON.stringify(baseOrigin)} && document.readyState === 'complete'`,
    30_000,
  );
  await evaluate(cdp, `localStorage.setItem('jwt-token', ${JSON.stringify(token)})`);
  await cdp.call('Page.navigate', {
    url: `${baseUrl}/planpilot/${encodeURIComponent(projectId)}`,
  });
  await waitForExpression(
    cdp,
    `document.querySelector('app-page-title')?.textContent?.includes('PlanPilot')
      && Boolean(document.querySelector('.start-form input[type="number"]'))`,
    30_000,
  );

  await evaluate(cdp, `(() => {
    const input = document.querySelector('.start-form input[type="number"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.start-form button[type="submit"]').click();
  })()`);

  const firstPage = await waitForExpression(cdp, `(() => {
    if (document.querySelector('.status--error') || document.querySelector('.recalculating')) return null;
    const summary = document.querySelector('.solutions__summary')?.textContent?.replace(/\\s+/g, ' ').trim();
    const remaining = document.querySelector('.remaining-plans')?.textContent?.replace(/\\s+/g, ' ').trim();
    const groups = [...document.querySelectorAll('.facet-group')].map((group) => ({
      title: group.querySelector('.facet-group__title')?.childNodes[0]?.textContent?.trim(),
      count: Number(group.querySelector('.facet-group__count')?.textContent),
    }));
    return summary?.includes('Showing 25 of 60 plans') && groups.length === 2
      ? { summary, remaining, groups }
      : null;
  })()`, 180_000);

  await evaluate(cdp, `([...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Show more plans'))).click()`);
  const secondPage = await waitForExpression(
    cdp,
    `document.querySelector('.solutions__summary')?.textContent?.replace(/\\s+/g, ' ').trim()
      === 'Showing 50 of 60 plans'`,
    90_000,
  );

  await evaluate(cdp, `([...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Show more plans'))).click()`);
  const finalPage = await waitForExpression(
    cdp,
    `document.querySelector('.solutions__summary')?.textContent?.replace(/\\s+/g, ' ').trim()
      === 'Showing 60 of 60 plans'
      && ![...document.querySelectorAll('button')]
        .some((button) => button.textContent?.includes('Show more plans'))`,
    90_000,
  );

  await evaluate(cdp, `(() => {
    const group = [...document.querySelectorAll('.facet-group')]
      .find((item) => item.querySelector('.facet-group__title')?.textContent?.includes('State'));
    group.querySelector('mat-expansion-panel-header').click();
  })()`);
  await waitForExpression(
    cdp,
    `[...document.querySelectorAll('.facet-group')].some((group) =>
      group.querySelector('.facet-group__title')?.textContent?.includes('State')
      && group.querySelector('.facet'))`,
    10_000,
  );
  const stagedLabel = await evaluate(cdp, `(() => {
    const group = [...document.querySelectorAll('.facet-group')]
      .find((item) => item.querySelector('.facet-group__title')?.textContent?.includes('State'));
    const facet = group.querySelector('.facet');
    const label = facet.querySelector('.facet__label').textContent.trim();
    [...facet.querySelectorAll('mat-button-toggle')]
      .find((toggle) => toggle.textContent?.includes('Enforce'))
      .querySelector('button').click();
    return label;
  })()`);
  await waitForExpression(
    cdp,
    `document.querySelector('.submit-bar__info')?.textContent?.includes('1 pending change')`,
    10_000,
  );
  await evaluate(cdp, `document.querySelector('.submit-bar__submit').click()`);
  const committed = await waitForExpression(cdp, `(() => {
    if (document.querySelector('.status--error') || document.querySelector('.recalculating')) return null;
    const info = document.querySelector('.submit-bar__info')?.textContent?.replace(/\\s+/g, ' ').trim();
    const decision = document.querySelector('.facet--decision');
    return info === 'No pending changes' && decision
      ? {
          label: decision.querySelector('.facet__label')?.textContent?.trim(),
          state: decision.querySelector('.facet__badge')?.textContent?.trim(),
        }
      : null;
  })()`, 90_000);

  await evaluate(cdp, `document.querySelector('app-breadcrumb a')?.click()`);
  await waitForExpression(
    cdp,
    `location.pathname.startsWith(${JSON.stringify(`/project/${projectId}`)})`,
    10_000,
  );
  await waitForActiveSessionCount(0, 10_000);

  console.log(JSON.stringify({
    status: 'passed',
    path: `/planpilot/${projectId}`,
    firstPage,
    secondPage,
    finalPage,
    stagedLabel,
    committed,
    stoppedOnLeave: true,
  }, null, 2));
} finally {
  if (cdp) {
    try {
      const runId = await evaluate(cdp, 'window.__navigationSmokeRunId ?? null');
      if (runId) {
        await fetch(`${baseUrl}/api/planpilot/sessions/${encodeURIComponent(runId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    cdp.close();
  }
  if (chrome.exitCode === null) {
    const exited = once(chrome, 'exit');
    chrome.kill('SIGTERM');
    await Promise.race([exited, delay(2000)]);
  }
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function assertPortAvailable(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
    });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

async function waitForTarget(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready.');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitForExpression(cdp, expression, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await delay(250);
  }
  const diagnostics = await evaluate(cdp, `({
    path: location.pathname,
    title: document.title,
    text: document.body?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 500) ?? '',
  })`);
  throw new Error(
    `Timed out waiting for browser expression: ${expression}\nBrowser state: ${JSON.stringify(diagnostics)}`,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForActiveSessionCount(expected, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${planPilotUrl}/api/health`);
      const body = await response.json();
      if (body.capacity?.activeSessions === expected) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`PlanPilot did not reach ${expected} active sessions.`);
}
