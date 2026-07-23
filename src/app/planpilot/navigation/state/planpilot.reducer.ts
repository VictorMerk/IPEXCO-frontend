import { createReducer, on } from "@ngrx/store";
import { PlanPilotFacet, PlanPilotSelectionState, PlanPilotSolution } from "../domain/planpilot";
import {
  clearPlanPilotImpliedFacets,
  queryPlanPilotImpliedFacets,
  queryPlanPilotImpliedFacetsFailure,
  queryPlanPilotImpliedFacetsSuccess,
  queryPlanPilotSolutionCount,
  queryPlanPilotSolutionCountFailure,
  queryPlanPilotSolutionCountSuccess,
  queryPlanPilotSolutionReductionSuccess,
  queryPlanPilotSolutions,
  queryPlanPilotSolutionsFailure,
  queryPlanPilotSolutionsSuccess,
  startPlanPilotSession,
  startPlanPilotSessionFailure,
  startPlanPilotSessionSuccess,
  submitPlanPilotSelections,
  submitPlanPilotSelectionsFailure,
  submitPlanPilotSelectionsSuccess,
} from "./planpilot.actions";

export interface PlanPilotState {
  runId: string | undefined;
  facets: PlanPilotFacet[];
  // The decisions the user has committed (selectionState !== neutral).
  // Tracked separately because the backend usually drops a decided facet
  // from the open-facet list once it is committed.
  decisions: PlanPilotFacet[];
  // Number of solutions (plans) still consistent with the committed decisions.
  solutionCount: number | undefined;
  // The remaining plans themselves, enumerated one page at a time.
  solutions: PlanPilotSolution[];
  // How many plans the last enumeration asked for.
  solutionLimit: number;
  // True while the count/enumeration queries are (re)calculating.
  solutionsLoading: boolean;
  // The implied facets ('|= %'): landmarks forced by the committed decisions.
  impliedFacets: PlanPilotFacet[];
  // Whether the implied-facets panel has been requested/shown.
  impliedFacetsShown: boolean;
  // True while the implied-facets query is running.
  impliedFacetsLoading: boolean;
  loading: boolean;
  error: unknown;
}

export const initialPlanPilotState: PlanPilotState = {
  runId: undefined,
  facets: [],
  decisions: [],
  solutionCount: undefined,
  solutions: [],
  solutionLimit: 0,
  solutionsLoading: false,
  impliedFacets: [],
  impliedFacetsShown: false,
  impliedFacetsLoading: false,
  loading: false,
  error: undefined,
};

export const planPilotReducer = createReducer(
  initialPlanPilotState,

  // Trigger: HTTP starts → loading on, clear previous error
  on(startPlanPilotSession, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),

  // Success: write the response into the state (fresh session -> no decisions yet)
  on(startPlanPilotSessionSuccess, (state, { response }) => ({
    ...state,
    loading: false,
    runId: response.runId,
    facets: response.facets,
    decisions: [],
    solutionCount: undefined,
    solutions: [],
    impliedFacets: [],
    impliedFacetsShown: false,
  })),

  // Failure: loading off, remember the error
  on(startPlanPilotSessionFailure, (state, { err }) => ({
    ...state,
    loading: false,
    error: err,
  })),

  on(submitPlanPilotSelections, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),

  on(submitPlanPilotSelectionsSuccess, (state, { response, requests }) => {
    let decisions = state.decisions;

    for (const request of requests) {
      const others = decisions.filter((d) => d.id !== request.facetId);
      if (request.selectionState !== PlanPilotSelectionState.NEUTRAL) {
        const facet =
          state.facets.find((f) => f.id === request.facetId) ??
          decisions.find((d) => d.id === request.facetId);
        decisions = facet
          ? [...others, { ...facet, selectionState: request.selectionState }]
          : others;
      } else {
        decisions = others;
      }
    }

    return {
      ...state,
      loading: false,
      runId: response.runId,
      facets: response.facets,
      decisions,
      impliedFacets: [],
      impliedFacetsShown: false,
    };
  }),

  on(submitPlanPilotSelectionsFailure, (state, { err }) => ({
    ...state,
    loading: false,
    error: err,
  })),

  // Recalculation starts: the count/enumeration chain is triggered.
  on(queryPlanPilotSolutionCount, (state) => ({
    ...state,
    solutionsLoading: true,
  })),

  // Counter refresh: store the number of remaining solutions.
  on(queryPlanPilotSolutionCountSuccess, (state, { count }) => ({
    ...state,
    solutionCount: count,
  })),

  // Merge the per-facet what-if plan counts ('#!!') into the stored facets:
  // remaining.solution.positive/negative = plans left when enforcing/forbidding.
  on(queryPlanPilotSolutionReductionSuccess, (state, { facets }) => {
    const countsById = new Map(facets.map((facet) => [facet.id, facet]));
    return {
      ...state,
      facets: state.facets.map((facet) => {
        const counts = countsById.get(facet.id);
        return counts
          ? { ...facet, reduction: counts.reduction, remaining: counts.remaining }
          : facet;
      }),
    };
  }),

  // A page of plans was requested (first page or "show more").
  on(queryPlanPilotSolutions, (state, { limit }) => ({
    ...state,
    solutionLimit: limit,
    solutionsLoading: true,
  })),

  // Store the enumerated remaining plans.
  // This is the end of the chain, so the recalculation is done.
  on(queryPlanPilotSolutionsSuccess, (state, { solutions }) => ({
    ...state,
    solutions,
    solutionsLoading: false,
  })),

  // Any query failure also ends the recalculation.
  on(queryPlanPilotSolutionCountFailure, queryPlanPilotSolutionsFailure, (state) => ({
    ...state,
    solutionsLoading: false,
  })),

  // Implied facets ('|= %') requested: mark shown + loading.
  on(queryPlanPilotImpliedFacets, (state) => ({
    ...state,
    impliedFacetsShown: true,
    impliedFacetsLoading: true,
    error: undefined,
  })),

  on(queryPlanPilotImpliedFacetsSuccess, (state, { facets }) => ({
    ...state,
    impliedFacets: facets,
    impliedFacetsLoading: false,
  })),

  on(queryPlanPilotImpliedFacetsFailure, (state, { err }) => ({
    ...state,
    impliedFacetsLoading: false,
    error: err,
  })),

  on(clearPlanPilotImpliedFacets, (state) => ({
    ...state,
    impliedFacets: [],
    impliedFacetsShown: false,
  })),
);
