import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlanPilotService } from './planpilot.service';

describe('PlanPilotService', () => {
  let service: PlanPilotService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanPilotService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends require and forbid as one request and exposes only the confirmed result', () => {
    let confirmedState: string | undefined;
    let confirmedSolutionCount: number | null | undefined;

    service.applyFacets$('run-1', {
      selections: [
        { facetId: 'include-me', selectionState: 'positive', previousSelectionState: 'neutral' },
        { facetId: 'exclude-me', selectionState: 'negative', previousSelectionState: 'neutral' },
      ],
    }).subscribe((response) => {
      confirmedState = response.facets[0].selectionState;
      confirmedSolutionCount = response.solutionCount;
    });

    const request = http.expectOne((candidate) => candidate.url.endsWith('/planpilot/sessions/run-1/facets/apply'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.selections).toHaveSize(2);
    expect(confirmedState).toBeUndefined();

    request.flush({
      runId: 'run-1',
      selectionRevision: 1,
      solutionCount: 15,
      solution: {
        label: 'solution 1',
        facets: [{ id: 'include-me', label: 'Include me', timestep: 1, selectionState: 'neutral' }],
      },
      facets: [{
        id: 'include-me',
        label: 'Include me',
        timestep: 1,
        selectionState: 'positive',
      }],
    });

    expect(confirmedState).toBe('positive');
    expect(confirmedSolutionCount).toBe(15);
  });

  it('forwards horizon and encoding when creating a session', () => {
    service.startSession$({
      projectId: 'project-1',
      horizon: 12,
      encoding: 'exact',
      abstractTimeSteps: false,
    }).subscribe();

    const exact = http.expectOne((request) => request.url.endsWith('/planpilot/sessions'));
    expect(exact.request.method).toBe('POST');
    expect(exact.request.body).toEqual({
      projectId: 'project-1',
      horizon: 12,
      encoding: 'exact',
      abstractTimeSteps: false,
    });
    exact.flush({
      runId: 'run-exact',
      status: 'READY',
      configuration: { horizon: 12, encoding: 'exact', abstractTimeSteps: false },
      facets: [],
    });

    service.startSession$({
      projectId: 'project-1',
      horizon: 20,
      encoding: 'bounded',
      abstractTimeSteps: false,
    }).subscribe();

    const bounded = http.expectOne((request) => request.url.endsWith('/planpilot/sessions'));
    expect(bounded.request.body.encoding).toBe('bounded');
    expect(bounded.request.body.horizon).toBe(20);
    bounded.flush({
      runId: 'run-bounded',
      status: 'READY',
      configuration: { horizon: 20, encoding: 'bounded', abstractTimeSteps: false },
      facets: [],
    });
  });

  it('requests a numbered concrete solution and stops the same backend run', () => {
    service.query$('run-1', 'solution', 3).subscribe();

    const query = http.expectOne((request) => request.url.endsWith('/planpilot/sessions/run-1/query'));
    expect(query.request.method).toBe('POST');
    expect(query.request.body).toEqual({ type: 'solution', solutionNumber: 3 });
    query.flush({ runId: 'run-1', result: { type: 'solution', solutions: [] } });

    service.stopSession$('run-1').subscribe();

    const stop = http.expectOne((request) => request.url.endsWith('/planpilot/sessions/run-1'));
    expect(stop.request.method).toBe('DELETE');
    expect(stop.request.body).toBeNull();
    stop.flush({ runId: 'run-1', status: 'STOPPED' });
  });

  it('revalidates a restored browser session through the facet endpoint', () => {
    service.revalidateSession$('run-1').subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/planpilot/sessions/run-1/facets/list'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ runId: 'run-1', selectionRevision: 3, facets: [] });
  });

  it('keeps the stop request alive while the page unloads', () => {
    localStorage.setItem('jwt-token', 'test-token');
    const request = spyOn(window, 'fetch').and.returnValue(Promise.resolve({} as Response));

    service.stopSessionOnUnload('run/1');

    expect(request).toHaveBeenCalledOnceWith(
      jasmine.stringMatching(/planpilot\/sessions\/run%2F1$/),
      jasmine.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
        keepalive: true,
      }),
    );
    localStorage.removeItem('jwt-token');
  });

  it('requests required actions without a solution number', () => {
    service.query$('run-1', 'impliedFacets').subscribe();

    const query = http.expectOne((request) => request.url.endsWith('/planpilot/sessions/run-1/query'));
    expect(query.request.method).toBe('POST');
    expect(query.request.body).toEqual({ type: 'impliedFacets' });
    query.flush({ runId: 'run-1', result: { type: 'impliedFacets', facets: [] } });
  });

  it('requests impact for only the selected facet', () => {
    service.selectionImpact$('run-1', 'facet-7').subscribe();

    const query = http.expectOne((request) => request.url.endsWith('/planpilot/sessions/run-1/query'));
    expect(query.request.method).toBe('POST');
    expect(query.request.body).toEqual({
      type: 'selectionImpact',
      facetId: 'facet-7',
    });
    query.flush({
      runId: 'run-1',
      selectionRevision: 0,
      solutionCount: null,
      result: {
        type: 'selectionImpact',
        facetId: 'facet-7',
        exact: false,
        comparableToCurrent: true,
        totalPlans: null,
        require: { available: true, plansRemaining: null, planReduction: null },
        forbid: { available: true, plansRemaining: null, planReduction: null },
      },
    });
  });
});
