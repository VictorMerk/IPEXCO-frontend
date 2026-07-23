import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { ComprehensionCheckViewComponent } from './comprehension-check-view.component';
import { selectExecutionUserStudyStep } from '../../state/user-study-execution.selector';

describe('ComprehensionCheckViewComponent', () => {
  let component: ComprehensionCheckViewComponent;
  let fixture: ComponentFixture<ComprehensionCheckViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComprehensionCheckViewComponent],
      providers: [provideMockStore({ selectors: [
        { selector: selectExecutionUserStudyStep, value: null }
      ] })]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComprehensionCheckViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
