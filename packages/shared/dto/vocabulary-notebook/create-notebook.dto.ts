// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface CreateNotebookReqDto {
  name: string;
  description?: string;
  coverColor?: string;
  icon?: string;
}

export interface CreateNotebookResDto {
  id: string;
  name: string;
  description?: string;
  coverColor?: string;
  icon?: string;
  isDefault: boolean;
  createdAt: Date;
}

