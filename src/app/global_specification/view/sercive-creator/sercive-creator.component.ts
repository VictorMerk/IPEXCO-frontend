import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DialogModule } from 'src/app/shared/components/dialog/dialog.module';
import { Encoding, Service, ServiceBase, ServiceType } from '../../domain/services';
import { domainOnlyForDomainDependentEncoding } from '../../validators/domain_dpendent.validator';

@Component({
  selector: 'app-sercive-creator',
  imports: [
    DialogModule,
    MatButtonModule,
    MatFormField,
    ReactiveFormsModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './sercive-creator.component.html',
  styleUrl: './sercive-creator.component.scss'
})
export class ServiceCreatorComponent {

  dialogRef = inject(MatDialogRef);
  data: {serviceType: string, domains: {_id: string, name: string}[]} = inject(MAT_DIALOG_DATA);

  types = [
    ServiceType.PLANNER,
    ServiceType.EXPLAINER,
    ServiceType.PROPERTY_CHECKER,
    ServiceType.PLANPILOT,
    ServiceType.VERIFIER,
    ServiceType.TESTER
  ]

  encoding = Encoding

  encodings = [
    Encoding.DOMAIN_DEPENDENT,
    Encoding.PDDL_CLASSIC,
    Encoding.PDDL_NUMERIC
  ]

  fb = inject(FormBuilder);
  private urlRegex = /^http?:\/\/.+(:[0-9]{4,5})?.*$/;

  form = this.fb.group({
      name: this.fb.control<string | null>(null, Validators.required),
      type: this.fb.control<ServiceType | null>(ServiceType.PLANNER, Validators.required),
      apiKey: this.fb.control<string | null>(null, Validators.required),
      url: this.fb.control<string | null>(null, [Validators.required, Validators.pattern(this.urlRegex)]),
      encoding: this.fb.control<Encoding | null>(Encoding.PDDL_CLASSIC, Validators.required),
      domainId: this.fb.control<string | null>(null),
  }, { validators: domainOnlyForDomainDependentEncoding });

  onCancel(){
    this.dialogRef.close();
  }

  onCreate(){
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    let service: ServiceBase = {
      name: this.form.controls.name.value ?? 'TODO',
      type: this.form.controls.type.value ?? ServiceType.NONE,
      url: this.form.controls.url.value ?? 'TODO',
      apiKey: this.form.controls.apiKey.value ?? '',
      encoding: this.form.controls.encoding.value ?? Encoding.NONE,
      domainId: this.form.controls.encoding.value == this.encoding.DOMAIN_DEPENDENT ? this.form.controls.domainId.value : null
    }
    this.dialogRef.close(service)
  }

}
