import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController, MailPublicController } from './mail.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([])], // ou só TypeOrmModule se você usa DataSource direto
  controllers: [MailController, MailPublicController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
