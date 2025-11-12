// Auto-generated from Prisma schema

export interface Book {
  name: string;
  id: string;
  introduce?: string | null;
  coverUrl?: string | null;
  tags: string[];
  originName?: string | null;
  version?: string | null;
  wordNum?: number | null;
  reciteUserNum?: number | null;
  offlinedata?: string | null;
  size?: number | null;
}

