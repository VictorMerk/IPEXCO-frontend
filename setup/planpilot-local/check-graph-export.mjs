import { readFileSync } from 'node:fs';
import { validateConstraintSnapshot } from './lib/diagnostic-contract.mjs';

const filename = process.argv[2];
if (!filename || process.argv.length !== 3) {
  console.error('Usage: node check-graph-export.mjs <graph-export.json|->');
  process.exit(2);
}

let payload;
try {
  const input = filename === '-' ? readFileSync(0, 'utf8') : readFileSync(filename, 'utf8');
  payload = JSON.parse(input);
} catch (error) {
  console.error(`Could not read graph export: ${error.message}`);
  process.exit(2);
}

const issues = [];
const facets = requireArray(payload.facets, 'facets');
const solution = requireArray(payload.representativeSolution, 'representativeSolution');
const connections = requireArray(payload.connections, 'connections');
const renderedNodes = requireArray(payload.renderedGraph?.nodes, 'renderedGraph.nodes');
const renderedEdges = requireArray(payload.renderedGraph?.edges, 'renderedGraph.edges');
const omittedFacetIds = requireArray(payload.integrity?.omittedFacetIds, 'integrity.omittedFacetIds');
const reportedIntegrityIssues = requireArray(payload.integrity?.issues, 'integrity.issues');
const semanticSnapshot = validateConstraintSnapshot(payload, { label: 'export' });
issues.push(...semanticSnapshot.issues);

if (payload.schemaVersion !== 'ipexco-planpilot-graph-diagnostic-v4') {
  issues.push(`unexpected schema version: ${payload.schemaVersion ?? 'missing'}`);
}
if (payload.ui?.connectionModel !== 'representative-solution-only') {
  issues.push(`unexpected connection model: ${payload.ui?.connectionModel ?? 'missing'}`);
}

const facetIds = uniqueIds(facets, 'facet');
const solutionIds = uniqueIds(solution, 'representative solution');
const solutionIdSet = new Set(solutionIds);
const solutionById = new Map(solution.map((facet) => [facet.id, facet]));
const renderedNodeIds = uniqueIds(renderedNodes, 'rendered node');
const renderedNodeIdSet = new Set(renderedNodeIds);
const renderedNodeById = new Map(renderedNodes.map((node) => [node.id, node]));
const omittedIdSet = new Set(omittedFacetIds);
if (omittedIdSet.size !== omittedFacetIds.length) {
  issues.push('integrity.omittedFacetIds contains duplicates');
}

for (const id of solutionIds) {
  if (!facetIds.includes(id)) {
    issues.push(`representative action is absent from facets: ${id}`);
  }
  if (omittedIdSet.has(id)) {
    issues.push(`representative action was omitted from the graph: ${id}`);
  }
}
for (const id of omittedFacetIds) {
  if (!facetIds.includes(id)) {
    issues.push(`omitted facet id is absent from facets: ${id}`);
  }
  if (renderedNodeIdSet.has(id)) {
    issues.push(`omitted facet was still rendered: ${id}`);
  }
}
for (const id of facetIds) {
  if (!omittedIdSet.has(id) && !renderedNodeIdSet.has(id)) {
    issues.push(`non-omitted facet was not rendered: ${id}`);
  }
}
for (const id of renderedNodeIds) {
  if (id !== '__session__' && id !== '__goal__' && !facetIds.includes(id)) {
    issues.push(`rendered node is absent from facets: ${id}`);
  }
}

for (const facet of facets) {
  const node = renderedNodeById.get(facet.id);
  if (!node) {
    continue;
  }
  const classes = new Set(node.classes ?? []);
  if (solutionIdSet.has(facet.id) && !classes.has('solution-path')) {
    issues.push(`displayed plan action has no solution-path class: ${facet.id}`);
  }
  if (!solutionIdSet.has(facet.id) && classes.has('solution-path')) {
    issues.push(`non-displayed facet has solution-path class: ${facet.id}`);
  }
  if (facet.abstractTimeStep) {
    if (/\bt0\b/i.test(String(node.label ?? ''))) {
      issues.push(`any-step facet is displayed as t0: ${facet.id}`);
    }
    if (!/any step/i.test(String(node.label ?? ''))) {
      issues.push(`any-step facet has no plan-wide label: ${facet.id}`);
    }
  }
}
for (const syntheticId of ['__session__', '__goal__']) {
  if (!renderedNodeIdSet.has(syntheticId)) {
    issues.push(`rendered graph is missing ${syntheticId}`);
  }
}

const timesteps = [];
for (const [index, action] of solution.entries()) {
  const expectedParentId = index === 0 ? undefined : solution[index - 1]?.id;
  const actualParentId = action.parentId ?? undefined;
  if (actualParentId !== expectedParentId) {
    issues.push(
      `wrong parent for ${action.id}: expected ${expectedParentId ?? 'none'}, got ${actualParentId ?? 'none'}`,
    );
  }
  if (action.facetType !== 'plan') {
    issues.push(`representative action is not marked as plan: ${action.id}`);
  }
  if (Number.isSafeInteger(action.timestep) && action.timestep > 0) {
    timesteps.push(action.timestep);
  } else if (!payload.session?.abstractTimeSteps) {
    issues.push(`representative action has no positive integer timestep: ${action.id}`);
  }
}
for (let index = 1; index < timesteps.length; index += 1) {
  if (timesteps[index] <= timesteps[index - 1]) {
    issues.push(`representative timesteps are not strictly increasing at t${timesteps[index]}`);
  }
}
const horizon = payload.session?.horizon;
if (!Number.isSafeInteger(horizon) || horizon < 1) {
  issues.push('session horizon must be a positive integer');
} else {
  for (const timestep of timesteps) {
    if (timestep > horizon) {
      issues.push(`representative action at t${timestep} exceeds horizon ${horizon}`);
    }
  }
}
const timestepSet = new Set(timesteps);
const timelineGaps = timesteps.length
  ? range(timesteps[0], timesteps[timesteps.length - 1]).filter((step) => !timestepSet.has(step))
  : [];

const expectedConnections = solution.length
  ? [
    ['__session__', solution[0].id],
    ...solution.slice(1).map((action, index) => [solution[index].id, action.id]),
    [solution[solution.length - 1].id, '__goal__'],
  ]
  : [];
const expectedConnectionKeys = new Set(expectedConnections.map(([source, target]) => edgeKey(source, target)));
const connectionKeys = validateEdges(connections, 'connection');
const connectionKeySet = new Set(connectionKeys);

for (const [sourceId, targetId] of expectedConnections) {
  if (!connectionKeySet.has(edgeKey(sourceId, targetId))) {
    issues.push(`missing representative edge: ${sourceId} -> ${targetId}`);
  }
}
for (const connection of connections) {
  const key = edgeKey(connection.sourceId, connection.targetId);
  if (!expectedConnectionKeys.has(key)) {
    issues.push(`unexpected edge outside the representative path: ${connection.sourceId} -> ${connection.targetId}`);
  }
  if (connection.kind !== 'plan') {
    issues.push(`connection is not marked as plan: ${connection.sourceId} -> ${connection.targetId}`);
  }
  for (const id of [connection.sourceId, connection.targetId]) {
    if (id !== '__session__' && id !== '__goal__' && !solutionIdSet.has(id)) {
      issues.push(`edge touches an alternative facet: ${connection.sourceId} -> ${connection.targetId}`);
      break;
    }
  }
  assertGapMetadata(
    connection,
    solutionById.get(connection.sourceId),
    solutionById.get(connection.targetId),
    'connection',
  );
}

const renderedEdgeKeys = validateEdges(renderedEdges, 'rendered edge');
const renderedEdgeKeySet = new Set(renderedEdgeKeys);
for (const key of connectionKeySet) {
  if (!renderedEdgeKeySet.has(key)) {
    issues.push(`connection was not rendered: ${key.replace('\u0000', ' -> ')}`);
  }
}
for (const edge of renderedEdges) {
  const key = edgeKey(edge.sourceId, edge.targetId);
  if (!connectionKeySet.has(key)) {
    issues.push(`rendered edge is absent from connections: ${edge.sourceId} -> ${edge.targetId}`);
  }
  if (
    !edge.classes?.includes('plan-edge')
    || edge.sourceArrowShape !== 'none'
    || edge.targetArrowShape !== 'triangle'
  ) {
    issues.push(`rendered edge has no directed plan styling: ${edge.sourceId} -> ${edge.targetId}`);
  }
  assertEdgeEndpoint(edge, renderedNodeById.get(edge.sourceId), 'source');
  assertEdgeEndpoint(edge, renderedNodeById.get(edge.targetId), 'target');
  assertGapMetadata(
    edge,
    solutionById.get(edge.sourceId),
    solutionById.get(edge.targetId),
    'rendered edge',
  );
}

compareCount('integrity.backendFacetCount', payload.integrity?.backendFacetCount, facets.length);
compareCount(
  'integrity.graphFacetCount',
  payload.integrity?.graphFacetCount,
  facets.length - omittedIdSet.size,
);
compareCount('integrity.connectionCount', payload.integrity?.connectionCount, connections.length);
compareCount('rendered node count', renderedNodes.length, facets.length - omittedIdSet.size + 2);
compareCount('rendered edge count', renderedEdges.length, connections.length);
if (reportedIntegrityIssues.length) {
  issues.push(`export already reports integrity issues: ${reportedIntegrityIssues.join('; ')}`);
}

const viewport = payload.renderedGraph?.viewport;
const offscreenNodeIds = renderedNodes
  .filter((node) => isOutsideViewport(node, viewport))
  .map((node) => node.id);
const displayedPlanIdSet = new Set(['__session__', ...solutionIds, '__goal__']);
const offscreenDisplayedPlanNodeIds = offscreenNodeIds.filter((id) => displayedPlanIdSet.has(id));
for (const id of offscreenDisplayedPlanNodeIds) {
  issues.push(`displayed plan node is outside the recorded viewport: ${id}`);
}
const warnings = offscreenNodeIds.length
  ? [`${offscreenNodeIds.length} rendered nodes are outside the recorded viewport`]
  : [];
const summary = {
  status: issues.length ? 'invalid' : 'valid',
  schemaVersion: payload.schemaVersion ?? null,
  encoding: payload.session?.encoding ?? null,
  horizon: Number.isSafeInteger(horizon) ? horizon : null,
  facetCount: facets.length,
  graphFacetCount: payload.integrity?.graphFacetCount ?? null,
  omittedFacetCount: omittedIdSet.size,
  representativeActionCount: solution.length,
  connectionCount: connections.length,
  timeline: timesteps.map((step) => `t${step}`),
  boundedTimelineGaps: timelineGaps.map((step) => `t${step}`),
  offscreenNodeCount: offscreenNodeIds.length,
  offscreenNodeIds,
  offscreenDisplayedPlanNodeCount: offscreenDisplayedPlanNodeIds.length,
  offscreenDisplayedPlanNodeIds,
  warnings,
  constraints: {
    positiveIds: semanticSnapshot.positiveIds,
    negativeIds: semanticSnapshot.negativeIds,
    displayedSolutionIds: semanticSnapshot.displayedSolutionIds,
  },
  effectiveNodeStyles: semanticSnapshot.effectiveStyles,
  issues,
};

console.log(JSON.stringify(summary, null, 2));
if (issues.length) {
  process.exitCode = 1;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    issues.push(`${name} must be an array`);
    return [];
  }
  return value;
}

function uniqueIds(items, label) {
  const ids = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      issues.push(`${label} has no id`);
      continue;
    }
    if (seen.has(item.id)) {
      issues.push(`duplicate ${label} id: ${item.id}`);
    }
    seen.add(item.id);
    ids.push(item.id);
  }
  return ids;
}

function validateEdges(edges, label) {
  const keys = [];
  const seen = new Set();
  for (const edge of edges) {
    if (typeof edge?.sourceId !== 'string' || typeof edge?.targetId !== 'string') {
      issues.push(`${label} has an invalid source or target`);
      continue;
    }
    const key = edgeKey(edge.sourceId, edge.targetId);
    if (seen.has(key)) {
      issues.push(`duplicate ${label}: ${edge.sourceId} -> ${edge.targetId}`);
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function compareCount(name, actual, expected) {
  if (actual !== expected) {
    issues.push(`${name} is ${String(actual)}, expected ${expected}`);
  }
}

function edgeKey(sourceId, targetId) {
  return `${sourceId}\u0000${targetId}`;
}

function range(first, last) {
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, index) => first + index);
}

function isOutsideViewport(node, viewport) {
  const position = node?.renderedPosition;
  const size = node?.renderedSize;
  if (![position?.x, position?.y, size?.width, size?.height, viewport?.width, viewport?.height]
    .every(Number.isFinite)) {
    return false;
  }
  return position.x - (size.width / 2) < 0
    || position.y - (size.height / 2) < 0
    || position.x + (size.width / 2) > viewport.width
    || position.y + (size.height / 2) > viewport.height;
}

function assertEdgeEndpoint(edge, node, endpointName) {
  if (!node) {
    issues.push(`rendered ${endpointName} node is missing for edge: ${edge.sourceId} -> ${edge.targetId}`);
    return;
  }
  const endpoint = endpointName === 'source'
    ? edge.renderedSourceEndpoint
    : edge.renderedTargetEndpoint;
  const position = node.renderedPosition;
  const size = node.renderedSize;
  if (![endpoint?.x, endpoint?.y, position?.x, position?.y, size?.width, size?.height]
    .every(Number.isFinite)) {
    issues.push(`rendered ${endpointName} geometry is incomplete for edge: ${edge.sourceId} -> ${edge.targetId}`);
    return;
  }
  const normalizedDistance = Math.hypot(
    (endpoint.x - position.x) / Math.max(size.width / 2, 1),
    (endpoint.y - position.y) / Math.max(size.height / 2, 1),
  );
  if (normalizedDistance < 0.7) {
    issues.push(`rendered edge ends inside its ${endpointName} node: ${edge.sourceId} -> ${edge.targetId}`);
  }
  if (normalizedDistance > 1.35) {
    issues.push(`rendered edge misses its ${endpointName} node: ${edge.sourceId} -> ${edge.targetId}`);
  }
}

function assertGapMetadata(edge, source, target, label) {
  if (!source || !target) {
    return;
  }
  const expected = range(source.timestep + 1, target.timestep - 1);
  const actual = Array.isArray(edge.gapTimesteps) ? edge.gapTimesteps : [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(
      `${label} has wrong bounded-gap metadata: ${edge.sourceId} -> ${edge.targetId}; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  const expectedLabel = expected.length === 0
    ? ''
    : expected.length === 1
      ? `t${expected[0]} empty`
      : `t${expected[0]}–t${expected.at(-1)} empty`;
  if (String(edge.label ?? '') !== expectedLabel) {
    issues.push(
      `${label} has wrong bounded-gap label: ${edge.sourceId} -> ${edge.targetId}; expected ${JSON.stringify(expectedLabel)}, got ${JSON.stringify(edge.label ?? '')}`,
    );
  }
}
