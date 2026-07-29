import { inject, Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { IHTTPData } from '../../shared/domain/http-data.interface';
import { HttpClient } from '@angular/common/http';
import { map, Observable} from 'rxjs';
import {User} from '../../user/domain/user';

@Injectable()
export class UserStudyAuthenticationService {

  private http = inject(HttpClient)
  private BASE_URL = environment.apiURL + 'users';

  register(userStudyId: string, prolificId: string | null): Observable<{user: User; token: string}> {
    return this.http.post<IHTTPData<{user: User; token: string}>>(this.BASE_URL + '/user-study', {userStudyId, prolificId}).pipe(
      map(({data}) => data)
    )
  }

  logout(): Observable<boolean> {
    return this.http.post<IHTTPData<boolean>>(this.BASE_URL + '/logout', null).pipe(
        map(({data: success}) => success)
    )
  }
}
