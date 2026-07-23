import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideMockStore } from '@ngrx/store/testing';

import { TimerStartsDialogComponent } from './timer-starts-dialog.component';

describe('TimerStartsDialogComponent', () => {
  let component: TimerStartsDialogComponent;
  let fixture: ComponentFixture<TimerStartsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimerStartsDialogComponent],
      providers: [
        provideMockStore(),
        { provide: MAT_DIALOG_DATA, useValue: { timeout: 30 } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimerStartsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
