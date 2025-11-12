import {
  Controller,
  Post,
  Get,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

import { PronunciationAssessReqDto, PronunciationAssessResDto } from './dto';
import { SpeechService } from './speech.service';
import { Public } from '../../decorators';

@ApiTags('语音评估')
@Controller('speech')
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);

  constructor(private readonly speechService: SpeechService) {}

  @Public()
  @Post('pronunciation/assess')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({
    summary: '发音评估',
    description: '上传音频文件进行发音评估',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'WAV音频文件',
        },
        referenceText: {
          type: 'string',
          description: '参考文本',
          example: 'Hello world',
        },
        language: {
          type: 'string',
          description: '语言代码',
          example: 'en-US',
          default: 'en-US',
        },
        enablePhonemeDetail: {
          type: 'string',
          description: '是否启用音素分析',
          default: 'true',
        },
      },
      required: ['audio', 'referenceText'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '评估成功',
    type: PronunciationAssessResDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 503,
    description: '语音服务不可用',
  })
  async assessPronunciation(
    @UploadedFile() audio: any,
    @Body('referenceText') referenceText: string,
    @Body('language') language?: string,
    @Body('enablePhonemeDetail') enablePhonemeDetail?: string,
  ): Promise<PronunciationAssessResDto> {
    this.logger.log('收到发音评估请求');
    this.logger.debug('请求参数:', {
      referenceText,
      language,
      enablePhonemeDetail,
    });
    this.logger.debug('音频文件信息:', {
      hasAudio: !!audio,
      originalname: audio?.originalname,
      mimetype: audio?.mimetype,
      size: audio?.size,
    });

    // 验证音频文件
    if (!audio) {
      this.logger.error('音频文件缺失');
      throw new BadRequestException('音频文件是必需的');
    }

    // 验证音频文件格式
    if (!audio.originalname.toLowerCase().endsWith('.wav')) {
      this.logger.error(
        `音频文件格式不支持: ${audio.originalname} (mimetype: ${audio.mimetype})`,
      );
      throw new BadRequestException('只支持WAV格式的音频文件');
    }

    // 验证音频文件大小 (限制为10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (audio.size > maxSize) {
      this.logger.error(
        `音频文件过大: ${audio.size} bytes (最大: ${maxSize} bytes)`,
      );
      throw new BadRequestException('音频文件大小不能超过10MB');
    }

    // 验证参考文本
    if (!referenceText || !referenceText.trim()) {
      this.logger.error('参考文本为空');
      throw new BadRequestException('参考文本不能为空');
    }

    // 手动构建 DTO
    const assessDto: PronunciationAssessReqDto = {
      referenceText: referenceText.trim(),
      language: language || 'en-US',
      enablePhonemeDetail: enablePhonemeDetail === 'false' ? false : true,
    };

    this.logger.log(
      `处理后的参数 - 文件: ${audio.originalname}, 大小: ${audio.size} bytes, 文本: "${assessDto.referenceText}", 语言: ${assessDto.language}, 音素详情: ${assessDto.enablePhonemeDetail}`,
    );

    try {
      const result = await this.speechService.assessPronunciation(
        audio.buffer,
        audio.originalname,
        assessDto,
      );

      this.logger.log(`发音评估完成 - 总体得分: ${result.overallScore}`);

      return result;
    } catch (error) {
      this.logger.error('发音评估失败', error);
      throw error;
    }
  }

  @Public()
  @Get('health')
  @ApiOperation({
    summary: '语音服务健康检查',
    description: '检查Python语音服务的健康状态',
  })
  @ApiResponse({
    status: 200,
    description: '服务正常',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        model: { type: 'string', example: 'WeNet' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: '语音服务不可用',
  })
  async checkHealth(): Promise<{ status: string; model: string }> {
    this.logger.log('检查语音服务健康状态');

    return await this.speechService.checkHealth();
  }
}
