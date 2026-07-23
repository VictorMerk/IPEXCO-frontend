import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { PlanCardComponent } from './plan-card.component';

describe('PlanCardComponent', () => {
  let component: PlanCardComponent;
  let fixture: ComponentFixture<PlanCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanCardComponent],
      providers: [provideMockStore(), provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('plan', null);
    fixture.componentRef.setInput('planner', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
