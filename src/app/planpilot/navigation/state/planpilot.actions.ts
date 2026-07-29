import { createAction, props } from "@ngrx/store";
import {
  PlanPilotFacet,
  PlanPilotFacetsResponse,
  PlanPilotSolution,
  SelectPlanPilotFacetRequest,
  StartPlanPilotSessionRequest,
  StartPlanPilotSessionResponse,
} from "../domain/planpilot";

export const startPlanPilotSession = createAction(
  "[planpilot] start session",
  props<{ request: StartPlanPilotSessionRequest }>(),
);
export const startPlanPilotSessionSuccess = createAction(
  "[planpilot] start session success",
  props<{ response: StartPlanPilotSessionResponse }>(),
);
export const startPlanPilotSessionFailure = createAction(
  "[planpilot] start session failure",
  props<{ err: unknown }>(),
);

export const submitPlanPilotSelections = createAction(
  "[planpilot] submit selections",
  props<{ requests: SelectPlanPilotFacetRequest[] }>(),
);
export const submitPlanPilotSelectionsSuccess = createAction(
  "[planpilot] submit selections success",
  props<{
    response: PlanPilotFacetsResponse;
    requests: SelectPlanPilotFacetRequest[];
  }>(),
);
export const submitPlanPilotSelectionsFailure = createAction(
  "[planpilot] submit selections failure",
  props<{ err: unknown }>(),
);

export const queryPlanPilotSolutionCount = createAction(
  "[planpilot] query solution count",
);
export const queryPlanPilotSolutionCountSuccess = createAction(
  "[planpilot] query solution count success",
  props<{ count: number | undefined }>(),
);
export const queryPlanPilotSolutionCountFailure = createAction(
  "[planpilot] query solution count failure",
  props<{ err: unknown }>(),
);

export const queryPlanPilotSolutions = createAction(
  "[planpilot] query solutions",
  props<{ limit: number }>(),
);
export const queryPlanPilotSolutionsSuccess = createAction(
  "[planpilot] query solutions success",
  props<{ solutions: PlanPilotSolution[] }>(),
);
export const queryPlanPilotSolutionsFailure = createAction(
  "[planpilot] query solutions failure",
  props<{ err: unknown }>(),
);

export const queryPlanPilotSolutionReduction = createAction(
  "[planpilot] query solution reduction",
);
export const queryPlanPilotSolutionReductionSuccess = createAction(
  "[planpilot] query solution reduction success",
  props<{ facets: PlanPilotFacet[] }>(),
);
export const queryPlanPilotSolutionReductionFailure = createAction(
  "[planpilot] query solution reduction failure",
  props<{ err: unknown }>(),
);

export const queryPlanPilotImpliedFacets = createAction(
  "[planpilot] query implied facets",
);
export const queryPlanPilotImpliedFacetsSuccess = createAction(
  "[planpilot] query implied facets success",
  props<{ facets: PlanPilotFacet[] }>(),
);
export const queryPlanPilotImpliedFacetsFailure = createAction(
  "[planpilot] query implied facets failure",
  props<{ err: unknown }>(),
);
export const clearPlanPilotImpliedFacets = createAction(
  "[planpilot] clear implied facets",
);
