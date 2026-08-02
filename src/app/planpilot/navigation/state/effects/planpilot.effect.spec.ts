import { TestBed } from "@angular/core/testing";
import { provideMockActions } from "@ngrx/effects/testing";
import { provideMockStore } from "@ngrx/store/testing";
import { ReplaySubject, firstValueFrom, of } from "rxjs";
import { Action } from "@ngrx/store";
import { PlanPilotService } from "../../service/planpilot.service";
import {
  queryPlanPilotSolutionCount,
  queryPlanPilotSolutionCountSuccess,
  queryPlanPilotSolutions,
  startPlanPilotSessionSuccess,
  submitPlanPilotSelections,
  submitPlanPilotSelectionsSuccess,
} from "../planpilot.actions";
import { selectRunId } from "../planpilot.feature";
import {
  PlanPilotEncoding,
  PlanPilotQueryType,
  PlanPilotRunStatus,
  PlanPilotSelectionState,
} from "../../domain/planpilot";
import { PlanPilotEffect, SOLUTION_INITIAL_LIMIT } from "./planpilot.effect";

describe("PlanPilot navigation effects", () => {
  let actions$: ReplaySubject<Action>;
  let effects: PlanPilotEffect;
  let service: jasmine.SpyObj<PlanPilotService>;

  beforeEach(() => {
    actions$ = new ReplaySubject<Action>(1);
    service = jasmine.createSpyObj<PlanPilotService>("PlanPilotService", [
      "applyFacets$",
      "query$",
      "startSession$",
      "stopSession$",
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlanPilotEffect,
        provideMockActions(() => actions$),
        provideMockStore({
          selectors: [{ selector: selectRunId, value: "run-1" }],
        }),
        { provide: PlanPilotService, useValue: service },
      ],
    });
    effects = TestBed.inject(PlanPilotEffect);
  });

  it("counts plans only when explicitly requested", async () => {
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        result: { type: PlanPilotQueryType.SOLUTION_COUNT, value: 12 },
      }),
    );

    const result = firstValueFrom(effects.querySolutionCount$);
    actions$.next(queryPlanPilotSolutionCount());

    expect(await result).toEqual(
      queryPlanPilotSolutionCountSuccess({
        count: 12,
      }),
    );
    expect(service.query$).toHaveBeenCalledOnceWith("run-1", {
      type: PlanPilotQueryType.SOLUTION_COUNT,
    });
  });

  it("submits all staged decisions in one request", async () => {
    const requests = [
      {
        facetId: "holds-clear-a-t0",
        selectionState: PlanPilotSelectionState.POSITIVE,
        previousSelectionState: PlanPilotSelectionState.NEUTRAL,
      },
    ];
    service.applyFacets$.and.returnValue(of({ runId: "run-1", facets: [] }));

    const result = firstValueFrom(effects.submitSelections$);
    actions$.next(submitPlanPilotSelections({ requests }));

    expect(await result).toEqual(
      submitPlanPilotSelectionsSuccess({
        response: { runId: "run-1", facets: [] },
        requests,
      }),
    );
    expect(service.applyFacets$).toHaveBeenCalledOnceWith("run-1", requests);
  });

  it("loads the first plan page after a session starts", async () => {
    const result = firstValueFrom(effects.refreshSolutions$);

    actions$.next(
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
          facets: [],
        },
      }),
    );

    expect(await result).toEqual(
      queryPlanPilotSolutions({ limit: SOLUTION_INITIAL_LIMIT }),
    );
  });

  it("reloads the first plan page after staged decisions are submitted", async () => {
    const result = firstValueFrom(effects.refreshSolutions$);

    actions$.next(
      submitPlanPilotSelectionsSuccess({
        response: { runId: "run-1", facets: [] },
        requests: [],
      }),
    );

    expect(await result).toEqual(
      queryPlanPilotSolutions({ limit: SOLUTION_INITIAL_LIMIT }),
    );
  });
});
