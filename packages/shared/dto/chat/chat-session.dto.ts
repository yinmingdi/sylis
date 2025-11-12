// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface CreateSessionReqDto {
  title?: string;
  configId?: string;
}

export interface CreateSessionResDto {
  id: string;
  userId: string;
  title?: string;
  configId?: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSessionReqDto {
  title?: string;
  isArchived?: boolean;
}

export interface UpdateSessionResDto {
  id: string;
  title?: string;
  isArchived: boolean;
  updatedAt: Date;
}

export interface GetSessionsReqDto {
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface SessionItemDto {
  id: string;
  userId: string;
  title?: string;
  configId?: string;
  isArchived: boolean;
  messageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetSessionsResDto {
  sessions: SessionItemDto[];
  total: number;
}

