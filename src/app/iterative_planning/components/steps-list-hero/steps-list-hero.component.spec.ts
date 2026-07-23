import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { StepsListHeroComponent } from './steps-list-hero.component';
import { selectIterativePlanningIsDemo } from '../../state/iterative-planning.selector';

describe('StepsListHeroComponent', () => {
  let component: StepsListHeroComponent;
  let fixture: ComponentFixture<StepsListHeroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepsListHeroComponent],
      providers: [provideMockStore({ selectors: [
        { selector: selectIterativePlanningIsDemo, value: false }
      ] })]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StepsListHeroComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('planPropertiesMap', {});
    fixture.componentRef.setInput('steps', []);
    fixture.componentRef.setInput('maxOverallUtility', 0);
    fixture.componentRef.setInput('currentMaxUtility', 0);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
