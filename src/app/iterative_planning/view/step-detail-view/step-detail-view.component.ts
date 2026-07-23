import { AsyncPipe } from "@angular/common";
import { Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { Observable, Subject, combineLatest, filter, map, of, startWith, switchMap, take } from "rxjs";

import { BreadcrumbModule } from "src/app/shared/components/breadcrumb/breadcrumb.module";
import { EmptyStateModule } from "src/app/shared/components/empty-state/empty-state.module";
import { PageModule } from "src/app/shared/components/page/page.module";

import { MatDialog } from "@angular/material/dialog";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import {
  filter as rFilter,
  includes as rIncludes,
  map as rMap,
  not as rNot,
} from "ramda";
import { ExplanationInterfaceType } from "src/app/project/domain/general-settings";
import { filterNotNullOrUndefined } from "src/app/shared/common/check_null_undefined";
import { AskDeleteComponent } from "src/app/shared/components/ask-delete/ask-delete.component";
import { PlanPropertyPanelComponent } from "../../../shared/components/plan-property-panel/plan-property-panel.component";
import { PlanProperty } from "../../../shared/domain/plan-property/plan-property";
import { ExplanationChatLlmComponent } from "../../components/explanation-chat-llm/explanation-chat-llm.component";
import { AvailableQuestion, ExplanationChatComponent } from "../../components/explanation-chat/explanation-chat.component";
import { IterationStepHeroComponent } from "../../components/iteration-step-hero/iteration-step-hero.component";
import { StepsListHeroComponent } from '../../components/steps-list-hero/steps-list-hero.component';
import { UserManualDialogComponent } from "../../components/user-manual-dialog/user-manual-dialog.component";
import { DemoDirective } from "../../directives/isDemo.directive";
import { ProjectDirective } from "../../directives/isProject.directive";
import { explanationHash } from "../../domain/explanation/explanation-hash";
import { QuestionType } from "../../domain/explanation/explanations";
import { questionFactory } from "../../domain/explanation/question-factory";
import { StructuredText } from "../../domain/interface/explanation-message";
import { PlanRunStatus } from "../../domain/plan";
import { cancelPlanComputationAndIterationStep, deleteIterationStep, initNewIterationStep, questionPosed } from "../../state/iterative-planning.actions";
import { Message } from "../../state/iterative-planning.reducer";
import {
  selectIsExplanationLoading,
  selectIterativePlanningIsIntroTask,
  selectIterativePlanningLoadingFinished,
  selectIterativePlanningCurrentMaxUtility,
  selectIterativePlanningMaxPayment,
  selectIterativePlanningMaxPossibleUtility,
  selectIterativePlanningMinPayment,
  selectIterativePlanningProject,
  selectIterativePlanningProjectExplanationInterfaceType,
  selectIterativePlanningProperties,
  selectIterativePlanningSelectedStep,
  selectMessageTypes,
  selectMessages,
  selectPropertyAvailableQuestions,
  selectStepAvailableQuestions,
  selectIterativePlanningIterationSteps,
  selectIterativePlanningShowPaymentInfo,
} from "../../state/iterative-planning.selector";
import {
  selectEnforcedGoals,
  selectSatisfiedSoftGoals,
  selectUnsatisfiedSoftGoals,
} from "./step-detail-view.component.selector";
import { ExplanationChatHybridComponent } from "../../components/explanation-chat-hybrid/explanation-chat-hybrid.component";

@Component({
    selector: "app-step-detail-view",
  imports: [
    AsyncPipe,
    BreadcrumbModule,
    EmptyStateModule,
    ExplanationChatComponent,
    ExplanationChatLlmComponent,
    IterationStepHeroComponent,
    StepsListHeroComponent,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    PageModule,
    PlanPropertyPanelComponent,
    RouterLink,
    MatExpansionModule,
    MatProgressBarModule,
    ProjectDirective,
    DemoDirective,
    ExplanationChatHybridComponent
  ],
    templateUrl: "./step-detail-view.component.html",
    styleUrl: "./step-detail-view.component.scss"
})
export class StepDetailViewComponent {

  host = window.location.protocol + "//" + window.location.host;

  private store = inject(Store);

  router = inject(Router);
  route = inject(ActivatedRoute);
  dialog = inject(MatDialog);

  explanationInterfaceType$ = this.store.select(selectIterativePlanningProjectExplanationInterfaceType);
  expInterfaceType = ExplanationInterfaceType;
  isIntroTask$ = this.store.select(selectIterativePlanningIsIntroTask);

  anabelCreationInterface = this.store.select(selectIterativePlanningLoadingFinished);

  project$ = this.store.select(selectIterativePlanningProject);
  maxOverAllUtility$ = this.store.select(selectIterativePlanningMaxPossibleUtility);
  currentMaxUtility$ = this.store.select(selectIterativePlanningCurrentMaxUtility);
  showPaymentInfo$ = this.store.select(selectIterativePlanningShowPaymentInfo);
  minPayment$ = this.store.select(selectIterativePlanningMinPayment);
  maxPayment$ = this.store.select(selectIterativePlanningMaxPayment);
  image$ = this.project$.pipe(map(p => p?.summaryImage));
  instanceInfo$ = this.project$.pipe(map(p => p?.instanceInfo));

  steps$ = this.store.select(selectIterativePlanningIterationSteps);

  step$ = this.store.select(selectIterativePlanningSelectedStep);
  stepId$ = this.step$.pipe(map(step => step?._id));
  isUnsolvable$ = this.step$.pipe(
    filter((step) => !!step),
    map((step) => step.plan?.status == PlanRunStatus.UNSOLVABLE)
  );
  isCanceled$ = this.step$.pipe(
    filter((step) => !!step),
    map((step) => step.plan?.status == PlanRunStatus.CANCELED)
  );
  planComputationRunning$ = this.step$.pipe(
    filter((step) => !!step),
    map((step) => step.plan?.status == PlanRunStatus.PENDING || step.plan?.status == PlanRunStatus.RUNNING)
  );
  isFailed$ = this.step$.pipe(
    filter((step) => !!step),
    map((step) => step.plan?.status == PlanRunStatus.FAILED)
  );
  isSolved$ = this.step$.pipe(
    filter((step) => !!step),
    map((step) => step.plan?.status == PlanRunStatus.SOLVED)
  );

  planProperties$ = this.store.select(selectIterativePlanningProperties);

  enforcedGoals$ = this.store.select(selectEnforcedGoals);
  solvedSoftGoals$ = this.store.select(selectSatisfiedSoftGoals);
  unsolvedSoftGoals$ = this.store.select(selectUnsatisfiedSoftGoals).pipe(
    map(list => list.filter(pp => pp !== undefined))
  );

  hasEnforcedGoals$ = this.enforcedGoals$.pipe(map((goals) => !!goals?.length));
  hasSolvedSoftGoals$ = this.solvedSoftGoals$.pipe(
    map((goals) => !!goals?.length)
  );
  hasUnsolvedSoftGoals$ = this.unsolvedSoftGoals$.pipe(
    map((goals) => !!goals?.length)
  );

  isExplanationLoading$ = this.step$.pipe(
    filterNotNullOrUndefined(),
    map(explanationHash),
    switchMap(hash => this.store.select(selectIsExplanationLoading(hash)))
  );

  globalAvailableQuestionTypes$ = this.step$.pipe(
    map((step) => step?._id),
    filterNotNullOrUndefined(),
    switchMap((stepId) =>
      combineLatest([
        this.store.select(selectStepAvailableQuestions),
        this.store.select(selectMessageTypes(stepId)),
      ]).pipe(
        map(([allQuestionTypes, alreadyAskedQuestionTypes]) => {
          const notAlreadyAskedFn = (type: QuestionType) => rNot(rIncludes(type, alreadyAskedQuestionTypes));
          return rFilter(notAlreadyAskedFn, allQuestionTypes);
        }),
        map( rMap((questionType) => ({ questionType, message: questionFactory(questionType)(undefined)  }))),
      )
    )
  );

  globalMessages$ = this.stepId$.pipe(
    filterNotNullOrUndefined(),
    switchMap(stepId => this.store.select(selectMessages(stepId))),
  );

  propertyAvailableQuestionTypes$(property: PlanProperty): Observable<{questionType: QuestionType, message: StructuredText}[]> {
    return this.step$.pipe(
      map((step) => step?._id),
      filterNotNullOrUndefined(),
      switchMap((stepId) =>
        combineLatest([
          this.store.select(selectPropertyAvailableQuestions),
          this.store.select(selectMessageTypes(stepId, property._id)),
        ]).pipe(
          map(([allQuestionTypes, alreadyAskedQuestionTypes]) => {
            const notAlreadyAskedFn = (type: QuestionType) => rNot(rIncludes(type, alreadyAskedQuestionTypes));
            return rFilter(notAlreadyAskedFn, allQuestionTypes);
          }),
          map(questionTypes => rMap((questionType) => ({ questionType, message: questionFactory(questionType)(property.name)}), questionTypes)),
        )
      )
    );
  }

  propertyMessages$(property: PlanProperty): Observable<Message[]> {
    return this.stepId$.pipe(
      filterNotNullOrUndefined(),
      switchMap(stepId => this.store.select(selectMessages(stepId, property._id))),
    );
  }

  combinedPropertyAvailableQuestionTypes$: Observable<AvailableQuestion[]> = this.unsolvedSoftGoals$.pipe(
    switchMap(properties => {
      if (properties.length === 0) {
        return of([]); // If no properties, return an empty array
      }
      return combineLatest(
        properties.map(property => this.propertyAvailableQuestionTypes$(property))
      ).pipe(
        map(arrayOfArrays => arrayOfArrays.flat()) // Flatten the array of arrays
      );
    })
  );

  private refreshSuggestedQuestionsSubject = new Subject<void>();
  refreshSuggestedQuestions$ = this.refreshSuggestedQuestionsSubject.asObservable();

  selectedCombinedPropertyAvailableQuestionTypes$: Observable<AvailableQuestion[]> = combineLatest([
    this.combinedPropertyAvailableQuestionTypes$,
    this.refreshSuggestedQuestions$.pipe(startWith(undefined))
  ]).pipe(
    map(([questions, _]) => {
      // Shuffle the array of questions
      const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
      // Take the first 3 questions
      return shuffledQuestions.slice(0, 3);
    })
  );

  createNewIteration(baseStepId?: string) {
    this.store.dispatch(initNewIterationStep({ baseStepId }));
  }

  deleteIteration(id?: string) {
    if(id === undefined){
      return;
    }
    const dialogRef = this.dialog.open(AskDeleteComponent, {
      data: {name: "Delete Iteration", text: "Are you sure you want to delete the current iteration?"},
    });
    dialogRef.afterClosed().subscribe(result => {
      if(result){
        this.store.dispatch(deleteIterationStep({ id }));
        this.router.navigate([".."], {relativeTo: this.route});
      }
    });

  }

  onPropertyQuestionSelected(question: AvailableQuestion, property: PlanProperty): void {
    this.stepId$.pipe(take(1)).subscribe((iterationStepId) => {
      if(iterationStepId != undefined)
        return this.store.dispatch(questionPosed({ question: { questionType: question.questionType, iterationStepId, propertyId: property._id }}))
    });
  }

  onQuestionSelected(question: AvailableQuestion): void {
    this.stepId$.pipe(take(1)).subscribe((iterationStepId) => {
      if(iterationStepId != undefined)
        return this.store.dispatch(questionPosed({ question: { questionType: question.questionType, iterationStepId }}))
    });
  }

  onRefreshSuggestedQuestions(): void {
    this.refreshSuggestedQuestionsSubject.next();
  }

  onHelp(){
    this.dialog.open(UserManualDialogComponent);
  }

  onCancel(){
    this.stepId$.pipe(take(1)).subscribe(id => {
      if(id != undefined)
        this.store.dispatch(cancelPlanComputationAndIterationStep({iterationStepId: id}))
    });
  }
}
