import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PromptCardComponent } from './prompt-card.component';

describe('PromptCardComponent', () => {
  let component: PromptCardComponent;
  let fixture: ComponentFixture<PromptCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromptCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('prompt', { name: 'Test prompt' });
    fixture.componentRef.setInput('domains', []);
    fixture.componentRef.setInput('explainer', []);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
