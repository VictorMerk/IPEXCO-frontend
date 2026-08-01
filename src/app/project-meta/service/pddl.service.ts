import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { BehaviorSubject, finalize } from "rxjs";
import { IHTTPData } from "src/app/shared/domain/http-data.interface";
import { environment } from "../../../environments/environment";
import { PDDLPlanningModel } from "src/app/shared/domain/PDDL_task";

@Injectable()
export class PDDLService {

  private http = inject(HttpClient)
  BASE_URL  = environment.apiURL + "pddl/";

  private model$ = new BehaviorSubject<PDDLPlanningModel | null>(null);
  private parsing$ = new BehaviorSubject(false);
  private error$ = new BehaviorSubject<string | null>(null);

  getModel(){
    return this.model$;
  }

  getParsing(){
    return this.parsing$;
  }

  getError(){
    return this.error$;
  }

  translateModel(domainText: string, problemText: string) {
    this.model$.next(null);
    this.error$.next(null);
    this.parsing$.next(true);

    return this.http.post<IHTTPData<any>>(this.BASE_URL + "model", {data: {problem: problemText, domain: domainText}})
      .pipe(finalize(() => this.parsing$.next(false)))
      .subscribe({
        next: (httpData) => this.model$.next(httpData.data),
        error: () => {
          this.model$.next(null);
          this.error$.next("The PDDL files could not be parsed. Check both files and try again.");
        },
      });
  }
}
