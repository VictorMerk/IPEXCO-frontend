const SEMANTIC_FIELDS = [
  'id',
  'label',
  'timestep',
  'action',
  'actionArguments',
  'abstractTimeStep',
  'selection',
  'selectable',
  'available',
  'facetType',
  'group',
  'nodeType',
  'parentId',
  'impliedBy',
  'causedBy',
  'remainingSolutions',
  'remainingFacets',
  'solutionReduction',
  'facetReduction',
];

export function compareFacetContract(backendFacets, exportedFacets, options = {}) {
  const backend = normalizeFacetList(backendFacets, normalizeBackendFacet, options);
  const exported = normalizeFacetList(exportedFacets, normalizeExportedFacet, options);
  const backendIds = [...backend.keys()].sort();
  const exportedIds = [...exported.keys()].sort();
  const issues = [];

  if (JSON.stringify(backendIds) !== JSON.stringify(exportedIds)) {
    const backendSet = new Set(backendIds);
    const exportedSet = new Set(exportedIds);
    issues.push(
      `facet IDs differ: backend-only=${JSON.stringify(backendIds.filter((id) => !exportedSet.has(id)))}, `
      + `export-only=${JSON.stringify(exportedIds.filter((id) => !backendSet.has(id)))}`,
    );
  }
  for (const id of backendIds.filter((candidate) => exported.has(candidate))) {
    for (const field of SEMANTIC_FIELDS) {
      const actual = exported.get(id)[field];
      const expected = backend.get(id)[field];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        issues.push(
          `${id} differs in ${field}: backend=${JSON.stringify(expected)}, export=${JSON.stringify(actual)}`,
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    facetCount: backendIds.length,
    comparedFields: SEMANTIC_FIELDS,
    normalization: {
      impliedSelection: 'compared without coercion; implied facets must be neutral and read-only at the source',
      abstractTimestep: 'backend null and exported t0 are both represented as null',
      selectableDefault: 'true except for implied facets when the backend omits selectable',
      metrics: 'the positive/negative pair is reduced using the backend selection, matching the UI mapper',
      missingValues: 'optional values are compared as null',
    },
    issues,
  };
}

export function validateConstraintSnapshot(payload, expectation = {}) {
  const issues = [];
  const facets = Array.isArray(payload?.facets) ? payload.facets : [];
  const solution = Array.isArray(payload?.representativeSolution)
    ? payload.representativeSolution
    : [];
  const nodes = Array.isArray(payload?.renderedGraph?.nodes) ? payload.renderedGraph.nodes : [];
  const edges = Array.isArray(payload?.renderedGraph?.edges) ? payload.renderedGraph.edges : [];
  const connections = Array.isArray(payload?.connections) ? payload.connections : [];
  const positiveIds = sortedIds(facets.filter((facet) => facet.selection === 'positive'));
  const negativeIds = sortedIds(facets.filter((facet) => facet.selection === 'negative'));
  const solutionIds = solution.map((facet) => facet.id);
  const expectedPositiveIds = [...(expectation.positiveIds ?? positiveIds)].sort();
  const expectedNegativeIds = [...(expectation.negativeIds ?? negativeIds)].sort();

  compareIdSets(positiveIds, expectedPositiveIds, 'positive constraints', issues);
  compareIdSets(negativeIds, expectedNegativeIds, 'negative constraints', issues);
  for (const id of expectedPositiveIds) {
    if (!solutionIds.includes(id)) {
      issues.push(`required facet is absent from the displayed solution: ${id}`);
    }
  }
  for (const id of expectedNegativeIds) {
    if (solutionIds.includes(id)) {
      issues.push(`forbidden facet is present in the displayed solution: ${id}`);
    }
  }

  const expectedChain = solutionIds.length
    ? [
      ['__session__', solutionIds[0]],
      ...solutionIds.slice(1).map((id, index) => [solutionIds[index], id]),
      [solutionIds.at(-1), '__goal__'],
    ]
    : [];
  const expectedKeys = expectedChain.map(([source, target]) => `${source}>${target}`).sort();
  compareIdSets(
    connections.map((connection) => `${connection.sourceId}>${connection.targetId}`).sort(),
    expectedKeys,
    'diagnostic edge chain',
    issues,
  );
  compareIdSets(
    edges.map((edge) => `${edge.sourceId}>${edge.targetId}`).sort(),
    expectedKeys,
    'rendered edge chain',
    issues,
  );

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const effectiveStyles = {};
  const renderedStyles = {};
  for (const facet of facets) {
    const node = nodeById.get(facet.id);
    if (!node) {
      if (!(payload.integrity?.omittedFacetIds ?? []).includes(facet.id)) {
        issues.push(`facet has no rendered node: ${facet.id}`);
      }
      continue;
    }
    const expectedClasses = expectedNodeClasses(facet, solutionIds.includes(facet.id));
    const classes = new Set(node.classes ?? []);
    for (const className of expectedClasses) {
      if (!classes.has(className)) {
        issues.push(`node ${facet.id} is missing class ${className}`);
      }
    }
    if (solutionIds.includes(facet.id) && !classes.has('solution-path')) {
      issues.push(`displayed-plan node is not styled as part of the solution: ${facet.id}`);
    }
    if (!solutionIds.includes(facet.id) && classes.has('solution-path')) {
      issues.push(`alternative node is incorrectly styled as part of the solution: ${facet.id}`);
    }
    effectiveStyles[facet.id] = effectiveNodeStyle(classes);
  }

  for (const node of nodes) {
    const expectedStyle = effectiveNodeStyle(new Set(node.classes ?? []));
    const actualStyle = normalizeComputedNodeStyle(node.computedStyle);
    renderedStyles[node.id] = actualStyle;
    validateComputedNodeStyle(node.id, actualStyle, expectedStyle, issues);
  }

  validateArrowGeometry(nodes, edges, solution, issues);
  return {
    valid: issues.length === 0,
    label: expectation.label ?? null,
    positiveIds,
    negativeIds,
    displayedSolutionIds: solutionIds,
    edgeChain: expectedChain.map(([sourceId, targetId]) => ({ sourceId, targetId })),
    effectiveStyles,
    renderedStyles,
    issues,
  };
}

export function normalizeBackendFacet(facet, options = {}) {
  const solution = options.solution === true;
  const backendSelection = facet?.selectionState ?? 'neutral';
  const selection = solution ? 'positive' : backendSelection;
  const facetType = solution ? 'plan' : facet?.facetType ?? null;
  const visual = solution
    ? { group: 'Displayed plan', nodeType: 'plan' }
    : visualState(facetType, selection);
  return {
    id: facet?.id ?? null,
    label: facet?.label ?? null,
    timestep: facet?.abstractTimeStep === true ? null : facet?.timestep ?? null,
    action: facet?.action?.name ?? firstWord(facet?.label),
    actionArguments: facet?.action?.arguments ?? [],
    abstractTimeStep: facet?.abstractTimeStep === true,
    selection,
    selectable: solution ? true : facet?.selectable ?? facetType !== 'implied',
    available: true,
    facetType,
    group: visual.group,
    nodeType: visual.nodeType,
    parentId: facet?.parentId ?? null,
    impliedBy: sortedOptional(facet?.impliedBy),
    causedBy: facet?.causedBy ?? null,
    remainingSolutions: solution
      ? options.solutionCount ?? null
      : metricValue(facet?.remaining?.solution, backendSelection),
    remainingFacets: solution ? null : metricValue(facet?.remaining?.facets, backendSelection),
    solutionReduction: solution ? null : metricValue(facet?.reduction?.solution, backendSelection),
    facetReduction: solution ? null : metricValue(facet?.reduction?.facets, backendSelection),
  };
}

export function normalizeExportedFacet(facet) {
  return {
    id: facet?.id ?? null,
    label: facet?.label ?? null,
    timestep: facet?.abstractTimeStep === true ? null : facet?.timestep ?? null,
    action: facet?.action ?? firstWord(facet?.label),
    actionArguments: facet?.actionArguments ?? [],
    abstractTimeStep: facet?.abstractTimeStep === true,
    selection: facet?.selection ?? 'neutral',
    selectable: facet?.selectable ?? true,
    available: facet?.available ?? true,
    facetType: facet?.facetType ?? null,
    group: facet?.group ?? null,
    nodeType: facet?.nodeType ?? null,
    parentId: facet?.parentId ?? null,
    impliedBy: sortedOptional(facet?.impliedBy),
    causedBy: facet?.causedBy ?? null,
    remainingSolutions: facet?.remainingSolutions ?? null,
    remainingFacets: facet?.remainingFacets ?? null,
    solutionReduction: facet?.solutionReduction ?? null,
    facetReduction: facet?.facetReduction ?? null,
  };
}

export function effectiveNodeStyle(classes) {
  const has = (name) => classes.has(name);
  let style = {
    background: '#ffffff',
    border: '#aeb8c2',
    borderStyle: 'solid',
    borderWidth: 1.5,
    shape: 'round-rectangle',
    opacity: 1,
  };
  if (has('root')) style = { ...style, background: '#0f766e', border: '#115e59', borderWidth: 3, shape: 'ellipse' };
  if (has('goal')) style = { ...style, background: '#fef3c7', border: '#b45309', borderWidth: 3, shape: 'diamond' };
  if (has('alternative')) style = { ...style, background: '#fff7ed', border: '#c2410c', borderStyle: 'dashed' };
  if (has('query')) style = { ...style, background: '#f1f5f9', border: '#64748b' };
  if (has('implied')) style = { ...style, background: '#f8fafc', border: '#64748b', borderStyle: 'dotted' };
  if (has('empty')) style = { ...style, background: '#f1f5f9', border: '#64748b', borderStyle: 'dotted' };
  if (has('unavailable')) style = { ...style, background: '#f2f4f6', border: '#9aa6af', borderStyle: 'dotted', opacity: 0.58 };
  if (has('required')) style = { ...style, background: '#dbeafe', border: '#2563eb', borderWidth: 4 };
  if (has('forbidden')) style = { ...style, background: '#ffe0db', border: '#b91c1c', borderStyle: 'double', borderWidth: 4 };
  if (has('displayed-plan')) style = { ...style, background: '#dcfce7', border: '#15803d', borderStyle: 'solid', borderWidth: 3 };
  if (has('displayed-plan') && has('user-constraint')) {
    style = { ...style, background: '#dcfce7', border: '#2563eb', borderWidth: 5 };
  }
  if (has('displayed-plan') && has('user-constraint') && has('negative')) {
    style = { ...style, background: '#ffe0db', border: '#b91c1c', borderStyle: 'double', borderWidth: 4 };
  }
  if (has('goal')) style = { ...style, background: '#fef3c7', border: '#b45309', borderStyle: 'solid', borderWidth: 3 };
  return style;
}

function normalizeComputedNodeStyle(style) {
  if (!style || typeof style !== 'object') return null;
  return {
    backgroundColor: normalizeColor(style.backgroundColor),
    borderColor: normalizeColor(style.borderColor),
    borderStyle: typeof style.borderStyle === 'string' ? style.borderStyle : null,
    borderWidth: finiteNumber(style.borderWidth),
    shape: typeof style.shape === 'string' ? style.shape : null,
    opacity: finiteNumber(style.opacity),
  };
}

function validateComputedNodeStyle(id, actual, expected, issues) {
  if (!actual) {
    issues.push(`node ${id} has no computed Cytoscape style`);
    return;
  }
  const fields = {
    backgroundColor: normalizeColor(expected.background),
    borderColor: normalizeColor(expected.border),
    borderStyle: expected.borderStyle,
    borderWidth: expected.borderWidth,
    shape: expected.shape,
    opacity: expected.opacity,
  };
  for (const [field, value] of Object.entries(fields)) {
    const current = actual[field];
    const matches = typeof value === 'number'
      ? Number.isFinite(current) && Math.abs(current - value) < 0.001
      : current === value;
    if (!matches) {
      issues.push(`node ${id} computed ${field} differs: expected=${JSON.stringify(value)}, actual=${JSON.stringify(current)}`);
    }
  }
}

function finiteNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().toLowerCase();
  const shortHex = compact.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (shortHex) return `#${shortHex.slice(1).map((part) => part + part).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(compact)) return compact;
  const rgb = compact.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,[^)]*)?\)$/);
  if (!rgb) return compact;
  return `#${rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function validateArrowGeometry(nodes, edges, solution, issues) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const timestepById = new Map(solution.map((facet) => [facet.id, facet.timestep]));
  timestepById.set('__session__', Number.NEGATIVE_INFINITY);
  timestepById.set('__goal__', Number.POSITIVE_INFINITY);

  for (const edge of edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    const sourcePoint = edge.renderedSourceEndpoint;
    const targetPoint = edge.renderedTargetEndpoint;
    if (!source || !target || !finitePoint(sourcePoint) || !finitePoint(targetPoint)) {
      issues.push(`arrow geometry is incomplete: ${edge.sourceId} -> ${edge.targetId}`);
      continue;
    }
    if (timestepById.get(edge.sourceId) >= timestepById.get(edge.targetId)) {
      issues.push(`arrow is not chronological: ${edge.sourceId} -> ${edge.targetId}`);
    }
    if (source.renderedPosition.y >= target.renderedPosition.y) {
      issues.push(`arrow is not laid out downward: ${edge.sourceId} -> ${edge.targetId}`);
    }
    const sourceTolerance = Math.max(3, source.renderedSize.height * 0.12);
    const targetTolerance = Math.max(3, target.renderedSize.height * 0.12);
    if (sourcePoint.y < source.renderedPosition.y - sourceTolerance) {
      issues.push(`arrow does not leave the lower half of its source: ${edge.sourceId} -> ${edge.targetId}`);
    }
    if (targetPoint.y > target.renderedPosition.y + targetTolerance) {
      issues.push(`arrow does not enter the upper half of its target: ${edge.sourceId} -> ${edge.targetId}`);
    }
    if (targetPoint.y <= sourcePoint.y) {
      issues.push(`arrow endpoints do not point downward: ${edge.sourceId} -> ${edge.targetId}`);
    }

    for (const node of nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId || node.id.startsWith('__level_')) {
        continue;
      }
      const bounds = nodeBounds(node, 2);
      if (bounds && segmentIntersectsRectangle(sourcePoint, targetPoint, bounds)) {
        issues.push(`arrow crosses unrelated node ${node.id}: ${edge.sourceId} -> ${edge.targetId}`);
      }
    }
  }
}

function expectedNodeClasses(facet, inSolution) {
  const classes = ['facet', facet.selection ?? 'neutral'];
  const visualState = inSolution
    ? 'displayed-plan'
    : facet.facetType === 'implied'
      ? 'implied'
      : facet.facetType === 'empty'
        ? 'empty'
        : facet.selection === 'negative'
          ? 'forbidden'
          : facet.selection === 'positive'
            ? 'required'
            : facet.available === false
              ? facet.nodeType === 'query' ? 'query' : 'unavailable'
              : facet.nodeType === 'query' ? 'query' : 'alternative';
  classes.push(visualState);
  if (inSolution) classes.push('solution-path');
  if (facet.userConstraint || (facet.facetType === 'selected' && facet.selection !== 'neutral')) {
    classes.push('user-constraint');
  }
  return classes;
}

function normalizeFacetList(facets, normalizer, options) {
  if (!Array.isArray(facets)) {
    throw new Error('Facet contract comparison requires two facet arrays.');
  }
  const entries = facets.map((facet) => [facet?.id, normalizer(facet, options)]);
  if (entries.some(([id]) => typeof id !== 'string' || !id)) {
    throw new Error('Facet contract comparison found an invalid ID.');
  }
  const result = new Map(entries);
  if (result.size !== entries.length) {
    throw new Error('Facet contract comparison found duplicate IDs.');
  }
  return result;
}

function metricValue(pair, selection) {
  if (!pair) return null;
  return selection === 'negative'
    ? pair.negative ?? pair.positive ?? null
    : pair.positive ?? pair.negative ?? null;
}

function visualState(facetType, selection) {
  if (facetType === 'implied') return { group: 'In every plan', nodeType: null };
  if (selection === 'positive') return { group: 'Required by you', nodeType: 'path' };
  if (selection === 'negative') return { group: 'Forbidden by you', nodeType: 'excluded' };
  if (facetType === 'selected') return { group: 'Required by you', nodeType: 'path' };
  if (facetType === 'empty') return { group: 'Empty timestep', nodeType: null };
  return { group: 'Open candidate', nodeType: 'candidate' };
}

function firstWord(value) {
  return typeof value === 'string' ? value.split(' ')[0] || null : null;
}

function sortedOptional(value) {
  return Array.isArray(value) ? [...value].sort() : [];
}

function sortedIds(items) {
  return items.map((item) => item.id).sort();
}

function compareIdSets(actual, expected, label, issues) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(`${label} differ: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`);
  }
}

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function nodeBounds(node, inset = 0) {
  const { renderedPosition: position, renderedSize: size } = node;
  if (![position?.x, position?.y, size?.width, size?.height].every(Number.isFinite)) return null;
  return {
    left: position.x - (size.width / 2) + inset,
    right: position.x + (size.width / 2) - inset,
    top: position.y - (size.height / 2) + inset,
    bottom: position.y + (size.height / 2) - inset,
  };
}

function segmentIntersectsRectangle(start, end, rectangle) {
  if (pointInside(start, rectangle) || pointInside(end, rectangle)) return true;
  const corners = [
    [{ x: rectangle.left, y: rectangle.top }, { x: rectangle.right, y: rectangle.top }],
    [{ x: rectangle.right, y: rectangle.top }, { x: rectangle.right, y: rectangle.bottom }],
    [{ x: rectangle.right, y: rectangle.bottom }, { x: rectangle.left, y: rectangle.bottom }],
    [{ x: rectangle.left, y: rectangle.bottom }, { x: rectangle.left, y: rectangle.top }],
  ];
  return corners.some(([first, second]) => segmentsIntersect(start, end, first, second));
}

function pointInside(point, rectangle) {
  return point.x > rectangle.left && point.x < rectangle.right
    && point.y > rectangle.top && point.y < rectangle.bottom;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => ((q.x - p.x) * (r.y - p.y)) - ((q.y - p.y) * (r.x - p.x));
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  return first * second <= 0 && third * fourth <= 0;
}
