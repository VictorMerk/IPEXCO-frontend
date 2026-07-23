import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PlanPilotTimelineRow } from "../../view/planpilot-view/planpilot-analysis";

export type PlanPilotTimelineKey = number | "any";

@Component({
  selector: "app-planpilot-sidebar-plan",
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./planpilot-sidebar-plan.component.html",
  styleUrl: "./planpilot-sidebar-plan.component.scss",
})
export class PlanPilotSidebarPlanComponent {
  @Input() sessionHorizon = 1;
  @Input() sessionEncoding: "exact" | "bounded" = "bounded";
  @Input() sessionAbstractTimeSteps = false;
  @Input() activeSessionHorizon = 1;
  @Input() activeSessionEncoding: "exact" | "bounded" = "bounded";
  @Input() activeSessionAbstractTimeSteps = false;
  @Input() displayedSessionHorizon = 1;
  @Input() displayedSessionEncoding: "exact" | "bounded" = "bounded";
  @Input() configurationChanged = false;
  @Input() pendingSelectionCount = 0;
  @Input() isBusy = false;
  @Input() solutionCountKnown = false;
  @Input() solutionCount = 0;
  @Input() knownPlanLowerBound = 0;
  @Input() solutionCountLoading = false;
  @Input() solutionCountError = "";
  @Input() planPreparationLoading = false;
  @Input() planPreparationError = "";
  @Input() timelineRows: PlanPilotTimelineRow[] = [];
  @Input() focusedTimestep: PlanPilotTimelineKey | null = null;
  @Input() timestepActionCounts: Record<string, number> = {};

  @Output() horizonChange = new EventEmitter<Event>();
  @Output() encodingChange = new EventEmitter<Event>();
  @Output() abstractTimeStepsChange = new EventEmitter<Event>();
  @Output() rebuild = new EventEmitter<void>();
  @Output() solutionCountLoad = new EventEmitter<void>();
  @Output() plansPrepare = new EventEmitter<number>();
  @Output() timestepFocus = new EventEmitter<PlanPilotTimelineKey>();
  @Output() timestepActions = new EventEmitter<PlanPilotTimelineKey>();

  get suggestedPlanPreparationCount(): number {
    return this.solutionCountKnown
      ? Math.max(1, Math.min(20, this.solutionCount))
      : 20;
  }
}
