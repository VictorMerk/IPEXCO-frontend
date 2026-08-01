import { inject, Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { concatLatestFrom } from "@ngrx/operators";
import { Store } from "@ngrx/store";
import { of } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { PlanPilotQueryType } from "../../domain/planpilot";
import { PlanPilotService } from "../../service/planpilot.service";
import {
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
} from "../planpilot.actions";
import { selectRunId } from "../planpilot.feature";

// Plans shown on first load; "Show more" then adds SOLUTION_PAGE_SIZE each time.
export const SOLUTION_INITIAL_LIMIT = 5;
export const SOLUTION_PAGE_SIZE = 25;

@Injectable()
export class PlanPilotEffect {

  private actions$ = inject(Actions);
  private service = inject(PlanPilotService);
  private store = inject(Store);

  public startSession$ = createEffect(() => this.actions$.pipe(
    ofType(startPlanPilotSession),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([{ request }, runId]) => {
      const stopCurrent$ = runId
        ? this.service.stopSession$(runId).pipe(catchError(() => of(undefined)))
        : of(undefined);
      return stopCurrent$.pipe(
        switchMap(() => this.service.startSession$(request)),
        map((response) => startPlanPilotSessionSuccess({ response })),
        catchError((err) => of(startPlanPilotSessionFailure({ err }))),
      );
    }),
  ));

  // Apply staged selections as one transaction.
  public submitSelections$ = createEffect(() => this.actions$.pipe(
    ofType(submitPlanPilotSelections),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([{ requests }, runId]) => {
      if (!runId) {
        return of(submitPlanPilotSelectionsFailure({ err: "No active PlanPilot session." }));
      }
      return this.service.applyFacets$(runId, requests).pipe(
        map((response) => submitPlanPilotSelectionsSuccess({ response, requests })),
        catchError((err) => of(submitPlanPilotSelectionsFailure({ err }))),
      );
    }),
  ));

  // After a session starts or the staged selections are submitted, recalculate.
  public refreshSolutionCount$ = createEffect(() => this.actions$.pipe(
    ofType(startPlanPilotSessionSuccess, submitPlanPilotSelectionsSuccess),
    map(() => queryPlanPilotSolutionCount()),
  ));

  // ... and refresh the per-facet what-if plan counts as well.
  public refreshSolutionReduction$ = createEffect(() => this.actions$.pipe(
    ofType(startPlanPilotSessionSuccess, submitPlanPilotSelectionsSuccess),
    map(() => queryPlanPilotSolutionReduction()),
  ));

  // Query, for every open facet, how many plans enforcing/forbidding it leaves.
  public querySolutionReduction$ = createEffect(() => this.actions$.pipe(
    ofType(queryPlanPilotSolutionReduction),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([, runId]) => {
      if (!runId) {
        return of(queryPlanPilotSolutionReductionFailure({ err: "No active PlanPilot session." }));
      }
      return this.service.query$(runId, { type: PlanPilotQueryType.SOLUTION_REDUCTION }).pipe(
        map((response) => queryPlanPilotSolutionReductionSuccess({ facets: response.result.facets ?? [] })),
        catchError((err) => of(queryPlanPilotSolutionReductionFailure({ err }))),
      );
    }),
  ));

  // Query the number of solutions still consistent with the decisions.
  public querySolutionCount$ = createEffect(() => this.actions$.pipe(
    ofType(queryPlanPilotSolutionCount),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([, runId]) => {
      if (!runId) {
        return of(queryPlanPilotSolutionCountFailure({ err: "No active PlanPilot session." }));
      }
      return this.service.query$(runId, { type: PlanPilotQueryType.SOLUTION_COUNT }).pipe(
        map((response) => queryPlanPilotSolutionCountSuccess({ count: response.result.value })),
        catchError((err) => of(queryPlanPilotSolutionCountFailure({ err }))),
      );
    }),
  ));

  // List the first page even when counting the complete space times out.
  public refreshSolutions$ = createEffect(() => this.actions$.pipe(
    ofType(queryPlanPilotSolutionCountSuccess, queryPlanPilotSolutionCountFailure),
    map((action) =>
      action.type === queryPlanPilotSolutionCountFailure.type || action.count === undefined || action.count > 0
        ? queryPlanPilotSolutions({ limit: SOLUTION_INITIAL_LIMIT })
        : queryPlanPilotSolutionsSuccess({ solutions: [] }),
    ),
  ));

  // Enumerate the solutions (plans) still consistent with the decisions.
  public querySolutions$ = createEffect(() => this.actions$.pipe(
    ofType(queryPlanPilotSolutions),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([{ limit }, runId]) => {
      if (!runId) {
        return of(queryPlanPilotSolutionsFailure({ err: "No active PlanPilot session." }));
      }
      return this.service.query$(runId, {
        type: PlanPilotQueryType.SOLUTION,
        solutionNumber: limit,
        solutionMode: 'prefix',
      }).pipe(
        map((response) => queryPlanPilotSolutionsSuccess({ solutions: response.result.solutions ?? [] })),
        catchError((err) => of(queryPlanPilotSolutionsFailure({ err }))),
      );
    }),
  ));

  // Query the implied facets ('|= %') forced by the committed decisions.
  public queryImpliedFacets$ = createEffect(() => this.actions$.pipe(
    ofType(queryPlanPilotImpliedFacets),
    concatLatestFrom(() => this.store.select(selectRunId)),
    switchMap(([, runId]) => {
      if (!runId) {
        return of(queryPlanPilotImpliedFacetsFailure({ err: "No active PlanPilot session." }));
      }
      return this.service.query$(runId, { type: PlanPilotQueryType.IMPLIED_FACETS }).pipe(
        map((response) => queryPlanPilotImpliedFacetsSuccess({ facets: response.result.facets ?? [] })),
        catchError((err) => of(queryPlanPilotImpliedFacetsFailure({ err }))),
      );
    }),
  ));
}
