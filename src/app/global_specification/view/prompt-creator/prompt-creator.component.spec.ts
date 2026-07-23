import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PromptCreatorComponent } from './prompt-creator.component';

describe('PromptCreatorComponent', () => {
  let component: PromptCreatorComponent;
  let fixture: ComponentFixture<PromptCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptCreatorComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { domains: [], explainers: [] } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromptCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
