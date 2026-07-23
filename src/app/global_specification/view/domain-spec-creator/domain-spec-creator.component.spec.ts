import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { DomainSpecCreatorComponent } from './domain-spec-creator.component';

describe('DomainSpecCreatorComponent', () => {
  let component: DomainSpecCreatorComponent;
  let fixture: ComponentFixture<DomainSpecCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainSpecCreatorComponent],
      providers: [
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DomainSpecCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
