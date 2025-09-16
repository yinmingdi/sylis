import { UserBook } from '@prisma/client';

export type AddUserLearning = Omit<UserBook, 'id' | 'createdAt' | 'updatedAt'>;
