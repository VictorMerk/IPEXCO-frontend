import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutputSchemaCardComponent } from './output-schema-card.component';

describe('OutputSchemaCardComponent', () => {
  let component: OutputSchemaCardComponent;
  let fixture: ComponentFixture<OutputSchemaCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutputSchemaCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutputSchemaCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', { name: 'Test schema' });
    fixture.componentRef.setInput('domains', []);
    fixture.componentRef.setInput('explainer', []);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
