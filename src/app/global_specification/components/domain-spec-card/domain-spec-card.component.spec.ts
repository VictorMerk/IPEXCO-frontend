import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DomainSpecCardComponent } from './domain-spec-card.component';

describe('DomainSpecCardComponent', () => {
  let component: DomainSpecCardComponent;
  let fixture: ComponentFixture<DomainSpecCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainSpecCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DomainSpecCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('spec', { name: 'Test specification' });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
