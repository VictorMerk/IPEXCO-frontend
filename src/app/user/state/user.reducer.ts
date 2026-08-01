import { createReducer, on } from "@ngrx/store";
import { Loadable, LoadingState } from "src/app/shared/common/loadable.interface";
import { User } from "../domain/user";
import { loadTokenLocalStorageFailure, loadTokenLocalStorageSuccess, loadUser, loadUserFailure, loadUserSuccess, login, loginFailure, loginSuccess, logoutSuccess, registerUser, registerUserFailure, registerUserSuccess } from "./user.actions";

export interface UserState {
    user: Loadable<User>;
    token: Loadable<String>;
}

export const UserDataFeature = 'user';

const initialState: UserState = {
    user: {state: LoadingState.Initial, data: undefined},
    token: {state: LoadingState.Initial, data: undefined},
}


export const userReducer = createReducer(
    initialState,
    on(loadTokenLocalStorageSuccess, (state, {token}): UserState => ({
        ...state,
        token: {state: LoadingState.Done, data: token}
    })),
    on(loadTokenLocalStorageFailure, (state): UserState => ({
        ...state,
        token: {state: LoadingState.Error, data: undefined}
    })),
    on(loadUser, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Loading, data: undefined}
    })),
    on(loadUserSuccess, (state, {user}): UserState => ({
        ...state,
        user: {state: LoadingState.Done, data: user}
    })),
    on(loadUserFailure, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Error, data: undefined}
    })),
    on(registerUser, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Loading, data: undefined}
    })),
    on(registerUserSuccess, (state, {user, token}): UserState => ({
        ...state,
        user: {state: LoadingState.Done, data: user},
        token: {state: LoadingState.Done, data: token},
    })),
    on(registerUserFailure, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Error, data: undefined}
    })),
    on(login, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Loading, data: undefined}
    })),
    on(loginSuccess, (state, {user, token}): UserState => ({
        ...state,
        user: {state: LoadingState.Done, data: user},
        token: {state: LoadingState.Done, data: token},
    })),
    on(loginFailure, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Error, data: undefined},
        token: {state: LoadingState.Error, data: undefined}
    })),
    on(logoutSuccess, (state): UserState => ({
        ...state,
        user: {state: LoadingState.Initial, data: undefined},
        token: {state: LoadingState.Done, data: undefined}
    })),
);
