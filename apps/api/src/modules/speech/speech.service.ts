import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as FormData from 'form-data';

import { PronunciationAssessReqDto, PronunciationAssessResDto } from './dto';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly pythonServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.pythonServiceUrl = this.configService.get<string>(
      'PYTHON_SPEECH_SERVICE_URL',
      'http://localhost:8080',
    );
  }

  /**
   * 调用Python语音打分服务进行发音评估
   * @param audioBuffer 音频文件的Buffer
   * @param fileName 音频文件名
   * @param assessDto 评估参数
   * @returns 评估结果
   */
  async assessPronunciation(
    audioBuffer: Buffer,
    fileName: string,
    assessDto: PronunciationAssessReqDto,
  ): Promise<PronunciationAssessResDto> {
    try {
      this.logger.log(
        `开始发音评估 - 文本: "${assessDto.text}", 文件: ${fileName}`,
      );

      // 创建FormData
      const formData = new FormData();
      formData.append('audio', audioBuffer, {
        filename: fileName,
        contentType: 'audio/wav',
      });
      formData.append('text', assessDto.text);
      formData.append('language', assessDto.language || 'en-US');
      formData.append(
        'enable_phoneme',
        String(assessDto.enable_phoneme ?? true),
      );

      // 调用Python服务
      const response: AxiosResponse<PronunciationAssessResDto> =
        await axios.post(
          `${this.pythonServiceUrl}/api/pronunciation/assess`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
            },
            timeout: 30000, // 30秒超时
          },
        );

      this.logger.log(`发音评估完成 - 总体得分: ${response.data.overallScore}`);

      return response.data;
    } catch (error) {
      this.logger.error('错误详情:', {
        url: `${this.pythonServiceUrl}/api/pronunciation/assess`,
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
      });
      this.logger.error('发音评估失败', error);
      this.logger.error('错误详情:', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new HttpException(
            '语音服务不可用，请检查Python服务是否正在运行',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        if (error.response) {
          const status = error.response.status;
          const message =
            error.response.data?.detail ||
            error.response.data?.message ||
            '语音服务错误';

          throw new HttpException(
            `语音服务错误: ${message}`,
            status >= 400 && status < 500 ? status : HttpStatus.BAD_REQUEST,
          );
        }

        if (error.code === 'ECONNABORTED') {
          throw new HttpException(
            '语音服务请求超时',
            HttpStatus.REQUEST_TIMEOUT,
          );
        }
      }

      throw new HttpException(
        '发音评估服务异常',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 检查Python语音服务健康状态
   */
  async checkHealth(): Promise<{ status: string; model: string }> {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, {
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      this.logger.error('语音服务健康检查失败', error);

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new HttpException(
          '语音服务不可用',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        '语音服务健康检查失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
