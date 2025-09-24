import { Button, Card, Space, Input, Toast, DotLoading } from 'antd-mobile';
import { useState } from 'react';
import { AiOutlineWifi, AiOutlineCheckCircle, AiOutlineCloseCircle } from 'react-icons/ai';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { quickTestConnection, testAIConnection, type TestConnectionResponse } from '../../network/ai/test';


export default function AITestPage() {
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  const [customMessage, setCustomMessage] = useState('');

  const handleQuickTest = async () => {
    setLoading(true);
    try {
      const response = await quickTestConnection();
      setTestResult(response.data);
      Toast.show({
        icon: response.data.success ? 'success' : 'fail',
        content: response.data.success ? '连接测试成功' : '连接测试失败',
      });
    } catch (error) {
      console.error('测试失败:', error);
      Toast.show({
        icon: 'fail',
        content: '测试请求失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomTest = async () => {
    if (!customMessage.trim()) {
      Toast.show({
        icon: 'fail',
        content: '请输入测试消息',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await testAIConnection({
        testMessage: customMessage.trim(),
      });
      setTestResult(response.data);
      Toast.show({
        icon: response.data.success ? 'success' : 'fail',
        content: response.data.success ? '自定义测试成功' : '自定义测试失败',
      });
    } catch (error) {
      console.error('自定义测试失败:', error);
      Toast.show({
        icon: 'fail',
        content: '测试请求失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderTestResult = () => {
    if (!testResult) return null;

    return (
      <Card
        title={
          <div className={styles.resultTitle}>
            {testResult.success ? (
              <AiOutlineCheckCircle color="#00b578" />
            ) : (
              <AiOutlineCloseCircle color="#ff3141" />
            )}
            <span>测试结果</span>
          </div>
        }
        className={styles.resultCard}
      >
        <div className={styles.resultContent}>
          <div className={styles.resultItem}>
            <span className={styles.label}>状态:</span>
            <span className={`${styles.status} ${styles[testResult.status]}`}>
              {testResult.status === 'connected' ? '已连接' : '连接失败'}
            </span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.label}>响应时间:</span>
            <span className={styles.value}>{testResult.responseTime}ms</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.label}>模型:</span>
            <span className={styles.value}>{testResult.model}</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.label}>API地址:</span>
            <span className={styles.value}>{testResult.baseUrl || '默认地址'}</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.label}>API密钥:</span>
            <span className={styles.value}>
              {testResult.hasApiKey ? '已配置' : '未配置'}
            </span>
          </div>

          {testResult.error && (
            <div className={styles.resultItem}>
              <span className={styles.label}>错误信息:</span>
              <span className={styles.error}>{testResult.error}</span>
            </div>
          )}

          {testResult.testResponse && (
            <div className={styles.resultItem}>
              <span className={styles.label}>AI响应:</span>
              <div className={styles.response}>{testResult.testResponse}</div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className={styles.container}>
      <PageHeader title="AI连接测试" />

      <div className={styles.content}>
        <Card title="快速测试" className={styles.testCard}>
          <div className={styles.cardContent}>
            <p className={styles.description}>
              使用默认测试消息检查OpenAI连接状态
            </p>
            <Button
              block
              color="primary"
              size="large"
              onClick={handleQuickTest}
              loading={loading}
              loadingIcon={<DotLoading />}
              disabled={loading}
            >
              <AiOutlineWifi />
              {loading ? '测试中...' : '开始测试'}
            </Button>
          </div>
        </Card>

        <Card title="自定义测试" className={styles.testCard}>
          <div className={styles.cardContent}>
            <p className={styles.description}>
              发送自定义消息测试AI响应
            </p>
            <Space direction="vertical" block>
              <Input
                placeholder="输入测试消息..."
                value={customMessage}
                onChange={setCustomMessage}
                disabled={loading}
              />
              <Button
                block
                color="primary"
                size="large"
                onClick={handleCustomTest}
                loading={loading}
                loadingIcon={<DotLoading />}
                disabled={loading || !customMessage.trim()}
              >
                发送测试消息
              </Button>
            </Space>
          </div>
        </Card>

        {renderTestResult()}
      </div>
    </div>
  );
}
