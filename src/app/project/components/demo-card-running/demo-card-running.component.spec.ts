import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { DemoCardRunningComponent } from './demo-card-running.component';

describe('DemoCardRunnigComponent', () => {
  let component: DemoCardRunningComponent;
  let fixture: ComponentFixture<DemoCardRunningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoCardRunningComponent],
      providers: [provideMockStore()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoCardRunningComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('demo', null);
    fixture.componentRef.setInput('planProperties', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
