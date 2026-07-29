import { inject, Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from "@angular/router";
import { Store } from "@ngrx/store";
import {
  selectLoggedIn,
  selectLoggedInAndUserLoaded,
  selectTokenLoadingState,
  selectUserLoadingState,
} from "../user/state/user.selector";
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
      this.store.select(selectLoggedInAndUserLoaded),
      this.store.select(selectTokenLoadingState),
      this.store.select(selectUserLoadingState),
      this.store.select(selectLoggedIn),
    ]).pipe(
      filter(([, tokenState, userState, hasToken]) =>
        tokenState !== LoadingState.Initial &&
        (!hasToken || userState === LoadingState.Done || userState === LoadingState.Error)
      ),
      take(1),
      map(([isLoggedIn]) => {
        if(isLoggedIn){
          return true;
        }
        return this.router.parseUrl("/user/register");
      })
    )
  }
}
