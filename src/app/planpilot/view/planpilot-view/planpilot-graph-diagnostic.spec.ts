import { buildPlanPilotViewGraphConnections } from './planpilot-graph-connections';
import { graphIntegrityIssues, javascriptAssetNames } from './planpilot-graph-diagnostic';
import { PlanPilotUiFacet } from './planpilot-view.models';

describe('PlanPilot graph diagnostics', () => {
  it('reports a bounded-plan gap without treating it as a broken edge', () => {
    const domainFacets = [
      facet('action-t3', 3),
      facet('action-t5', 5, 'action-t3'),
      facet('__goal__', 6, 'action-t5', 'goal'),
    ];
    const connections = buildPlanPilotViewGraphConnections(domainFacets);

    expect(connections).toContain(jasmine.objectContaining({
      sourceId: 'action-t3',
      targetId: 'action-t5',
      gapTimesteps: [4],
      label: 't4 empty',
    }));
    expect(graphIntegrityIssues([rootFacet(), ...domainFacets], connections)).toEqual([]);
  });

  it('distinguishes a missing parent from a valid forward gap', () => {
    const domainFacets = [
      facet('action-t3', 3),
      facet('action-t5', 5, 'missing-parent'),
    ];
    const connections = buildPlanPilotViewGraphConnections(domainFacets);
    const issues = graphIntegrityIssues([rootFacet(), ...domainFacets], connections);

    expect(issues).toContain('Facet parent is missing from graph: action-t5 -> missing-parent');
    expect(issues).toContain('Representative solution facet has no incoming connection: action-t5');
  });

  it('distinguishes a backwards parent from a valid forward gap', () => {
    const domainFacets = [
      facet('action-t3', 3, 'action-t5'),
      facet('action-t5', 5),
    ];
    const connections = buildPlanPilotViewGraphConnections(domainFacets);
    const issues = graphIntegrityIssues([rootFacet(), ...domainFacets], connections);

    expect(issues).toContain('Facet parent is not earlier: action-t5 -> action-t3');
    expect(connections).not.toContain(jasmine.objectContaining({
      sourceId: 'action-t3',
      targetId: 'action-t5',
    }));
  });

  it('keeps loaded hashed JavaScript filenames in the exported diagnostic', () => {
    expect(javascriptAssetNames([
      'http://localhost/main-A1B2C3.js',
      '/chunk-XYZ.js',
      '',
      '/styles.css',
    ], 'http://localhost/planpilot')).toEqual([
      'chunk-XYZ.js',
      'main-A1B2C3.js',
    ]);
  });
});

function facet(
  id: string,
  timestep: number,
  parentId?: string,
  nodeType: PlanPilotUiFacet['nodeType'] = 'plan',
): PlanPilotUiFacet {
  return {
    id,
    label: id,
    detail: id,
    timestep,
    action: id,
    group: 'Displayed plan',
    selection: 'positive',
    remainingSolutions: 1,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    parentId,
    facetType: 'plan',
    nodeType,
    tokens: [id],
    solutionContext: true,
  };
}

function rootFacet(): PlanPilotUiFacet {
  return {
    ...facet('__session__', -1, undefined, 'root'),
    selection: 'neutral',
    solutionContext: false,
  };
}
