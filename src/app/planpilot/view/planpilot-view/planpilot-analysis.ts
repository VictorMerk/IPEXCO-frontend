import type {
  PlanPilotFacet,
  PlanPilotQueryResult,
} from "../../service/planpilot.service";
import { PlanPilotUiFacet } from "./planpilot-view.models";

export interface PlanPilotImpactDirection {
  available: boolean | null;
  planReduction: number | null;
  plansRemaining: number | null;
  facetReduction: number | null;
  facetsRemaining: number | null;
}

export interface PlanPilotFacetImpact {
  exact: boolean;
  comparableToCurrent: boolean;
  require: PlanPilotImpactDirection;
  forbid: PlanPilotImpactDirection;
}

export interface PlanPilotActionImpactView {
  available: boolean | null;
  totalPlans: number | null;
  plansRemaining: number | null;
  plansRemoved: number | null;
  reductionPercent: number | null;
}

export interface PlanPilotParsedSelectionImpact {
  impact: PlanPilotFacetImpact;
  totalPlans: number | null;
}

export interface PlanPilotTimelineRow {
  key: number | "any";
  label: string;
  displayedActions: string[];
  alternativeCount: number;
  requiredCount: number;
  forbiddenCount: number;
}

export interface PlanPilotPlanSummary {
  number: number;
  actionCount: number;
  gapTimesteps: number[];
  firstTimestep: number | null;
  lastTimestep: number | null;
}

export interface PlanPilotMovedAction {
  label: string;
  from: number;
  to: number;
}

export interface PlanPilotComparedAction {
  label: string;
  timestep: number;
}

export interface PlanPilotComparison {
  same: PlanPilotComparedAction[];
  moved: PlanPilotMovedAction[];
  onlyA: PlanPilotComparedAction[];
  onlyB: PlanPilotComparedAction[];
}

export function buildFacetImpactMap(
  solutionFacets: PlanPilotFacet[],
  facetFacets: PlanPilotFacet[],
): Record<string, PlanPilotFacetImpact> {
  const ids = new Set([
    ...solutionFacets.map((facet) => facet.id),
    ...facetFacets.map((facet) => facet.id),
  ]);
  const solutionById = new Map(
    solutionFacets.map((facet) => [facet.id, facet]),
  );
  const facetById = new Map(facetFacets.map((facet) => [facet.id, facet]));

  return Object.fromEntries(
    Array.from(ids).map((id) => {
      const solution = solutionById.get(id);
      const facet = facetById.get(id);
      return [
        id,
        {
          exact: true,
          comparableToCurrent: true,
          require: impactDirection(solution, facet, "positive"),
          forbid: impactDirection(solution, facet, "negative"),
        },
      ];
    }),
  );
}

export function parseSelectionImpact(
  result: PlanPilotQueryResult | undefined,
  facetId: string,
): PlanPilotParsedSelectionImpact | undefined {
  if (
    result?.type !== "selectionImpact" ||
    result.facetId !== facetId ||
    !result.require ||
    !result.forbid
  ) {
    return undefined;
  }
  const comparableToCurrent = result.comparableToCurrent === true;
  return {
    impact: {
      exact: result.exact === true,
      comparableToCurrent,
      require: {
        available: result.require.available,
        planReduction: result.require.planReduction,
        plansRemaining: result.require.plansRemaining,
        facetReduction: null,
        facetsRemaining: null,
      },
      forbid: {
        available: result.forbid.available,
        planReduction: result.forbid.planReduction,
        plansRemaining: result.forbid.plansRemaining,
        facetReduction: null,
        facetsRemaining: null,
      },
    },
    totalPlans:
      comparableToCurrent &&
      Number.isInteger(result.totalPlans) &&
      (result.totalPlans ?? 0) > 0
        ? result.totalPlans!
        : null,
  };
}

export function fixedDisplayedPlanImpact(
  count: number | null,
): PlanPilotFacetImpact {
  return {
    exact: count !== null,
    comparableToCurrent: true,
    require: {
      available: true,
      planReduction: count === null ? null : 0,
      plansRemaining: count,
      facetReduction: null,
      facetsRemaining: null,
    },
    forbid: {
      available: false,
      planReduction: count === null ? null : 1,
      plansRemaining: count === null ? null : 0,
      facetReduction: null,
      facetsRemaining: null,
    },
  };
}

export function buildActionImpactView(
  impact: PlanPilotImpactDirection,
  counterpart: PlanPilotImpactDirection,
  comparableToCurrent: boolean,
  knownSolutionCount: number | null,
): PlanPilotActionImpactView {
  const derivedTotal =
    comparableToCurrent &&
    impact.plansRemaining !== null &&
    counterpart.plansRemaining !== null
      ? impact.plansRemaining + counterpart.plansRemaining
      : null;
  const totalPlans = comparableToCurrent
    ? (knownSolutionCount ?? derivedTotal)
    : null;
  return {
    available: impact.available,
    totalPlans,
    plansRemaining: impact.plansRemaining,
    plansRemoved:
      totalPlans !== null && impact.plansRemaining !== null
        ? Math.max(0, totalPlans - impact.plansRemaining)
        : null,
    reductionPercent:
      totalPlans !== null && impact.plansRemaining !== null
        ? Math.round(
            ((totalPlans - impact.plansRemaining) / totalPlans) * 10_000,
          ) / 100
        : impact.planReduction === null || !comparableToCurrent
          ? null
          : Math.round(impact.planReduction * 10_000) / 100,
  };
}

export function buildTimelineRows(
  facets: PlanPilotUiFacet[],
  displayedPlan: PlanPilotUiFacet[],
  horizon: number,
): PlanPilotTimelineRow[] {
  const displayedIds = new Set(displayedPlan.map((facet) => facet.id));
  const displayedByTimestep = groupBy(
    displayedPlan.filter((facet) => !facet.abstractTimeStep),
    (facet) => facet.timestep,
  );
  const domainFacets = facets.filter((facet) => !isStructural(facet));
  const rows = Array.from({ length: Math.max(0, horizon) }, (_, index) => {
    const timestep = index + 1;
    const atTimestep = domainFacets.filter(
      (facet) => !facet.abstractTimeStep && facet.timestep === timestep,
    );
    return timelineRow(
      timestep,
      `t${timestep}`,
      atTimestep,
      displayedByTimestep.get(timestep) ?? [],
      displayedIds,
    );
  });

  const anyStepFacets = domainFacets.filter((facet) => facet.abstractTimeStep);
  if (anyStepFacets.length) {
    rows.push(timelineRow("any", "Any step", anyStepFacets, [], displayedIds));
  }
  return rows;
}

export function summarizePlan(
  number: number,
  facets: PlanPilotUiFacet[],
): PlanPilotPlanSummary {
  const timesteps = facets
    .filter((facet) => !facet.abstractTimeStep && facet.timestep > 0)
    .map((facet) => facet.timestep)
    .sort((left, right) => left - right);
  const gaps: number[] = [];
  for (let index = 1; index < timesteps.length; index += 1) {
    for (
      let timestep = timesteps[index - 1] + 1;
      timestep < timesteps[index];
      timestep += 1
    ) {
      gaps.push(timestep);
    }
  }
  return {
    number,
    actionCount: facets.length,
    gapTimesteps: Array.from(new Set(gaps)),
    firstTimestep: timesteps[0] ?? null,
    lastTimestep: timesteps[timesteps.length - 1] ?? null,
  };
}

export function comparePlanSolutions(
  planA: PlanPilotUiFacet[],
  planB: PlanPilotUiFacet[],
): PlanPilotComparison {
  const groupedA = groupBy(planA, actionSignature);
  const groupedB = groupBy(planB, actionSignature);
  const signatures = new Set([...groupedA.keys(), ...groupedB.keys()]);
  const comparison: PlanPilotComparison = {
    same: [],
    moved: [],
    onlyA: [],
    onlyB: [],
  };

  for (const signature of signatures) {
    const actionsA = [...(groupedA.get(signature) ?? [])].sort(byTimestep);
    const actionsB = [...(groupedB.get(signature) ?? [])].sort(byTimestep);
    const remainingA: PlanPilotUiFacet[] = [];
    const remainingB = [...actionsB];

    for (const actionA of actionsA) {
      const sameIndex = remainingB.findIndex(
        (actionB) => actionB.timestep === actionA.timestep,
      );
      if (sameIndex >= 0) {
        comparison.same.push({
          label: actionA.label,
          timestep: actionA.timestep,
        });
        remainingB.splice(sameIndex, 1);
      } else {
        remainingA.push(actionA);
      }
    }

    const pairedCount = Math.min(remainingA.length, remainingB.length);
    for (let index = 0; index < pairedCount; index += 1) {
      comparison.moved.push({
        label: remainingA[index].label,
        from: remainingA[index].timestep,
        to: remainingB[index].timestep,
      });
    }
    comparison.onlyA.push(...remainingA.slice(pairedCount).map(comparedAction));
    comparison.onlyB.push(...remainingB.slice(pairedCount).map(comparedAction));
  }

  comparison.same.sort(comparedActionOrder);
  comparison.moved.sort(
    (left, right) =>
      left.from - right.from || left.label.localeCompare(right.label),
  );
  comparison.onlyA.sort(comparedActionOrder);
  comparison.onlyB.sort(comparedActionOrder);
  return comparison;
}

export type PlanPilotComparisonGraphState =
  "same" | "moved" | "only-a" | "only-b";

export function buildPlanComparisonGraphStates(
  planA: PlanPilotUiFacet[],
  planB: PlanPilotUiFacet[],
): Record<string, PlanPilotComparisonGraphState> {
  const states: Record<string, PlanPilotComparisonGraphState> = {};
  const unmatchedB = [...planB];

  for (const actionA of planA) {
    const sameIndex = unmatchedB.findIndex(
      (actionB) =>
        actionSignature(actionB) === actionSignature(actionA) &&
        actionB.timestep === actionA.timestep,
    );
    if (sameIndex >= 0) {
      states[actionA.id] = "same";
      states[unmatchedB[sameIndex].id] = "same";
      unmatchedB.splice(sameIndex, 1);
      continue;
    }
    const movedIndex = unmatchedB.findIndex(
      (actionB) => actionSignature(actionB) === actionSignature(actionA),
    );
    if (movedIndex >= 0) {
      states[actionA.id] = "moved";
      states[unmatchedB[movedIndex].id] = "moved";
      unmatchedB.splice(movedIndex, 1);
      continue;
    }
    states[actionA.id] = "only-a";
  }
  unmatchedB.forEach((action) => {
    states[action.id] = "only-b";
  });
  return states;
}

function impactDirection(
  solution: PlanPilotFacet | undefined,
  facet: PlanPilotFacet | undefined,
  direction: "positive" | "negative",
): PlanPilotImpactDirection {
  return {
    available:
      solution?.remaining?.solution[direction] === null
        ? null
        : (solution?.remaining?.solution[direction] ?? 0) > 0,
    planReduction: solution?.reduction?.solution[direction] ?? null,
    plansRemaining: solution?.remaining?.solution[direction] ?? null,
    facetReduction: facet?.reduction?.facets[direction] ?? null,
    facetsRemaining: facet?.remaining?.facets[direction] ?? null,
  };
}

function timelineRow(
  key: number | "any",
  label: string,
  facets: PlanPilotUiFacet[],
  displayed: PlanPilotUiFacet[],
  displayedIds: Set<string>,
): PlanPilotTimelineRow {
  const unique = uniqueById(facets);
  return {
    key,
    label,
    displayedActions: displayed.map((facet) => facet.label),
    alternativeCount: unique.filter(
      (facet) =>
        facet.available &&
        facet.selectable !== false &&
        facet.selection === "neutral" &&
        facet.facetType !== "implied" &&
        facet.facetType !== "empty" &&
        !displayedIds.has(facet.id),
    ).length,
    requiredCount: unique.filter(
      (facet) =>
        facet.selection === "positive" && facet.facetType === "selected",
    ).length,
    forbiddenCount: unique.filter(
      (facet) =>
        facet.selection === "negative" && facet.facetType === "selected",
    ).length,
  };
}

function actionSignature(facet: PlanPilotUiFacet): string {
  return JSON.stringify([
    facet.action || facet.label,
    ...(facet.actionArguments ?? []),
  ]);
}

function comparedAction(facet: PlanPilotUiFacet): PlanPilotComparedAction {
  return { label: facet.label, timestep: facet.timestep };
}

function comparedActionOrder(
  left: PlanPilotComparedAction,
  right: PlanPilotComparedAction,
): number {
  return (
    left.timestep - right.timestep || left.label.localeCompare(right.label)
  );
}

function byTimestep(left: PlanPilotUiFacet, right: PlanPilotUiFacet): number {
  return left.timestep - right.timestep || left.id.localeCompare(right.id);
}

function uniqueById(facets: PlanPilotUiFacet[]): PlanPilotUiFacet[] {
  return Array.from(new Map(facets.map((facet) => [facet.id, facet])).values());
}

function isStructural(facet: PlanPilotUiFacet): boolean {
  return (
    facet.nodeType === "root" ||
    facet.nodeType === "goal" ||
    facet.nodeType === "time"
  );
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    groups.set(itemKey, [...(groups.get(itemKey) ?? []), item]);
  }
  return groups;
}
