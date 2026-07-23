import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  compareFacetContract,
  validateConstraintSnapshot,
} from "./lib/diagnostic-contract.mjs";
import {
  backendSolutionSteps,
  diagnosticSolutionSteps,
  parseStripsTask,
  validateStripsPlan,
} from "./lib/strips-validator.mjs";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22 || typeof WebSocket === "undefined") {
  throw new Error(
    "The UI smoke test requires Node.js 22 or newer with global WebSocket support.",
  );
}
const chromeVersion = spawnSync("google-chrome", ["--version"], {
  encoding: "utf8",
});
if (chromeVersion.error || chromeVersion.status !== 0) {
  throw new Error("The UI smoke test requires google-chrome on PATH.");
}

const token = requiredEnv("IPEXCO_UI_TOKEN");
const demoTask = parseStripsTask(
  readFileSync(
    new URL(
      "../example_data/planpilot-demo/domain-planpilot-towers.pddl",
      import.meta.url,
    ),
    "utf8",
  ),
  readFileSync(
    new URL(
      "../example_data/planpilot-demo/problem-planpilot-towers-4.pddl",
      import.meta.url,
    ),
    "utf8",
  ),
);

const baseUrl = (process.env.IPEXCO_UI_URL ?? "http://127.0.0.1:4200").replace(
  /\/+$/,
  "",
);
const parsedBaseUrl = new URL(baseUrl);
if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
  throw new Error("IPEXCO_UI_URL must use http or https.");
}
const baseOrigin = parsedBaseUrl.origin;
const projectId = requiredEnv("IPEXCO_PROJECT_ID");
const expectedFacets = Number(requiredEnv("IPEXCO_EXPECTED_FACETS"));
const expectedActions = Number(requiredEnv("IPEXCO_EXPECTED_ACTIONS"));
const expectedAlternatives = process.env.IPEXCO_EXPECTED_ALTERNATIVES
  ? Number(process.env.IPEXCO_EXPECTED_ALTERNATIVES)
  : undefined;
const requestedSessionHorizon = process.env.IPEXCO_SESSION_HORIZON
  ? Number(process.env.IPEXCO_SESSION_HORIZON)
  : undefined;
const requestedSessionEncoding = process.env.IPEXCO_SESSION_ENCODING;
const requestedAbstractTimeSteps = parseOptionalBoolean(
  "IPEXCO_SESSION_ABSTRACT_TIME_STEPS",
);
if (!Number.isSafeInteger(expectedFacets) || expectedFacets < 0) {
  throw new Error("IPEXCO_EXPECTED_FACETS must be a non-negative integer.");
}
if (!Number.isSafeInteger(expectedActions) || expectedActions < 1) {
  throw new Error("IPEXCO_EXPECTED_ACTIONS must be a positive integer.");
}
if (
  expectedAlternatives !== undefined &&
  (!Number.isSafeInteger(expectedAlternatives) || expectedAlternatives < 0)
) {
  throw new Error(
    "IPEXCO_EXPECTED_ALTERNATIVES must be a non-negative integer.",
  );
}
if (
  requestedSessionHorizon !== undefined &&
  (!Number.isSafeInteger(requestedSessionHorizon) ||
    requestedSessionHorizon < 1 ||
    requestedSessionHorizon > 100)
) {
  throw new Error("IPEXCO_SESSION_HORIZON must be an integer from 1 to 100.");
}
if (
  requestedSessionEncoding !== undefined &&
  !["bounded", "exact"].includes(requestedSessionEncoding)
) {
  throw new Error("IPEXCO_SESSION_ENCODING must be bounded or exact.");
}
const applyFirstFacet = process.env.IPEXCO_APPLY_FIRST_FACET === "true";
const excludeFirstFacet = process.env.IPEXCO_EXCLUDE_FIRST_FACET === "true";
if (applyFirstFacet && excludeFirstFacet) {
  throw new Error(
    "Choose either IPEXCO_APPLY_FIRST_FACET or IPEXCO_EXCLUDE_FIRST_FACET.",
  );
}
const firstFacetSelection = applyFirstFacet
  ? "include"
  : excludeFirstFacet
    ? "exclude"
    : undefined;
const exerciseSelections = process.env.IPEXCO_EXERCISE_SELECTIONS === "true";
const exerciseAnalysis = process.env.IPEXCO_EXERCISE_ANALYSIS === "true";
const findGappedSolution = process.env.IPEXCO_FIND_GAPPED_SOLUTION === "true";
const requestPlanCount = process.env.IPEXCO_REQUEST_PLAN_COUNT !== "false";
const preparePlanCount = process.env.IPEXCO_PREPARE_PLAN_COUNT
  ? Number(process.env.IPEXCO_PREPARE_PLAN_COUNT)
  : undefined;
if (
  preparePlanCount !== undefined &&
  (!Number.isSafeInteger(preparePlanCount) || preparePlanCount < 1)
) {
  throw new Error("IPEXCO_PREPARE_PLAN_COUNT must be a positive integer.");
}
const prepareAllPlans = process.env.IPEXCO_PREPARE_ALL === "true";
const allowPlanCountFailure =
  process.env.IPEXCO_ALLOW_PLAN_COUNT_FAILURE === "true";
const expandGraph = process.env.IPEXCO_EXPAND_GRAPH === "true";
const exportDiagnostic = process.env.IPEXCO_EXPORT_DIAGNOSTIC === "true";
const diagnosticPath = process.env.IPEXCO_DIAGNOSTIC_PATH;
const screenshotPath = process.env.IPEXCO_SCREENSHOT_PATH;
const projectScreenshotPath = process.env.IPEXCO_PROJECT_SCREENSHOT_PATH;
const landingScreenshotPath =
  process.env.IPEXCO_PLANPILOT_START_SCREENSHOT_PATH;
const sidebarScreenshotDirectory = process.env.IPEXCO_SIDEBAR_SCREENSHOT_DIR;
const constraintSnapshotDirectory = process.env.IPEXCO_CONSTRAINT_SNAPSHOT_DIR;
if (sidebarScreenshotDirectory) {
  mkdirSync(sidebarScreenshotDirectory, { recursive: true });
}
if (constraintSnapshotDirectory) {
  mkdirSync(constraintSnapshotDirectory, { recursive: true });
}
const viewportWidth = Number(process.env.IPEXCO_VIEWPORT_WIDTH ?? 1600);
const viewportHeight = Number(process.env.IPEXCO_VIEWPORT_HEIGHT ?? 1000);
if (
  !Number.isSafeInteger(viewportWidth) ||
  viewportWidth < 320 ||
  !Number.isSafeInteger(viewportHeight) ||
  viewportHeight < 480
) {
  throw new Error(
    "IPEXCO_VIEWPORT_WIDTH and IPEXCO_VIEWPORT_HEIGHT must describe a usable viewport.",
  );
}
const debuggingPort = Number(
  process.env.IPEXCO_CHROME_DEBUG_PORT ??
    String(10_000 + (process.pid % 40_000)),
);
if (
  !Number.isSafeInteger(debuggingPort) ||
  debuggingPort < 1024 ||
  debuggingPort > 65_535
) {
  throw new Error(
    "IPEXCO_CHROME_DEBUG_PORT must be an integer from 1024 to 65535.",
  );
}
await assertPortAvailable(debuggingPort);
const profileDirectory = mkdtempSync(join(tmpdir(), "ipexco-ui-smoke-"));
const downloadDirectory = join(profileDirectory, "downloads");
mkdirSync(downloadDirectory);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let cdp;

try {
  const target = await waitForTarget(debuggingPort);
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__planPilotSmokeRequest = { method: String(method).toUpperCase(), url: String(url) };
        this.addEventListener('load', () => {
          const request = this.__planPilotSmokeRequest;
          if (request?.method !== 'POST' || !/\/api\/planpilot\/sessions\/?$/.test(request.url)) return;
          try {
            const body = JSON.parse(this.responseText);
            window.__planPilotSmokeRunId = body.runId ?? body.data?.runId ?? null;
          } catch {}
        }, { once: true });
        return originalOpen.call(this, method, url, ...rest);
      };
    })();`,
  });
  await cdp.call("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDirectory,
  });
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.call("Page.navigate", { url: baseUrl });
  await waitForExpression(
    cdp,
    `location.origin === ${JSON.stringify(baseOrigin)} && document.readyState === "complete"`,
    30_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `localStorage.setItem('jwt-token', ${JSON.stringify(token)})`,
  });

  const entryNavigation = await openPlanPilotFromProject(
    cdp,
    baseUrl,
    projectId,
    projectScreenshotPath,
    landingScreenshotPath,
  );
  let result = await waitForPlanPilot(cdp, 180_000);

  if (!result.title?.startsWith("Plan timeline and alternatives")) {
    throw new Error(`unexpected page title: ${JSON.stringify(result.title)}`);
  }
  if (result.error) {
    throw new Error(`PlanPilot UI reported an error: ${result.error}`);
  }
  if (
    requestedSessionHorizon !== undefined ||
    requestedSessionEncoding !== undefined ||
    requestedAbstractTimeSteps !== undefined
  ) {
    await rebuildSessionWithConfiguration(
      cdp,
      {
        horizon: requestedSessionHorizon,
        encoding: requestedSessionEncoding,
        abstractTimeSteps: requestedAbstractTimeSteps,
      },
      expectedFacets,
    );
    result = await waitForPlanPilot(cdp, 180_000);
    if (result.error) {
      throw new Error(
        `PlanPilot UI reported an error after rebuilding: ${result.error}`,
      );
    }
  }
  assertEqual(result.facetCount, expectedFacets, "facet count");
  if (result.renderedFacetCount > result.facetCount) {
    throw new Error(
      `rendered facet count exceeds matching total: ${result.renderedFacetCount} > ${result.facetCount}`,
    );
  }
  assertEqual(
    result.actionRowCount,
    result.renderedFacetCount,
    "rendered action row count",
  );
  if (expectedFacets === 46) {
    assertEqual(
      result.renderedFacetCount,
      40,
      "initial bounded rendered facet limit",
    );
  }
  if (requestedSessionEncoding === "bounded") {
    if (result.actionCount < expectedActions) {
      throw new Error(
        `representative action count: expected at least ${expectedActions}, received ${result.actionCount}`,
      );
    }
  } else {
    assertEqual(
      result.actionCount,
      expectedActions,
      "representative action count",
    );
  }
  if (expectedAlternatives !== undefined) {
    assertEqual(
      result.alternativeCount,
      expectedAlternatives,
      "alternative count",
    );
  }
  if (requestedAbstractTimeSteps === true) {
    result.abstractTime = await assertAbstractTimeUi(cdp);
  }
  result.entryNavigation = entryNavigation;
  if (result.canvasCount < 1) {
    throw new Error("PlanPilot graph canvas was not rendered.");
  }
  result.initialSolutionCountKnown = result.solutionCountKnown === true;
  if (preparePlanCount !== undefined && !result.initialSolutionCountKnown) {
    result.planPreparation = await preparePlansInUi(cdp, preparePlanCount);
    result.directOpenWithoutCount = await openPlanWithoutCountInUi(
      cdp,
      Math.min(preparePlanCount, 7),
    );
  }
  if (requestPlanCount && !result.initialSolutionCountKnown) {
    result.planCount = await countPlansInUi(cdp);
    if (result.planCount.error && !allowPlanCountFailure) {
      throw new Error(`Plan count failed: ${result.planCount.error}`);
    }
    if (Number.isFinite(result.planCount.value)) {
      result.solutionCount = result.planCount.value;
      result.solutionCountKnown = true;
    }
  }
  if (prepareAllPlans && result.solutionCountKnown) {
    result.prepareAll = await prepareAllPlansInUi(cdp, result.solutionCount);
  }
  result.interfaceCopy = await assertInterfaceCopy(cdp);
  result.sidebarNavigation = await assertSidebarNavigation(cdp);
  if (requestedSessionEncoding === "exact") {
    result.fixedActionUi = await assertFixedActionUi(cdp);
  } else {
    result.belowFoldSelection = await assertBelowFoldActionSelection(cdp);
  }

  if (expandGraph) {
    result.expandedGraph = await showAllGraphFacets(cdp, expectedFacets);
  }

  if (exerciseAnalysis) {
    result.analysisTools = await exerciseAnalysisTools(
      cdp,
      result.solutionCount,
    );
    if (result.solutionCount > 20) {
      result.extendedPlanBrowsing = await exerciseExtendedPlanBrowsing(
        cdp,
        result.solutionCount,
      );
    }
  }

  if (firstFacetSelection) {
    result.selection = await selectFirstAlternative(cdp, firstFacetSelection);
    if (result.selection.error) {
      throw new Error(`facet selection failed: ${result.selection.error}`);
    }
    assertEqual(
      result.selection[
        firstFacetSelection === "include" ? "included" : "excluded"
      ],
      1,
      `${firstFacetSelection}d facet count`,
    );
    if (
      result.selection.graphLimit &&
      !result.selection.graphLimit.startsWith("All ")
    ) {
      throw new Error(
        `graph incorrectly reports hidden facets: ${result.selection.graphLimit}`,
      );
    }
  }

  if (exerciseSelections) {
    result.selectionExercise = await exerciseSelectionControls(cdp);
  }

  if (findGappedSolution) {
    const currentPlanCount = await countPlansInUi(cdp);
    if (currentPlanCount.error) {
      throw new Error(
        `Plan count before gap inspection failed: ${currentPlanCount.error}`,
      );
    }
    result.solutionCount = currentPlanCount.value;
    result.gappedSolution = await showFirstGappedSolution(
      cdp,
      result.solutionCount,
    );
  }

  if (screenshotPath) {
    await capturePageScreenshot(cdp, screenshotPath);
  }

  if (exportDiagnostic) {
    result.diagnostic = await downloadAndAnalyzeDiagnostic(
      cdp,
      downloadDirectory,
      diagnosticPath,
    );
  }

  console.log(JSON.stringify(result));
} finally {
  if (cdp) {
    let stoppedInUi = false;
    try {
      const stopped = await cdp.call("Runtime.evaluate", {
        expression: `(() => {
          const button = [...document.querySelectorAll('.session-actions button')]
            .find((candidate) => candidate.textContent?.trim().endsWith('Stop'));
          if (!button || button.disabled) return false;
          button.click();
          return true;
        })()`,
        returnByValue: true,
      });
      if (stopped.result.value) {
        await waitForExpression(
          cdp,
          `document.querySelector('.inspector-status')?.textContent?.trim() === 'Stopped'`,
          10_000,
        );
        stoppedInUi = true;
      }
    } catch {}
    if (!stoppedInUi) {
      try {
        const observed = await cdp.call("Runtime.evaluate", {
          expression: `window.__planPilotSmokeRunId ?? null`,
          returnByValue: true,
        });
        const runId = observed.result.value;
        if (typeof runId === "string" && runId) {
          const response = await fetch(
            `${baseUrl}/api/planpilot/sessions/${encodeURIComponent(runId)}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (response.status !== 200 && response.status !== 404) {
            throw new Error(
              `fallback session cleanup returned HTTP ${response.status}`,
            );
          }
        }
      } catch {}
    }
    try {
      const leftPlanPilot = await cdp.call("Runtime.evaluate", {
        expression: `(() => {
          const link = document.querySelector('[aria-label="Back to PlanPilot"]');
          link?.click();
          return Boolean(link);
        })()`,
        returnByValue: true,
      });
      if (leftPlanPilot.result.value) {
        await waitForExpression(
          cdp,
          `location.pathname === ${JSON.stringify(`/planpilot/${projectId}`)}`,
          10_000,
        );
      } else {
        await cdp.call("Page.navigate", { url: baseUrl });
      }
      await delay(2_000);
    } catch {
      // Chrome may already be shutting down after an earlier smoke-test error.
    }
    cdp.close();
  }
  if (chrome.exitCode === null) {
    const exited = once(chrome, "exit");
    chrome.kill("SIGTERM");
    await Promise.race([exited, delay(2_000)]);
  }
  if (chrome.exitCode === null) {
    const killed = once(chrome, "exit");
    chrome.kill("SIGKILL");
    await Promise.race([killed, delay(2_000)]);
  }
  await delay(500);
  try {
    rmSync(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  } catch (error) {
    console.warn(
      `Could not remove temporary Chrome profile ${profileDirectory}: ${error.message}`,
    );
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseOptionalBoolean(name) {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be true or false.`);
  }
  return value === "true";
}

async function assertPortAvailable(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
    });
  } catch {
    throw new Error(`Chrome debugging port ${port} is already in use.`);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

async function waitForTarget(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) {
        return page;
      }
    } catch {
      // Chrome may need a moment before exposing its debugging endpoint.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready.");
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("close", () => {
    for (const { reject } of pending.values()) {
      reject(new Error("Chrome DevTools connection closed."));
    }
    pending.clear();
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  return {
    call(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function waitForExpression(cdp, expression, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const response = await cdp.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (response.result.value) {
      return response.result.value;
    }
    await delay(250);
  }
  const diagnostics = await cdp.call("Runtime.evaluate", {
    expression: `({
      path: location.pathname,
      title: document.title,
      text: document.body?.textContent?.trim().replace(/\\s+/g, " ").slice(0, 500) ?? "",
    })`,
    returnByValue: true,
  });
  throw new Error(
    `Timed out waiting for browser expression: ${expression}\nBrowser state: ${JSON.stringify(diagnostics.result.value)}`,
  );
}

async function waitForPlanPilot(cdp, timeout) {
  const expression = `(() => {
    const inspector = document.querySelector('.facet-inspector');
    const count = document.querySelector('[data-testid="planpilot-action-result-count"]');
    const busy = document.querySelector('.workbench-progress');
    if (!inspector || !count || busy) return null;
    const error = document.querySelector('.error-state, .error-message');
    const overviewItems = [...document.querySelectorAll('.session-overview > span')];
    const overview = overviewItems
      .map((item) => Number(item.querySelector('strong')?.textContent?.trim()));
    const planCountLabel = overviewItems[0]?.querySelector('small')?.textContent?.trim();
    return {
      title: document.querySelector('app-page-title')?.childNodes[0]?.textContent?.trim() ?? null,
      facetCount: Number(count.dataset.matchingCount),
      renderedFacetCount: Number(count.dataset.renderedCount),
      actionRowCount: document.querySelectorAll('.facet-result').length,
      actionCount: document.querySelectorAll('.plan-explorer .solution-action-list li').length,
      canvasCount: document.querySelectorAll('app-planpilot-graph canvas').length,
      solutionCount: overview[0],
      solutionCountKnown: planCountLabel === 'Plans',
      alternativeCount: overview[1],
      includedCount: overview[2],
      excludedCount: overview[3],
      error: error?.textContent?.trim().replace(/\\s+/g, ' ') ?? null,
    };
  })()`;
  return waitForExpression(cdp, expression, timeout);
}

async function countPlansInUi(cdp) {
  await showSidebarTab(cdp, "Plan");
  const started = await waitForExpression(
    cdp,
    `(() => {
      const planSummary = document.querySelector('.session-overview > span');
      const countLabel = planSummary?.querySelector('small')?.textContent?.trim();
      const countText = planSummary?.querySelector('strong')?.textContent?.trim() ?? '';
      if (countLabel === 'Plans' && /^\\d+$/.test(countText)) {
        return { known: Number(countText), clicked: false };
      }
      const button = [...document.querySelectorAll('[data-testid="planpilot-plan-calculation"] .count-row button')]
        .find((candidate) => candidate.textContent?.includes('Count all'));
      if (!button || button.disabled || document.querySelector('.workbench-progress')) return null;
      button.click();
      return { known: null, clicked: true };
    })()`,
    180_000,
  );
  if (Number.isFinite(started.known)) {
    return { value: started.known, error: null };
  }
  if (!started.clicked) {
    throw new Error(
      "The Plan tab did not expose its explicit plan-count action.",
    );
  }
  const result = await waitForExpression(
    cdp,
    `(() => {
      const planSummary = document.querySelector('.session-overview > span');
      const countLabel = planSummary?.querySelector('small')?.textContent?.trim();
      const countText = planSummary?.querySelector('strong')?.textContent?.trim() ?? '';
      if (countLabel === 'Plans' && /^\\d+$/.test(countText)) {
        return { value: Number(countText), error: null };
      }
      const error = document.querySelector('[data-testid="planpilot-plan-calculation"] .analysis-error')?.textContent?.trim().replace(/\\s+/g, ' ');
      return error ? { value: null, error } : null;
    })()`,
    70_000,
  );
  return result;
}

async function preparePlansInUi(cdp, count) {
  await showSidebarTab(cdp, "Plan");
  const submitted = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#planpilot-prepare-count');
      const form = input?.closest('form');
      if (!input || !form || input.disabled) return false;
      input.value = ${count};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!submitted.result.value) {
    throw new Error("The Plan tab did not allow plan preparation.");
  }
  const result = await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return null;
      const message = document.querySelector('.inline-message:not(.error-message) span')?.textContent?.trim() ?? '';
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim() ?? '';
      const summary = document.querySelector('.session-overview > span strong')?.textContent?.trim() ?? '';
      return message.includes('Plans 1–${count} are ready')
        ? { message, heading, summary }
        : null;
    })()`,
    180_000,
  );
  return result;
}

async function openPlanWithoutCountInUi(cdp, solutionNumber) {
  await showSidebarTab(cdp, "Plans");
  await waitForExpression(
    cdp,
    `(() => {
      const input = document.querySelector('#planpilot-plan-number');
      return Boolean(input && !input.disabled && !document.querySelector('.workbench-progress'));
    })()`,
    180_000,
  );
  const submitted = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#planpilot-plan-number');
      const form = input?.closest('form');
      if (!input || !form || input.disabled) return false;
      input.value = ${solutionNumber};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!submitted.result.value) {
    throw new Error("Direct plan opening still requires an exact count.");
  }
  const result = await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return null;
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim();
      const countLabel = document.querySelector('.session-overview > span small')?.textContent?.trim();
      return heading === 'Plan ${solutionNumber}'
        ? { heading, countStillDeferred: countLabel === 'Plans found' }
        : null;
    })()`,
    180_000,
  );
  if (!result.countStillDeferred) {
    throw new Error("Direct plan opening triggered an unexpected exact count.");
  }
  return result;
}

async function prepareAllPlansInUi(cdp, solutionCount) {
  await showSidebarTab(cdp, "Plan");
  const started = await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return null;
      const button = [...document.querySelectorAll('[data-testid="planpilot-plan-calculation"] .count-row button')]
        .find((candidate) => candidate.textContent?.includes('Prepare all'));
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim() ?? '';
      if (!button || button.disabled) return null;
      button.click();
      return { heading };
    })()`,
    180_000,
  );
  const finished = await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return null;
      const message = document.querySelector('.inline-message:not(.error-message) span')?.textContent?.trim() ?? '';
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim() ?? '';
      return message.includes('Plans 1–${solutionCount} are ready')
        ? { message, heading }
        : null;
    })()`,
    180_000,
  );
  if (finished.heading !== started.heading) {
    throw new Error("Prepare all replaced the displayed plan.");
  }
  return finished;
}

async function assertAbstractTimeUi(cdp) {
  const selected = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const row = document.querySelector('[data-testid="planpilot-timeline-summary"] [data-timestep="any"]');
      row?.querySelector('.timeline-focus')?.click();
      row?.querySelector('.timeline-show-actions')?.click();
      return Boolean(row?.querySelector('.timeline-show-actions'));
    })()`,
    returnByValue: true,
  });
  if (!selected.result.value) {
    throw new Error("The timeline did not expose its Any step filter.");
  }
  const timeline = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const row = document.querySelector('[data-testid="planpilot-timeline-summary"] [data-timestep="any"]');
      const description = row?.querySelector('.timeline-focus span')?.textContent?.trim() ?? '';
      const displayedSteps = [...document.querySelectorAll('.solution-action-list li small')]
        .map((node) => node.textContent?.trim() ?? '');
      return { description, displayedSteps };
    })()`,
    returnByValue: true,
  });
  if (
    timeline.result.value.description !==
      "Action facets that apply to any timestep"
  ) {
    throw new Error("The flexible timeline row has an unclear description.");
  }
  if (timeline.result.value.displayedSteps.includes("Any step")) {
    throw new Error("A flexible facet was rendered as a concrete plan step.");
  }
  await waitForExpression(
    cdp,
    `(() => {
    const active = document.querySelector('.inspector-navigation button.active span')?.textContent?.trim();
    const filter = document.querySelector('.active-timestep-filter span')?.textContent?.trim();
    return active === 'Actions' && filter === 'Flexible steps';
  })()`,
    10_000,
  );
  const result = await waitForExpression(
    cdp,
    `(() => {
    const labels = [...document.querySelectorAll('.facet-result small')]
      .map((node) => node.textContent?.trim() ?? '');
    const anyStepCount = labels.filter((label) => label.startsWith('Any step')).length;
    if (anyStepCount < 1) return null;
    return {
      anyStepCount,
      t0Count: labels.filter((label) => /^t0(?:\\s|·|$)/.test(label)).length,
    };
  })()`,
    10_000,
  );
  if (result.t0Count !== 0) {
    throw new Error("The abstract-time UI displayed a flexible action as t0.");
  }
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.active-timestep-filter button')?.click()`,
  });
  return { ...result, timeline: timeline.result.value };
}

async function openPlanPilotFromProject(
  cdp,
  baseUrl,
  projectId,
  projectScreenshotPath,
  landingScreenshotPath,
) {
  const projectUrl = `${baseUrl}/project/${projectId}/features`;
  await cdp.call("Page.navigate", { url: projectUrl });
  await waitForExpression(
    cdp,
    `(() => {
    const card = [...document.querySelectorAll('app-project-action-card')]
      .find((item) => item.querySelector('mat-card-title')?.textContent?.trim() === 'PlanPilot');
    return Boolean(card?.querySelector('a'));
  })()`,
    30_000,
  );

  const cardResult = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const card = [...document.querySelectorAll('app-project-action-card')]
        .find((item) => item.querySelector('mat-card-title')?.textContent?.trim() === 'PlanPilot');
      const link = card?.querySelector('a');
      const description = card?.querySelector('mat-card-content')?.textContent?.trim().replace(/\\s+/g, ' ') ?? '';
      return { found: Boolean(link), description };
    })()`,
    returnByValue: true,
  });
  if (!cardResult.result.value?.found) {
    throw new Error("The PlanPilot project card could not be opened.");
  }
  if (projectScreenshotPath) {
    await capturePageScreenshot(cdp, projectScreenshotPath);
  }
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const card = [...document.querySelectorAll('app-project-action-card')]
        .find((item) => item.querySelector('mat-card-title')?.textContent?.trim() === 'PlanPilot');
      card?.querySelector('a')?.click();
    })()`,
  });

  const landingPath = `/planpilot/${projectId}`;
  const landing = await waitForExpression(
    cdp,
    `(() => {
    if (location.pathname !== ${JSON.stringify(landingPath)}) return null;
    const open = [...document.querySelectorAll('a')]
      .find((item) => item.textContent?.includes('Open graph'));
    const navigation = document.querySelector('app-planpilot-facets');
    if (!open || !navigation) return null;
    return {
      title: document.querySelector('app-page-title')?.textContent?.trim() ?? '',
      text: document.querySelector('app-page-content')?.textContent?.trim().replace(/\\s+/g, ' ') ?? '',
      hasNavigation: Boolean(navigation),
    };
  })()`,
    30_000,
  );
  if (!landing.hasNavigation || /choose a plan|iteration|propert/i.test(landing.text)) {
    throw new Error(
      `The PlanPilot page contains iterative-planning UI: ${JSON.stringify(landing.text)}`,
    );
  }
  if (landingScreenshotPath) {
    await capturePageScreenshot(cdp, landingScreenshotPath);
  }

  const opened = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const link = [...document.querySelectorAll('a')]
        .find((item) => item.textContent?.includes('Open graph'));
      link?.click();
      return Boolean(link);
    })()`,
    returnByValue: true,
  });
  if (!opened.result.value) {
    throw new Error("The PlanPilot start button was not available.");
  }

  const graphPath = `${landingPath}/graph`;
  await waitForExpression(
    cdp,
    `location.pathname === ${JSON.stringify(graphPath)}`,
    30_000,
  );
  return {
    projectCardDescription: cardResult.result.value.description,
    landingTitle: landing.title,
    graphPath,
    projectScreenshotPath: projectScreenshotPath ?? null,
    landingScreenshotPath: landingScreenshotPath ?? null,
  };
}

async function capturePageScreenshot(cdp, path) {
  await delay(500);
  const screenshot = await cdp.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: false,
  });
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(path, screenshot.data, "base64"),
  );
}

async function rebuildSessionWithConfiguration(
  cdp,
  configuration,
  expectedFacetCount,
) {
  const changed = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('.session-setting-fields input[type="number"]');
      const select = document.querySelector('.session-setting-fields select');
      const checkbox = document.querySelector('.abstract-setting input[type="checkbox"]');
      if (!input || !select || !checkbox) return { found: false, changed: false };
      const configuration = ${JSON.stringify(configuration)};
      const differs = (configuration.horizon !== undefined && Number(input.value) !== configuration.horizon)
        || (configuration.encoding !== undefined && select.value !== configuration.encoding)
        || (configuration.abstractTimeSteps !== undefined && checkbox.checked !== configuration.abstractTimeSteps);
      if (configuration.horizon !== undefined) {
        input.value = String(configuration.horizon);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (configuration.encoding !== undefined) {
        select.value = configuration.encoding;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (configuration.abstractTimeSteps !== undefined) {
        checkbox.checked = configuration.abstractTimeSteps;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { found: true, changed: differs };
    })()`,
    returnByValue: true,
  });
  if (!changed.result.value?.found) {
    throw new Error("The PlanPilot horizon controls were not available.");
  }
  if (changed.result.value.changed) {
    await waitForExpression(
      cdp,
      `(() => {
      const button = [...document.querySelectorAll('.session-settings button')]
        .find((candidate) => candidate.textContent?.trim().includes('Rebuild'));
      return Boolean(button && !button.disabled);
    })()`,
      10_000,
    );
    await cdp.call("Runtime.evaluate", {
      expression: `[...document.querySelectorAll('.session-settings button')]
        .find((candidate) => candidate.textContent?.trim().includes('Rebuild'))?.click()`,
    });
  }

  await waitForExpression(
    cdp,
    `(() => {
    if (document.querySelector('.workbench-progress')) return false;
    const activeSettings = document.querySelector('.session-settings .active-settings')?.textContent?.toLowerCase() ?? '';
    const count = document.querySelector('[data-testid="planpilot-action-result-count"]');
    const facetCount = Number(count?.dataset.matchingCount);
    const configuration = ${JSON.stringify(configuration)};
    const horizonMatches = configuration.horizon === undefined
      || activeSettings.includes('horizon ' + configuration.horizon);
    const encodingMatches = configuration.encoding === undefined
      || activeSettings.includes(configuration.encoding);
    const checkbox = document.querySelector('.abstract-setting input[type="checkbox"]');
    const abstractMatches = configuration.abstractTimeSteps === undefined
      || checkbox?.checked === configuration.abstractTimeSteps;
    return horizonMatches && encodingMatches && abstractMatches && facetCount === ${expectedFacetCount};
  })()`,
    180_000,
  );
}

async function selectFirstAlternative(
  cdp,
  selection,
  expectedSelectionCount = 1,
) {
  const actionClass = selection === "include" ? "require" : "forbid";
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const candidate = [...document.querySelectorAll('.facet-result')]
        .find((button) => button.textContent?.includes('Available'));
      candidate?.click();
      return { found: Boolean(candidate), facetId: candidate?.dataset.facetId ?? null };
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value?.found) {
    throw new Error(
      "No selectable alternative was found in the facet browser.",
    );
  }
  if (!clicked.result.value.facetId) {
    throw new Error(
      "The selected action row has no data-facet-id for exact smoke assertions.",
    );
  }

  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('.${actionClass}-action:not([disabled])'))`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.${actionClass}-action:not([disabled])').click()`,
  });
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('.apply-bar'))`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('.apply-bar button')]
      .find((button) => button.textContent?.trim().includes('Apply'))?.click()`,
  });

  const result = await waitForExpression(
    cdp,
    `(() => {
    if (document.querySelector('.workbench-progress')) return null;
    const values = [...document.querySelectorAll('.session-overview strong')]
      .map((node) => node.textContent?.trim());
    const error = document.querySelector('.error-state, .error-message');
    if (values[${selection === "include" ? 2 : 3}] !== ${JSON.stringify(String(expectedSelectionCount))}) return null;
    return {
      included: Number(values[2]),
      excluded: Number(values[3]),
      alternatives: Number(values[1]),
      graphLimit: document.querySelector('.graph-limit')?.textContent?.trim().replace(/\\s+/g, ' ') ?? null,
      error: error?.textContent?.trim().replace(/\\s+/g, ' ') ?? null,
    };
  })()`,
    180_000,
  );
  return { ...result, facetId: clicked.result.value.facetId };
}

async function exerciseSelectionControls(cdp) {
  const snapshots = [];
  const included = await selectFirstAlternative(cdp, "include");
  snapshots.push(
    await captureConstraintSnapshot(cdp, "require", [included.facetId], []),
  );
  const includedButtons = await actionButtonState(cdp);
  assertEqual(includedButtons.includeText, "Require", "positive action label");
  assertEqual(includedButtons.excludeText, "Forbid", "negative action label");
  assertEqual(
    includedButtons.clearText,
    "Remove constraint",
    "remove constraint action label",
  );
  if (!includedButtons.stateText.includes("Required by you")) {
    throw new Error(
      `required action state was unclear: ${JSON.stringify(includedButtons.stateText)}`,
    );
  }
  assertEqual(
    includedButtons.includeDisabled,
    true,
    "active include button disabled state",
  );
  assertEqual(
    includedButtons.excludeDisabled,
    false,
    "switch include to exclude availability",
  );
  assertEqual(
    includedButtons.clearDisabled,
    false,
    "included clear availability",
  );

  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.forbid-action:not([disabled])').click()`,
  });
  const pendingSwitch = await actionButtonState(cdp);
  if (!pendingSwitch.stateText.includes("Forbid pending")) {
    throw new Error(
      `pending switch state was unclear: ${JSON.stringify(pendingSwitch.stateText)}`,
    );
  }
  await applyStagedChanges(cdp);
  await overviewCounts(cdp, 0, 1);
  snapshots.push(
    await captureConstraintSnapshot(
      cdp,
      "switch-to-forbid",
      [],
      [included.facetId],
    ),
  );
  const switchedToForbidden = await actionButtonState(cdp);
  assertEqual(
    switchedToForbidden.includeDisabled,
    false,
    "switch forbidden to required availability",
  );
  assertEqual(
    switchedToForbidden.excludeDisabled,
    true,
    "switched forbid button disabled state",
  );

  const includeCleared = await clearSelectedConstraint(cdp, 0, 0);
  snapshots.push(
    await captureConstraintSnapshot(cdp, "individual-clear", [], []),
  );
  assertEqual(
    includeCleared.includeDisabled,
    false,
    "include availability after clear",
  );
  assertEqual(
    includeCleared.excludeDisabled,
    false,
    "exclude availability after clear",
  );
  assertEqual(includeCleared.clearDisabled, true, "clear disabled after clear");

  const excluded = await selectFirstAlternative(cdp, "exclude");
  snapshots.push(
    await captureConstraintSnapshot(cdp, "forbid", [], [excluded.facetId]),
  );
  const excludedButtons = await actionButtonState(cdp);
  assertEqual(
    excludedButtons.includeDisabled,
    false,
    "switch exclude to include availability",
  );
  assertEqual(
    excludedButtons.excludeDisabled,
    true,
    "active exclude button disabled state",
  );
  assertEqual(
    excludedButtons.clearDisabled,
    false,
    "excluded clear availability",
  );
  const excludeCleared = await clearSelectedConstraint(cdp, 0, 0);

  const excludedAgain = await selectFirstAlternative(cdp, "exclude");
  const twoExclusions = await selectFirstAlternative(cdp, "exclude", 2);
  snapshots.push(
    await captureConstraintSnapshot(
      cdp,
      "two-forbids",
      [],
      [excludedAgain.facetId, twoExclusions.facetId],
    ),
  );
  const combined = await selectFirstAlternative(cdp, "include");
  const mixedPositive = [combined.facetId];
  const mixedNegative = [excludedAgain.facetId, twoExclusions.facetId];
  snapshots.push(
    await captureConstraintSnapshot(
      cdp,
      "mixed-constraints",
      mixedPositive,
      mixedNegative,
    ),
  );
  const beforeReset = await overviewCounts(cdp, 1, 2);
  await clearAllConstraints(cdp);
  const afterReset = await overviewCounts(cdp, 0, 0);
  snapshots.push(await captureConstraintSnapshot(cdp, "clear-all", [], []));
  const history = await exerciseHistoryControls(
    cdp,
    beforeReset,
    afterReset,
    mixedPositive,
    mixedNegative,
    snapshots,
  );

  return {
    included,
    pendingSwitch,
    switchedToForbidden,
    includeCleared,
    excluded,
    excludeCleared,
    excludedAgain,
    combined,
    twoExclusions,
    beforeReset,
    afterReset,
    history,
    snapshots,
  };
}

async function exerciseHistoryControls(
  cdp,
  beforeReset,
  afterReset,
  positiveIds,
  negativeIds,
  snapshots,
) {
  await waitForExpression(
    cdp,
    `(() => {
    const undo = document.querySelector('.history-controls button[aria-label="Undo constraint change"]');
    return Boolean(undo && !undo.disabled);
  })()`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.history-controls button[aria-label="Undo constraint change"]')?.click()`,
  });
  const restored = await overviewCounts(
    cdp,
    beforeReset.included,
    beforeReset.excluded,
  );
  snapshots.push(
    await captureConstraintSnapshot(
      cdp,
      "undo-clear-all",
      positiveIds,
      negativeIds,
    ),
  );
  await waitForExpression(
    cdp,
    `(() => {
    const redo = document.querySelector('.history-controls button[aria-label="Redo constraint change"]');
    return Boolean(redo && !redo.disabled);
  })()`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.history-controls button[aria-label="Redo constraint change"]')?.click()`,
  });
  const clearedAgain = await overviewCounts(
    cdp,
    afterReset.included,
    afterReset.excluded,
  );
  snapshots.push(
    await captureConstraintSnapshot(cdp, "redo-clear-all", [], []),
  );
  return { restored, clearedAgain };
}

async function captureConstraintSnapshot(cdp, label, positiveIds, negativeIds) {
  const savedPath = constraintSnapshotDirectory
    ? join(constraintSnapshotDirectory, `${label}.json`)
    : undefined;
  const diagnostic = await downloadAndAnalyzeDiagnostic(
    cdp,
    downloadDirectory,
    savedPath,
    { label, positiveIds, negativeIds },
  );
  return {
    label,
    positiveIds: diagnostic.constraints.positiveIds,
    negativeIds: diagnostic.constraints.negativeIds,
    displayedSolutionIds: diagnostic.constraints.displayedSolutionIds,
    edgeCount: diagnostic.connectionCount,
    exactFacetSemanticMatch:
      diagnostic.backendComparison.exactFacetSemanticMatch,
    validPlan: diagnostic.backendComparison.backendPlanValidation.valid,
    savedPath: diagnostic.savedPath,
    sha256: diagnostic.sha256,
  };
}

async function exerciseAnalysisTools(cdp, solutionCount) {
  await showSidebarTab(cdp, "Plan");
  const timeline = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const section = document.querySelector('[data-testid="planpilot-timeline-summary"]');
      const rows = [...section.querySelectorAll('[data-timestep]')];
      const concrete = rows.find((row) => row.dataset.timestep !== 'any');
      concrete?.querySelector('.timeline-focus')?.click();
      return {
        rows: rows.length,
        selected: concrete?.dataset.timestep ?? null,
      };
    })()`,
    returnByValue: true,
  });
  if (
    timeline.result.value.rows < 1 ||
    timeline.result.value.selected === null
  ) {
    throw new Error("The timeline did not expose a concrete timestep filter.");
  }
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('.timeline-row.active'))`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.timeline-row.active .timeline-show-actions')?.click()`,
  });
  await waitForExpression(
    cdp,
    `(() => {
    const active = document.querySelector('.inspector-navigation button.active span')?.textContent?.trim();
    return active === 'Actions' && Boolean(document.querySelector('.active-timestep-filter'));
  })()`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.active-timestep-filter button')?.click()`,
  });
  await waitForExpression(
    cdp,
    `!document.querySelector('.active-timestep-filter')`,
    10_000,
  );

  await showSidebarTab(cdp, "Plans");
  const required = await openDetailsAndClick(
    cdp,
    "planpilot-required-actions",
    "Calculate",
    `.analysis-list, .analysis-empty, .analysis-error`,
    90_000,
  );

  await showSidebarTab(cdp, "Plans");
  const planOverview = await waitForExpression(
    cdp,
    `(() => {
      const section = document.querySelector('[data-testid="planpilot-plan-explorer"]');
      const result = section?.querySelector('.plan-summary-list, .analysis-error');
      return result ? { error: result.classList.contains('analysis-error'), text: result.textContent?.trim().replace(/\\s+/g, ' ') ?? '' } : null;
    })()`,
    180_000,
  );
  assertAnalysisSucceeded("plan browser", planOverview);

  let comparison = { skipped: "only one plan" };
  if (solutionCount > 1) {
    await cdp.call("Runtime.evaluate", {
      expression: `(() => {
        const section = document.querySelector('[data-testid="planpilot-plan-comparison"]');
        [...section.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Compare'))?.click();
      })()`,
    });
    comparison = await waitForExpression(
      cdp,
      `(() => {
      const section = document.querySelector('[data-testid="planpilot-plan-comparison"]');
      const result = section?.querySelector('.comparison-result, .analysis-error');
      return result ? { error: result.classList.contains('analysis-error'), text: result.textContent?.trim().replace(/\\s+/g, ' ') ?? '' } : null;
    })()`,
      180_000,
    );
    assertAnalysisSucceeded("plan comparison", comparison);
  }

  await showSidebarTab(cdp, "Actions");
  const impact = await calculateFirstFacetImpact(cdp);
  return {
    timeline: timeline.result.value,
    required,
    planOverview,
    comparison,
    impact,
  };
}

async function openDetailsAndClick(
  cdp,
  testId,
  buttonText,
  resultSelector,
  timeout,
) {
  const started = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const section = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
      if (!section) return { found: false };
      section.open = true;
      const button = [...section.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.includes(${JSON.stringify(buttonText)}));
      button?.click();
      return { found: true, clicked: Boolean(button), existing: Boolean(section.querySelector(${JSON.stringify(resultSelector)})) };
    })()`,
    returnByValue: true,
  });
  if (!started.result.value?.found) {
    throw new Error(`Missing analysis section: ${testId}`);
  }
  if (!started.result.value.clicked && !started.result.value.existing) {
    throw new Error(`Missing analysis action in ${testId}: ${buttonText}`);
  }
  const result = await waitForExpression(
    cdp,
    `(() => {
    const section = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
    const result = section?.querySelector(${JSON.stringify(resultSelector)});
    return result ? { error: result.classList.contains('analysis-error'), text: result.textContent?.trim().replace(/\\s+/g, ' ') ?? '' } : null;
  })()`,
    timeout,
  );
  assertAnalysisSucceeded(testId, result);
  return result;
}

async function calculateFirstFacetImpact(cdp) {
  const selected = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const facet = [...document.querySelectorAll('.facet-result')]
        .find((candidate) => candidate.textContent?.includes('Available'));
      facet?.click();
      return Boolean(facet);
    })()`,
    returnByValue: true,
  });
  if (!selected.result.value) {
    return { skipped: "no selectable alternative" };
  }
  await waitForExpression(
    cdp,
    `(() => {
    const section = document.querySelector('[data-testid="planpilot-facet-impact"]');
    const button = [...(section?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.textContent?.includes('Preview impact'));
    return Boolean(button && !button.disabled);
  })()`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const section = document.querySelector('[data-testid="planpilot-facet-impact"]');
      [...section.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Preview impact'))?.click();
    })()`,
  });
  const result = await waitForExpression(
    cdp,
    `(() => {
    const section = document.querySelector('[data-testid="planpilot-facet-impact"]');
    const result = section?.querySelector('.impact-grid, .analysis-empty, .analysis-error');
    return result ? { error: result.classList.contains('analysis-error'), text: result.textContent?.trim().replace(/\\s+/g, ' ') ?? '' } : null;
  })()`,
    180_000,
  );
  assertAnalysisSucceeded("facet impact", result);
  return result;
}

function assertAnalysisSucceeded(name, result) {
  if (result?.error) {
    throw new Error(
      `${name} failed: ${result.text || "unknown PlanPilot error"}`,
    );
  }
}

async function actionButtonState(cdp) {
  const response = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const include = document.querySelector('.require-action');
      const exclude = document.querySelector('.forbid-action');
      const clear = document.querySelector('.clear-action');
      if (!include || !exclude || !clear) return null;
      const label = (button) => [...button.querySelectorAll('span')]
        .map((node) => node.textContent?.trim() ?? '')
        .find(Boolean) ?? '';
      return {
        includeDisabled: include.disabled,
        excludeDisabled: exclude.disabled,
        clearDisabled: clear.disabled,
        includeText: label(include),
        excludeText: label(exclude),
        clearText: label(clear),
        stateText: document.querySelector('.selected-facet .facet-state')?.textContent?.trim().replace(/\\s+/g, ' ') ?? '',
      };
    })()`,
    returnByValue: true,
  });
  if (!response.result.value) {
    throw new Error("The selected action controls were not available.");
  }
  return response.result.value;
}

async function assertBelowFoldActionSelection(cdp) {
  await showSidebarTab(cdp, "Actions");
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const scroller = document.querySelector('.inspector-scroll');
      if (!scroller) return { error: 'missing inspector scroller' };
      scroller.scrollTop = 0;
      const scrollerBox = scroller.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.facet-result')];
      const row = [...rows].reverse().find((candidate) => (
        candidate.getBoundingClientRect().top >= scrollerBox.bottom
      ));
      if (!row) return { error: 'no rendered action below the visible fold', rows: rows.length };
      const before = row.getBoundingClientRect();
      const facetId = row.dataset.facetId ?? null;
      const label = row.textContent?.trim().replace(/\\s+/g, ' ') ?? '';
      row.scrollIntoView({ block: 'end' });
      row.click();
      return {
        error: null,
        facetId,
        label,
        rows: rows.length,
        wasBelowFold: before.top >= scrollerBox.bottom,
      };
    })()`,
    returnByValue: true,
  });
  if (clicked.result.value?.error) {
    throw new Error(
      `Could not exercise a below-fold action: ${clicked.result.value.error} (${clicked.result.value.rows ?? 0} rows).`,
    );
  }
  if (!clicked.result.value?.facetId || !clicked.result.value.wasBelowFold) {
    throw new Error(
      "The below-fold action row did not expose a stable facet ID.",
    );
  }

  const visible = await waitForExpression(
    cdp,
    `(() => {
    const active = document.querySelector('.inspector-navigation button.active span')?.textContent?.trim();
    const scroller = document.querySelector('.inspector-scroll');
    const panel = document.querySelector('[data-testid="planpilot-selected-action-panel"]');
    if (active !== 'Actions' || !scroller || !panel) return null;
    const scrollerBox = scroller.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const hasControls = Boolean(panel.querySelector('.facet-actions, .analysis-empty'));
    const insideViewport = panelBox.top >= scrollerBox.top - 1
      && panelBox.bottom <= scrollerBox.bottom + 1;
    return hasControls && insideViewport
      ? { active, insideViewport, panelTop: panelBox.top, panelBottom: panelBox.bottom }
      : null;
  })()`,
    10_000,
  );
  return { ...clicked.result.value, ...visible };
}

async function assertFixedActionUi(cdp) {
  await showSidebarTab(cdp, "Actions");
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const row = document.querySelector('.facet-result.displayed-plan, .facet-result');
      row?.click();
      return Boolean(row);
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) {
    throw new Error("Exact mode exposed no fixed action row.");
  }
  const result = await waitForExpression(
    cdp,
    `(() => {
    const detail = document.querySelector('.selected-facet');
    if (!detail) return null;
    const enabledConstraintButtons = [...detail.querySelectorAll('.require-action, .forbid-action, .clear-action')]
      .filter((button) => !button.disabled).length;
    const fixedMessage = [...detail.querySelectorAll('.analysis-empty')]
      .map((node) => node.textContent?.trim().replace(/\\s+/g, ' ') ?? '')
      .find((text) => text.includes('This action is fixed in the current plan space.')) ?? '';
    const preview = [...detail.querySelectorAll('[data-testid="planpilot-facet-impact"] button')]
      .find((button) => button.textContent?.includes('Preview impact'));
    if (!fixedMessage || !preview || preview.disabled) return null;
    return { enabledConstraintButtons, fixedMessage };
  })()`,
    10_000,
  );
  assertEqual(
    result.enabledConstraintButtons,
    0,
    "enabled exact-mode constraint controls",
  );
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const section = document.querySelector('[data-testid="planpilot-facet-impact"]');
      [...section.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Preview impact'))?.click();
    })()`,
  });
  const preview = await waitForExpression(
    cdp,
    `(() => {
      const grid = document.querySelector('[data-testid="planpilot-facet-impact"] .impact-grid');
      return grid?.textContent?.trim().replace(/\\s+/g, ' ') ?? null;
    })()`,
    10_000,
  );
  return { ...result, preview };
}

async function assertInterfaceCopy(cdp) {
  const copy = await waitForExpression(
    cdp,
    `(() => {
    const legendNote = document.querySelector('.connection-note')?.textContent?.trim() ?? '';
    const overviewLabels = [...document.querySelectorAll('.session-overview small')]
      .map((node) => node.textContent?.trim());
    const navigationLabels = [...document.querySelectorAll('.inspector-navigation button span')]
      .map((node) => node.textContent?.trim());
    const timelineFocusCount = document.querySelectorAll('.timeline-focus').length;
    const timelineActionCount = document.querySelectorAll('.timeline-show-actions').length;
    const commonActionsState = document.querySelector('.common-actions-state')?.textContent?.trim() ?? '';
    const canvasHeaderHeight = document.querySelector('.canvas-header')?.getBoundingClientRect().height ?? 0;
    const legendSwatchCount = document.querySelectorAll('.graph-legend .node-key').length;
    const planStates = [...document.querySelectorAll('.facet-result small')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text.includes('Displayed plan'));
    const bodyText = document.querySelector('.planpilot-workbench')?.textContent ?? '';
    return { legendNote, overviewLabels, navigationLabels, timelineFocusCount, timelineActionCount, commonActionsState, canvasHeaderHeight, legendSwatchCount, planStates, bodyText };
  })()`,
    10_000,
  );

  assertEqual(
    copy.legendNote,
    "Arrows connect actions in the displayed plan. Empty timesteps contain no action. A check marks when a goal first becomes true.",
    "graph explanation",
  );
  assertEqual(
    copy.overviewLabels[1],
    "Alternatives",
    "alternative action count label",
  );
  assertEqual(
    copy.overviewLabels[2],
    "Required",
    "positive constraint count label",
  );
  assertEqual(
    copy.overviewLabels[3],
    "Forbidden",
    "negative constraint count label",
  );
  assertEqual(
    copy.navigationLabels.join(","),
    "Plan,Actions,Plans",
    "sidebar navigation",
  );
  if (copy.timelineFocusCount < 1 || copy.timelineActionCount < 1) {
    throw new Error(
      "Timeline rows must expose separate graph-focus and action-filter controls.",
    );
  }
  if (!copy.commonActionsState) {
    throw new Error("The common-actions calculation state is missing.");
  }
  if (copy.canvasHeaderHeight <= 0 || copy.canvasHeaderHeight > 72) {
    throw new Error(
      `The graph header is not compact: ${copy.canvasHeaderHeight}px.`,
    );
  }
  assertEqual(copy.legendSwatchCount, 4, "compact graph legend swatches");
  if (!copy.planStates.some((text) => text.includes("No constraint"))) {
    throw new Error(
      "The action list did not distinguish a neutral displayed-plan action.",
    );
  }
  for (const oldText of [
    "Arrows show only the displayed plan",
    "Checked against the displayed plan",
    "Reached at t",
    "Plan-space impact has not been calculated",
  ]) {
    if (copy.bodyText.includes(oldText)) {
      throw new Error(`old interface copy is still visible: ${oldText}`);
    }
  }
  return {
    legendNote: copy.legendNote,
    overviewLabels: copy.overviewLabels,
    navigationLabels: copy.navigationLabels,
    neutralDisplayedPlanStates: copy.planStates.length,
  };
}

async function assertSidebarNavigation(cdp) {
  const visit = async (key, label, targetId) => {
    const clicked = await cdp.call("Runtime.evaluate", {
      expression: `(() => {
        const labelNode = [...document.querySelectorAll('.inspector-navigation button span')]
          .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
        const button = labelNode?.closest('button');
        button?.click();
        const scroller = document.querySelector('.inspector-scroll');
        if (scroller) scroller.scrollTop = 0;
        return Boolean(button);
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) {
      throw new Error(`Missing sidebar navigation button: ${label}`);
    }
    const result = await waitForExpression(
      cdp,
      `(() => {
      const scroller = document.querySelector('.inspector-scroll');
      const target = document.getElementById(${JSON.stringify(targetId)});
      const navigation = document.querySelector('.inspector-navigation');
      if (!scroller || !target || !navigation) return null;
      scroller.scrollTop = 0;
      const scrollerBox = scroller.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const navigationBox = navigation.getBoundingClientRect();
      const activeButtons = [...navigation.querySelectorAll('button.active')];
      if (target.classList.contains('inspector-section-hidden') || activeButtons.length !== 1) return null;
      if (targetBox.bottom <= scrollerBox.top || targetBox.top >= scrollerBox.bottom) return null;
      return {
        target: ${JSON.stringify(targetId)},
        activeLabel: activeButtons[0].textContent?.trim(),
        navigationVisible: navigationBox.top >= 0 && navigationBox.bottom <= innerHeight,
        contentHeight: scroller.scrollHeight,
        visibleHeight: scroller.clientHeight,
        needsScroll: scroller.scrollHeight > scroller.clientHeight + 1,
        nestedScrollableCount: [...target.querySelectorAll('*')].filter((element) => {
          const overflowY = getComputedStyle(element).overflowY;
          return (overflowY === 'auto' || overflowY === 'scroll')
            && element.scrollHeight > element.clientHeight + 1;
        }).length,
        selectedContextCount: target.querySelectorAll('.selected-context').length,
      };
    })()`,
      10_000,
    );
    if (sidebarScreenshotDirectory) {
      await capturePageScreenshot(
        cdp,
        join(sidebarScreenshotDirectory, `${key}.png`),
      );
    }
    return result;
  };

  const tabs = {
    plan: await visit("plan", "Plan", "planpilot-timeline"),
    plans: await visit("plans", "Plans", "planpilot-plans"),
    actions: await visit("actions", "Actions", "planpilot-action-browser"),
  };
  if (Object.values(tabs).some((tab) => !tab.navigationVisible)) {
    throw new Error(
      "The sidebar navigation did not remain visible while moving between sections.",
    );
  }
  if (Object.values(tabs).some((tab) => tab.nestedScrollableCount > 0)) {
    throw new Error(
      "A sidebar section still contains a nested vertical scrollbar.",
    );
  }
  if (tabs.plans.selectedContextCount !== 0) {
    throw new Error(
      "The Plans section contains unrelated selected-action context.",
    );
  }
  return tabs;
}

async function showSidebarTab(cdp, label) {
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const labelNode = [...document.querySelectorAll('.inspector-navigation button span')]
        .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      const button = labelNode?.closest('button');
      button?.click();
      return Boolean(button);
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) {
    throw new Error(`Missing sidebar tab: ${label}`);
  }
  await waitForExpression(
    cdp,
    `(() => {
    const active = document.querySelector('.inspector-navigation button.active span');
    return active?.textContent?.trim() === ${JSON.stringify(label)};
  })()`,
    10_000,
  );
}

async function clearSelectedConstraint(
  cdp,
  expectedIncluded,
  expectedExcluded,
) {
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('.clear-action:not([disabled])'))`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('.clear-action:not([disabled])').click()`,
  });
  await applyStagedChanges(cdp);
  await overviewCounts(cdp, expectedIncluded, expectedExcluded);
  return actionButtonState(cdp);
}

async function applyStagedChanges(cdp) {
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('.apply-bar'))`,
    10_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('.apply-bar button')]
      .find((button) => button.textContent?.trim().includes('Apply'))?.click()`,
  });
}

async function overviewCounts(cdp, expectedIncluded, expectedExcluded) {
  return waitForExpression(
    cdp,
    `(() => {
    if (document.querySelector('.workbench-progress')) return null;
    const values = [...document.querySelectorAll('.session-overview strong')]
      .map((node) => Number(node.textContent?.trim()));
    if (values[2] !== ${expectedIncluded} || values[3] !== ${expectedExcluded}) return null;
    const error = document.querySelector('.error-state, .error-message');
    if (error) throw new Error(error.textContent?.trim() || 'PlanPilot UI error');
    return { included: values[2], excluded: values[3], alternatives: values[1] };
  })()`,
    180_000,
  );
}

async function clearAllConstraints(cdp) {
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const button = [...document.querySelectorAll('.session-actions button')]
        .find((candidate) => candidate.textContent?.includes('Clear all'));
      const enabled = Boolean(button && !button.disabled);
      if (enabled) button.click();
      return enabled;
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) {
    throw new Error("Clear all was not available with active constraints.");
  }
}

async function exerciseExtendedPlanBrowsing(cdp, solutionCount) {
  await showSidebarTab(cdp, "Plans");
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#planpilot-plan-number');
      const form = input?.closest('form');
      if (!input || !form) return false;
      input.value = 1;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    returnByValue: true,
  });
  await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return false;
      return document.querySelector('.plan-summary-row')?.dataset.solutionNumber === '1';
    })()`,
    180_000,
  );
  for (const pageStart of [6, 11, 16, 21]) {
    const clicked = await cdp.call("Runtime.evaluate", {
      expression: `(() => {
        const next = [...document.querySelectorAll('.plan-page-controls button')]
          .find((button) => button.textContent?.includes('Next'));
        if (!next || next.disabled) return false;
        next.click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) {
      throw new Error(`Next was disabled before plan ${pageStart}.`);
    }
    await waitForExpression(
      cdp,
      `(() => {
        if (document.querySelector('.workbench-progress')) return false;
        return Boolean(document.querySelector('[data-solution-number="${pageStart}"]'));
      })()`,
      180_000,
    );
  }

  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('[data-solution-number="21"]')?.click()`,
  });
  await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return false;
      return document.querySelector('.plan-browser-heading strong')?.textContent?.trim() === 'Plan 21';
    })()`,
    180_000,
  );

  const jumpTarget = Math.min(solutionCount, 37);
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#planpilot-plan-number');
      const form = input?.closest('form');
      if (!input || !form) return false;
      input.value = ${jumpTarget};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    returnByValue: true,
  });
  const jumpPageStart = Math.floor((jumpTarget - 1) / 5) * 5 + 1;
  await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return false;
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim();
      const first = document.querySelector('.plan-summary-row')?.dataset.solutionNumber;
      return heading === 'Plan ${jumpTarget}' && Number(first) === ${jumpPageStart};
    })()`,
    180_000,
  );

  const previousStart = Math.max(1, jumpPageStart - 5);
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const previous = [...document.querySelectorAll('.plan-page-controls button')]
        .find((button) => button.textContent?.includes('Previous'));
      if (!previous || previous.disabled) return false;
      previous.click();
      return true;
    })()`,
    returnByValue: true,
  });
  await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return false;
      return Number(document.querySelector('.plan-summary-row')?.dataset.solutionNumber) === ${previousStart};
    })()`,
    180_000,
  );
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const next = [...document.querySelectorAll('.plan-page-controls button')]
        .find((button) => button.textContent?.includes('Next'));
      if (!next || next.disabled) return false;
      next.click();
      return true;
    })()`,
    returnByValue: true,
  });
  await waitForExpression(
    cdp,
    `(() => {
      if (document.querySelector('.workbench-progress')) return false;
      return Number(document.querySelector('.plan-summary-row')?.dataset.solutionNumber) === ${jumpPageStart};
    })()`,
    180_000,
  );

  return {
    pagedPastTwenty: true,
    selectedPlan: 21,
    jumpTarget,
    jumpPageStart,
    previousAndNextVerified: true,
  };
}

async function showFirstGappedSolution(cdp, maximumSolutionNumber) {
  await showSidebarTab(cdp, "Plans");
  const startingPlan = await waitForExpression(
    cdp,
    `(() => {
      const heading = document.querySelector('.plan-browser-heading strong')?.textContent?.trim();
      if (!heading) return null;
      if (heading !== 'Initial plan') return 'numbered';
      const first = document.querySelector('[data-solution-number="1"]');
      if (!first || first.disabled) return null;
      first.click();
      return 'selected-first';
    })()`,
    180_000,
  );
  if (startingPlan === "selected-first") {
    await waitForExpression(
      cdp,
      `(() => {
        if (document.querySelector('.workbench-progress')) return false;
        return document.querySelector('.plan-browser-heading strong')?.textContent?.trim() === 'Plan 1';
      })()`,
      180_000,
    );
  }
  const readDisplayedPlan = async (expectedNumber = 0) =>
    waitForExpression(
      cdp,
      `(() => {
      if (document.querySelector('.workbench-progress')) return null;
      const details = document.querySelector('.plan-explorer .solution-action-list');
      if (details) details.open = true;
      const position = document.querySelector('.plan-browser-heading strong')?.textContent?.trim();
      const match = position?.match(/\\d+/);
      const timesteps = [...document.querySelectorAll('.plan-explorer .solution-action-list li small')]
        .map((node) => Number(node.textContent?.trim().replace(/^t/, '')));
      return match && (!${expectedNumber} || Number(match[0]) === ${expectedNumber}) && timesteps.length && timesteps.every(Number.isInteger)
        ? { solutionNumber: Number(match[0]), position, timesteps }
        : null;
    })()`,
      180_000,
    );

  const withGaps = (state) => {
    const gaps = state.timesteps
      .slice(1)
      .flatMap((timestep, index) =>
        range(state.timesteps[index] + 1, timestep - 1),
      );
    return gaps.length
      ? {
          solutionNumber: state.solutionNumber,
          timesteps: state.timesteps,
          gapTimesteps: gaps,
        }
      : undefined;
  };

  const displayed = await readDisplayedPlan();
  const displayedWithGaps = withGaps(displayed);
  if (displayedWithGaps) {
    return displayedWithGaps;
  }

  for (
    let solutionNumber = displayed.solutionNumber + 1;
    solutionNumber <= maximumSolutionNumber;
    solutionNumber += 1
  ) {
    const clicked = await cdp.call("Runtime.evaluate", {
      expression: `(() => {
        const row = document.querySelector('[data-solution-number="${solutionNumber}"]');
        if (row && !row.disabled) {
          row.click();
          return 'selected';
        }
        const next = [...document.querySelectorAll('.plan-page-controls button')]
          .find((candidate) => candidate.textContent?.includes('Next'));
        if (next && !next.disabled) {
          next.click();
          return 'next-page';
        }
        return null;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) {
      break;
    }
    if (clicked.result.value === "next-page") {
      await waitForExpression(
        cdp,
        `Boolean(document.querySelector('[data-solution-number="${solutionNumber}"]'))`,
        180_000,
      );
      await cdp.call("Runtime.evaluate", {
        expression: `document.querySelector('[data-solution-number="${solutionNumber}"]')?.click()`,
      });
    }
    const state = await readDisplayedPlan(solutionNumber);
    if (state.solutionNumber !== solutionNumber) {
      throw new Error(
        `Expected displayed plan ${solutionNumber}, received ${state.position}.`,
      );
    }
    const stateWithGaps = withGaps(state);
    if (stateWithGaps) {
      return stateWithGaps;
    }
  }
  throw new Error(
    `No internally gapped bounded plan was found among solutions 1-${maximumSolutionNumber}.`,
  );
}

async function showAllGraphFacets(cdp, expectedCount) {
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const button = [...document.querySelectorAll('.graph-limit button')]
        .find((candidate) => candidate.textContent?.trim() === 'All');
      button?.click();
      return Boolean(button);
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) {
    throw new Error("The graph did not offer its All control.");
  }

  return waitForExpression(
    cdp,
    `(() => {
    const text = document.querySelector('.graph-limit span')?.textContent?.trim();
    if (text !== 'All ${expectedCount} actions shown') return null;
    return {
      label: text,
      canvasCount: document.querySelectorAll('app-planpilot-graph canvas').length,
    };
  })()`,
    30_000,
  );
}

async function downloadAndAnalyzeDiagnostic(
  cdp,
  directory,
  savedPath,
  expectation,
) {
  await cdp.call("Runtime.evaluate", {
    expression: `document.querySelector('button[aria-label="Focus displayed plan"]')?.click()`,
  });
  await delay(500);
  const overlayGeometry = await graphOverlayGeometry(cdp);
  const before = new Set(readdirSync(directory));
  const clicked = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const button = document.querySelector('button[aria-label="Export graph data"]');
      button?.click();
      return Boolean(button && !button.disabled);
    })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) {
    throw new Error("The graph diagnostic export control was not available.");
  }

  const filename = await waitForDownloadedFile(directory, before, 60_000);
  const downloadedPath = join(directory, filename);
  const bytes = readFileSync(downloadedPath);
  const payload = JSON.parse(bytes.toString("utf8"));
  const summary = analyzeDiagnostic(payload, overlayGeometry, expectation);
  if (savedPath) {
    copyFileSync(downloadedPath, savedPath);
  }
  if (summary.issues.length) {
    throw new Error(
      `graph diagnostic integrity failed: ${summary.issues.join("; ")}`,
    );
  }
  const backendComparison = await compareDiagnosticWithBackend(payload);
  return {
    filename,
    savedPath: savedPath ?? null,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...summary,
    backendComparison,
  };
}

async function compareDiagnosticWithBackend(payload) {
  const runId = payload.session?.runId;
  if (typeof runId !== "string" || !runId) {
    throw new Error("graph diagnostic has no backend run id");
  }
  const sessionUrl = `${baseUrl}/api/planpilot/sessions/${encodeURIComponent(runId)}`;
  const solutionNumber = Number(payload.session?.currentSolutionNumber) || 0;
  const facetResponse = await postBackendJson(`${sessionUrl}/facets/list`, {});
  const queryResponse = solutionNumber
    ? await postBackendJson(`${sessionUrl}/query`, {
        type: "solution",
        solutionNumber,
      })
    : { result: { solutions: [facetResponse.solution] } };

  const backendFacetIds = sortedUniqueIds(
    facetResponse.facets,
    "backend facets",
  );
  const exportedFacetIds = sortedUniqueIds(payload.facets, "exported facets");
  assertStringArraysEqual(
    backendFacetIds,
    exportedFacetIds,
    "backend/exported facet ids",
  );
  const facetContract = compareFacetContract(
    facetResponse.facets,
    payload.facets,
  );
  if (!facetContract.valid) {
    throw new Error(
      `backend/exported facet semantics differ: ${facetContract.issues.join("; ")}`,
    );
  }

  const solutions = queryResponse.result?.solutions;
  if (
    !Array.isArray(solutions) ||
    solutions.length !== 1 ||
    !Array.isArray(solutions[0]?.facets)
  ) {
    throw new Error(
      "backend solution query did not return exactly one solution",
    );
  }
  const backendSolution = solutions[0].facets.map(solutionLink);
  const exportedSolution = (payload.representativeSolution ?? []).map(
    solutionLink,
  );
  if (JSON.stringify(backendSolution) !== JSON.stringify(exportedSolution)) {
    throw new Error(
      `backend/exported representative solution differs: backend=${JSON.stringify(backendSolution)}, exported=${JSON.stringify(exportedSolution)}`,
    );
  }
  const solutionContract = compareFacetContract(
    solutions[0].facets,
    payload.representativeSolution ?? [],
    { solution: true, solutionCount: payload.session?.solutionCount ?? null },
  );
  if (!solutionContract.valid) {
    throw new Error(
      `backend/exported solution semantics differ: ${solutionContract.issues.join("; ")}`,
    );
  }
  const backendPlanValidation = validateStripsPlan(
    demoTask,
    backendSolutionSteps(solutions[0]),
  );
  const exportedPlanValidation = validateStripsPlan(
    demoTask,
    diagnosticSolutionSteps(payload.representativeSolution ?? []),
  );

  return {
    runId,
    solutionNumber,
    facetCount: backendFacetIds.length,
    representativeActionCount: backendSolution.length,
    exactFacetIdMatch: true,
    exactSolutionChainMatch: true,
    exactFacetSemanticMatch: true,
    exactSolutionSemanticMatch: true,
    comparedFacetFields: facetContract.comparedFields,
    normalization: facetContract.normalization,
    backendPlanValidation: {
      valid: backendPlanValidation.valid,
      actionCount: backendPlanValidation.actionCount,
    },
    exportedPlanValidation: {
      valid: exportedPlanValidation.valid,
      actionCount: exportedPlanValidation.actionCount,
    },
  };
}

async function postBackendJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `backend comparison request failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("backend comparison returned invalid JSON");
  }
}

function sortedUniqueIds(items, label) {
  if (!Array.isArray(items)) {
    throw new Error(`${label} are missing`);
  }
  const ids = items.map((item) => item?.id);
  if (ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error(`${label} contain an invalid id`);
  }
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw new Error(`${label} contain duplicate ids`);
  }
  return unique.sort();
}

function assertStringArraysEqual(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const onlyActual = actual.filter((id) => !expectedSet.has(id));
    const onlyExpected = expected.filter((id) => !actualSet.has(id));
    throw new Error(
      `${label} differ: backend-only=${JSON.stringify(onlyActual)}, export-only=${JSON.stringify(onlyExpected)}`,
    );
  }
}

function solutionLink(facet) {
  return {
    id: facet?.id ?? null,
    timestep: facet?.timestep ?? null,
    parentId: facet?.parentId ?? null,
  };
}

async function graphOverlayGeometry(cdp) {
  const response = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const canvas = document.querySelector('app-planpilot-graph .graph-canvas');
      const legend = document.querySelector('.graph-legend');
      if (!canvas || !legend) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const legendRect = legend.getBoundingClientRect();
      return {
        canvas: {
          width: canvasRect.width,
          height: canvasRect.height,
        },
        legend: {
          left: legendRect.left - canvasRect.left,
          top: legendRect.top - canvasRect.top,
          right: legendRect.right - canvasRect.left,
          bottom: legendRect.bottom - canvasRect.top,
        },
      };
    })()`,
    returnByValue: true,
  });
  return response.result.value;
}

async function waitForDownloadedFile(directory, before, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const filename = readdirSync(directory).find(
      (entry) => !before.has(entry) && entry.endsWith(".json"),
    );
    if (filename) {
      return filename;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the graph diagnostic download.");
}

function analyzeDiagnostic(payload, overlayGeometry, expectation) {
  const issues = [...(payload.integrity?.issues ?? [])];
  const constraintSnapshot = validateConstraintSnapshot(
    payload,
    expectation ?? { label: "browser export" },
  );
  issues.push(...constraintSnapshot.issues);
  const facets = payload.facets ?? [];
  const representative = payload.representativeSolution ?? [];
  const renderedNodes = payload.renderedGraph?.nodes ?? [];
  const renderedEdges = payload.renderedGraph?.edges ?? [];
  const connections = payload.connections ?? [];
  const solutionIds = new Set(representative.map((facet) => facet.id));
  const solutionById = new Map(
    representative.map((facet) => [facet.id, facet]),
  );
  const renderedEdgeKeys = new Set(
    renderedEdges.map((edge) => `${edge.sourceId}>${edge.targetId}`),
  );
  const renderedNodeById = new Map(
    renderedNodes.map((node) => [node.id, node]),
  );

  if (payload.schemaVersion !== "ipexco-planpilot-graph-diagnostic-v4") {
    issues.push(`unexpected schema version: ${payload.schemaVersion}`);
  }
  if (payload.ui?.connectionModel !== "representative-solution-only") {
    issues.push(`unexpected connection model: ${payload.ui?.connectionModel}`);
  }
  for (const connection of connections) {
    if (connection.kind !== "plan") {
      issues.push(
        `non-plan edge: ${connection.sourceId} -> ${connection.targetId}`,
      );
    }
    if (
      connection.sourceId !== "__session__" &&
      !solutionIds.has(connection.sourceId)
    ) {
      issues.push(
        `edge starts outside displayed solution: ${connection.sourceId}`,
      );
    }
    if (
      connection.targetId !== "__goal__" &&
      !solutionIds.has(connection.targetId)
    ) {
      issues.push(`edge targets an alternative: ${connection.targetId}`);
    }
    if (
      !renderedEdgeKeys.has(`${connection.sourceId}>${connection.targetId}`)
    ) {
      issues.push(
        `connection was not rendered: ${connection.sourceId} -> ${connection.targetId}`,
      );
    }
    assertDiagnosticGapMetadata(
      connection,
      solutionById.get(connection.sourceId),
      solutionById.get(connection.targetId),
      "connection",
      issues,
    );
  }
  for (const edge of renderedEdges) {
    if (
      !connections.some(
        (connection) =>
          connection.sourceId === edge.sourceId &&
          connection.targetId === edge.targetId,
      )
    ) {
      issues.push(
        `rendered edge is absent from diagnostic topology: ${edge.sourceId} -> ${edge.targetId}`,
      );
    }
    if (!edge.classes?.includes("plan-edge")) {
      issues.push(
        `displayed solution edge has no plan-edge class: ${edge.sourceId} -> ${edge.targetId}`,
      );
    }
    if (
      edge.sourceArrowShape !== "none" ||
      edge.targetArrowShape !== "triangle"
    ) {
      issues.push(
        `displayed solution edge has no directed arrow: ${edge.sourceId} -> ${edge.targetId}`,
      );
    }
    if (!Number.isFinite(edge.renderedWidth) || edge.renderedWidth < 2) {
      issues.push(
        `displayed solution edge is thinner than 2 rendered pixels: ${edge.sourceId} -> ${edge.targetId}`,
      );
    }
    assertEdgeEndpoint(
      edge,
      renderedNodeById.get(edge.sourceId),
      "source",
      issues,
    );
    assertEdgeEndpoint(
      edge,
      renderedNodeById.get(edge.targetId),
      "target",
      issues,
    );
    assertDiagnosticGapMetadata(
      edge,
      solutionById.get(edge.sourceId),
      solutionById.get(edge.targetId),
      "rendered edge",
      issues,
    );
  }
  assertPlanIsClearOfLegend(
    renderedNodes,
    renderedEdges,
    overlayGeometry?.legend,
    issues,
  );
  const displayedPlanViewportNodeCount = assertDisplayedPlanIsVisible(
    renderedNodes,
    representative,
    overlayGeometry?.canvas,
    issues,
  );
  const displayedPlanHorizontalOffset = assertDisplayedPlanIsCentered(
    renderedNodes,
    representative,
    overlayGeometry?.canvas,
    issues,
  );

  const expectedPath = representative.length
    ? [
        ["__session__", representative[0].id],
        ...representative
          .slice(1)
          .map((facet, index) => [representative[index].id, facet.id]),
        [representative[representative.length - 1].id, "__goal__"],
      ]
    : [];
  for (const [sourceId, targetId] of expectedPath) {
    if (
      !connections.some(
        (connection) =>
          connection.sourceId === sourceId && connection.targetId === targetId,
      )
    ) {
      issues.push(
        `displayed solution path is broken: ${sourceId} -> ${targetId}`,
      );
    }
  }
  if (connections.length !== expectedPath.length) {
    issues.push(
      `expected ${expectedPath.length} plan edges, got ${connections.length}`,
    );
  }

  return {
    schemaVersion: payload.schemaVersion,
    backendFacetCount: facets.length,
    graphFacetCount: payload.integrity?.graphFacetCount,
    omittedFacetCount: payload.integrity?.omittedFacetIds?.length ?? 0,
    representativeActionCount: representative.length,
    connectionCount: connections.length,
    renderedNodeCount: renderedNodes.length,
    renderedEdgeCount: renderedEdges.length,
    displayedPlanViewportNodeCount,
    displayedPlanHorizontalOffset,
    minimumRenderedEdgeWidth: renderedEdges.length
      ? Math.min(...renderedEdges.map((edge) => edge.renderedWidth))
      : null,
    solutionEdges: expectedPath.map(([sourceId, targetId]) => ({
      sourceId,
      sourceLabel: renderedNodeById.get(sourceId)?.label ?? null,
      targetId,
      targetLabel: renderedNodeById.get(targetId)?.label ?? null,
    })),
    hasPng: String(payload.renderedGraph?.imagePngDataUrl ?? "").startsWith(
      "data:image/png;base64,",
    ),
    constraints: {
      positiveIds: constraintSnapshot.positiveIds,
      negativeIds: constraintSnapshot.negativeIds,
      displayedSolutionIds: constraintSnapshot.displayedSolutionIds,
    },
    effectiveNodeStyles: constraintSnapshot.effectiveStyles,
    issues,
  };
}

function assertDisplayedPlanIsVisible(nodes, representative, canvas, issues) {
  const expectedIds = [
    "__session__",
    ...representative.map((facet) => facet.id),
    "__goal__",
  ];
  if (
    !canvas ||
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height)
  ) {
    issues.push("displayed plan viewport geometry was unavailable");
    return 0;
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let visible = 0;
  for (const id of expectedIds) {
    const node = byId.get(id);
    const position = node?.renderedPosition;
    const size = node?.renderedSize;
    if (
      ![position?.x, position?.y, size?.width, size?.height].every(
        Number.isFinite,
      )
    ) {
      issues.push(
        `displayed plan node viewport geometry is unavailable: ${id}`,
      );
      continue;
    }
    const bounds = {
      left: position.x - size.width / 2,
      right: position.x + size.width / 2,
      top: position.y - size.height / 2,
      bottom: position.y + size.height / 2,
    };
    if (
      bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > canvas.width ||
      bounds.bottom > canvas.height
    ) {
      issues.push(
        `displayed plan node is outside the interactive viewport: ${id}`,
      );
    } else {
      visible += 1;
    }
  }
  return visible;
}

function assertDisplayedPlanIsCentered(nodes, representative, canvas, issues) {
  if (!canvas || !Number.isFinite(canvas.width)) {
    return null;
  }
  const expectedIds = new Set([
    "__session__",
    ...representative.map((facet) => facet.id),
    "__goal__",
  ]);
  const displayedNodes = nodes.filter((node) => expectedIds.has(node.id));
  if (displayedNodes.length !== expectedIds.size) {
    issues.push("displayed plan centering could not be measured");
    return null;
  }
  const left = Math.min(
    ...displayedNodes.map(
      (node) => node.renderedPosition.x - node.renderedSize.width / 2,
    ),
  );
  const right = Math.max(
    ...displayedNodes.map(
      (node) => node.renderedPosition.x + node.renderedSize.width / 2,
    ),
  );
  const offset = (left + right) / 2 - canvas.width / 2;
  const tolerance = Math.max(24, canvas.width * 0.03);
  if (Math.abs(offset) > tolerance) {
    issues.push(
      `displayed plan is horizontally off-center by ${offset.toFixed(1)}px`,
    );
  }
  return offset;
}

function assertPlanIsClearOfLegend(nodes, edges, legend, issues) {
  if (!legend) {
    issues.push("graph legend geometry was unavailable");
    return;
  }
  const planNodeIds = new Set(
    edges.flatMap((edge) => [edge.sourceId, edge.targetId]),
  );
  nodes
    .filter((node) => planNodeIds.has(node.id))
    .forEach((node) => {
      const bounds = {
        left: node.renderedPosition.x - node.renderedSize.width / 2,
        right: node.renderedPosition.x + node.renderedSize.width / 2,
        top: node.renderedPosition.y - node.renderedSize.height / 2,
        bottom: node.renderedPosition.y + node.renderedSize.height / 2,
      };
      if (rectanglesIntersect(bounds, legend)) {
        issues.push(
          `displayed solution node is obscured by the legend: ${node.id}`,
        );
      }
    });
  edges.forEach((edge) => {
    for (const [name, point] of [
      ["source", edge.renderedSourceEndpoint],
      ["target", edge.renderedTargetEndpoint],
    ]) {
      if (
        point &&
        point.x >= legend.left &&
        point.x <= legend.right &&
        point.y >= legend.top &&
        point.y <= legend.bottom
      ) {
        issues.push(
          `displayed solution edge ${name} is obscured by the legend: ${edge.sourceId} -> ${edge.targetId}`,
        );
      }
    }
  });
}

function rectanglesIntersect(left, right) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function assertEdgeEndpoint(edge, node, endpointName, issues) {
  if (!node) {
    issues.push(
      `rendered ${endpointName} node is missing for edge: ${edge.sourceId} -> ${edge.targetId}`,
    );
    return;
  }
  const endpoint =
    endpointName === "source"
      ? edge.renderedSourceEndpoint
      : edge.renderedTargetEndpoint;
  const position = node.renderedPosition;
  const size = node.renderedSize;
  if (
    ![
      endpoint?.x,
      endpoint?.y,
      position?.x,
      position?.y,
      size?.width,
      size?.height,
    ].every(Number.isFinite)
  ) {
    issues.push(
      `rendered ${endpointName} geometry is incomplete for edge: ${edge.sourceId} -> ${edge.targetId}`,
    );
    return;
  }
  const normalizedDistance = Math.hypot(
    (endpoint.x - position.x) / Math.max(size.width / 2, 1),
    (endpoint.y - position.y) / Math.max(size.height / 2, 1),
  );
  if (normalizedDistance < 0.7) {
    issues.push(
      `rendered edge ends inside its ${endpointName} node: ${edge.sourceId} -> ${edge.targetId}`,
    );
  }
  if (normalizedDistance > 1.35) {
    issues.push(
      `rendered edge misses its ${endpointName} node: ${edge.sourceId} -> ${edge.targetId}`,
    );
  }
}

function assertDiagnosticGapMetadata(edge, source, target, label, issues) {
  if (!source || !target) {
    return;
  }
  const expected = Array.from(
    { length: Math.max(target.timestep - source.timestep - 1, 0) },
    (_, index) => source.timestep + index + 1,
  );
  const actual = Array.isArray(edge.gapTimesteps) ? edge.gapTimesteps : [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(
      `${label} has wrong bounded-gap metadata: ${edge.sourceId} -> ${edge.targetId}`,
    );
  }
  const expectedLabel =
    expected.length === 0
      ? ""
      : expected.length === 1
        ? `t${expected[0]} empty`
        : `t${expected[0]}–t${expected.at(-1)} empty`;
  if (String(edge.label ?? "") !== expectedLabel) {
    issues.push(
      `${label} has wrong bounded-gap label: ${edge.sourceId} -> ${edge.targetId}`,
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function range(first, last) {
  return Array.from(
    { length: Math.max(last - first + 1, 0) },
    (_, index) => first + index,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
