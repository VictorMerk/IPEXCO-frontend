import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { DemoEditViewComponent } from './demo-edit-view.component';
import { selectDemo } from '../../state/demo.selector';

describe('DemoEditViewComponent', () => {
  let component: DemoEditViewComponent;
  let fixture: ComponentFixture<DemoEditViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoEditViewComponent],
      providers: [
        provideHttpClient(),
        provideMockStore({ selectors: [
          { selector: selectDemo, value: undefined }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoEditViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
