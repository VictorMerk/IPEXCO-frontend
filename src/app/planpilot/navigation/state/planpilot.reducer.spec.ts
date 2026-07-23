import {
  PlanPilotEncoding,
  PlanPilotRunStatus,
  PlanPilotSelectionState,
} from '../domain/planpilot';
import {
  startPlanPilotSessionSuccess,
  submitPlanPilotSelections,
  submitPlanPilotSelectionsFailure,
  submitPlanPilotSelectionsSuccess,
} from './planpilot.actions';
import { initialPlanPilotState, planPilotReducer } from './planpilot.reducer';

describe('PlanPilot navigation reducer', () => {
  const openFacet = {
    id: 'holds-clear-a-t0',
    label: 'clear a',
    timestep: 0,
    selectionState: PlanPilotSelectionState.NEUTRAL,
  };
  const request = {
    facetId: openFacet.id,
    selectionState: PlanPilotSelectionState.POSITIVE,
    previousSelectionState: PlanPilotSelectionState.NEUTRAL,
  };

  function readyState() {
    return planPilotReducer(initialPlanPilotState, startPlanPilotSessionSuccess({
      response: {
        runId: 'run-1',
        externalSessionId: 'session-1',
        status: PlanPilotRunStatus.READY,
        configuration: {
          horizon: 10,
          encoding: PlanPilotEncoding.BOUNDED,
          abstractTimeSteps: false,
          stateFacets: true,
        },
        facets: [openFacet],
      },
    }));
  }

  it('does not commit a staged decision before the batch succeeds', () => {
    const state = planPilotReducer(readyState(), submitPlanPilotSelections({
      requests: [request],
    }));

    expect(state.decisions).toEqual([]);
    expect(state.loading).toBeTrue();
  });

  it('commits the decision from a successful batch', () => {
    const state = planPilotReducer(readyState(), submitPlanPilotSelectionsSuccess({
      requests: [request],
      response: { runId: 'run-1', facets: [] },
    }));

    expect(state.decisions).toEqual([{
      ...openFacet,
      selectionState: PlanPilotSelectionState.POSITIVE,
    }]);
  });

  it('keeps the previous decisions after a failed batch', () => {
    const ready = readyState();
    const state = planPilotReducer(ready, submitPlanPilotSelectionsFailure({
      err: new Error('failed'),
    }));

    expect(state.decisions).toEqual(ready.decisions);
  });
});
