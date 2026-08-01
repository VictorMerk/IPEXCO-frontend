import { inject, Injectable } from "@angular/core";
import { User } from "../domain/user";
import { environment } from "src/environments/environment";
import { IHTTPData } from "../../shared/domain/http-data.interface";
import { HttpClient } from "@angular/common/http";
import { map, Observable } from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  private http = inject(HttpClient)
  private BASE_URL = environment.apiURL + "users";

  loadUser(): Observable<User> {
    return this.http.get<IHTTPData<User>>(this.BASE_URL + "/").pipe(
      map(({data}) => data)
    )
  }

  register(name: string, password: string): Observable<{user: User; token: string}> {
    return this.http.post<IHTTPData<{user: User; token: string}>>(this.BASE_URL + "/", {name, password}).pipe(
      map(({data}) => data)
    )
  }


  login(name: string, password: string):  Observable<{user: User; token: string}> {
    return this.http.post<IHTTPData<{user: User; token: string}>>(
      this.BASE_URL + "/login", {name, password}).pipe(
        map(({data: {user, token}}) => ({user, token}))
    )
  }

  logout(): Observable<boolean> {
    return this.http.post<IHTTPData<boolean>>(this.BASE_URL + "/logout", null).pipe(
        map(({data: success}) => success)
    )
  }
}
