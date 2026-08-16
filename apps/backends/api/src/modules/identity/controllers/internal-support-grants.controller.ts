import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";

import { Public } from "../../../platform/auth/public.decorator";
import { ServiceGrantGuard } from "../../../platform/auth/service-grant.guard";
import { SupportGrantService } from "../services/support-grant.service";

class SupportGrantAccessDto {
  @IsString()
  @Length(20, 256)
  token!: string;

  @IsString()
  @Length(36, 36)
  grantId!: string;

  @IsString()
  @Length(12, 160)
  requestId!: string;
}

@Public()
@UseGuards(ServiceGrantGuard)
@Controller("internal/v1/identity/support-grants")
export class InternalSupportGrantsController {
  constructor(private readonly grants: SupportGrantService) {}

  @Post("access")
  access(@Body() body: SupportGrantAccessDto) {
    return this.grants.access(body);
  }
}
