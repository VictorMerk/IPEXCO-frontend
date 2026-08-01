import { Component, inject } from "@angular/core";
import { FormsModule, ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule, MatLabel } from "@angular/material/form-field";
import { Store } from "@ngrx/store";
import { login } from "src/app/user/state/user.actions";
import { selectLoggedIn, selectUserError } from "src/app/user/state/user.selector";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { filter } from "rxjs";
import { DialogModule } from "src/app/shared/components/dialog/dialog.module";
import { AsyncPipe } from "@angular/common";

@Component({
    selector: "app-login",
    imports: [
        DialogModule,
        MatIconModule,
        MatLabel,
        MatFormFieldModule,
        MatInputModule,
        ReactiveFormsModule,
        FormsModule,
        MatButtonModule,
        AsyncPipe,
    ],
    templateUrl: "./login.component.html",
    styleUrls: ["./login.component.scss"]
})
export class LoginComponent {

  loginForm = new UntypedFormGroup({
    name: new UntypedFormControl('',[
        Validators.required,
        Validators.minLength(5),
        Validators.maxLength(32),
      ]),
    password: new UntypedFormControl('', [
      Validators.required,
      Validators.minLength(8),
      Validators.maxLength(32),
    ]),
  });

  snackBar = inject(MatSnackBar);
  dialogRef = inject(MatDialogRef<LoginComponent>);

  store = inject(Store)

  loginFailed$ = this.store.select(selectUserError);
  loginSuccessful$ = this.store.select(selectLoggedIn);

  constructor(
  ) {
    this.loginSuccessful$.pipe(
      takeUntilDestroyed(),
      filter(loggedIn => loggedIn)
    ).subscribe(() =>
      this.dialogRef.close(false)
    );
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const name = this.loginForm.controls.name.value;
    const password = this.loginForm.controls.password.value;

    this.store.dispatch(login({name, password}))
  }

  onBack(): void {
    this.dialogRef.close(false);
  }
}
