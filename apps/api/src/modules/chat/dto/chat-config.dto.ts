import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateConfigReqDto {
  @ApiProperty({ description: '系统提示词' })
  @IsString()
  systemPrompt: string;

  @ApiProperty({ description: '角色名称' })
  @IsString()
  roleName: string;

  @ApiProperty({ description: 'AI模型', required: false })
  @IsOptional()
  @IsString()
  aiModel?: string;

  @ApiProperty({ description: '温度参数', required: false })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiProperty({ description: '标签列表', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiProperty({ description: '额外配置', required: false })
  @IsOptional()
  extraConfig?: any;
}

export class UpdateConfigReqDto {
  @ApiProperty({ description: '系统提示词', required: false })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiProperty({ description: '角色名称', required: false })
  @IsOptional()
  @IsString()
  roleName?: string;

  @ApiProperty({ description: 'AI模型', required: false })
  @IsOptional()
  @IsString()
  aiModel?: string;

  @ApiProperty({ description: '温度参数', required: false })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiProperty({ description: '标签列表', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiProperty({ description: '额外配置', required: false })
  @IsOptional()
  extraConfig?: any;
}

export class ChatConfigDto {
  @ApiProperty({ description: '配置ID' })
  id: string;

  @ApiProperty({ description: '系统提示词' })
  systemPrompt?: string;

  @ApiProperty({ description: '角色名称' })
  roleName?: string;

  @ApiProperty({ description: 'AI模型' })
  aiModel?: string;

  @ApiProperty({ description: '温度参数' })
  temperature?: number;

  @ApiProperty({ description: '标签列表', type: [String] })
  tags: string[];

  @ApiProperty({ description: '额外配置' })
  extraConfig?: any;

  @ApiProperty({ description: '是否为预设配置', required: false })
  isPreset?: boolean;
}

export class GetConfigsResDto {
  @ApiProperty({ description: '所有配置', type: [ChatConfigDto] })
  configs: ChatConfigDto[];

  @ApiProperty({ description: '预设配置', type: [ChatConfigDto] })
  presets: ChatConfigDto[];
}
