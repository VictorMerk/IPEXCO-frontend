import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  PlanPilotEncoding,
  PlanPilotQueryType,
  PlanPilotSelectionState,
} from '../domain/planpilot';
import { PlanPilotService } from './planpilot.service';

describe('PlanPilot navigation service', () => {
  let service: PlanPilotService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlanPilotService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PlanPilotService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests state facets when it starts its own view', () => {
    service.startSession$({
      projectId: 'project-1',
      horizon: 6,
      encoding: PlanPilotEncoding.BOUNDED,
      abstractTimeSteps: false,
      stateFacets: true,
    }).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/planpilot/sessions'),
    );
    expect(request.request.body.stateFacets).toBeTrue();
    request.flush({
      runId: 'run-1',
      externalSessionId: 'session-1',
      status: 'READY',
      configuration: {
        horizon: 6,
        encoding: 'bounded',
        abstractTimeSteps: false,
        stateFacets: true,
      },
      facets: [],
    });
  });

  it('can request the prefix needed by the plan list', () => {
    service.query$('run-1', {
      type: PlanPilotQueryType.SOLUTION,
      solutionNumber: 25,
      solutionMode: 'prefix',
    }).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/planpilot/sessions/run-1/query'),
    );
    expect(request.request.body).toEqual({
      type: 'solution',
      solutionNumber: 25,
      solutionMode: 'prefix',
    });
    request.flush({
      runId: 'run-1',
      result: { type: 'solution', solutions: [] },
    });
  });

  it('applies a staged batch in one request', () => {
    const selections = [{
      facetId: 'holds-clear-a-t0',
      selectionState: PlanPilotSelectionState.POSITIVE,
      previousSelectionState: PlanPilotSelectionState.NEUTRAL,
    }];

    service.applyFacets$('run-1', selections).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/planpilot/sessions/run-1/facets/apply'),
    );
    expect(request.request.body).toEqual({ selections });
    request.flush({ runId: 'run-1', facets: [] });
  });

  it('can stop the navigation session', () => {
    service.stopSession$('run-1').subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url.endsWith('/planpilot/sessions/run-1'),
    );
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
