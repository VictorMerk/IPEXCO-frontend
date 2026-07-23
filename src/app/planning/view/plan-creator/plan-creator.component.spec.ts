import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PlanCreatorComponent } from './plan-creator.component';

describe('PlanCreatorComponent', () => {
  let component: PlanCreatorComponent;
  let fixture: ComponentFixture<PlanCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanCreatorComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { planners: [] } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
