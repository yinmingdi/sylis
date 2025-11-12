import type {
  PronunciationAssessReqDto,
  PronunciationAssessResDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';

/**
 * 语音评估相关 API
 */
export class SpeechService {
  /**
   * 发音评估
   * @param audioBlob 音频文件 Blob
   * @param params 评估参数
   * @returns 评估结果
   */
  static async assessPronunciation(
    audioBlob: Blob,
    params: PronunciationAssessReqDto,
  ): Promise<PronunciationAssessResDto> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('referenceText', params.referenceText);
    formData.append('language', params.language || 'en-US');
    formData.append(
      'enablePhonemeDetail',
      String(params.enablePhonemeDetail ?? true),
    );

    const response = await request({
      method: 'POST',
      url: '/speech/pronunciation/assess',
      data: formData,
      // 不设置 Content-Type，让浏览器自动设置 multipart/form-data 边界
      timeout: 90000, // 90秒超时
    });

    return response.data as PronunciationAssessResDto;
  }

  /**
   * 检查语音服务健康状态
   * @returns 服务状态
   */
  static async checkHealth(): Promise<{ status: string; model: string }> {
    const response = await request({
      method: 'GET',
      url: '/speech/health',
      timeout: 5000,
    });

    return response.data as { status: string; model: string };
  }
}
