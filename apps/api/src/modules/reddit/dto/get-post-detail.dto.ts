import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { RedditPostDto } from './get-posts.dto';

export class GetPostDetailReqDto {
  @ApiProperty({
    description: 'Reddit 帖子 ID（不含 t3_ 前缀）',
    example: 'abc123',
  })
  @IsString()
  postId: string;
}

export class GetPostDetailResDto extends RedditPostDto {
  @ApiProperty({ description: '完整内容' })
  fullContent: string;

  @ApiProperty({ description: '投票比率' })
  upvoteRatio: number;
}
