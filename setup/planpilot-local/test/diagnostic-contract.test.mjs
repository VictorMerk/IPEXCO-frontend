import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareFacetContract,
  effectiveNodeStyle,
  validateConstraintSnapshot,
} from '../lib/diagnostic-contract.mjs';

const backendFacet = {
  id: 'pick-a-t1',
  label: 'pick-up a',
  timestep: 1,
  selectionState: 'positive',
  action: { name: 'pick-up', arguments: ['a'] },
  selectable: true,
  facetType: 'selected',
  remaining: { solution: { positive: 2, negative: 4 }, facets: { positive: 3, negative: 5 } },
  reduction: { solution: { positive: 0.5, negative: 0 }, facets: { positive: 0.25, negative: 0 } },
};
const exportedFacet = {
  id: 'pick-a-t1',
  label: 'pick-up a',
  timestep: 1,
  action: 'pick-up',
  actionArguments: ['a'],
  selection: 'positive',
  selectable: true,
  facetType: 'selected',
  available: true,
  group: 'Required by you',
  nodeType: 'path',
  remainingSolutions: 2,
  remainingFacets: 3,
  solutionReduction: 0.5,
  facetReduction: 0.25,
};

test('compares every mapped backend/export facet field', () => {
  const result = compareFacetContract([backendFacet], [exportedFacet]);
  assert.equal(result.valid, true);
  assert.equal(result.comparedFields.length, 19);
});

test('requires implied facets to be neutral in the backend and export', () => {
  const result = compareFacetContract(
    [{ ...backendFacet, selectionState: 'neutral', facetType: 'implied', selectable: false }],
    [{
      ...exportedFacet,
      selection: 'neutral',
      facetType: 'implied',
      selectable: false,
      group: 'In every plan',
      nodeType: null,
    }],
  );
  assert.equal(result.valid, true);
});

test('rejects an implied positive backend state instead of normalizing it', () => {
  const result = compareFacetContract(
    [{ ...backendFacet, selectionState: 'positive', facetType: 'implied', selectable: false }],
    [{
      ...exportedFacet,
      selection: 'neutral',
      facetType: 'implied',
      selectable: false,
      group: 'In every plan',
      nodeType: null,
    }],
  );
  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /selection/);
});

test('detects semantic drift even when IDs still match', () => {
  const result = compareFacetContract([backendFacet], [{ ...exportedFacet, actionArguments: ['b'] }]);
  assert.equal(result.valid, false);
  assert.match(result.issues[0], /actionArguments/);
});

test('compares a displayed solution using the mapper-provided plan count', () => {
  const result = compareFacetContract(
    [{ ...backendFacet, selectionState: 'neutral', facetType: 'plan' }],
    [{
      ...exportedFacet,
      selection: 'positive',
      facetType: 'plan',
      group: 'Displayed plan',
      nodeType: 'plan',
      remainingSolutions: 7,
      remainingFacets: null,
      solutionReduction: null,
      facetReduction: null,
    }],
    { solution: true, solutionCount: 7 },
  );
  assert.equal(result.valid, true, result.issues.join('\n'));
});

test('validates constrained membership, classes, styles, and directed chain', () => {
  const payload = snapshotFixture();
  const result = validateConstraintSnapshot(payload, {
    positiveIds: ['pick-a-t1'],
    negativeIds: ['pick-b-t1'],
  });
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.equal(result.effectiveStyles['pick-a-t1'].border, '#2563eb');
  assert.equal(result.effectiveStyles['pick-b-t1'].background, '#ffe0db');
  assert.equal(result.renderedStyles['pick-a-t1'].borderColor, '#2563eb');
});

test('rejects a live Cytoscape style that drifted from its semantic class', () => {
  const payload = snapshotFixture();
  payload.renderedGraph.nodes.find((node) => node.id === 'pick-a-t1').computedStyle.borderColor = '#ff00ff';
  const result = validateConstraintSnapshot(payload, {
    positiveIds: ['pick-a-t1'],
    negativeIds: ['pick-b-t1'],
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /computed borderColor differs/);
});

test('computes the final CSS-order-dependent displayed-plan color', () => {
  const style = effectiveNodeStyle(new Set(['facet', 'alternative', 'neutral', 'displayed-plan', 'solution-path']));
  assert.deepEqual(style, {
    background: '#dcfce7',
    border: '#15803d',
    borderStyle: 'solid',
    borderWidth: 3,
    shape: 'round-rectangle',
    opacity: 1,
  });
});

function snapshotFixture() {
  const node = (id, y, classes) => {
    const style = effectiveNodeStyle(new Set(classes));
    return {
      id,
      classes,
      computedStyle: {
        backgroundColor: style.background,
        borderColor: style.border,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        shape: style.shape,
        opacity: style.opacity,
      },
      renderedPosition: { x: 200, y },
      renderedSize: { width: 100, height: 40 },
    };
  };
  const edge = (sourceId, targetId, sourceY, targetY) => ({
    sourceId,
    targetId,
    renderedSourceEndpoint: { x: 200, y: sourceY },
    renderedTargetEndpoint: { x: 200, y: targetY },
  });
  return {
    facets: [
      { ...exportedFacet, userConstraint: true },
      {
        ...exportedFacet,
        id: 'pick-b-t1',
        label: 'pick-up b',
        actionArguments: ['b'],
        selection: 'negative',
        group: 'Forbidden by you',
        nodeType: 'excluded',
        remainingSolutions: 4,
        remainingFacets: 5,
        solutionReduction: 0,
        facetReduction: 0,
      },
    ],
    representativeSolution: [{ ...exportedFacet, solutionContext: true }],
    connections: [
      { sourceId: '__session__', targetId: 'pick-a-t1' },
      { sourceId: 'pick-a-t1', targetId: '__goal__' },
    ],
    renderedGraph: {
      nodes: [
        node('__session__', 50, ['facet', 'neutral', 'root']),
        node('pick-a-t1', 150, ['facet', 'positive', 'displayed-plan', 'solution-path', 'user-constraint']),
        { ...node('pick-b-t1', 150, ['facet', 'negative', 'forbidden', 'user-constraint']), renderedPosition: { x: 400, y: 150 } },
        node('__goal__', 250, ['facet', 'positive', 'goal', 'solution-path']),
      ],
      edges: [
        edge('__session__', 'pick-a-t1', 70, 130),
        edge('pick-a-t1', '__goal__', 170, 230),
      ],
    },
    integrity: { omittedFacetIds: [] },
  };
}
