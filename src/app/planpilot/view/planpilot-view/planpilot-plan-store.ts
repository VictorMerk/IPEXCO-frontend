import { PlanPilotPlanSummary, summarizePlan } from "./planpilot-analysis";
import { PlanPilotUiFacet } from "./planpilot-view.models";

export interface PlanPilotCachedPlan {
  label: string;
  facets: PlanPilotUiFacet[];
}

export interface PlanPilotLoadedPlan extends PlanPilotCachedPlan {
  number: number;
}

export interface PlanPilotPlanLoadResult {
  number: number;
  plan?: PlanPilotLoadedPlan;
  error?: unknown;
  stale?: boolean;
  unavailable?: boolean;
}

export type PlanPilotSolutionCache = Record<number, PlanPilotCachedPlan>;

export interface PlanPilotPage {
  start: number;
  numbers: number[];
}

export interface PlanPilotBatchRange {
  start: number;
  end: number;
  hasMore: boolean;
}

export function buildPlanPage(
  requestedStart: number,
  pageSize: number,
  solutionCountKnown: boolean,
  solutionCount: number,
): PlanPilotPage {
  const start = planPageStartFor(requestedStart, pageSize);
  const lastStart = solutionCountKnown
    ? planPageStartFor(solutionCount, pageSize)
    : start;
  const normalizedStart = Math.min(start, lastStart);
  const length = solutionCountKnown
    ? Math.min(pageSize, Math.max(0, solutionCount - normalizedStart + 1))
    : pageSize;
  return {
    start: normalizedStart,
    numbers: Array.from({ length }, (_, index) => normalizedStart + index),
  };
}

export function planPageStartFor(
  solutionNumber: number,
  pageSize: number,
): number {
  return (
    Math.floor((Math.max(1, solutionNumber) - 1) / pageSize) * pageSize + 1
  );
}

export function knownPlanLowerBound(
  cache: PlanPilotSolutionCache,
  currentSolutionNumber: number,
  hasRepresentativeSolution: boolean,
): number {
  return Math.max(
    hasRepresentativeSolution ? 1 : 0,
    currentSolutionNumber,
    ...cachedPlanNumbers(cache),
  );
}

export function cachedPlanNumbers(cache: PlanPilotSolutionCache): number[] {
  return Object.keys(cache)
    .map(Number)
    .sort((left, right) => left - right);
}

export function nextPlanBatch(
  cache: PlanPilotSolutionCache,
  batchSize: number,
  solutionCountKnown: boolean,
  solutionCount: number,
): PlanPilotBatchRange {
  let start = 1;
  while (cache[start] && (!solutionCountKnown || start <= solutionCount)) {
    start += 1;
  }
  const requestedEnd = start + batchSize - 1;
  return {
    start,
    end: solutionCountKnown
      ? Math.min(requestedEnd, solutionCount)
      : requestedEnd,
    hasMore: !solutionCountKnown || start <= solutionCount,
  };
}

export function mergePlanLoadResults(
  cache: PlanPilotSolutionCache,
  results: PlanPilotPlanLoadResult[],
  errorMessage: (error: unknown) => string,
): { cache: PlanPilotSolutionCache; errors: string[] } {
  const nextCache: PlanPilotSolutionCache = { ...cache };
  const errors: string[] = [];
  for (const result of results) {
    if (result.plan) {
      nextCache[result.number] = {
        label: result.plan.label,
        facets: cloneFacets(result.plan.facets),
      };
    } else if (result.error && !result.unavailable) {
      errors.push(`Plan ${result.number}: ${errorMessage(result.error)}`);
    }
  }
  return { cache: nextCache, errors };
}

export function planPageSummaries(
  cache: PlanPilotSolutionCache,
  numbers: number[],
): PlanPilotPlanSummary[] {
  return numbers.flatMap((number) => {
    const solution = cache[number];
    return solution ? [summarizePlan(number, solution.facets)] : [];
  });
}

function cloneFacets(facets: PlanPilotUiFacet[]): PlanPilotUiFacet[] {
  return facets.map((facet) => ({ ...facet }));
}
