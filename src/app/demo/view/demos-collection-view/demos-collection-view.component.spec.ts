import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { DemosCollectionViewComponent } from './demos-collection-view.component';
import { demosFeature } from '../../state/demo.feature';
import { selectAllFinishedDemos } from '../../state/demo.selector';

describe('DemosCollectionViewComponent', () => {
  let component: DemosCollectionViewComponent;
  let fixture: ComponentFixture<DemosCollectionViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemosCollectionViewComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectAllFinishedDemos, value: [] },
          { selector: demosFeature.selectDemoProperties, value: {} }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemosCollectionViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
