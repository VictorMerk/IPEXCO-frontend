import { HttpErrorResponse, HttpHandlerFn, HttpRequest,} from "@angular/common/http";
import { selectToken } from "../user/state/user.selector";
import { inject } from "@angular/core";
import { Store } from "@ngrx/store";
import { catchError, throwError } from "rxjs";
import { logoutSuccess } from "../user/state/user.actions";


export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {

  const store = inject(Store);
  const token = store.selectSignal(selectToken);
  const authToken = token() ?? localStorage.getItem("jwt-token");
  
  if(!authToken){
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
      }

      return throwError(() => error);
    }),
  );
}
