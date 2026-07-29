import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideMockStore } from "@ngrx/store/testing";
import { Router, provideRouter } from "@angular/router";
import { Store } from "@ngrx/store";
import { authInterceptor } from "./authentication.interceptor";
import { logoutSuccess } from "../user/state/user.actions";
import { selectToken } from "../user/state/user.selector";

describe("authInterceptor", () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let store: Store;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideMockStore({
          selectors: [{ selector: selectToken, value: "valid-token" }],
        }),
        provideRouter([]),
      ],
    });

    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(Store);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it("keeps the session after a forbidden response", () => {
    localStorage.setItem("jwt-token", "valid-token");
    const dispatch = spyOn(store, "dispatch");
    const navigate = spyOn(router, "navigate");

    client.delete("/api/services/service-1").subscribe({
      error: () => undefined,
    });
    const request = http.expectOne("/api/services/service-1");
    expect(request.request.headers.get("Authorization")).toBe(
      "Bearer valid-token",
    );
    request.flush({}, { status: 403, statusText: "Forbidden" });

    expect(localStorage.getItem("jwt-token")).toBe("valid-token");
    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears the session after an unauthorized response", () => {
    localStorage.setItem("jwt-token", "valid-token");
    const dispatch = spyOn(store, "dispatch");
    const navigate = spyOn(router, "navigate").and.resolveTo(true);

    client.get("/api/users").subscribe({ error: () => undefined });
    const request = http.expectOne("/api/users");
    request.flush({}, { status: 401, statusText: "Unauthorized" });

    expect(localStorage.getItem("jwt-token")).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(logoutSuccess());
    expect(navigate).toHaveBeenCalledWith(["/user/register"]);
  });
});
