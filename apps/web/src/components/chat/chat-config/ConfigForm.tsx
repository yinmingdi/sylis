import { Form, Input, TextArea, Button, Slider, Toast, Picker } from 'antd-mobile';
import React, { useState } from 'react';

import styles from './ConfigForm.module.less';
import type { CreateConfigReq, ChatConfig } from '../../../modules/chat/api';

export interface ConfigFormProps {
  presets: ChatConfig[];
  onSubmit: (data: CreateConfigReq) => Promise<void>;
  onCancel: () => void;
}

// AI 模型选项
const AI_MODELS = [
  { label: 'GPT-3.5 Turbo（推荐）', value: 'gpt-3.5-turbo' },
  { label: 'GPT-4', value: 'gpt-4' },
  { label: 'GPT-4 Turbo（最新）', value: 'gpt-4-turbo' },
];

export const ConfigForm: React.FC<ConfigFormProps> = ({ presets, onSubmit, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateConfigReq>({
    roleName: '',
    systemPrompt: '',
    aiModel: 'gpt-3.5-turbo',
    temperature: 0.7,
  });

  // 处理预设模板选择
  const handlePresetConfirm = (value: any[]) => {
    const presetId = value[0] as string;
    if (!presetId) return;

    const preset = presets.find((p) => p.id === presetId);

    if (preset) {
      setFormData({
        roleName: preset.roleName || '',
        systemPrompt: preset.systemPrompt || '',
        aiModel: preset.aiModel || 'gpt-3.5-turbo',
        temperature: preset.temperature ?? 0.7,
      });
    }
  };

  // 处理 AI 模型选择
  const handleModelConfirm = (value: any[]) => {
    const model = value[0] as string;
    if (model) {
      setFormData({ ...formData, aiModel: model });
    }
  };

  const handleSubmit = async () => {
    if (!formData.roleName?.trim()) {
      Toast.show({
        content: '请输入角色名称',
        icon: 'fail',
      });
      return;
    }

    if (!formData.systemPrompt?.trim()) {
      Toast.show({
        content: '请输入系统提示词',
        icon: 'fail',
      });
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
      Toast.show({
        content: '配置创建成功',
        icon: 'success',
      });
    } catch (error) {
      console.error('创建配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.formContainer}>
      <Form layout="vertical" className={styles.form}>
        {/* 预设模板选择 */}
        <Form.Item
          name="preset"
          label="选择预设模板"
          trigger="onConfirm"
          onClick={(_e, pickerRef: any) => {
            pickerRef.current?.open();
          }}
        >
          <Picker
            columns={[presets.map((preset) => ({
              label: preset.roleName || '未命名',
              value: preset.id,
            }))]}
            onConfirm={handlePresetConfirm}
          >
            {(value) => {
              if (!value || value.length === 0) return '请选择预设模板';
              const selectedItem = value[0];
              const presetId = typeof selectedItem === 'object' && selectedItem !== null
                ? (selectedItem as any).value
                : selectedItem;
              const preset = presets.find(p => p.id === presetId);
              return preset?.roleName || '请选择预设模板';
            }}
          </Picker>
        </Form.Item>

        <Form.Item label="角色名称" required>
          <Input
            placeholder="例如：英语老师、翻译助手"
            value={formData.roleName}
            onChange={(val) => setFormData({ ...formData, roleName: val })}
            clearable
          />
        </Form.Item>

        <Form.Item
          name="aiModel"
          label="AI 模型"
          required
          trigger="onConfirm"
          onClick={(_e, pickerRef: any) => {
            pickerRef.current?.open();
          }}
        >
          <Picker
            columns={[AI_MODELS]}
            onConfirm={handleModelConfirm}
          >
            {(value) => {
              const model = AI_MODELS.find(m => m.value === (value?.[0] || formData.aiModel));
              return model?.label || '请选择 AI 模型';
            }}
          </Picker>
        </Form.Item>

        <Form.Item label="系统提示词" required>
          <TextArea
            placeholder="请输入系统提示词，定义AI的角色和行为..."
            value={formData.systemPrompt}
            onChange={(val) => setFormData({ ...formData, systemPrompt: val })}
            rows={5}
            maxLength={2000}
            showCount
          />
        </Form.Item>

        <Form.Item
          label={`温度 (${formData.temperature})`}
          help="较高的值会使输出更随机，较低的值会使其更集中和确定"
        >
          <Slider
            value={formData.temperature}
            onChange={(val) => {
              const temperature = Array.isArray(val) ? val[0] : val;
              setFormData({ ...formData, temperature });
            }}
            min={0}
            max={2}
            step={0.1}
            marks={{
              0: '0',
              1: '1',
              2: '2',
            }}
          />
        </Form.Item>
      </Form>

      <div className={styles.formActions}>
        <Button block onClick={onCancel} disabled={loading}>
          取消
        </Button>
        <Button
          block
          color="primary"
          onClick={handleSubmit}
          loading={loading}
        >
          创建
        </Button>
      </div>
    </div>
  );
};

export default ConfigForm;
