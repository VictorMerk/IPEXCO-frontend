import { inject, Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from "@angular/router";
import { Store } from "@ngrx/store";
import { selectLoggedIn, selectTokenLoadingState } from "../user/state/user.selector";
import { combineLatest, filter, map, Observable, take } from "rxjs";
import { LoadingState } from "../shared/common/loadable.interface";

@Injectable({
  providedIn: "root",
})
export class ToHomeGuard  {

  store = inject(Store)
  router = inject(Router)

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    return this.checkLogin();
  }

  checkLogin(): Observable<boolean | UrlTree> {

    return combineLatest([
      this.store.select(selectLoggedIn),
      this.store.select(selectTokenLoadingState),
    ]).pipe(
      filter(([, tokenState]) => tokenState !== LoadingState.Initial),
      take(1),
      map(([isLoggedIn]) => {
        const hasStoredToken = !!localStorage.getItem("jwt-token");
        if(isLoggedIn || hasStoredToken){
          return true;
        }
        else {
          return this.router.parseUrl("/user/register");
        }
      })
    )
  }
}
