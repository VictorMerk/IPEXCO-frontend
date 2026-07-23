import { routes as iterativePlanningRoutes } from '../iterative_planning/iterative-planning.routes';
import { PlanPilotNavigationViewComponent } from './navigation/view/planpilot-navigation-view/planpilot-navigation-view.component';
import { routes as planPilotRoutes } from './planpilot.routes';

describe('PlanPilot routes', () => {
  it('opens navigation first and keeps the graph under the project route', () => {
    const children = planPilotRoutes[0].children ?? [];

    expect(planPilotRoutes[0].path).toBe(':projectId');
    expect(children.map((route) => route.path)).toEqual([
      '',
      'graph',
      'navigation',
    ]);
    expect(children[0].component).toBe(PlanPilotNavigationViewComponent);
    expect(children[2].redirectTo).toBe('');
    expect(children[2].pathMatch).toBe('full');
    expect(planPilotRoutes[0].resolve?.['project']).toBeDefined();
  });

  it('does not add routes to iterative planning', () => {
    const iterativeChildren = iterativePlanningRoutes[0].children ?? [];

    expect(iterativeChildren.map((route) => route.path)).toEqual([
      '',
      'steps',
      'steps/:stepId',
      'steps/:stepId/plan',
    ]);
    expect(iterativeChildren.some((route) => route.path?.includes('planpilot'))).toBeFalse();
  });
});
