import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemoInfoCardComponent } from './demo-info-card.component';

describe('DemoInfoCardComponent', () => {
  let component: DemoInfoCardComponent;
  let fixture: ComponentFixture<DemoInfoCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoInfoCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoInfoCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('step', { type: 'demo-info', name: 'Demo information', time: 1 });
    fixture.componentRef.setInput('demos', []);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
