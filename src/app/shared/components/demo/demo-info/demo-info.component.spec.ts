import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemoInfoComponent } from './demo-info.component';

describe('DemoInfoComponent', () => {
  let component: DemoInfoComponent;
  let fixture: ComponentFixture<DemoInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoInfoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemoInfoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('demo', {
      summaryImage: '',
      domainInfo: '',
      instanceInfo: ''
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
