import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { OutputSchemaEditorComponent } from './output-schema-editor.component';
import { selectDomainSpecifications, selectExplainers, selectOutputSchema } from '../../state/globalSpec.selector';

describe('OutputSchemaEditorComponent', () => {
  let component: OutputSchemaEditorComponent;
  let fixture: ComponentFixture<OutputSchemaEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutputSchemaEditorComponent],
      providers: [
        provideMockStore({ selectors: [
          { selector: selectOutputSchema, value: undefined },
          { selector: selectDomainSpecifications, value: [] },
          { selector: selectExplainers, value: [] }
        ] }),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutputSchemaEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
