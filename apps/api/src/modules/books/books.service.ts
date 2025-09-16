import { Injectable } from '@nestjs/common';

import { BooksRepository } from './books.repository';

@Injectable()
export class BooksService {
  constructor(private readonly BooksRepository: BooksRepository) {}

  books() {
    return this.BooksRepository.books();
  }
}
