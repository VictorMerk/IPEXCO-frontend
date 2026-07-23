import { Component, input, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Store } from '@ngrx/store';
import { QuoteModule } from 'src/app/shared/components/quote/quote.module';
import { UnformattedModule } from 'src/app/shared/components/unformatted/unformatted.module';
import { PlanProperty } from '../../../shared/domain/plan-property/plan-property';
import { ExplanationTemplate } from '../../domain/explanation/explanation_templates';
import { AnswerType, ExplanationRunStatus } from '../../domain/explanation/explanations';
import { IterationStep } from '../../domain/iteration_step';
import { registerGlobalExplanationComputation } from '../../state/iterative-planning.actions';

@Component({
    selector: 'app-question-panel',
    imports: [MatExpansionModule, MatIconModule, UnformattedModule, QuoteModule, MatButtonModule, MatCardModule, MatListModule],
    templateUrl: './question-panel.component.html',
    styleUrl: './question-panel.component.scss'
})
export class QuestionPanelComponent implements OnInit{

  property = input<PlanProperty | null>();
  planProperties = input.required<Record<string,PlanProperty> | null>();
  template = input.required<ExplanationTemplate | null>();
  step = input.required<IterationStep | null>();

  answerPhrase: string | undefined;
  answerSetsIds: string[][] | undefined 
  answerSets: PlanProperty[][] | undefined 

  explanationAvailable: boolean | undefined;

  constructor(
    private store: Store
  ){}

  ngOnInit(): void {

    const step = this.step();
    const properties  = this.planProperties();
    if(step === null || properties === null){
      return;
    }

    this.explanationAvailable = Boolean(step.globalExplanation && step.globalExplanation.status === ExplanationRunStatus.FINISHED);

    if(this.explanationAvailable){
      // TODO Check for what this is needed
      // let answerBase = this.template()?.answerType == AnswerType.MUGS ?  step.globalExplanation?.MUGS : step.globalExplanation?.MGCS;
      // [this.answerPhrase, this.answerSetsIds] = this.template()?.answerComputer(step, null, answerBase, true);

      // this.answerSets = this.answerSetsIds?.map(set => set.map(id => properties[id]));
    }
  }

  computeAnswer() {
    const step = this.step();
    if(step !== null)
      this.store.dispatch(registerGlobalExplanationComputation({iterationStepId: step._id}))
  }
  
}
