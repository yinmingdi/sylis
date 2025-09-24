import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BooksRepository {
  constructor(private readonly prismaService: PrismaService) {}

  books() {
    return this.prismaService.book.findMany();
  }
}
