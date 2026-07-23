import { Routes } from '@angular/router';
import { loadProjectResolver } from './resolver/load-project.resolver';
import { setCurrentStepResolver } from './resolver/set-current-step.resolver';
import { PlanDetailViewComponent } from './view/plan-detail-view/plan-detail-view.component';
import { ShellComponent } from './view/shell/shell.component';
import { StepDetailViewComponent } from './view/step-detail-view/step-detail-view.component';
import { StepsListViewComponent } from './view/steps-list-view/steps-list-view.component';


export const routes: Routes = [
  {
    path: ':projectId',
    component: ShellComponent,
    resolve: { loadProjectResolver },
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    children: [
      { path: '', redirectTo: 'steps', pathMatch: 'full' },
      {
        path: 'steps',
        component: StepsListViewComponent,
      },
      {
        path: 'steps/:stepId',
        component: StepDetailViewComponent,
        resolve: { setCurrentStepResolver },
      },
      {
        path: 'steps/:stepId/plan',
        component: PlanDetailViewComponent,
        resolve: { setCurrentStepResolver },
      }
    ]
  }
];
