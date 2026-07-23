import { buildPlanPilotGraphConnections } from './planpilot-graph-connections';
import { PLANPILOT_GRAPH_STYLES } from '../../components/planpilot-graph/planpilot-graph.styles';

describe('buildPlanPilotGraphConnections', () => {
  it('does not connect a facet to a parent in the same timestep', () => {
    const connections = buildPlanPilotGraphConnections([
      facet('t1-a', 1, 'positive'),
      { ...facet('t3-a', 3, 'neutral'), parentId: 't3-b' },
      facet('t3-b', 3, 'positive'),
    ]);

    expect(connections).toEqual([]);
  });

  it('does not turn backend metadata into semantic edges between alternatives', () => {
    const connections = buildPlanPilotGraphConnections([
      facet('t1-a', 1, 'positive'),
      facet('t3-a', 3, 'positive'),
      { ...facet('t7-a', 7, 'neutral'), parentId: 't1-a' },
    ]);

    expect(connections).toEqual([]);
  });

  it('does not invent a connection without a previous selected path', () => {
    const connections = buildPlanPilotGraphConnections([
      facet('t1-open', 1, 'neutral'),
      facet('t2-open', 2, 'neutral'),
    ]);

    expect(connections).toEqual([]);
  });

  it('draws representative and implied plan actions as path edges, not user requirements', () => {
    const connections = buildPlanPilotGraphConnections([
      { ...facet('plan-1', 1, 'positive'), facetType: 'plan', nodeType: 'plan', solutionContext: true },
      { ...facet('forced-2', 2, 'positive'), facetType: 'implied', parentId: 'plan-1', solutionContext: true },
      { ...facet('solution-3', 3, 'positive'), facetType: 'plan', nodeType: 'plan', solutionContext: true, parentId: 'forced-2' },
    ]);

    expect(connections).toEqual([
      { sourceId: 'plan-1', targetId: 'forced-2', kind: 'plan' },
      { sourceId: 'forced-2', targetId: 'solution-3', kind: 'plan' },
    ]);
  });

  it('marks a neutral backend facet as a plan edge when it belongs to the returned solution', () => {
    const connections = buildPlanPilotGraphConnections([
      { ...facet('plan-1', 1, 'positive'), solutionContext: true },
      { ...facet('solution-2', 2, 'neutral'), parentId: 'plan-1', solutionContext: true },
    ]);

    expect(connections).toEqual([
      { sourceId: 'plan-1', targetId: 'solution-2', kind: 'plan' },
    ]);
  });

  it('does not draw unconfirmed timeline plan facets as edges', () => {
    const connections = buildPlanPilotGraphConnections([
      facet('root-action', 1, 'positive'),
      { ...facet('timeline-plan', 2, 'positive'), parentId: 'root-action', facetType: 'plan', nodeType: 'plan' },
    ]);

    expect(connections).toEqual([]);
  });

  it('uses distinct non-rectangular shapes for the plan space and goal', () => {
    const root = PLANPILOT_GRAPH_STYLES.find((style) => style.selector === 'node.facet.root') as unknown as {
      style: Record<string, unknown>;
    };
    const goal = PLANPILOT_GRAPH_STYLES.find((style) => style.selector === 'node.facet.goal') as unknown as {
      style: Record<string, unknown>;
    };

    expect(root.style['shape']).toBe('ellipse');
    expect(goal.style['shape']).toBe('diamond');
    expect(root.style['background-color']).not.toBe(goal.style['background-color']);
  });

  it('renders the representative solution edge as a prominent directed arrow', () => {
    const planEdge = PLANPILOT_GRAPH_STYLES.find((style) => style.selector === 'edge.plan-edge') as unknown as {
      style: Record<string, unknown>;
    };

    expect(planEdge.style['target-arrow-shape']).toBe('triangle');
    expect(planEdge.style['arrow-scale']).toBeGreaterThanOrEqual(1.8);
    expect(planEdge.style['width']).toBeGreaterThanOrEqual(5);
    expect(planEdge.style['opacity']).toBe(1);
    expect(planEdge.style['z-index']).toBeGreaterThan(0);
  });
});

function facet(id: string, timestep: number, selection: 'positive' | 'negative' | 'neutral') {
  return {
    id,
    label: id,
    timestep,
    selection,
    available: true,
  };
}
