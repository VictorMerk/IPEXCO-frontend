import { AuthenticationService } from "../../../user/services/authentication.service";
import { Component, inject } from "@angular/core";
import { FormBuilder, FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from "@angular/forms";
import { User } from "src/app/user/domain/user";
import { passwordValidator } from "src/app/validators/user.validators";
import { ActivatedRoute, Router } from "@angular/router";
import { MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatIconModule } from "@angular/material/icon";
import { MatError, MatFormFieldModule, MatLabel } from "@angular/material/form-field";
import { MatCardModule } from "@angular/material/card";
import { Store } from "@ngrx/store";
import { registerUser } from "src/app/user/state/user.actions";
import { selectLoggedIn, selectUserError } from "src/app/user/state/user.selector";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { filter, tap } from "rxjs";
import { MatInputModule } from "@angular/material/input";
import { NgIf } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";

@Component({
    selector: "app-register",
    imports: [
        MatIconModule,
        MatError,
        MatLabel,
        MatFormFieldModule,
        ReactiveFormsModule,
        FormsModule,
        MatCardModule,
        MatInputModule,
        NgIf,
        MatButtonModule,
    ],
    templateUrl: "./register.component.html",
    styleUrls: ["./register.component.scss"]
})
export class RegisterComponent {

  fb = inject(FormBuilder);

  registerForm = this.fb.group(
    {
      name: this.fb.control<string | null>(null, [
        Validators.required,
        Validators.minLength(5),
        Validators.maxLength(32),
      ]),
      password: this.fb.control<string | null>(null, [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(32),
      ]),
      passwordRepeat: this.fb.control<string | null>(null, [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(32),
      ]),
    },
    [passwordValidator]
  );

  maxLengthErrorName = this.registerForm.get('name')?.hasError('maxlength') ?? false
  minLengthErrorName = this.registerForm.get('name')?.hasError('minlength') ?? false

  maxLengthErrorPassword = this.registerForm.get('password')?.hasError('maxlength') ?? false
  minLengthErrorPassword = this.registerForm.get('password')?.hasError('minlength') ?? false
  notSameErrorPassword = this.registerForm.hasError('notSame') ?? false

  snackBar = inject(MatSnackBar);

  store = inject(Store);

  registerFailed$ = this.store.select(selectUserError);
  registerSuccessful$ = this.store.select(selectLoggedIn);

  constructor(
    public dialogRef: MatDialogRef<RegisterComponent>,
    private userService: AuthenticationService,
    private router: Router,
    private route: ActivatedRoute
  ) {

    this.registerSuccessful$.pipe(takeUntilDestroyed()).pipe(
      filter(s => s)
    ).subscribe(
      () => this.dialogRef.close()
    );
  }

  onRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const name = this.registerForm.controls.name.value;
    const password = this.registerForm.controls.password.value;

    this.store.dispatch(registerUser({name, password}))
  }



  onBack(): void {
    this.dialogRef.close();
  }
}
