import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController, MailPublicController } from './mail.controller';

@Module({
  controllers: [MailController, MailPublicController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
