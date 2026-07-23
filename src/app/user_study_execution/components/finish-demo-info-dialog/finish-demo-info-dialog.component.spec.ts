import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideMockStore } from '@ngrx/store/testing';

import { FinishDemoInfoDialogComponent } from './finish-demo-info-dialog.component';
import {
  selectIterativePlanningIterationSteps,
  selectIterativePlanningProject,
  selectIterativePlanningProperties
} from 'src/app/iterative_planning/state/iterative-planning.selector';

describe('FinishDemoInfoDialogComponent', () => {
  let component: FinishDemoInfoDialogComponent;
  let fixture: ComponentFixture<FinishDemoInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinishDemoInfoDialogComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectIterativePlanningProject, value: undefined },
          { selector: selectIterativePlanningProperties, value: {} },
          { selector: selectIterativePlanningIterationSteps, value: [] }
        ] }),
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FinishDemoInfoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
