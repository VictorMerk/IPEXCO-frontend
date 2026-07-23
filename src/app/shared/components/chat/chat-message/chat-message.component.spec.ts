import { ComponentFixture, TestBed } from "@angular/core/testing"
import { ChatMessageComponent, Role } from "./chat-message.component"
import { Component } from "@angular/core";

@Component({
    template: `
        <app-chat-message [role]="role">PROJECT_ME</app-chat-message>
    `,
    imports: [ChatMessageComponent],
})
class TestHostComponent {
    role: Role | undefined = undefined;
}

describe('ChatMessage', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let testHost: TestHostComponent;
    let element: HTMLElement;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TestHostComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        testHost = fixture.componentInstance;
        element = fixture.nativeElement;
    });

    it('should create', () => {
        expect(testHost).toBeTruthy();
    });

    it('should set the class according to the specified role',() => {
        const chatContainer = element.querySelector('div');
        testHost.role = 'sender';
        fixture.detectChanges();

        expect(chatContainer).toHaveClass('sender');
    });

    it('should project its content', () => {
        expect(element.innerText).toEqual('PROJECT_ME');
    });
})
