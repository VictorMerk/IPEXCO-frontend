import { HttpErrorResponse, HttpHandlerFn, HttpRequest,} from "@angular/common/http";
import { selectToken } from "../user/state/user.selector";
import { inject } from "@angular/core";
import { Store } from "@ngrx/store";
import { catchError, throwError } from "rxjs";
import { logoutSuccess } from "../user/state/user.actions";
import { Router } from "@angular/router";


export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {

  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSignal(selectToken);
  const authToken = token() ?? localStorage.getItem("jwt-token");
  const isPublicAuthenticationRequest =
    req.method === "POST" &&
    (/\/api\/users\/?$/.test(req.url) || /\/api\/users\/login\/?$/.test(req.url));
  
  if(!authToken || isPublicAuthenticationRequest){
    return next(req);
  }

  const newReq = req.clone({
    headers: req.headers.append('Authorization', 'Bearer ' + authToken),
  });
  
  return next(newReq).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        localStorage.removeItem("jwt-token");
        store.dispatch(logoutSuccess());
        void router.navigate(["/user/register"]);
      }

      return throwError(() => error);
    }),
  );
}
