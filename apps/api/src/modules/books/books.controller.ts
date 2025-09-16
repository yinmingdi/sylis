import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

import { BooksService } from './books.service';
import { GetBooksResDto } from './dto/books.dto';

@Controller('books')
export class BooksController {
  constructor(private readonly BooksService: BooksService) {}

  @Get()
  @ApiOkResponse({
    description: 'Get Books info',
  })
  books(): Promise<GetBooksResDto[]> {
    return this.BooksService.books();
  }
}
