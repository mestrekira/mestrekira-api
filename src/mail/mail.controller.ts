import { Controller, Post, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('admin/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Post('test')
  async test(
    @Query('to') to: string,
    @Headers('x-cleanup-secret') secret: string,
  ) {
    if (!process.env.CLEANUP_SECRET || secret !== process.env.CLEANUP_SECRET) {
      throw new UnauthorizedException('unauthorized');
    }

    if (!to || !String(to).includes('@')) {
      return { ok: false, error: 'Informe ?to=seuemail@dominio.com' };
    }

    const baseUrl = (process.env.APP_WEB_URL || '').trim() || 'https://www.mestrekira.com.br';
    const downloadUrl = `${baseUrl}/app/frontend/desempenho.html?roomId=TESTE`;

    const result = await this.mail.sendInactivityWarning({
      to,
      name: 'Teste Mestre Kira',
      deletionDateISO: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      downloadUrl,
    });

    return { ok: true, result };
  }
}
