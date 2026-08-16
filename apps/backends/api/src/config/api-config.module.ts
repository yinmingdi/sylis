import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ApiConfig } from "./api.config";
import { validateEnvironment } from "./env.schema";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
  ],
  providers: [ApiConfig],
  exports: [ApiConfig],
})
export class ApiConfigModule {}
