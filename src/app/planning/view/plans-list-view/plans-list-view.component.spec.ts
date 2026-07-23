import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { PlansListViewComponent } from './plans-list-view.component';
import { selectPlans, selectProject, selectSupportedPlanners } from '../../state/planning.selector';

describe('PlansListViewComponent', () => {
  let component: PlansListViewComponent;
  let fixture: ComponentFixture<PlansListViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlansListViewComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectProject, value: undefined },
          { selector: selectPlans, value: [] },
          { selector: selectSupportedPlanners, value: [] }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlansListViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
