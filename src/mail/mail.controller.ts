import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('admin/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Post('test')
  async test(
    @Headers('x-mail-secret') secret: string,
    @Body()
    body: {
      to: string;
      name?: string;
      downloadUrl?: string;
      deletionDateISO?: string;
    },
  ) {
    const expected = (process.env.MAIL_TEST_SECRET || '').trim();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('unauthorized');
    }

    const to = (body?.to || '').trim();
    if (!to) {
      return { ok: false, error: 'Body "to" é obrigatório' };
    }

    const name = (body?.name || '').trim() || 'Aluno(a)';
    const baseUrl = (process.env.APP_WEB_URL || '').trim() || 'https://www.mestrekira.com.br';
    const downloadUrl = (body?.downloadUrl || '').trim() || `${baseUrl}/app/frontend/`;
    const deletionDateISO =
      (body?.deletionDateISO || '').trim() ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = await this.mail.sendInactivityWarning({
      to,
      name,
      deletionDateISO,
      downloadUrl,
    });

    return { ok: true, result };
  }
}
