import { Injectable, NotFoundException } from '@nestjs/common';

import { ChatRepository } from './chat.repository';
import { CreateConfigReqDto, UpdateConfigReqDto } from './dto/chat-config.dto';
import { DEFAULT_CONFIGS } from './seeds/default-configs';

@Injectable()
export class ChatConfigService {
  private readonly presetConfigIds = new Set(DEFAULT_CONFIGS.map((c) => c.id));

  constructor(private readonly chatRepository: ChatRepository) {}

  /**
   * 获取预设配置模板
   */
  async getPresetConfigs() {
    const configs = await this.chatRepository.getAllConfigs();
    return configs.filter((config) => this.presetConfigIds.has(config.id));
  }

  /**
   * 获取所有配置（预设 + 自定义）
   */
  async getAllConfigs() {
    const allConfigs = await this.chatRepository.getAllConfigs();
    const presets = allConfigs.filter((config) =>
      this.presetConfigIds.has(config.id),
    );
    const customs = allConfigs.filter(
      (config) => !this.presetConfigIds.has(config.id),
    );

    return {
      configs: allConfigs.map((config) => ({
        ...config,
        isPreset: this.presetConfigIds.has(config.id),
      })),
      presets: presets.map((config) => ({
        ...config,
        isPreset: true,
      })),
      customs: customs.map((config) => ({
        ...config,
        isPreset: false,
      })),
    };
  }

  /**
   * 创建自定义配置
   */
  async createCustomConfig(dto: CreateConfigReqDto) {
    return await this.chatRepository.createConfig({
      systemPrompt: dto.systemPrompt,
      roleName: dto.roleName,
      aiModel: dto.aiModel,
      temperature: dto.temperature,
      tags: dto.tags || [],
      extraConfig: dto.extraConfig,
    });
  }

  /**
   * 更新配置（仅限自定义配置）
   */
  async updateConfig(configId: string, dto: UpdateConfigReqDto) {
    // 检查是否为预设配置
    if (this.presetConfigIds.has(configId)) {
      throw new NotFoundException('预设配置不可修改');
    }

    const config = await this.chatRepository.getConfigById(configId);
    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    return await this.chatRepository.updateConfig(configId, {
      systemPrompt: dto.systemPrompt,
      roleName: dto.roleName,
      aiModel: dto.aiModel,
      temperature: dto.temperature,
      tags: dto.tags,
      extraConfig: dto.extraConfig,
    });
  }

  /**
   * 删除配置（仅限自定义配置）
   */
  async deleteConfig(configId: string) {
    // 检查是否为预设配置
    if (this.presetConfigIds.has(configId)) {
      throw new NotFoundException('预设配置不可删除');
    }

    const config = await this.chatRepository.getConfigById(configId);
    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    await this.chatRepository.deleteConfig(configId);
    return { message: '配置已删除' };
  }

  /**
   * 获取配置详情
   */
  async getConfigById(configId: string) {
    const config = await this.chatRepository.getConfigById(configId);
    if (!config) {
      throw new NotFoundException('配置不存在');
    }

    return {
      ...config,
      isPreset: this.presetConfigIds.has(config.id),
    };
  }

  /**
   * 初始化预设配置（种子数据）
   */
  async initializePresetConfigs() {
    const existingConfigs = await this.chatRepository.getAllConfigs();
    const existingIds = new Set(existingConfigs.map((c) => c.id));

    // 只创建不存在的预设配置
    for (const preset of DEFAULT_CONFIGS) {
      if (!existingIds.has(preset.id)) {
        await this.chatRepository.createConfig({
          systemPrompt: preset.systemPrompt,
          roleName: preset.roleName,
          aiModel: preset.aiModel,
          temperature: preset.temperature,
          tags: preset.tags,
        });
      }
    }
  }
}
