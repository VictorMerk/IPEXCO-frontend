import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { OutputSchemaCreatorComponent } from './output-schema-creator.component';

describe('OutputSchemaCreatorComponent', () => {
  let component: OutputSchemaCreatorComponent;
  let fixture: ComponentFixture<OutputSchemaCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutputSchemaCreatorComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { domains: [], explainers: [] } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutputSchemaCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
