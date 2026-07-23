import { Routes } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { ProjectService } from 'src/app/project/service/project.service';
import { PlanPilotEffect } from './navigation/state/effects/planpilot.effect';
import { planPilotFeature } from './navigation/state/planpilot.feature';
import { PlanPilotService } from './navigation/service/planpilot.service';
import { PlanPilotNavigationViewComponent } from './navigation/view/planpilot-navigation-view/planpilot-navigation-view.component';
import { loadPlanPilotProjectResolver } from './resolver/load-planpilot-project.resolver';
import { PlanPilotViewComponent } from './view/planpilot-view/planpilot-view.component';

export const routes: Routes = [
  {
    path: ':projectId',
    resolve: { project: loadPlanPilotProjectResolver },
    providers: [
      ProjectService,
      provideState(planPilotFeature),
      provideEffects([PlanPilotEffect]),
      PlanPilotService,
    ],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    children: [
      { path: '', component: PlanPilotNavigationViewComponent },
      { path: 'graph', component: PlanPilotViewComponent },
      { path: 'navigation', redirectTo: '', pathMatch: 'full' },
    ],
  },
];
