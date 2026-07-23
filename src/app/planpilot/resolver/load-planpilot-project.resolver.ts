import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Project } from 'src/app/shared/domain/project';
import { ProjectService } from 'src/app/project/service/project.service';

export const loadPlanPilotProjectResolver: ResolveFn<Project> = (route) => (
  inject(ProjectService).getProject$(route.paramMap.get('projectId') ?? '')
);
