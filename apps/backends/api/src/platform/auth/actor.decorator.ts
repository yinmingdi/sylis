import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "./authenticated-request";

export const Actor = createParamDecorator(
  (_data: never, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().actor,
);
