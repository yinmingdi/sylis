// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface CreateConfigReqDto {
  systemPrompt: string;
  roleName: string;
  aiModel?: string;
  temperature?: number;
  tags?: string[];
  extraConfig?: any;
}

export interface UpdateConfigReqDto {
  systemPrompt?: string;
  roleName?: string;
  aiModel?: string;
  temperature?: number;
  tags?: string[];
  extraConfig?: any;
}

export interface ChatConfigDto {
  id: string;
  systemPrompt?: string;
  roleName?: string;
  aiModel?: string;
  temperature?: number;
  tags: string[];
  extraConfig?: any;
  isPreset?: boolean;
}

export interface GetConfigsResDto {
  configs: ChatConfigDto[];
  presets: ChatConfigDto[];
}
