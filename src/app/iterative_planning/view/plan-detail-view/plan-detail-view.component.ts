import { AsyncPipe } from "@angular/common";
import { Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { filter, map } from "rxjs";

import { BreadcrumbModule } from "src/app/shared/components/breadcrumb/breadcrumb.module";
import { EmptyStateModule } from "src/app/shared/components/empty-state/empty-state.module";
import { PageModule } from "src/app/shared/components/page/page.module";

import { ExplanationInterfaceType } from "src/app/project/domain/general-settings";
import { PlanViewComponent } from "../../components/plan/plan-view/plan-view.component";
import { initNewIterationStep } from "../../state/iterative-planning.actions";
import {
  selectIterativePlanningProjectExplanationInterfaceType,
  selectIterativePlanningSelectedStep
} from "../../state/iterative-planning.selector";
import { BelugaPlanAnimationComponent } from "src/app/domain_plugins/beluga/components/beluga-plan-animation/beluga-plan-animation.component";
import { BelugaDirective } from "src/app/domain_plugins/beluga/directives/isBeluga.directive";

@Component({
    selector: "app-plan-detail-view",
    imports: [
        AsyncPipe,
        BreadcrumbModule,
        EmptyStateModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        PageModule,
        RouterLink,
        PlanViewComponent,
    ],
    templateUrl: "./plan-detail-view.component.html",
    styleUrl: "./plan-detail-view.component.scss"
})
export class PlanDetailViewComponent {
  private store = inject(Store);

  step$ = this.store.select(selectIterativePlanningSelectedStep);
  stepId$ = this.step$.pipe(map(step => step?._id));

  createNewIteration(baseStepId?: string) {
    this.store.dispatch(initNewIterationStep({ baseStepId }));
  }


}
