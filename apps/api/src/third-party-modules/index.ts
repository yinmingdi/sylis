import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

export const thirdPartyModules: any[] = [
  MailerModule.forRoot({
    transport: {
      host: process.env.MAILER_HOST,
      port: process.env.MAILER_PORT,
      auth: {
        user: process.env.MAILER_USER,
        pass: process.env.MAILER_PASS,
      },
    },
    template: {
      dir: join(__dirname, '../../templates'),
      adapter: new HandlebarsAdapter(),
    },
  }),
];
