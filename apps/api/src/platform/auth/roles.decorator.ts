import { SetMetadata } from "@nestjs/common";
import type { OperatorRole } from "@sylis/database";

export const REQUIRED_ROLES = "sylis.required-roles";
export const Roles = (...roles: OperatorRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
