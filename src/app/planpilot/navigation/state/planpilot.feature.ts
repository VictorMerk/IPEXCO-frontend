import { createFeature } from "@ngrx/store";
import { planPilotReducer } from "./planpilot.reducer";

export const planPilotFeature = createFeature({
  name: "planPilotFeature",
  reducer: planPilotReducer,
});

export const {
  name,
  reducer,
  selectRunId,
  selectReplacedRunId,
  selectFacets,
  selectDecisions,
  selectSolutionCount,
  selectSolutions,
  selectSolutionLimit,
  selectCountLoading,
  selectReductionLoading,
  selectSolutionsLoading,
  selectConfiguration,
  selectRequestedHorizon,
  selectMinimumHorizon,
  selectImpliedFacets,
  selectImpliedFacetsShown,
  selectImpliedFacetsLoading,
  selectLoading,
  selectError,
} = planPilotFeature;
