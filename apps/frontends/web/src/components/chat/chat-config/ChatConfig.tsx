import { Popup, Button } from 'antd-mobile';
import React, { useEffect } from 'react';
import { AiOutlineClose } from 'react-icons/ai';

import ConfigForm from './ConfigForm';
import styles from './index.module.less';
import { useChatConfigStore } from '../../../modules/chat';
import type {
  ChatConfig as ChatConfigType,
  CreateConfigReq,
} from '../../../modules/chat/api';

export interface ChatConfigProps {
  visible: boolean;
  onClose: () => void;
  onSelect?: (config: ChatConfigType) => void;
  selectedConfigId?: string;
  currentSessionId?: string | null;
}

export const ChatConfig: React.FC<ChatConfigProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const presets = useChatConfigStore((state) => state.presets);
  const loadConfigs = useChatConfigStore((state) => state.loadConfigs);
  const createConfig = useChatConfigStore((state) => state.createConfig);

  // 当弹窗打开时加载配置
  useEffect(() => {
    if (visible) {
      loadConfigs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleCreateConfig = async (data: CreateConfigReq) => {
    const newConfig = await createConfig(data);
    if (newConfig) {
      // 自动选中新创建的配置并关闭
      onSelect?.(newConfig);
      onClose();
    }
  };

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      position="left"
      bodyStyle={{
        width: '80%',
        height: '100%',
        padding: 0,
      }}
      getContainer={document.body}
      destroyOnClose
    >
      <div className={styles.configContainer}>
        <div className={styles.header}>
          <h2>聊天设置</h2>
          <Button
            size="small"
            fill="none"
            aria-label="关闭聊天设置"
            onClick={onClose}
            className={styles.closeButton}
          >
            <AiOutlineClose />
          </Button>
        </div>

        <ConfigForm
          presets={presets}
          onSubmit={handleCreateConfig}
          onCancel={onClose}
        />
      </div>
    </Popup>
  );
};

export default ChatConfig;
