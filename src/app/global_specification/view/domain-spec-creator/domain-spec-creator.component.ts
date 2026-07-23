import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomainSpecification, DomainSpecificationBase } from '../../domain/domain_specification';
import { DialogModule } from 'src/app/shared/components/dialog/dialog.module';
import { Encoding } from '../../domain/services';

@Component({
  selector: 'app-domain-spec-creator',
  imports: [
        DialogModule,
        MatButtonModule,
        MatFormField,
        ReactiveFormsModule,
        MatInputModule,
        MatSelectModule,
  ],
  templateUrl: './domain-spec-creator.component.html',
  styleUrl: './domain-spec-creator.component.scss'
})
export class DomainSpecCreatorComponent {

    dialogRef = inject(MatDialogRef);

    encodings = [
      Encoding.DOMAIN_DEPENDENT,
      Encoding.PDDL_CLASSIC,
      Encoding.PDDL_NUMERIC
    ]
  
    fb = inject(FormBuilder);
  
    form = this.fb.group({
        name: this.fb.control<string | null>(null, Validators.required),
        encoding: this.fb.control<Encoding | null>(Encoding.PDDL_CLASSIC, Validators.required),
    });
  
    onCancel(){
      this.dialogRef.close();
    }
  
    onCreate(){
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        return;
      }

      let spec: DomainSpecificationBase = {
        name: this.form.controls.name.value ?? 'TODO',
        encoding: this.form.controls.encoding.value ?? Encoding.NONE,
        planPropertyTemplates: [],
        description: 'TODO',
      }
      this.dialogRef.close(spec)
    }

}
