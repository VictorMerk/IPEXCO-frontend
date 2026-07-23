import { Routes } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { HelpPageComponent } from './base/components/help-page/help-page.component';
import { NavigationComponent } from './base/components/navigation/navigation.component';
import { IterativePlanningDomainSpecificationService } from './iterative_planning/service/domainSpecification.service';
import { ExplainerMonitoringService } from './iterative_planning/service/explainer-monitoring.service';
import { ExplainerService } from './iterative_planning/service/explainer.service';
import { IterationStepService } from './iterative_planning/service/iteration-step.service';
import { PlanPropertyService } from './iterative_planning/service/plan-properties.service';
import { PlannerMonitoringService } from './iterative_planning/service/planner-monitoring.service';
import { PlannerService } from './iterative_planning/service/planner.service';
import { IterativePlanningProjectService } from './iterative_planning/service/project.service';
import { iterativePlanningFeatureEffects } from './iterative_planning/state/effects/effects';
import { iterativePlanningFeature } from './iterative_planning/state/iterative-planning.feature';
import { LLMService } from './LLM/service/llm.service';
import { AuthGuard } from './route-guards/auth-guard.guard';
import { FailureEffect } from './shared/effects/failure.effect';
import { AuthenticationService } from './user/services/authentication.service';
import { userFeatureEffects } from './user/state/effects/effects';
import { userFeature } from './user/state/user.feature';

export const routes: Routes = [
  {
    path: 'user-study-execution',
    loadChildren: () => import('./user_study_execution/user-study-execution.routes').then(m => m.routes),
    providers: [
      provideState(userFeature),
      provideEffects([...userFeatureEffects,FailureEffect] ),
      AuthenticationService,
    ],
  },
  {
    path: '',
    redirectTo: '/user',
    pathMatch: 'full'
  },
  {
    path: '',
    component: NavigationComponent,
    resolve: { },
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    providers: [
        provideState(userFeature),
        provideEffects([...userFeatureEffects,FailureEffect] ),
        AuthenticationService,
    ],
    children: [
      {
        path: 'manual',
        component: HelpPageComponent,
        canActivate: [AuthGuard],
      },
      {
        path: 'user',
        loadChildren: () => import('./user/user.routes').then(m => m.routes),
      },
      {
        path: 'spec',
        loadChildren: () => import('./global_specification/global_specification.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'projects',
        loadChildren: () => import('./project-meta/project-meta.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'project',
        loadChildren: () => import('./project/project.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'demos',
        loadChildren: () => import('./demo/demo.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'iterative-planning',
        loadChildren: () => import('./iterative_planning/iterative-planning.routes').then(m => m.routes),
        providers: [
          provideState(iterativePlanningFeature),
          provideEffects(iterativePlanningFeatureEffects),
          IterativePlanningDomainSpecificationService,
          ExplainerMonitoringService,
          ExplainerService,
          IterationStepService,
          PlanPropertyService,
          PlannerMonitoringService,
          IterativePlanningProjectService,
          PlannerService,
          LLMService,
          PlannerMonitoringService,
        ],
        canActivate: [AuthGuard],
      },
      {
        path: 'planpilot',
        loadChildren: () => import('./planpilot/planpilot.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'planning',
        loadChildren: () => import('./planning/planning.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
      {
        path: 'user-study',
        loadChildren: () => import('./user_study/user-study.routes').then(m => m.routes),
        canActivate: [AuthGuard],
      },
    ]
  }
];
