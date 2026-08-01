import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

export const thirdPartyModules: any[] = [
  MailerModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => ({
      transport: {
        host: configService.getOrThrow<string>('MAILER_HOST'),
        port: configService.getOrThrow<number>('MAILER_PORT'),
        secure: configService.getOrThrow<boolean>('MAILER_SECURE'),
        auth: {
          user: configService.getOrThrow<string>('MAILER_USER'),
          pass: configService.getOrThrow<string>('MAILER_PASS'),
        },
      },
      defaults: {
        from: configService.getOrThrow<string>('MAILER_FROM'),
      },
      template: {
        dir: join(__dirname, '../../templates'),
        adapter: new HandlebarsAdapter(),
      },
    }),
  }),
];
