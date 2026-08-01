import { createReducer, on } from "@ngrx/store";
import {
  PlanPilotFacet,
  PlanPilotSelectionState,
  PlanPilotSessionConfiguration,
  PlanPilotSolution,
} from "../domain/planpilot";
import {
  clearPlanPilotImpliedFacets,
  queryPlanPilotImpliedFacets,
  queryPlanPilotImpliedFacetsFailure,
  queryPlanPilotImpliedFacetsSuccess,
  queryPlanPilotSolutionCount,
  queryPlanPilotSolutionCountFailure,
  queryPlanPilotSolutionCountSuccess,
  queryPlanPilotSolutionReduction,
  queryPlanPilotSolutionReductionFailure,
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
  replacedRunId: string | undefined;
  facets: PlanPilotFacet[];
  // The decisions the user has committed (selectionState !== neutral).
  // Tracked separately because the backend usually drops a decided facet
  // from the open-facet list once it is committed.
  decisions: PlanPilotFacet[];
  solutionCount: number | undefined;
  solutions: PlanPilotSolution[];
  solutionLimit: number;
  countLoading: boolean;
  reductionLoading: boolean;
  solutionsLoading: boolean;
  configuration: PlanPilotSessionConfiguration | undefined;
  requestedHorizon: number | undefined;
  minimumHorizon: number | null | undefined;
  // The implied facets ('|= %'): landmarks forced by the committed decisions.
  impliedFacets: PlanPilotFacet[];
  impliedFacetsShown: boolean;
  impliedFacetsLoading: boolean;
  loading: boolean;
  error: unknown;
}

export const initialPlanPilotState: PlanPilotState = {
  runId: undefined,
  replacedRunId: undefined,
  facets: [],
  decisions: [],
  solutionCount: undefined,
  solutions: [],
  solutionLimit: 0,
  countLoading: false,
  reductionLoading: false,
  solutionsLoading: false,
  configuration: undefined,
  requestedHorizon: undefined,
  minimumHorizon: undefined,
  impliedFacets: [],
  impliedFacetsShown: false,
  impliedFacetsLoading: false,
  loading: false,
  error: undefined,
};

export const planPilotReducer = createReducer(
  initialPlanPilotState,

  on(startPlanPilotSession, (state, { request }) => ({
    ...initialPlanPilotState,
    loading: true,
    replacedRunId: state.runId,
    requestedHorizon: request.horizon,
  })),

  on(startPlanPilotSessionSuccess, (state, { response }) => ({
    ...state,
    loading: false,
    runId: response.runId,
    replacedRunId: undefined,
    facets: response.facets,
    decisions: [],
    solutionCount: response.solutionCount ?? undefined,
    solutions: response.solution ? [response.solution] : [],
    configuration: response.configuration,
    minimumHorizon: response.minimumHorizon,
    impliedFacets: [],
    impliedFacetsShown: false,
  })),

  on(startPlanPilotSessionFailure, (state, { err }) => ({
    ...state,
    loading: false,
    runId: undefined,
    replacedRunId: undefined,
    facets: [],
    decisions: [],
    solutions: [],
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
      solutionCount: response.solutionCount ?? undefined,
      solutions: response.solution ? [response.solution] : [],
      solutionLimit: 0,
      impliedFacets: [],
      impliedFacetsShown: false,
    };
  }),

  on(submitPlanPilotSelectionsFailure, (state, { err }) => ({
    ...state,
    loading: false,
    error: err,
  })),

  on(queryPlanPilotSolutionCount, (state) => ({
    ...state,
    countLoading: true,
    error: undefined,
  })),

  on(queryPlanPilotSolutionCountSuccess, (state, { count }) => ({
    ...state,
    solutionCount: count,
    countLoading: false,
  })),

  on(queryPlanPilotSolutionCountFailure, (state, { err }) => ({
    ...state,
    countLoading: false,
    error: err,
  })),

  // Merge the per-facet what-if plan counts ('#!!') into the stored facets:
  // remaining.solution.positive/negative = plans left when enforcing/forbidding.
  on(queryPlanPilotSolutionReduction, (state) => ({
    ...state,
    reductionLoading: true,
    error: undefined,
  })),

  on(queryPlanPilotSolutionReductionSuccess, (state, { facets }) => {
    const countsById = new Map(facets.map((facet) => [facet.id, facet]));
    return {
      ...state,
      reductionLoading: false,
      facets: state.facets.map((facet) => {
        const counts = countsById.get(facet.id);
        return counts
          ? {
              ...facet,
              reduction: counts.reduction,
              remaining: counts.remaining,
            }
          : facet;
      }),
    };
  }),

  on(queryPlanPilotSolutionReductionFailure, (state, { err }) => ({
    ...state,
    reductionLoading: false,
    error: err,
  })),

  on(queryPlanPilotSolutions, (state, { limit }) => ({
    ...state,
    solutionLimit: limit,
    solutionsLoading: true,
  })),

  on(queryPlanPilotSolutionsSuccess, (state, { solutions }) => ({
    ...state,
    solutions,
    solutionsLoading: false,
  })),

  on(queryPlanPilotSolutionsFailure, (state, { err }) => ({
    ...state,
    solutionsLoading: false,
    error: err,
  })),

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
