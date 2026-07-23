import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatMarkdownMessageComponent } from './chat-markdown-message.component';

describe('ChatMarkdownMessageComponent', () => {
  let component: ChatMarkdownMessageComponent;
  let fixture: ComponentFixture<ChatMarkdownMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMarkdownMessageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatMarkdownMessageComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('role', 'sender');
    fixture.componentRef.setInput('rawMessage', 'Test message');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
