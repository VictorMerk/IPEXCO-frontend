import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ServiceCreatorComponent } from './sercive-creator.component';

describe('SerciveCreatorComponent', () => {
  let component: ServiceCreatorComponent;
  let fixture: ComponentFixture<ServiceCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCreatorComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { serviceType: 'Service', domains: [] } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
