import { Card } from 'antd-mobile';
import { Toast } from 'antd-mobile';
import React, { useState, useCallback } from 'react';

import styles from './index.module.less';
import ReadyStage from './ready-stage';
import RecordingStage from './recording-stage';
import ResultStage from './result-stage';
import type { AssessmentResult } from './result-stage';
import { SpeechService } from '../../modules/speech/api';

// 简单的文本组件
const Text: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => (
  <span className={className} style={style}>{children}</span>
);

export interface FollowReadProps {
  /** 参考文本 */
  referenceText: string;
  /** 音标文本 */
  phoneticText?: string;
  /** 是否显示波形 */
  showWaveform?: boolean;
  /** 参考音频URL */
  referenceAudioUrl?: string;
  /** 录音完成回调 */
  onRecordingComplete?: (audioBlob: Blob) => void;
  /** 评估完成回调 */
  onAssessmentComplete?: (result: any) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义样式类名 */
  className?: string;
}

export type FollowReadStage = 'ready' | 'recording' | 'result';

const FollowRead: React.FC<FollowReadProps> = ({
  referenceText,
  phoneticText,
  showWaveform = true,
  referenceAudioUrl,
  onRecordingComplete,
  onAssessmentComplete,
  disabled = false,
  className,
}) => {
  const [stage, setStage] = useState<FollowReadStage>('ready');
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);

  // 发音评估
  const assessPronunciation = useCallback(async (audioBlob: Blob) => {
    setIsAssessing(true);
    try {
      const result = await SpeechService.assessPronunciation(audioBlob, {
        referenceText,
        language: 'en-US',
        enablePhonemeDetail: true,
      });

      setAssessmentResult(result);
      onAssessmentComplete?.(result);

      Toast.show({
        content: `发音评估完成！得分：${result.overallScore}分`,
        icon: 'success',
      });

    } catch (error: any) {
      console.error('发音评估失败:', error);
      console.error('错误响应数据:', error.response?.data);
      console.error('错误状态码:', error.response?.status);

      let errorMessage = '发音评估失败，请重试';

      // 处理 422 验证错误
      if (error.response?.status === 422 || error.response?.status === 400) {
        if (Array.isArray(error.response?.data?.message)) {
          // NestJS ValidationPipe 返回的错误数组
          errorMessage = `验证失败: ${error.response.data.message.join(', ')}`;
        } else if (error.response?.data?.message) {
          errorMessage = `发音评估失败: ${error.response.data.message}`;
        } else if (error.response?.data?.detail) {
          errorMessage = `发音评估失败: ${error.response.data.detail}`;
        }
      } else if (error.response?.data?.message) {
        errorMessage = `发音评估失败: ${error.response.data.message}`;
      } else if (error.response?.data?.detail) {
        errorMessage = `发音评估失败: ${error.response.data.detail}`;
      } else if (error.message) {
        errorMessage = `发音评估失败: ${error.message}`;
      }

      Toast.show({
        content: errorMessage,
        icon: 'fail',
        duration: 5000,
      });
    } finally {
      setIsAssessing(false);
    }
  }, [referenceText, onAssessmentComplete]);

  // 开始录音流程
  const handleStartRecording = useCallback(() => {
    setStage('recording');
  }, []);

  // 录音完成处理
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);

    onRecordingComplete?.(audioBlob);

    // 立即进入结果阶段（显示loading）
    setStage('result');

    // 自动进行发音评估
    await assessPronunciation(audioBlob);
  }, [assessPronunciation, onRecordingComplete]);

  // 重新跟读
  const handleRestart = useCallback(() => {
    setStage('ready');
    setAssessmentResult(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  }, [audioUrl]);

  return (
    <div className={`${styles.followRead} ${className || ''}`}>
      <Card className={styles.card}>
        <div className={styles.textDisplay}>
          <Text className={styles.englishText}>{referenceText}</Text>
          {phoneticText && (
            <Text className={styles.phoneticText}>
              /{phoneticText}/
            </Text>
          )}
        </div>

        {/* 第一阶段：准备阶段 */}
        {stage === 'ready' && (
          <ReadyStage
            referenceAudioUrl={referenceAudioUrl}
            disabled={disabled}
            onStartRecording={handleStartRecording}
          />
        )}

        {/* 第二阶段：录音阶段 - 只显示音波UI */}
        {stage === 'recording' && (
          <RecordingStage
            showWaveform={showWaveform}
            onRecordingComplete={handleRecordingComplete}
          />
        )}

        {/* 第三阶段：结果阶段 - 显示评估结果 */}
        {stage === 'result' && (
          <ResultStage
            assessmentResult={assessmentResult}
            audioUrl={audioUrl}
            isAssessing={isAssessing}
            onRestart={handleRestart}
          />
        )}
      </Card>
    </div>
  );
};

export default FollowRead;
