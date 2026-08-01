import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PlanPilotComparison } from "../../view/planpilot-view/planpilot-analysis";

export interface PlanPilotPlanActionView {
  id: string;
  label: string;
  timestepLabel: string;
  visible?: boolean;
}

export interface PlanPilotPlanSummaryView {
  number: number;
  title: string;
  text: string;
}

@Component({
  selector: "app-planpilot-sidebar-plans",
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./planpilot-sidebar-plans.component.html",
  styleUrl: "./planpilot-sidebar-plans.component.scss",
})
export class PlanPilotSidebarPlansComponent {
  @Input() forcedSuffixMessage = "";
  @Input() displayedPlanActions: PlanPilotPlanActionView[] = [];
  @Input() solutionCountKnown = false;
  @Input() solutionCount = 0;
  @Input() currentSolutionNumber = 0;
  @Input() knownPlanLowerBound = 0;
  @Input() isBusy = false;
  @Input() queryPending = false;
  @Input() backendError = "";
  @Input() displayedSessionHorizon = 0;
  @Input() commonActions: PlanPilotPlanActionView[] = [];
  @Input() commonActionsLoaded = false;
  @Input() commonActionsLoading = false;
  @Input() commonActionsError = "";
  @Input() planSummaries: PlanPilotPlanSummaryView[] = [];
  @Input() planPageLoading = false;
  @Input() planPageStart = 1;
  @Input() planPageEnd = 1;
  @Input() planPageError = "";
  @Input() loadedPlanCount = 0;
  @Input() cachedPlanNumbers: number[] = [];
  @Input() nextPlanBatchStart = 1;
  @Input() nextPlanBatchEnd = 20;
  @Input() hasMorePlanBatches = true;
  @Input() planBatchLoading = false;
  @Input() planBatchError = "";
  @Input() canCancelOperation = false;
  @Input() comparisonPlanA = 1;
  @Input() comparisonPlanB = 2;
  @Input() comparison?: PlanPilotComparison;
  @Input() comparisonLoading = false;
  @Input() comparisonError = "";
  @Input() comparisonHasChanges = false;
  @Input() comparisonGraphActive = false;

  @Output() solutionShow = new EventEmitter<number>();
  @Output() solutionJump = new EventEmitter<number>();
  @Output() constraintsClear = new EventEmitter<void>();
  @Output() commonActionsLoad = new EventEmitter<void>();
  @Output() planPageLoad = new EventEmitter<number>();
  @Output() planPagePrevious = new EventEmitter<void>();
  @Output() planPageNext = new EventEmitter<void>();
  @Output() planBatchLoad = new EventEmitter<void>();
  @Output() operationCancel = new EventEmitter<void>();
  @Output() comparisonPlanChange = new EventEmitter<{
    event: Event;
    side: "a" | "b";
  }>();
  @Output() plansCompare = new EventEmitter<void>();
  @Output() comparisonPlanShow = new EventEmitter<number>();
  @Output() graphComparisonClear = new EventEmitter<void>();

  requestedPlanNumber = 1;
  planNumberEdited = false;

  updateRequestedPlan(event: Event): void {
    this.planNumberEdited = true;
    this.requestedPlanNumber = Number((event.target as HTMLInputElement).value);
  }

  get jumpNeedsWarning(): boolean {
    return (
      this.planNumberEdited &&
      Number.isSafeInteger(this.requestedPlanNumber) &&
      this.requestedPlanNumber > 0 &&
      !this.cachedPlanNumbers.includes(this.requestedPlanNumber)
    );
  }
}
