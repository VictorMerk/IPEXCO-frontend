import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { UserManualComponent } from './user-manual.component';
import { selectIterativePlanningIsDemo } from '../../state/iterative-planning.selector';

describe('UserManualComponent', () => {
  let component: UserManualComponent;
  let fixture: ComponentFixture<UserManualComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserManualComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectIterativePlanningIsDemo, value: false }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserManualComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
