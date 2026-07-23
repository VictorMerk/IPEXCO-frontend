import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { UserManualDialogComponent } from './user-manual-dialog.component';
import {
  selectIterativePlanningIsDemo,
  selectIterativePlanningProject
} from '../../state/iterative-planning.selector';

describe('UserManualDialogueComponent', () => {
  let component: UserManualDialogComponent;
  let fixture: ComponentFixture<UserManualDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserManualDialogComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectIterativePlanningProject, value: undefined },
          { selector: selectIterativePlanningIsDemo, value: false }
        ] }),
        provideRouter([]),
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserManualDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
