import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetCommentsReqDto {
  @ApiProperty({
    description: 'Reddit 帖子 ID',
    example: 'abc123',
  })
  @IsString()
  postId: string;
}

export class CommentMediaDto {
  @ApiProperty({ description: '媒体类型', enum: ['image', 'video', 'gif'] })
  type: 'image' | 'video' | 'gif';

  @ApiProperty({ description: '媒体 URL' })
  url: string;

  @ApiProperty({ description: '媒体标题', required: false })
  title?: string;

  @ApiProperty({ description: '媒体描述', required: false })
  description?: string;
}

export class CommentDto {
  @ApiProperty({ description: '评论 ID' })
  id: string;

  @ApiProperty({ description: '作者' })
  author: string;

  @ApiProperty({ description: '内容' })
  content: string;

  @ApiProperty({ description: '分数' })
  score: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '嵌套深度' })
  depth: number;

  @ApiProperty({
    description: '媒体内容',
    required: false,
    type: CommentMediaDto,
  })
  media?: CommentMediaDto;

  @ApiProperty({ description: '回复列表' })
  replies: CommentDto[];
}

export class GetCommentsResDto {
  @ApiProperty({ description: '评论列表' })
  comments: CommentDto[];

  @ApiProperty({ description: '总评论数' })
  totalCount: number;
}
