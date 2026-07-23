import { Component, ElementRef, TemplateRef, inject, viewChild } from "@angular/core";
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { Store } from "@ngrx/store";
import { EditableListModule } from "src/app/shared/components/editable-list/editable-list.module";

import { AsyncPipe } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { combineLatest, filter, map, startWith, take } from "rxjs";
import { filterNotNullOrUndefined } from "src/app/shared/common/check_null_undefined";
import { InfoModule } from "src/app/shared/components/info/info.module";
import { SideSheetModule } from "src/app/shared/components/side-sheet/side-sheet.module";
import { PlanPropertyPanelComponent } from "../../../shared/components/plan-property-panel/plan-property-panel.component";
import { SelectPropertyComponent } from "../../components/select-property/select-property.component";
import { ProjectDirective } from "../../directives/isProject.directive";
import { IterationStepBase, StepStatus } from "../../domain/iteration_step";
import { cancelNewIterationStep, createIterationStep } from "../../state/iterative-planning.actions";
import { selectIterativePlanningIsDemo, selectIterativePlanningIterationStepComputationRunning, selectIterativePlanningNewStepBase, selectIterativePlanningNumberOfSteps, selectIterativePlanningProject, selectIterativePlanningProperties } from "../../state/iterative-planning.selector";
import { selectPlanPropertyIds, selectPreselectedEnforcedGoals$, selectPreselectedSoftGoals$ } from "./create-iteration.component.selector";

@Component({
    selector: "app-create-iteration",
    imports: [
        AsyncPipe,
        EditableListModule,
        InfoModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        PlanPropertyPanelComponent,
        SelectPropertyComponent,
        ReactiveFormsModule,
        SideSheetModule,
        ProjectDirective
    ],
    templateUrl: "./create-iteration.component.html",
    styleUrl: "./create-iteration.component.scss"
})
export class CreateIterationComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private dialogService = inject(MatDialog);

  handlePropertyIdSelection: ((ids: string[]) => void) | undefined;
  dialogRef: MatDialogRef<unknown> | undefined;

  propertySelector = viewChild.required<TemplateRef<ElementRef>>('propertySelector');

  project$ = this.store.select(selectIterativePlanningProject);
  projectId$ = this.project$.pipe(
    map(p => p?._id),
    filterNotNullOrUndefined()
  );

  computationRunning$ = this.store.select(selectIterativePlanningIterationStepComputationRunning);

  numberOfExistingSteps  = this.store.select(selectIterativePlanningNumberOfSteps);

  planProperties$ = this.store.select(selectIterativePlanningProperties);
  planPropertyIds$ = this.store.select(selectPlanPropertyIds);

  preselectedEnforcedGoals$ = this.store.select(selectPreselectedEnforcedGoals$);
  preselectedSoftGoals$ = this.store.select(selectPreselectedSoftGoals$);

  form = this.fb.group({
    general: this.fb.group({
      name: this.fb.control<string>("", [Validators.required, Validators.pattern(/\S/)]),
    }),
    enforcedGoalIds: this.fb.array<FormControl<string |  null>>([]),
    softGoalIds: this.fb.array<FormControl<string | null>>([]),
  });

  enforcedPropertyIds$ = this.form.controls.enforcedGoalIds.valueChanges.pipe(
    startWith(this.form.controls.enforcedGoalIds.value),
    map(() => this.form.controls.enforcedGoalIds.value),
  );
  enforcedPlanProperties$ = combineLatest([
    this.planProperties$,
    this.enforcedPropertyIds$,
  ]).pipe(
    filter(([planProperties]) => !!planProperties),
    map(([planProperties, selectedPropertyIds]) => selectedPropertyIds?.filter(pp => pp !== null).map(id => planProperties?.[id]) ?? []),
    map(list => list.filter(pp => pp != undefined)),
  );
  hasEnforcedPlanProperties$ = this.enforcedPlanProperties$.pipe(map(properties => !!properties.length));

  softPlanPropertyIds$ = this.form.controls.softGoalIds.valueChanges.pipe(
    startWith(this.form.controls.softGoalIds.value),
    map(() => this.form.controls.softGoalIds.value),
  );
  softPlanProperties$ = combineLatest([
    this.planProperties$,
    this.softPlanPropertyIds$,
  ]).pipe(
    filter(([planProperties]) => !!planProperties),
    map(([planProperties, selectedPropertyIds]) => selectedPropertyIds?.filter(pp => pp !== null).map(id => planProperties?.[id]) ?? []),
    map(list => list.filter(pp => pp != undefined)),
  );
  hasSoftPlanProperties$ = this.softPlanProperties$.pipe(map(properties => !!properties.length));

  availableProperties$ = combineLatest([
    this.planProperties$.pipe(map(properties => Object.values(properties ?? {}))),
    this.enforcedPropertyIds$,
    this.softPlanPropertyIds$,
  ]).pipe(
    map(([allPlanProperties, enforcedPlanProperties, softPlanProperties]) => allPlanProperties?.filter(
      ({_id}) => !enforcedPlanProperties?.includes(_id) && !softPlanProperties?.includes(_id),
    )),
  );

  constructor() {
    this.preselectedSoftGoals$.pipe(takeUntilDestroyed()).subscribe(softGoals => {
      this.form.controls.softGoalIds.clear();
      this.addSoftGoalIds(softGoals);
    });
    this.preselectedEnforcedGoals$.pipe(takeUntilDestroyed()).subscribe(enforcedGoals => {
      this.form.controls.enforcedGoalIds.clear();
      this.addEnforcedGoalIds(enforcedGoals);
    });
    this.numberOfExistingSteps.pipe(
      takeUntilDestroyed(),
      filterNotNullOrUndefined(),
    ).subscribe(numSteps => {
      this.form.controls.general.controls.name.setValue('Step ' + (numSteps + 1));
    })
  }

  addEnforcedGoalIds(ids: string[]): void {
    const idControls = ids.map(id => this.fb.control<string>(id));

    idControls.forEach(control => this.form.controls.enforcedGoalIds.push(control));
  }

  addSoftGoalIds(ids: string[]): void {
    const idControls = ids.map(id => this.fb.control<string>(id));

    idControls.forEach(control => this.form.controls.softGoalIds.push(control));
  }

  removeEnforcedGoal(index: number): void {
    this.form.controls.enforcedGoalIds.removeAt(index);
    this.form.updateValueAndValidity();
  }

  removeSoftGoal(index: number): void {
    this.form.controls.softGoalIds.removeAt(index);
  }

  addPropertyEnforce(): void {
    this.handlePropertyIdSelection = (ids: string[]) => {
      this.addEnforcedGoalIds(ids);
      this.dialogRef?.close();
    }

    this.dialogRef = this.dialogService.open(this.propertySelector());
  }

  addPropertySoftGoal(): void {
    this.handlePropertyIdSelection = (ids: string[]) => {
      this.addSoftGoalIds(ids);
      this.dialogRef?.close();
    }

    this.dialogRef = this.dialogService.open(this.propertySelector());
  }

  onCancelPropertySelection(): void {
    this.dialogRef?.close();
  }

  onCancel(): void {
    this.store.dispatch(cancelNewIterationStep());
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

     combineLatest([
      this.store.select(selectIterativePlanningNewStepBase),
      this.store.select(selectIterativePlanningProject),
      this.planPropertyIds$,
      this.store.select(selectIterativePlanningIsDemo)
    ]).pipe(take(1)).subscribe(([baseStep, project, planPropertiesIds, isDemo]) => {

      if(project === undefined){
        return;
      }

      const enforcedGoalIds = this.form.controls.enforcedGoalIds.value.filter(pp => pp !== null);
      
      const newStep: IterationStepBase = {
        name: this.form.controls.general.controls.name.value?.trim() || 'Step',
        hardGoals: enforcedGoalIds,
        softGoals: isDemo ? planPropertiesIds.filter(ppId => !enforcedGoalIds.includes(ppId)) : this.form.controls.softGoalIds.value.filter(pp => pp !== null),
        project: project._id,
        status: StepStatus.UNKNOWN,
        task: baseStep?.task ?? project.baseTask,
        predecessorStep: baseStep?._id ?? null,
      }

      this.store.dispatch(createIterationStep({iterationStep: newStep}))
    });
     
  }
}
