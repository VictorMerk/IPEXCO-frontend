import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideMockStore } from '@ngrx/store/testing';

import { TaskInformationDialogComponent } from './task-information-dialog.component';
import {
  selectIterativePlanningDomainSpecification,
  selectIterativePlanningProject,
  selectIterativePlanningPropertiesList,
  selectIterativePlanningSelectedStep
} from '../../state/iterative-planning.selector';

describe('TaskInformationViewComponent', () => {
  let component: TaskInformationDialogComponent;
  let fixture: ComponentFixture<TaskInformationDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskInformationDialogComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectIterativePlanningProject, value: undefined },
          { selector: selectIterativePlanningSelectedStep, value: undefined },
          { selector: selectIterativePlanningPropertiesList, value: null },
          { selector: selectIterativePlanningDomainSpecification, value: undefined }
        ] }),
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskInformationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
