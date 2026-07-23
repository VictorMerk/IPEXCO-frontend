import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { UserManualViewComponent } from './user-manual-view.component';
import {
  selectExecutionUserStudyDemo,
  selectExecutionUserStudyStep
} from '../../state/user-study-execution.selector';
import { selectIterativePlanningIsDemo } from 'src/app/iterative_planning/state/iterative-planning.selector';

describe('UserManualViewComponent', () => {
  let component: UserManualViewComponent;
  let fixture: ComponentFixture<UserManualViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserManualViewComponent],
      providers: [provideMockStore({ selectors: [
        { selector: selectExecutionUserStudyStep, value: null },
        { selector: selectExecutionUserStudyDemo, value: undefined },
        { selector: selectIterativePlanningIsDemo, value: false }
      ] }), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserManualViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
