import {
  PlanPilotEncoding,
  PlanPilotRunStatus,
  PlanPilotSelectionState,
} from "../domain/planpilot";
import {
  startPlanPilotSession,
  startPlanPilotSessionSuccess,
  submitPlanPilotSelections,
  submitPlanPilotSelectionsFailure,
  submitPlanPilotSelectionsSuccess,
} from "./planpilot.actions";
import { initialPlanPilotState, planPilotReducer } from "./planpilot.reducer";

describe("PlanPilot navigation reducer", () => {
  const openFacet = {
    id: "holds-clear-a-t0",
    label: "clear a",
    timestep: 0,
    selectionState: PlanPilotSelectionState.NEUTRAL,
  };
  const request = {
    facetId: openFacet.id,
    selectionState: PlanPilotSelectionState.POSITIVE,
    previousSelectionState: PlanPilotSelectionState.NEUTRAL,
  };

  function readyState() {
    return planPilotReducer(
      initialPlanPilotState,
      startPlanPilotSessionSuccess({
        response: {
          runId: "run-1",
          externalSessionId: "session-1",
          status: PlanPilotRunStatus.READY,
          configuration: {
            horizon: 10,
            encoding: PlanPilotEncoding.BOUNDED,
            abstractTimeSteps: false,
            stateFacets: true,
          },
          facets: [openFacet],
        },
      }),
    );
  }

  it("does not commit a staged decision before the batch succeeds", () => {
    const state = planPilotReducer(
      readyState(),
      submitPlanPilotSelections({
        requests: [request],
      }),
    );

    expect(state.decisions).toEqual([]);
    expect(state.loading).toBeTrue();
  });

  it("clears the previous result as soon as a replacement starts", () => {
    const state = planPilotReducer(
      readyState(),
      startPlanPilotSession({
        request: {
          projectId: "project-1",
          horizon: 5,
          encoding: PlanPilotEncoding.BOUNDED,
          abstractTimeSteps: false,
        },
      }),
    );

    expect(state.runId).toBeUndefined();
    expect(state.replacedRunId).toBe('run-1');
    expect(state.facets).toEqual([]);
    expect(state.solutions).toEqual([]);
    expect(state.requestedHorizon).toBe(5);
    expect(state.loading).toBeTrue();
  });

  it("stores the effective horizon returned by PlanPilot", () => {
    const state = planPilotReducer(
      initialPlanPilotState,
      startPlanPilotSessionSuccess({
        response: {
          runId: "run-1",
          externalSessionId: "session-1",
          status: PlanPilotRunStatus.READY,
          configuration: {
            horizon: 8,
            encoding: PlanPilotEncoding.BOUNDED,
            abstractTimeSteps: false,
            stateFacets: true,
          },
          minimumHorizon: 8,
          facets: [],
        },
      }),
    );

    expect(state.configuration?.horizon).toBe(8);
    expect(state.minimumHorizon).toBe(8);
  });

  it("commits the decision from a successful batch", () => {
    const state = planPilotReducer(
      readyState(),
      submitPlanPilotSelectionsSuccess({
        requests: [request],
        response: { runId: "run-1", facets: [] },
      }),
    );

    expect(state.decisions).toEqual([
      {
        ...openFacet,
        selectionState: PlanPilotSelectionState.POSITIVE,
      },
    ]);
  });

  it("keeps the previous decisions after a failed batch", () => {
    const ready = readyState();
    const state = planPilotReducer(
      ready,
      submitPlanPilotSelectionsFailure({
        err: new Error("failed"),
      }),
    );

    expect(state.decisions).toEqual(ready.decisions);
  });
});
