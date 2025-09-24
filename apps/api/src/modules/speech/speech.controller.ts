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
        text: {
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
        enable_phoneme: {
          type: 'boolean',
          description: '是否启用音素分析',
          default: true,
        },
      },
      required: ['audio', 'text'],
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
    @Body() assessDto: PronunciationAssessReqDto,
  ): Promise<PronunciationAssessResDto> {
    // 验证音频文件
    if (!audio) {
      throw new BadRequestException('音频文件是必需的');
    }

    // 验证音频文件格式
    if (!audio.originalname.toLowerCase().endsWith('.wav')) {
      throw new BadRequestException('只支持WAV格式的音频文件');
    }

    // 验证音频文件大小 (限制为10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (audio.size > maxSize) {
      throw new BadRequestException('音频文件大小不能超过10MB');
    }

    // 验证参考文本
    if (!assessDto.text || !assessDto.text.trim()) {
      throw new BadRequestException('参考文本不能为空');
    }

    // 处理enable_phoneme参数（从字符串转换为布尔值）
    let enablePhoneme = true;
    if (assessDto.enable_phoneme !== undefined) {
      if (typeof assessDto.enable_phoneme === 'string') {
        enablePhoneme = assessDto.enable_phoneme.toLowerCase() === 'true';
      } else {
        enablePhoneme = Boolean(assessDto.enable_phoneme);
      }
    }

    this.logger.log(
      `收到发音评估请求 - 文件: ${audio.originalname}, 大小: ${audio.size} bytes, 文本: "${assessDto.text}"`,
    );

    try {
      const result = await this.speechService.assessPronunciation(
        audio.buffer,
        audio.originalname,
        {
          ...assessDto,
          enable_phoneme: enablePhoneme,
        },
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
