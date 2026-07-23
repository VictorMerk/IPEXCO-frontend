import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { PromptEditorComponent } from './prompt-editor.component';
import { selectDomainSpecifications, selectExplainers, selectPrompt } from '../../state/globalSpec.selector';

describe('PromptEditorComponent', () => {
  let component: PromptEditorComponent;
  let fixture: ComponentFixture<PromptEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptEditorComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectPrompt, value: undefined },
          { selector: selectDomainSpecifications, value: [] },
          { selector: selectExplainers, value: [] }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromptEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
