import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 翻译请求 DTO
 */
export class TranslateTextReqDto {
  @ApiProperty({ description: '要翻译的文字' })
  @IsString({ message: '文字必须是字符串' })
  @IsNotEmpty({ message: '文字不能为空' })
  text: string;
}
