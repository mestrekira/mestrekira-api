import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
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
    const baseUrl =
      (process.env.APP_WEB_URL || '').trim() || 'https://www.mestrekira.com.br';
    const downloadUrl = (body?.downloadUrl || '').trim() || `${baseUrl}/app/frontend/`;
    const deletionDateISO =
      (body?.deletionDateISO || '').trim() ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // opcional: se quiser testar unsubscribe no e-mail de teste:
    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() || 'https://mestrekira-api.onrender.com';

    const unsubscribeUrl = `${apiUrl}/mail/unsubscribe?token=fake_test_token`;

    const result = await this.mail.sendInactivityWarning({
      to,
      name,
      deletionDateISO,
      downloadUrl,
      unsubscribeUrl, // pode manter ou remover; é só para teste visual
    });

    return { ok: true, result };
  }
}

/**
 * Rotas públicas para unsubscribe:
 * - GET  /mail/unsubscribe?token=...
 * - POST /mail/unsubscribe?token=...  (compatibilidade "one-click")
 */
@Controller('mail')
export class MailPublicController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('unsubscribe')
  async unsubscribeGet(@Query('token') token: string) {
    const res = await this.applyUnsubscribeToken(token);
    // Pode retornar HTML depois, mas JSON já resolve e não quebra nada.
    return res;
  }

  @Post('unsubscribe')
  async unsubscribePost(@Query('token') token: string) {
    // Gmail/clients podem mandar POST sem body útil; por isso aceitamos token na query.
    const res = await this.applyUnsubscribeToken(token);
    return res;
  }

  private async applyUnsubscribeToken(token: string) {
    const parsed = this.verifyUnsubscribeToken(token);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const { uid, email } = parsed;

    // grava opt-out
    await this.dataSource.query(
      `
      UPDATE user_entity
      SET "emailOptOut" = true
      WHERE id = $1 AND email = $2
      `,
      [uid, email],
    );

    return { ok: true, message: 'Notificações canceladas com sucesso.' };
  }

  private verifyUnsubscribeToken(token: string):
    | { ok: true; uid: string; email: string; exp: number }
    | { ok: false; error: string } {
    if (!token || typeof token !== 'string') {
      return { ok: false, error: 'Token ausente.' };
    }

    const secret =
      (process.env.MAIL_UNSUBSCRIBE_SECRET || '').trim() ||
      (process.env.CLEANUP_SECRET || '').trim();

    if (!secret) {
      return { ok: false, error: 'Configuração ausente (secret).' };
    }

    let raw: string;
    try {
      raw = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
      return { ok: false, error: 'Token inválido (decode).' };
    }

    const parts = raw.split('|');
    if (parts.length !== 4) {
      return { ok: false, error: 'Token inválido (formato).' };
    }

    const [uid, email, expStr, sig] = parts;
    const exp = Number(expStr);

    if (!uid || !email || !exp || !sig) {
      return { ok: false, error: 'Token inválido (campos).' };
    }

    if (Date.now() > exp) {
      return { ok: false, error: 'Token expirado.' };
    }

    const data = `${uid}|${email}|${exp}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    // comparação em tempo constante
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Token inválido (assinatura).' };
    }

    return { ok: true, uid, email, exp };
  }
}
