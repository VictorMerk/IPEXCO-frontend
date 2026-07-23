import { inject, Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, switchMap, tap } from "rxjs/operators";
import { of } from "rxjs";
import { logout, logoutSuccess } from "../user.actions";
import { AuthenticationService } from "../../services/authentication.service";

@Injectable()
export class LogoutEffect{

    private actions$ = inject(Actions)
    private service = inject(AuthenticationService)

    public logoutUser$ = createEffect(() => this.actions$.pipe(
        ofType(logout),
        switchMap(() => this.service.logout().pipe(
            switchMap(() => [logoutSuccess()]),
            catchError(() => of(logoutSuccess()))
        ))
    ))

    public removeUserToken$ = createEffect(() => this.actions$.pipe(
        ofType(logoutSuccess),
        tap(() => localStorage.removeItem("jwt-token"))
    ), {dispatch: false})
}
