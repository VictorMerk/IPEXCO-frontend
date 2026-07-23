import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { DomainSpecEditorComponent } from './domain-spec-editor.component';
import { selectDomainSpecification } from '../../state/globalSpec.selector';

describe('DomainSpecEditorComponent', () => {
  let component: DomainSpecEditorComponent;
  let fixture: ComponentFixture<DomainSpecEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainSpecEditorComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectDomainSpecification, value: undefined }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DomainSpecEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
