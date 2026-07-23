import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { CreateIterationComponent } from './create-iteration.component';

describe('CreateIterationComponent step validation', () => {
  let component: CreateIterationComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        { provide: Store, useValue: { select: () => of([]), dispatch: jasmine.createSpy('dispatch') } },
        { provide: MatDialog, useValue: jasmine.createSpyObj<MatDialog>('MatDialog', ['open']) },
      ],
    });

    component = TestBed.runInInjectionContext(() => new CreateIterationComponent());
  });

  it('allows a named step without additional plan properties', () => {
    component.form.controls.general.controls.name.setValue('Task-goal baseline');

    expect(component.form.controls.enforcedGoalIds.length).toBe(0);
    expect(component.form.controls.softGoalIds.length).toBe(0);
    expect(component.form.valid).toBeTrue();
  });

  it('rejects an empty or whitespace-only step name', () => {
    component.form.controls.general.controls.name.setValue('   ');

    expect(component.form.invalid).toBeTrue();
  });
});
