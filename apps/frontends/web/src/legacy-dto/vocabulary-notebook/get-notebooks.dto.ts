// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface NotebookItemDto {
  id: string;
  name: string;
  description?: string;
  coverColor?: string;
  icon?: string;
  isDefault: boolean;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetNotebooksResDto {
  notebooks: NotebookItemDto[];
  total: number;
}
