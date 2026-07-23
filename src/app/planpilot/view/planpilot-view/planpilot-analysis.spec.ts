import { PlanPilotFacet } from '../../service/planpilot.service';
import { PlanPilotUiFacet } from './planpilot-view.models';
import {
  buildFacetImpactMap,
  buildTimelineRows,
  comparePlanSolutions,
  summarizePlan,
} from './planpilot-analysis';

describe('PlanPilot sidebar analysis', () => {
  it('keeps Require and Forbid impact metrics from both FASB queries', () => {
    const solutionImpact = metricFacet('move-t1', {
      reduction: { solution: { positive: 0.8, negative: 0.2 }, facets: emptyPair() },
      remaining: { solution: { positive: 12, negative: 48 }, facets: emptyPair() },
    });
    const facetImpact = metricFacet('move-t1', {
      reduction: { solution: emptyPair(), facets: { positive: 0.5, negative: 0.1 } },
      remaining: { solution: emptyPair(), facets: { positive: 20, negative: 36 } },
    });

    const result = buildFacetImpactMap([solutionImpact], [facetImpact])['move-t1'];

    expect(result.exact).toBeTrue();
    expect(result.comparableToCurrent).toBeTrue();
    expect(result.require).toEqual({
      available: true,
      planReduction: 0.8,
      plansRemaining: 12,
      facetReduction: 0.5,
      facetsRemaining: 20,
    });
    expect(result.forbid).toEqual({
      available: true,
      planReduction: 0.2,
      plansRemaining: 48,
      facetReduction: 0.1,
      facetsRemaining: 36,
    });
  });

  it('builds every concrete timestep plus a separate Any step row', () => {
    const displayed = [uiFacet('plan-t1', 1, { solutionContext: true })];
    const facets = [
      uiFacet('plan-t1', 1),
      uiFacet('alternative-t1', 1),
      uiFacet('empty-t2', 2, { facetType: 'empty' }),
      uiFacet('required-t2', 2, { selection: 'positive', facetType: 'selected' }),
      uiFacet('forbidden-t3', 3, { selection: 'negative', facetType: 'selected' }),
      uiFacet('any', 0, { abstractTimeStep: true }),
      uiFacet('any-implied', 0, { abstractTimeStep: true, facetType: 'implied', selectable: false }),
    ];

    const rows = buildTimelineRows(facets, displayed, 3);

    expect(rows.map((row) => row.label)).toEqual(['t1', 't2', 't3', 'Any step']);
    expect(rows[0].displayedActions).toEqual(['plan-t1']);
    expect(rows[0].alternativeCount).toBe(1);
    expect(rows[1].alternativeCount).toBe(0);
    expect(rows[1].requiredCount).toBe(1);
    expect(rows[2].forbiddenCount).toBe(1);
    expect(rows[3].alternativeCount).toBe(1);
  });

  it('summarizes bounded gaps without adding leading or trailing idle steps', () => {
    const summary = summarizePlan(2, [
      uiFacet('a', 1),
      uiFacet('b', 2),
      uiFacet('c', 4),
    ]);

    expect(summary).toEqual({
      number: 2,
      actionCount: 3,
      gapTimesteps: [3],
      firstTimestep: 1,
      lastTimestep: 4,
    });
  });

  it('compares repeated grounded actions before classifying extras', () => {
    const planA = [
      uiFacet('a1', 1, { action: 'move', actionArguments: ['a', 'b'], label: 'move a b' }),
      uiFacet('a2', 3, { action: 'move', actionArguments: ['a', 'b'], label: 'move a b' }),
      uiFacet('only-a', 4),
    ];
    const planB = [
      uiFacet('b1', 1, { action: 'move', actionArguments: ['a', 'b'], label: 'move a b' }),
      uiFacet('b2', 2, { action: 'move', actionArguments: ['a', 'b'], label: 'move a b' }),
      uiFacet('only-b', 5),
    ];

    const comparison = comparePlanSolutions(planA, planB);

    expect(comparison.same).toEqual([{ label: 'move a b', timestep: 1 }]);
    expect(comparison.moved).toEqual([{ label: 'move a b', from: 3, to: 2 }]);
    expect(comparison.onlyA).toEqual([{ label: 'only-a', timestep: 4 }]);
    expect(comparison.onlyB).toEqual([{ label: 'only-b', timestep: 5 }]);
  });
});

function emptyPair(): { positive: null; negative: null } {
  return { positive: null, negative: null };
}

function metricFacet(
  id: string,
  metrics: Pick<PlanPilotFacet, 'reduction' | 'remaining'>,
): PlanPilotFacet {
  return {
    id,
    label: id,
    timestep: 1,
    selectionState: 'neutral',
    ...metrics,
  };
}

function uiFacet(
  id: string,
  timestep: number,
  overrides: Partial<PlanPilotUiFacet> = {},
): PlanPilotUiFacet {
  return {
    id,
    label: id,
    detail: id,
    timestep,
    action: id,
    actionArguments: [],
    group: 'Open candidate',
    selection: 'neutral',
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    selectable: true,
    facetType: 'optional',
    tokens: [id],
    ...overrides,
  };
}
