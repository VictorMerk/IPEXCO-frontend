import { inject, Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from "@angular/router";
import { Store } from "@ngrx/store";
import {
  selectIsUserStudy,
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
export class AuthGuard  {

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
      this.store.select(selectIsUserStudy),
      this.store.select(selectTokenLoadingState),
      this.store.select(selectUserLoadingState),
      this.store.select(selectLoggedIn),
    ]).pipe(
      filter(([, , tokenState, userState, hasToken]) =>
        tokenState !== LoadingState.Initial &&
        (!hasToken || userState === LoadingState.Done || userState === LoadingState.Error)
      ),
      take(1),
      map(([isLoggedIn, isUserStudy]) => {
        if(isLoggedIn && !isUserStudy){
          return true;
        }
        if(isUserStudy){
          return this.router.parseUrl("/user-study-execution/fail");
        }
        
        return this.router.parseUrl("/user/register");
        
      })
    )
  }
}
