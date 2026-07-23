import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { PlanDetailViewComponent } from './plan-detail-view.component';
import { selectDomainSpecification, selectProject, selectSelectedPlan } from '../../state/planning.selector';

describe('PlanDetailViewComponent', () => {
  let component: PlanDetailViewComponent;
  let fixture: ComponentFixture<PlanDetailViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanDetailViewComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectSelectedPlan, value: null },
          { selector: selectProject, value: undefined },
          { selector: selectDomainSpecification, value: undefined }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanDetailViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
