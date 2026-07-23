import { CreationState } from "src/app/shared/common/creatable.interface";
import { projectMetaFeature } from "./project-meta.feature";
import { createSelector } from "@ngrx/store";


const selectState = projectMetaFeature.selectProjectMetaFeatureState

export const selectProjectsMetaData = createSelector(selectState, (state) => state.projects.data)


export const selectProjectCreationPending = createSelector(selectState, 
    (state) => state.createdProject.state === CreationState.Pending)

export const selectProjectCreationDone = createSelector(selectState,
    (state) => state.createdProject.state === CreationState.Done)


export const selectProjectCreationNone = createSelector(selectState, 
    (state) => state.createdProject.state === CreationState.Default || 
        state.createdProject.state === CreationState.Done)


export const selectProjectCreationError = createSelector(selectState, 
    (state) => state.createdProject.state === CreationState.Error)


export const selectDomainSpecifications = createSelector(selectState, (state) => state.domainSpecifications.data)
