import { Global, Module } from "@nestjs/common";

import { FieldEncryptionService } from "./field-encryption.service";

@Global()
@Module({
  providers: [FieldEncryptionService],
  exports: [FieldEncryptionService],
})
export class EncryptionModule {}
