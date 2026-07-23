import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { SpecificationOverviewComponent } from './specification-overview.component';
import {
  selectDomainSpecifications,
  selectExplainers,
  selectOutputSchemas,
  selectPrompts,
  selectServices
} from '../../state/globalSpec.selector';

describe('SpecificationOverviewComponent', () => {
  let component: SpecificationOverviewComponent;
  let fixture: ComponentFixture<SpecificationOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecificationOverviewComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectDomainSpecifications, value: [] },
          { selector: selectPrompts, value: [] },
          { selector: selectOutputSchemas, value: [] },
          { selector: selectServices, value: [] },
          { selector: selectExplainers, value: [] }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpecificationOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
