import { Global, Module } from '@nestjs/common';
import { DockerodeRunner } from './dockerode-runner';
import { DOCKER_RUNNER } from './types';

@Global()
@Module({
  providers: [DockerodeRunner, { provide: DOCKER_RUNNER, useExisting: DockerodeRunner }],
  exports: [DOCKER_RUNNER, DockerodeRunner],
})
export class DockerRunnerModule {}
