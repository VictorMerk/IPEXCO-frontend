import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import {
  FacetFilter,
  FacetSelection,
  PlanPilotUiFacet,
} from "../../view/planpilot-view/planpilot-view.models";

export interface PlanPilotActionRowView {
  facet: PlanPilotUiFacet;
  timestepLabel: string;
  stateLabel: string;
  displayedPlan: boolean;
  required: boolean;
  forbidden: boolean;
  selected: boolean;
}

export interface PlanPilotSelectedActionView extends PlanPilotActionRowView {
  canRequire: boolean;
  canForbid: boolean;
  canClear: boolean;
  canPreviewImpact: boolean;
  clearHint: string;
  requireImpact?: PlanPilotActionImpactView;
  forbidImpact?: PlanPilotActionImpactView;
}

export interface PlanPilotActionImpactView {
  available: boolean | null;
  totalPlans: number | null;
  plansRemaining: number | null;
  plansRemoved: number | null;
  reductionPercent: number | null;
}

export interface PlanPilotActionFilterView {
  value: FacetFilter;
  label: string;
  count: number;
}

@Component({
  selector: "app-planpilot-sidebar-actions",
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: "./planpilot-sidebar-actions.component.html",
  styleUrl: "./planpilot-sidebar-actions.component.scss",
})
export class PlanPilotSidebarActionsComponent {
  @Input() selectedAction?: PlanPilotSelectedActionView;
  @Input() rows: PlanPilotActionRowView[] = [];
  @Input() filters: PlanPilotActionFilterView[] = [];
  @Input() activeFilter: FacetFilter = "all";
  @Input() activeTimestep: number | "any" | null = null;
  @Input() query = "";
  @Input() matchingCount = 0;
  @Input() hiddenCount = 0;
  @Input() isBusy = false;
  @Input() impactCalculated = false;
  @Input() impactLoading = false;
  @Input() impactError = "";
  @Input() impactNotice = "";
  @Input() lastSpaceChangeSummary = "";

  @Output() selectedActionClose = new EventEmitter<void>();
  @Output() selectionChange = new EventEmitter<{
    facetId: string;
    selection: FacetSelection;
  }>();
  @Output() impactCalculate = new EventEmitter<void>();
  @Output() timestepClear = new EventEmitter<void>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<FacetFilter>();
  @Output() facetSelect = new EventEmitter<string>();
  @Output() showMore = new EventEmitter<void>();
  @Output() showAll = new EventEmitter<void>();
  @Output() showFewer = new EventEmitter<void>();

  updateQuery(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }
}
