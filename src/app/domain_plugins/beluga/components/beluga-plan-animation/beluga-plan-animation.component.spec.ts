import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BelugaPlanAnimationComponent } from './beluga-plan-animation.component';

describe('BelugaPlanAnimationComponent', () => {
  let component: BelugaPlanAnimationComponent;
  let fixture: ComponentFixture<BelugaPlanAnimationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BelugaPlanAnimationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BelugaPlanAnimationComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('plan', { actions: [] });
    fixture.componentRef.setInput('model', {});
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
