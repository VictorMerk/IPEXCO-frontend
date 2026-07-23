import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { ReplaySubject, firstValueFrom, of } from 'rxjs';
import { Action } from '@ngrx/store';
import { PlanPilotService } from '../../service/planpilot.service';
import {
  queryPlanPilotSolutionCountFailure,
  queryPlanPilotSolutions,
  submitPlanPilotSelections,
  submitPlanPilotSelectionsSuccess,
} from '../planpilot.actions';
import { selectRunId } from '../planpilot.feature';
import { PlanPilotSelectionState } from '../../domain/planpilot';
import { PlanPilotEffect, SOLUTION_PAGE_SIZE } from './planpilot.effect';

describe('PlanPilot navigation effects', () => {
  let actions$: ReplaySubject<Action>;
  let effects: PlanPilotEffect;
  let service: jasmine.SpyObj<PlanPilotService>;

  beforeEach(() => {
    actions$ = new ReplaySubject<Action>(1);
    service = jasmine.createSpyObj<PlanPilotService>('PlanPilotService', [
      'applyFacets$',
      'query$',
      'startSession$',
      'stopSession$',
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlanPilotEffect,
        provideMockActions(() => actions$),
        provideMockStore({ selectors: [{ selector: selectRunId, value: 'run-1' }] }),
        { provide: PlanPilotService, useValue: service },
      ],
    });
    effects = TestBed.inject(PlanPilotEffect);
  });

  it('loads the first page when the complete count times out', async () => {
    const result = firstValueFrom(effects.refreshSolutions$);
    actions$.next(queryPlanPilotSolutionCountFailure({ err: new Error('timeout') }));

    expect(await result).toEqual(queryPlanPilotSolutions({ limit: SOLUTION_PAGE_SIZE }));
  });

  it('submits all staged decisions in one request', async () => {
    const requests = [{
      facetId: 'holds-clear-a-t0',
      selectionState: PlanPilotSelectionState.POSITIVE,
      previousSelectionState: PlanPilotSelectionState.NEUTRAL,
    }];
    service.applyFacets$.and.returnValue(of({ runId: 'run-1', facets: [] }));

    const result = firstValueFrom(effects.submitSelections$);
    actions$.next(submitPlanPilotSelections({ requests }));

    expect(await result).toEqual(submitPlanPilotSelectionsSuccess({
      response: { runId: 'run-1', facets: [] },
      requests,
    }));
    expect(service.applyFacets$).toHaveBeenCalledOnceWith('run-1', requests);
  });
});
