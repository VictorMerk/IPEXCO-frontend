import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { environment } from "src/environments/environment";
import { AuthenticationService } from "./authentication.service";

describe("AuthenticationService", () => {
  let service: AuthenticationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthenticationService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthenticationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("uses the login endpoint and unwraps its response", () => {
    const user = {_id: "user-1", name: "student", role: "creator" as const};
    let result: unknown;

    service.login("student", "password").subscribe(value => result = value);

    const request = http.expectOne(environment.apiURL + "users/login");
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      name: "student",
      password: "password",
    });
    request.flush({data: {user, token: "token-1"}});

    expect(result).toEqual({user, token: "token-1"});
  });

  it("uses the logout endpoint and unwraps its response", () => {
    let result: boolean | undefined;

    service.logout().subscribe(value => result = value);

    const request = http.expectOne(environment.apiURL + "users/logout");
    expect(request.request.method).toBe("POST");
    request.flush({data: true});

    expect(result).toBeTrue();
  });
});
