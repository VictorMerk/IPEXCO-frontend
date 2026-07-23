import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanPropertyUpdatePanelComponent } from './plan-property-update-panel.component';

describe('PlanPropertyUpdatePanelComponent', () => {
  let component: PlanPropertyUpdatePanelComponent;
  let fixture: ComponentFixture<PlanPropertyUpdatePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanPropertyUpdatePanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanPropertyUpdatePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('property', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
