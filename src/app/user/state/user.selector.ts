import { createSelector } from "@ngrx/store";
import { LoadingState } from "src/app/shared/common/loadable.interface";
import { userFeature } from "./user.feature";


export const selectUser = createSelector(userFeature.selectUserFeatureState, (state) => state.user.data)
export const selectToken = createSelector(userFeature.selectUserFeatureState, (state) => state.token.data)
export const selectTokenLoadingState = createSelector(userFeature.selectUserFeatureState, (state) => state.token.state)


export const selectLoggedIn = createSelector(userFeature.selectUserFeatureState, (state) =>
  state.token.state == LoadingState.Done && state.token.data != undefined)
export const selectLoggedInAndUserLoaded = createSelector(userFeature.selectUserFeatureState, (state) =>
    state.token.state == LoadingState.Done && state.token.data != undefined &&
    state.user.state == LoadingState.Done && state.user.data != undefined)
export const selectLoggedInAndUserNotLoaded = createSelector(userFeature.selectUserFeatureState, (state) =>
  state.token.state == LoadingState.Done && state.token.data != undefined &&
  state.user.state !== LoadingState.Done)
export const selectLoggedOut = createSelector(userFeature.selectUserFeatureState, (state) =>
  state.token.state !== LoadingState.Done || state.token.data === undefined)
export const selectUserError = createSelector(userFeature.selectUserFeatureState, (state) =>
    state.user.state == LoadingState.Error)

export const selectUserRole = createSelector(userFeature.selectUserFeatureState, (state) => state.user.data?.role)
export const selectUserName = createSelector(userFeature.selectUserFeatureState, (state) => state.user.data?.name)


export const selectIsUserStudy = createSelector(userFeature.selectUserFeatureState, (state) => state.user.data?.role == 'user-study')
