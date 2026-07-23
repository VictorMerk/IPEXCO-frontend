import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backendSolutionSteps,
  parseStripsTask,
  validateStripsPlan,
} from './lib/strips-validator.mjs';

const serviceUrl = (process.env.PLANPILOT_URL ?? 'http://127.0.0.1:5000').replace(/\/+$/, '');
const apiKey = process.env.PLANPILOT_API_KEY ?? 'test';
const fixtureDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../example_data/planpilot-demo',
);
const domainPddl = readFileSync(resolve(fixtureDirectory, 'domain-planpilot-towers.pddl'), 'utf8');
const problemPddl = readFileSync(resolve(fixtureDirectory, 'problem-planpilot-towers-4.pddl'), 'utf8');
const stripsTask = parseStripsTask(domainPddl, problemPddl);
const liveSessions = new Set();
const results = [];
const representativePlan = [
  { name: 'unstack', params: ['a', 'b'] },
  { name: 'put-down', params: ['a'] },
  { name: 'unstack', params: ['b', 'c'] },
  { name: 'stack', params: ['b', 'a'] },
  { name: 'pick-up', params: ['c'] },
  { name: 'stack', params: ['c', 'b'] },
  { name: 'pick-up', params: ['d'] },
  { name: 'stack', params: ['d', 'c'] },
];

try {
  const health = await request('/api/health', { authenticated: false });
  equal(health.status, 200, 'health status');
  const capacity = health.body.capacity;
  assert(capacity.acceptingNewSessions, 'service must accept new sessions before the matrix starts');

  await checkRequestValidation();
  await checkCreationConcurrency(capacity.maxConcurrentCreations);
  await checkActiveSessionLimit(capacity.maxActiveSessions);
  await checkExactSession();
  await checkBoundedSession();
  await checkAbstractTimeSession();
  await checkStateFacetSession();

  const finalHealth = await request('/api/health', { authenticated: false });
  equal(finalHealth.body.capacity.activeSessions, 0, 'active sessions after cleanup');
  equal(finalHealth.body.capacity.activeCreations, 0, 'active creations after cleanup');
  record('final cleanup', finalHealth.body.capacity);
  console.log(JSON.stringify({ status: 'passed', results }, null, 2));
} finally {
  await Promise.allSettled([...liveSessions].map((sessionId) => stopSession(sessionId)));
}

async function checkRequestValidation() {
  const unauthorized = await request('/api/sessions', {
    authenticated: false,
    method: 'POST',
    body: sessionPayload('exact', 8),
  });
  equal(unauthorized.status, 401, 'unauthenticated creation');

  const invalid = sessionPayload('exact', 8);
  invalid.configuration.horizon = 0;
  const invalidResponse = await request('/api/sessions', { method: 'POST', body: invalid });
  assertError(invalidResponse, 400, 'INVALID_REQUEST');

  const tooShort = await request('/api/sessions', {
    method: 'POST',
    body: sessionPayload('exact', 7),
    timeout: 180_000,
  });
  equal(tooShort.status, 201, 'minimum-horizon promotion');
  remember(tooShort);
  equal(tooShort.body.minimumHorizon, 8, 'discovered minimum horizon');
  equal(tooShort.body.configuration.horizon, 8, 'effective promoted horizon');
  await stopSession(tooShort.body.sessionId);
  record('authentication and validation', {
    unauthenticated: unauthorized.status,
    invalidHorizon: invalidResponse.status,
    promotedExactHorizon: tooShort.body.configuration.horizon,
  });
}

async function checkCreationConcurrency(maxConcurrentCreations) {
  if (maxConcurrentCreations !== 1) {
    record('creation concurrency', { skipped: `configured limit is ${maxConcurrentCreations}` });
    return;
  }
  const requests = [1, 2].map(() => request('/api/sessions', {
    method: 'POST',
    body: sessionPayload('exact', 8),
    timeout: 180_000,
  }));
  const responses = await Promise.all(requests);
  const created = responses.filter((response) => response.status === 201);
  const busy = responses.filter(
    (response) => response.status === 503 && response.body?.error?.code === 'PLANPILOT_BUSY',
  );
  equal(created.length, 1, 'concurrent accepted creations');
  equal(busy.length, 1, 'concurrent rejected creations');
  remember(created[0]);
  await stopSession(created[0].body.sessionId);
  record('creation concurrency', { accepted: 1, rejectedAsBusy: 1 });
}

async function checkActiveSessionLimit(maxActiveSessions) {
  assert(Number.isSafeInteger(maxActiveSessions) && maxActiveSessions > 0, 'invalid active-session limit');
  const held = [];
  try {
    for (let index = 0; index < maxActiveSessions; index += 1) {
      const response = await createSession('exact', 8);
      held.push(response.body.sessionId);
    }
    const healthAtLimit = await request('/api/health', { authenticated: false });
    equal(healthAtLimit.body.capacity.activeSessions, maxActiveSessions, 'active sessions at limit');
    equal(healthAtLimit.body.capacity.acceptingNewSessions, false, 'capacity flag at limit');

    const readyAtLimit = await request('/api/ready', { authenticated: false });
    equal(readyAtLimit.status, 503, 'readiness at active-session limit');
    equal(readyAtLimit.body.status, 'at-capacity', 'readiness reason at limit');
    equal(readyAtLimit.headers.get('retry-after'), '5', 'readiness retry header');

    const overflow = await request('/api/sessions', {
      method: 'POST',
      body: sessionPayload('exact', 8),
      timeout: 180_000,
    });
    assertError(overflow, 503, 'PLANPILOT_SESSION_LIMIT');
    await stopSession(held.pop());
    const recovered = await createSession('exact', 8);
    held.push(recovered.body.sessionId);
    equal(recovered.status, 201, 'creation after releasing one active session');
    record('active session limit', {
      held: maxActiveSessions,
      overflow: overflow.status,
      recoveredAfterRelease: true,
    });
  } finally {
    await Promise.allSettled(held.map((sessionId) => stopSession(sessionId)));
  }
}

async function checkExactSession() {
  const response = await createSession('exact', 8);
  const session = response.body;
  equal(session.minimumHorizon, 8, 'exact minimum horizon');
  equal(session.configuration.encoding, 'exact', 'exact encoding');
  const ids = validateSolution(session.solution, { exactHorizon: 8 });
  deepEqual(
    session.solution.facets.map((facet) => ({ name: facet.action.name, params: facet.action.arguments })),
    representativePlan,
    'exact representative plan actions',
  );
  equal(session.facets.length, 8, 'exact facet count');
  assert(session.facets.every((facet) => facet.facetType === 'plan'), 'exact facets must be plan actions');
  assert(
    session.facets.every((facet) => facet.selectionState === 'neutral'),
    'exact fixed actions must not be reported as user constraints',
  );
  deepEqual(
    session.facets.map((facet) => facet.id).sort(),
    [...ids].sort(),
    'exact fixed actions and solution actions',
  );

  const listed = await request(`/api/sessions/${session.sessionId}/facets/list`, {
    method: 'POST',
    body: {},
  });
  equal(listed.status, 200, 'exact facet list');
  deepEqual(listed.body.facets.map((facet) => facet.id), ids, 'exact create/list facet IDs');

  const queried = await query(session.sessionId, 'solution', 1);
  const queriedIds = validateSolution(queried.solutions[0], { exactHorizon: 8 });
  deepEqual(queriedIds, ids, 'exact create/query solution IDs');
  await checkQueryTypes(session.sessionId);

  await stopSession(session.sessionId);
  const missing = await request(`/api/sessions/${session.sessionId}`);
  assertError(missing, 404, 'SESSION_NOT_FOUND');
  const secondDelete = await request(`/api/sessions/${session.sessionId}`, { method: 'DELETE' });
  assertError(secondDelete, 404, 'SESSION_NOT_FOUND');
  record('exact session and lifecycle', { actions: ids.length, timesteps: 't1-t8' });
}

async function checkBoundedSession() {
  const response = await createSession('bounded', 10);
  const session = response.body;
  equal(session.configuration.encoding, 'bounded', 'bounded encoding');
  const initialIds = validateSolution(session.solution, { maximumHorizon: 10 });
  assert(initialIds.length >= 8, 'bounded representative solution is unexpectedly short');
  assert(session.facets.length > initialIds.length, 'bounded session has no alternatives');

  const optional = session.facets.filter(
    (facet) => facet.facetType === 'optional' && facet.selectable && facet.selectionState === 'neutral',
  );
  assert(optional.length >= 2, 'bounded session needs at least two selectable alternatives');
  const include = optional[0];
  const impact = await query(
    session.sessionId,
    'selectionImpact',
    undefined,
    include.id,
  );
  equal(impact.facetId, include.id, 'targeted impact facet');
  equal(impact.exact, true, 'targeted impact exact result');
  equal(impact.comparableToCurrent, true, 'targeted impact relation');
  equal(
    impact.require.plansRemaining + impact.forbid.plansRemaining,
    impact.totalPlans,
    'targeted impact partition',
  );
  const included = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: [
        { facetId: include.id, selectionState: 'positive', previousSelectionState: 'neutral' },
      ],
    },
    timeout: 60_000,
  });
  if (included.status !== 200) {
    throw new Error(`include apply: expected HTTP 200, got ${included.status} ${JSON.stringify(included.body)}`);
  }
  const includedIds = validateSolution(included.body.solution, { maximumHorizon: 10 });
  assert(includedIds.includes(include.id), 'included facet is absent from rebuilt solution');
  equal(facetState(included.body.facets, include.id), 'positive', 'positive selection state');
  equal(facetById(included.body.facets, include.id).facetType, 'selected', 'included facet type');
  equal(facetById(included.body.facets, include.id).selectable, true, 'included facet selectability');
  const listedAfterInclude = await request(`/api/sessions/${session.sessionId}/facets/list`, {
    method: 'POST',
    body: {},
  });
  equal(listedAfterInclude.status, 200, 'facet list after include');
  equal(facetById(listedAfterInclude.body.facets, include.id).facetType, 'selected', 'persisted included facet type');
  equal(facetState(listedAfterInclude.body.facets, include.id), 'positive', 'persisted included state');

  const includeReset = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: [
        { facetId: include.id, selectionState: 'neutral', previousSelectionState: 'positive' },
      ],
    },
    timeout: 60_000,
  });
  equal(includeReset.status, 200, 'include reset');

  const mixedExclude = optional.find((facet) => (
    facet.id !== include.id
    && facet.facetType === 'optional'
    && facet.selectable
    && facet.selectionState === 'neutral'
    && !includedIds.includes(facet.id)
  ));
  assert(mixedExclude, 'mixed selection needs a safe forbidden action');
  const mixed = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: [
        { facetId: include.id, selectionState: 'positive', previousSelectionState: 'neutral' },
        { facetId: mixedExclude.id, selectionState: 'negative', previousSelectionState: 'neutral' },
      ],
    },
    timeout: 60_000,
  });
  equal(mixed.status, 200, 'mixed include/forbid apply');
  const mixedIds = validateSolution(mixed.body.solution, { maximumHorizon: 10 });
  assert(mixedIds.includes(include.id), 'mixed required action is absent from the solution');
  assert(!mixedIds.includes(mixedExclude.id), 'mixed forbidden action is present in the solution');
  const mixedReset = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: [
        { facetId: include.id, selectionState: 'neutral', previousSelectionState: 'positive' },
        { facetId: mixedExclude.id, selectionState: 'neutral', previousSelectionState: 'negative' },
      ],
    },
    timeout: 60_000,
  });
  equal(mixedReset.status, 200, 'mixed selection reset');

  const exclusions = optional
    .filter((facet) => facet.id !== include.id && !initialIds.includes(facet.id))
    .slice(0, 2);
  equal(exclusions.length, 2, 'safe exclusion candidate count');
  const applied = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: exclusions.map((facet) => ({
        facetId: facet.id,
        selectionState: 'negative',
        previousSelectionState: 'neutral',
      })),
    },
    timeout: 60_000,
  });
  if (applied.status !== 200) {
    throw new Error(`exclude apply: expected HTTP 200, got ${applied.status} ${JSON.stringify(applied.body)}`);
  }
  const selectedIds = validateSolution(applied.body.solution, { maximumHorizon: 10 });
  for (const excluded of exclusions) {
    assert(!selectedIds.includes(excluded.id), 'excluded facet is present in rebuilt solution');
    equal(facetState(applied.body.facets, excluded.id), 'negative', 'negative selection state');
  }

  const stale = await request(`/api/sessions/${session.sessionId}/facets/select`, {
    method: 'POST',
    body: {
      facetId: exclusions[0].id,
      selectionState: 'positive',
      previousSelectionState: 'neutral',
    },
  });
  assertError(stale, 409, 'SELECTION_CONFLICT');

  const reset = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: exclusions.map((facet) => ({
        facetId: facet.id,
        selectionState: 'neutral',
        previousSelectionState: 'negative',
      })),
    },
    timeout: 60_000,
  });
  equal(reset.status, 200, 'selection reset');
  for (const excluded of exclusions) {
    equal(facetState(reset.body.facets, excluded.id), 'neutral', 'excluded facet reset state');
  }

  const firstSolution = await query(session.sessionId, 'solution', 1);
  const secondSolution = await query(session.sessionId, 'solution', 2);
  const firstIds = validateSolution(firstSolution.solutions[0], { maximumHorizon: 10 });
  const secondIds = validateSolution(secondSolution.solutions[0], { maximumHorizon: 10 });
  assert(firstIds.join('\n') !== secondIds.join('\n'), 'solution 1 and solution 2 are identical');
  const planCount = await query(session.sessionId, 'solutionCount');
  assert(planCount.value >= 25, 'bounded demo needs at least 25 plans');
  const twentyFive = await query(session.sessionId, 'solution', 25);
  const twentyOne = await query(session.sessionId, 'solution', 21);
  validateSolution(twentyFive.solutions[0], { maximumHorizon: 10 });
  validateSolution(twentyOne.solutions[0], { maximumHorizon: 10 });

  await stopSession(session.sessionId);
  record('bounded selections and solutions', {
    facets: session.facets.length,
    alternatives: optional.length,
    included: include.id,
    excluded: exclusions.map((facet) => facet.id),
    impactPlans: impact.totalPlans,
    representativeTimesteps: session.solution.facets.map((facet) => facet.timestep),
    distinctSolutionsQueried: 4,
    highestPlanQueried: 25,
  });
}

async function checkAbstractTimeSession() {
  const response = await createSession('bounded', 10, true);
  const session = response.body;
  equal(session.configuration.abstractTimeSteps, true, 'abstract-time configuration');
  validateSolution(session.solution, { maximumHorizon: 10 });
  const abstractFacets = session.facets.filter((facet) => facet.abstractTimeStep === true);
  assert(abstractFacets.length > 0, 'abstract-time session returned no abstract facets');
  assert(
    abstractFacets.every((facet) => facet.timestep === null && facet.id.startsWith('occurs_sometime(')),
    'abstract facets must have no invented concrete timestep',
  );
  assert(
    session.facets.every((facet) => facet.timestep === null || facet.timestep > 0),
    'abstract-time sessions must never expose a concrete t0 facet',
  );
  const implied = abstractFacets.filter((facet) => facet.facetType === 'implied');
  assert(implied.length > 0, 'abstract-time session returned no implied facets');
  assert(
    implied.every((facet) => facet.selectionState === 'neutral' && facet.selectable === false),
    'implied abstract facets must be neutral and non-selectable',
  );
  const optional = abstractFacets.filter(
    (facet) => facet.facetType === 'optional' && facet.selectionState === 'neutral' && facet.selectable,
  );
  assert(optional.length > 0, 'abstract-time session returned no selectable any-step facet');
  const queriedPlans = await Promise.all(range(1, 5).map(
    (solutionNumber) => query(session.sessionId, 'solution', solutionNumber),
  ));
  const queriedPlanSizes = queriedPlans.map((queried, index) => {
    const solutionNumber = index + 1;
    equal(queried.solutions.length, 1, `abstract solution ${solutionNumber} result count`);
    return validateSolution(queried.solutions[0], { maximumHorizon: 10 }).length;
  });
  assert(optional.length >= 2, 'abstract-time session needs two selectable any-step facets');
  const selectedFlexibleFacets = [
    optional.find((facet) => facet.action?.name === 'pick-up' && facet.action?.arguments?.[0] === 'b'),
    optional.find((facet) => facet.action?.name === 'put-down' && facet.action?.arguments?.[0] === 'b'),
  ];
  assert(
    selectedFlexibleFacets.every(Boolean),
    'demo fixture does not expose the compatible pick-up/put-down b any-step pair',
  );
  const included = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: selectedFlexibleFacets.map((facet) => ({
        facetId: facet.id,
        selectionState: 'positive',
        previousSelectionState: 'neutral',
      })),
    },
    timeout: 60_000,
  });
  equal(included.status, 200, 'two any-step includes');
  validateSolution(included.body.solution, { maximumHorizon: 10 });
  for (const flexibleFacet of selectedFlexibleFacets) {
    const selectedAnyStep = facetById(included.body.facets, flexibleFacet.id);
    equal(selectedAnyStep.facetType, 'selected', 'included any-step facet type');
    equal(selectedAnyStep.selectionState, 'positive', 'included any-step state');
    equal(selectedAnyStep.abstractTimeStep, true, 'included any-step marker');
    equal(selectedAnyStep.selectable, true, 'included any-step selectability');
    assert(
      included.body.solution.facets.some((planFacet) => sameAction(planFacet, flexibleFacet)),
      `selected any-step action is absent from the rebuilt plan: ${flexibleFacet.id}`,
    );
  }
  const cleared = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      selections: selectedFlexibleFacets.map((facet) => ({
        facetId: facet.id,
        selectionState: 'neutral',
        previousSelectionState: 'positive',
      })),
    },
    timeout: 60_000,
  });
  equal(cleared.status, 200, 'two any-step clears');
  for (const flexibleFacet of selectedFlexibleFacets) {
    equal(facetState(cleared.body.facets, flexibleFacet.id), 'neutral', 'cleared any-step state');
  }
  await stopSession(session.sessionId);
  record('abstract-time facets', {
    totalFacets: session.facets.length,
    abstractFacets: abstractFacets.length,
    impliedAbstractFacets: implied.length,
    queriedPlanSizes,
    includeAndClearVerified: selectedFlexibleFacets.map((facet) => facet.id),
  });
}

async function checkStateFacetSession() {
  const payload = sessionPayload('bounded', 10);
  payload.configuration.stateFacets = true;
  const response = await request('/api/sessions', {
    method: 'POST',
    body: payload,
    timeout: 180_000,
  });
  equal(response.status, 201, 'state-facet session creation');
  remember(response);

  const session = response.body;
  equal(session.configuration.stateFacets, true, 'state-facet configuration');
  const stateFacets = session.facets.filter((facet) => facet.facetKind === 'state');
  assert(stateFacets.length > 0, 'state-facet session returned no states');
  assert(
    stateFacets.every((facet) => Number.isSafeInteger(facet.timestep) && facet.timestep >= 0),
    'state facets must keep their concrete state timestep',
  );

  const simultaneous = ['clear(a)', 'clear(d)'].map((label) =>
    stateFacets.find((facet) => facet.label === label && facet.timestep === 1),
  );
  assert(simultaneous.every(Boolean), 'demo fixture is missing the simultaneous clear states');
  const applied = await request(`/api/sessions/${session.sessionId}/facets/apply`, {
    method: 'POST',
    body: {
      expectedSelectionRevision: 0,
      selections: simultaneous.map((facet) => ({
        facetId: facet.id,
        selectionState: 'positive',
        previousSelectionState: 'neutral',
      })),
    },
    timeout: 60_000,
  });
  equal(applied.status, 200, 'simultaneous state selection');
  for (const state of simultaneous) {
    equal(facetState(applied.body.facets, state.id), 'positive', 'selected state');
  }

  const prefix = await query(session.sessionId, 'solution', 3, undefined, 'prefix');
  deepEqual(
    prefix.solutions.map((solution) => solution.label),
    ['solution 1', 'solution 2', 'solution 3'],
    'plan-list solution prefix',
  );

  await stopSession(session.sessionId);
  record('state facets and plan-list prefix', {
    stateFacets: stateFacets.length,
    simultaneousSelections: simultaneous.map((facet) => facet.label),
    prefixPlans: prefix.solutions.length,
  });
}

async function checkQueryTypes(sessionId) {
  const values = {};
  for (const type of [
    'facets',
    'facetCount',
    'facetReduction',
    'impliedFacets',
    'solutionCount',
    'solutionReduction',
  ]) {
    const response = await query(sessionId, type);
    equal(response.type, type, `${type} response type`);
    if (type === 'facetReduction' || type === 'solutionReduction') {
      validateImpactMetrics(response.facets, type);
    }
    if (type === 'impliedFacets') {
      assert(
        response.facets.every((facet) => (
          facet.facetType === 'implied'
          && facet.selectionState === 'neutral'
          && facet.selectable === false
        )),
        'implied facets must be neutral and read-only',
      );
    }
    values[type] = response.value ?? response.facets?.length ?? null;
  }
  return values;
}

function validateImpactMetrics(facets, queryType) {
  assert(Array.isArray(facets), `${queryType} must return facets`);
  for (const facet of facets) {
    for (const pair of Object.values(facet.reduction ?? {})) {
      for (const value of Object.values(pair)) {
        assert(
          value === null || (typeof value === 'number' && value >= 0 && value <= 1),
          `${queryType} returned a reduction outside 0..1`,
        );
      }
    }
    for (const pair of Object.values(facet.remaining ?? {})) {
      for (const value of Object.values(pair)) {
        assert(
          value === null || (Number.isSafeInteger(value) && value >= 0),
          `${queryType} returned a non-integer remaining count`,
        );
      }
    }
  }
}

async function query(sessionId, type, solutionNumber, facetId, solutionMode) {
  const response = await request(`/api/sessions/${sessionId}/query`, {
    method: 'POST',
    body: {
      type,
      ...(solutionNumber === undefined ? {} : { solutionNumber }),
      ...(facetId === undefined ? {} : { facetId }),
      ...(solutionMode === undefined ? {} : { solutionMode }),
    },
    timeout: 60_000,
  });
  equal(response.status, 200, `${type} query`);
  return response.body.result;
}

function validateSolution(solution, { exactHorizon, maximumHorizon }) {
  assert(solution && Array.isArray(solution.facets) && solution.facets.length > 0, 'missing solution facets');
  const facets = solution.facets;
  const ids = facets.map((facet) => facet.id);
  equal(new Set(ids).size, ids.length, 'unique solution facet IDs');
  for (let index = 0; index < facets.length; index += 1) {
    const facet = facets[index];
    equal(facet.facetType, 'plan', `solution facet type at index ${index}`);
    const expectedParent = index === 0 ? undefined : facets[index - 1].id;
    equal(facet.parentId, expectedParent, `solution parent at index ${index}`);
    assert(Number.isSafeInteger(facet.timestep) && facet.timestep > 0, `invalid timestep at index ${index}`);
    if (index > 0) {
      assert(facet.timestep > facets[index - 1].timestep, `timesteps do not increase at index ${index}`);
    }
  }
  if (exactHorizon !== undefined) {
    deepEqual(facets.map((facet) => facet.timestep), range(1, exactHorizon), 'exact timesteps');
  }
  if (maximumHorizon !== undefined) {
    assert(facets.at(-1).timestep <= maximumHorizon, 'bounded solution exceeds horizon');
  }
  validateStripsPlan(stripsTask, backendSolutionSteps(solution));
  return ids;
}

function sameAction(left, right) {
  return left.action?.name === right.action?.name
    && JSON.stringify(left.action?.arguments ?? []) === JSON.stringify(right.action?.arguments ?? []);
}


async function createSession(
  encoding,
  horizon,
  abstractTimeSteps = false,
  suppliedRepresentativePlan,
) {
  const response = await request('/api/sessions', {
    method: 'POST',
    body: sessionPayload(encoding, horizon, abstractTimeSteps, suppliedRepresentativePlan),
    timeout: 180_000,
  });
  equal(response.status, 201, `${encoding} session creation`);
  remember(response);
  return response;
}

function remember(response) {
  if (response.body?.sessionId) {
    liveSessions.add(response.body.sessionId);
  }
}

async function stopSession(sessionId) {
  const response = await request(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  if (response.status !== 200 && response.status !== 404) {
    throw new Error(`could not stop ${sessionId}: HTTP ${response.status}`);
  }
  liveSessions.delete(sessionId);
  return response;
}

function sessionPayload(encoding, horizon, abstractTimeSteps = false, suppliedRepresentativePlan) {
  const payload = {
    task: { domainPddl, problemPddl },
    configuration: { horizon, encoding, abstractTimeSteps },
    source: { system: 'IPEXCO' },
  };
  if (suppliedRepresentativePlan) {
    payload.representativePlan = suppliedRepresentativePlan;
  }
  return payload;
}

function facetState(facets, facetId) {
  return facetById(facets, facetId).selectionState;
}

function facetById(facets, facetId) {
  const facet = facets.find((item) => item.id === facetId);
  assert(facet, `facet is absent from response: ${facetId}`);
  return facet;
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.authenticated !== false) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 15_000);
  try {
    const response = await fetch(`${serviceUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    return { status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

function assertError(response, status, code) {
  equal(response.status, status, `${code} status`);
  equal(response.body?.error?.code, code, `${code} code`);
}

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function record(name, evidence) {
  results.push({ name, evidence });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function deepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
