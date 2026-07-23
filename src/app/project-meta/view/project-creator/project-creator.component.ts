import { AsyncPipe } from "@angular/common";
import { Component, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule, MatLabel } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatStepperModule } from "@angular/material/stepper";
import { Store } from "@ngrx/store";
import { BehaviorSubject, combineLatest } from "rxjs";
import { filter, map, shareReplay, startWith, take, tap } from "rxjs/operators";
import { TemplateFileUploadComponent } from "src/app/components/files/file-upload/file-upload.component";
import { Encoding } from "src/app/global_specification/domain/services";
import { DialogModule } from "src/app/shared/components/dialog/dialog.module";
import { SpecCardFeatureComponent } from "src/app/shared/components/spec-card/spec-card-feature/spec-card-feature.component";
import { ProjectBase } from "src/app/shared/domain/project";
import { defaultGeneralSetting } from "../../../project/domain/general-settings";
import { PDDLService } from "../../service/pddl.service";
import { createProject, loadDomainSpecifications } from "../../state/project-meta.actions";
import { selectDomainSpecifications, selectProjectCreationDone, selectProjectCreationPending } from "../../state/project-meta.selector";
import { TaskObject } from "src/app/shared/domain/planning-task";

@Component({
    selector: "app-project-creator",
    imports: [
        DialogModule,
        AsyncPipe,
        MatIconModule,
        TemplateFileUploadComponent,
        MatStepperModule,
        MatLabel,
        MatFormFieldModule,
        MatInputModule,
        FormsModule,
        ReactiveFormsModule,
        MatCardModule,
        MatIconModule,
        MatButtonModule,
        MatSelectModule,
        AsyncPipe,
        SpecCardFeatureComponent
    ],
    providers : [
      PDDLService,
    ],
    templateUrl: "./project-creator.component.html",
    styleUrls: ["./project-creator.component.scss"]
})
export class ProjectCreatorComponent {

  store = inject(Store);
  pddlService = inject(PDDLService);
  dialogRef = inject(MatDialogRef<ProjectCreatorComponent>);
  
  selectedIndex = 0;
  maxStepIndex = 1

  encoding = Encoding;
  
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: this.fb.control<string | null>(null, Validators.required),
    domain: this.fb.control<string | null>(null, Validators.required),
    description: this.fb.control<string | null>(null),
  });

  domains$ = this.store.select(selectDomainSpecifications);
  selectedDomain$ = combineLatest([
    this.domains$,
    this.form.controls.domain.valueChanges.pipe(startWith(this.form.controls.domain.value)),
  ]).pipe(
    map(([domains, domainId]) => domains ? domains.find(d => d._id == domainId) : null),
    shareReplay(1),
  );

  selectedDomain: string | undefined
  selectedProblem: string | undefined

  translatedPddlModel$ = this.pddlService.getModel().pipe(startWith(null));
  pddlModelValid$ = this.translatedPddlModel$.pipe(
    map(m => !!this.selectedProblem && !!this.selectedDomain && !!m)
  )

  domainDependentModel$ = new BehaviorSubject<string | null>(null);
  domainDependentModelValid$ = this.domainDependentModel$.pipe(
    filter(m => m !== null),
    map(m => {
      try{
        JSON.parse(m);
        return true;
      }
      catch(err) {
        return false;
      }
    })
  )

  model$ = combineLatest([this.selectedDomain$, this.translatedPddlModel$, this.domainDependentModel$]).pipe(
    map(([domain, pddlModel, domainDependentModel]) => {
      if(domain === undefined || domain === null){
        return null;
      }
      switch(domain.encoding){
        case(Encoding.PDDL_NUMERIC): {
          throw Error('Numeric PDDL encoding not yet supported!');
        }
        case(Encoding.PDDL_CLASSIC): {
          return pddlModel as unknown;
        }
        case(Encoding.DOMAIN_DEPENDENT): {
          return domainDependentModel ? JSON.parse(domainDependentModel) as unknown : null;
        }
      }
    }),
    shareReplay(1),
  )


  objects$ = combineLatest([this.selectedDomain$, this.translatedPddlModel$, this.domainDependentModel$]).pipe(
    map(([domain, pddlModel, domainDependentModel]) => {
      if(domain === undefined || domain === null){
        return null;
      }
      switch(domain.encoding){
        case(Encoding.PDDL_NUMERIC): {
          throw Error('Numeric PDDL encoding not yet supported!');
        }
        case(Encoding.PDDL_CLASSIC): {
          return pddlModel?.objects as TaskObject[];
        }
        case(Encoding.DOMAIN_DEPENDENT): {
          return [];
        }
      }
    }),
    shareReplay(1),
  )

  modelValid$ = combineLatest([this.selectedDomain$, this.translatedPddlModel$, this.domainDependentModel$]).pipe(
    map(([domain, pddlModel, domainDependentModel]) => {
      if(!domain) {
        return false;
      }
      switch(domain.encoding){
        case(Encoding.PDDL_NUMERIC): {
          throw Error('Numeric PDDL encoding not yet supported!');
        }
        case(Encoding.PDDL_CLASSIC): {
          return pddlModel != null;
        }
        case(Encoding.DOMAIN_DEPENDENT): {
          if(domainDependentModel == null){
            return false;
          }
          try{
            JSON.parse(domainDependentModel);
            return true;
          }
          catch(err) {
            return false;
          }
        }
      }
    }),
    startWith(false),
    shareReplay(1),
  )

  projectCreationPending$ = this.store.select(selectProjectCreationPending);

  constructor(
  ) {
    this.store.dispatch(loadDomainSpecifications());
    this.store.select(selectProjectCreationDone).pipe(
      filter(done => done),
      takeUntilDestroyed(),
    ).subscribe(() => this.dialogRef.close());
  }


  onDomainSelected(domain: string){
    this.selectedDomain = domain
    if(!!this.selectedDomain && !!this.selectedProblem)
      this.pddlService.translateModel(this.selectedDomain, this.selectedProblem)
  }

  onProblemSelected(problem: string){
    this.selectedProblem = problem
    if(!!this.selectedDomain && !!this.selectedProblem)
      this.pddlService.translateModel(this.selectedDomain, this.selectedProblem)
  }

  onTaskSelected(model: string){
    this.domainDependentModel$.next(model);
  }

  onNext() {
    if(this.selectedIndex < this.maxStepIndex){
      this.selectedIndex += 1;
    }
  }

  onPrevious() {
    if(this.selectedIndex > 0){
      this.selectedIndex -= 1;
    }
  }

  onCancel(){
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    console.log("onSave");
    combineLatest([this.model$, this.objects$]).pipe(
      tap(console.log),
      take(1),
    ).subscribe(
      ([model,objects]) => {

        const newProject: ProjectBase = {
          name: this.form.controls.name.value ?? 'TODO',
          domain: this.form.controls.domain.value ?? 'TODO',
          description: this.form.controls.description.value ? this.form.controls.description.value : "TODO",
          settings: defaultGeneralSetting,
          baseTask: {
            name: this.form.controls.name.value ?? 'TODO',
            objects,
            model,
          },
          public: false,
          instanceInfo: null,
          summaryImage: null
        };

        console.log("create new project");
        console.log(newProject);
        this.store.dispatch(createProject({project: newProject}))
      }
    )
  }
}
