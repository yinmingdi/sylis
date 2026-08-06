import { Module } from "@nestjs/common";

import { AdminIdentityController } from "./controllers/admin-identity.controller";
import { IdentityController } from "./controllers/identity.controller";
import { IdentityService } from "./services/identity.service";
import { RegistrationMailer } from "./services/registration-mailer";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [JobsModule],
  controllers: [IdentityController, AdminIdentityController],
  providers: [IdentityService, RegistrationMailer],
  exports: [IdentityService],
})
export class IdentityModule {}
