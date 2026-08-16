import { Toast } from 'antd-mobile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CreateConfigReqDto, UpdateConfigReqDto } from '@/legacy-dto';

import type { ChatConfig } from '../api';
import {
  getConfigs as getConfigsApi,
  createConfig as createConfigApi,
  updateConfig as updateConfigApi,
  deleteConfig as deleteConfigApi,
} from '../api';

// Chat Config Store 状态类型
interface ChatConfigState {
  // ============ 配置数据 ============
  configs: ChatConfig[];
  presets: ChatConfig[];
  customs: ChatConfig[];
  isLoading: boolean;
  error: string | null;

  // ============ 配置操作 ============
  loadConfigs: () => Promise<void>;
  createConfig: (data: CreateConfigReqDto) => Promise<ChatConfig | null>;
  updateConfig: (
    id: string,
    data: UpdateConfigReqDto,
  ) => Promise<ChatConfig | null>;
  deleteConfig: (id: string) => Promise<boolean>;

  // ============ 辅助方法 ============
  getConfigById: (id: string) => ChatConfig | undefined;
}

export const useChatConfigStore = create<ChatConfigState>()(
  persist(
    (set, get) => ({
      // ============ 初始状态 ============
      configs: [],
      presets: [],
      customs: [],
      isLoading: false,
      error: null,

      // ============ 配置操作 ============
      // 加载所有配置
      loadConfigs: async () => {
        set({ isLoading: true, error: null });

        try {
          const response = await getConfigsApi();
          set({
            configs: response.data.configs,
            presets: response.data.presets,
            isLoading: false,
          });
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '加载配置失败';
          set({ error: errorMessage, isLoading: false });
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
        }
      },

      // 创建自定义配置
      createConfig: async (data: CreateConfigReqDto) => {
        set({ isLoading: true, error: null });

        try {
          const response = await createConfigApi(data);
          const newConfig = response.data;

          set((state) => ({
            configs: [...state.configs, newConfig],
            customs: [...state.customs, newConfig],
            isLoading: false,
          }));

          Toast.show({
            content: '配置创建成功',
            icon: 'success',
          });

          return newConfig;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '创建配置失败';
          set({ error: errorMessage, isLoading: false });
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return null;
        }
      },

      // 更新配置
      updateConfig: async (id: string, data: UpdateConfigReqDto) => {
        set({ isLoading: true, error: null });

        try {
          const response = await updateConfigApi(id, data);
          const updatedConfig = response.data;

          set((state) => ({
            configs: state.configs.map((config) =>
              config.id === id ? updatedConfig : config,
            ),
            customs: state.customs.map((config) =>
              config.id === id ? updatedConfig : config,
            ),
            isLoading: false,
          }));

          Toast.show({
            content: '配置更新成功',
            icon: 'success',
          });

          return updatedConfig;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '更新配置失败';
          set({ error: errorMessage, isLoading: false });
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return null;
        }
      },

      // 删除配置
      deleteConfig: async (id: string) => {
        set({ isLoading: true, error: null });

        try {
          await deleteConfigApi(id);

          set((state) => ({
            configs: state.configs.filter((config) => config.id !== id),
            customs: state.customs.filter((config) => config.id !== id),
            isLoading: false,
          }));

          Toast.show({
            content: '配置删除成功',
            icon: 'success',
          });

          return true;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '删除配置失败';
          set({ error: errorMessage, isLoading: false });
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return false;
        }
      },

      // ============ 辅助方法 ============
      // 根据ID获取配置
      getConfigById: (id: string) => {
        const { configs } = get();
        return configs.find((config) => config.id === id);
      },
    }),
    {
      name: 'chat-config-store',
      // 不持久化配置数据，每次从服务器加载
      partialize: () => ({}),
    },
  ),
);
