import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { DemoInformationViewComponent } from './demo-information-view.component';
import {
  selectExecutionUserStudyDemo,
  selectExecutionUserStudyDomainSpecification,
  selectExecutionUserStudyPlanProperties,
  selectExecutionUserStudyStep
} from '../../state/user-study-execution.selector';

describe('DemoInformationViewComponent', () => {
  let component: DemoInformationViewComponent;
  let fixture: ComponentFixture<DemoInformationViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoInformationViewComponent],
      providers: [provideMockStore({ selectors: [
        { selector: selectExecutionUserStudyStep, value: null },
        { selector: selectExecutionUserStudyDemo, value: undefined },
        { selector: selectExecutionUserStudyPlanProperties, value: undefined },
        { selector: selectExecutionUserStudyDomainSpecification, value: undefined }
      ] })]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoInformationViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
