import { DeploymentEnvironment } from "@sylis/database";
import { IsEnum, IsObject, IsString, IsUrl, Matches } from "class-validator";

export class IngestDeploymentReleaseDto {
  @IsString()
  @Matches(/^0\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  version!: string;

  @IsString()
  @Matches(/^[a-f0-9]{40}$/)
  gitSha!: string;

  @IsObject()
  imageDigests!: Record<string, string>;

  @IsObject()
  stagingEvidence!: Record<string, unknown>;

  @IsUrl({ protocols: ["https"], require_protocol: true })
  approvalRef!: string;

  @IsEnum(DeploymentEnvironment)
  productionEnvironment!: DeploymentEnvironment;

  @IsUrl({ protocols: ["https"], require_protocol: true })
  workflowUrl!: string;

  @IsUrl({ protocols: ["https"], require_protocol: true })
  deploymentUrl!: string;
}
