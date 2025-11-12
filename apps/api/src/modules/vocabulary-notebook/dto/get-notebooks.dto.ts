import { ApiProperty } from '@nestjs/swagger';

export class NotebookItemDto {
  @ApiProperty({ description: '生词本ID' })
  id: string;

  @ApiProperty({ description: '生词本名称' })
  name: string;

  @ApiProperty({ description: '描述' })
  description?: string;

  @ApiProperty({ description: '封面颜色' })
  coverColor?: string;

  @ApiProperty({ description: '图标' })
  icon?: string;

  @ApiProperty({ description: '是否默认生词本' })
  isDefault: boolean;

  @ApiProperty({ description: '单词数量' })
  wordCount: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class GetNotebooksResDto {
  @ApiProperty({ description: '生词本列表', type: [NotebookItemDto] })
  notebooks: NotebookItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}
