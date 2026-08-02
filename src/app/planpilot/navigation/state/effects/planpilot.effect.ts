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
import { selectReplacedRunId, selectRunId } from "../planpilot.feature";

export const SOLUTION_INITIAL_LIMIT = 5;
export const SOLUTION_PAGE_SIZE = 25;

@Injectable()
export class PlanPilotEffect {
  private actions$ = inject(Actions);
  private service = inject(PlanPilotService);
  private store = inject(Store);

  public refreshSolutions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(startPlanPilotSessionSuccess, submitPlanPilotSelectionsSuccess),
      map(() => queryPlanPilotSolutions({ limit: SOLUTION_INITIAL_LIMIT })),
    ),
  );

  public startSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(startPlanPilotSession),
      concatLatestFrom(() => this.store.select(selectReplacedRunId)),
      switchMap(([{ request }, runId]) => {
        const stopCurrent$ = runId
          ? this.service
              .stopSession$(runId)
              .pipe(catchError(() => of(undefined)))
          : of(undefined);
        return stopCurrent$.pipe(
          switchMap(() => this.service.startSession$(request)),
          map((response) => startPlanPilotSessionSuccess({ response })),
          catchError((err) => of(startPlanPilotSessionFailure({ err }))),
        );
      }),
    ),
  );

  public submitSelections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(submitPlanPilotSelections),
      concatLatestFrom(() => this.store.select(selectRunId)),
      switchMap(([{ requests }, runId]) => {
        if (!runId) {
          return of(
            submitPlanPilotSelectionsFailure({
              err: "No active PlanPilot session.",
            }),
          );
        }
        return this.service.applyFacets$(runId, requests).pipe(
          map((response) =>
            submitPlanPilotSelectionsSuccess({ response, requests }),
          ),
          catchError((err) => of(submitPlanPilotSelectionsFailure({ err }))),
        );
      }),
    ),
  );

  public querySolutionReduction$ = createEffect(() =>
    this.actions$.pipe(
      ofType(queryPlanPilotSolutionReduction),
      concatLatestFrom(() => this.store.select(selectRunId)),
      switchMap(([, runId]) => {
        if (!runId) {
          return of(
            queryPlanPilotSolutionReductionFailure({
              err: "No active PlanPilot session.",
            }),
          );
        }
        return this.service
          .query$(runId, { type: PlanPilotQueryType.SOLUTION_REDUCTION })
          .pipe(
            map((response) =>
              queryPlanPilotSolutionReductionSuccess({
                facets: response.result.facets ?? [],
              }),
            ),
            catchError((err) =>
              of(queryPlanPilotSolutionReductionFailure({ err })),
            ),
          );
      }),
    ),
  );

  public querySolutionCount$ = createEffect(() =>
    this.actions$.pipe(
      ofType(queryPlanPilotSolutionCount),
      concatLatestFrom(() => this.store.select(selectRunId)),
      switchMap(([, runId]) => {
        if (!runId) {
          return of(
            queryPlanPilotSolutionCountFailure({
              err: "No active PlanPilot session.",
            }),
          );
        }
        return this.service
          .query$(runId, { type: PlanPilotQueryType.SOLUTION_COUNT })
          .pipe(
            map((response) =>
              queryPlanPilotSolutionCountSuccess({
                count: response.result.value,
              }),
            ),
            catchError((err) =>
              of(queryPlanPilotSolutionCountFailure({ err })),
            ),
          );
      }),
    ),
  );

  public querySolutions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(queryPlanPilotSolutions),
      concatLatestFrom(() => this.store.select(selectRunId)),
      switchMap(([{ limit }, runId]) => {
        if (!runId) {
          return of(
            queryPlanPilotSolutionsFailure({
              err: "No active PlanPilot session.",
            }),
          );
        }
        return this.service
          .query$(runId, {
            type: PlanPilotQueryType.SOLUTION,
            solutionNumber: limit,
            solutionMode: "prefix",
          })
          .pipe(
            map((response) =>
              queryPlanPilotSolutionsSuccess({
                solutions: response.result.solutions ?? [],
              }),
            ),
            catchError((err) => of(queryPlanPilotSolutionsFailure({ err }))),
          );
      }),
    ),
  );

  public queryImpliedFacets$ = createEffect(() =>
    this.actions$.pipe(
      ofType(queryPlanPilotImpliedFacets),
      concatLatestFrom(() => this.store.select(selectRunId)),
      switchMap(([, runId]) => {
        if (!runId) {
          return of(
            queryPlanPilotImpliedFacetsFailure({
              err: "No active PlanPilot session.",
            }),
          );
        }
        return this.service
          .query$(runId, { type: PlanPilotQueryType.IMPLIED_FACETS })
          .pipe(
            map((response) =>
              queryPlanPilotImpliedFacetsSuccess({
                facets: response.result.facets ?? [],
              }),
            ),
            catchError((err) =>
              of(queryPlanPilotImpliedFacetsFailure({ err })),
            ),
          );
      }),
    ),
  );
}
