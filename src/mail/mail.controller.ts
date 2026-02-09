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
  constructor(
    private readonly mail: MailService,
    private readonly dataSource: DataSource,
  ) {}

  @Post('test')
  async test(
    @Headers('x-mail-secret') secret: string,
    @Body()
    body: {
      to: string;
      name?: string;
      downloadUrl?: string;
      deletionDateISO?: string;
      userId?: string;
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

    const downloadUrl =
      (body?.downloadUrl || '').trim() || `${baseUrl}/app/frontend/`;

    const deletionDateISO =
      (body?.deletionDateISO || '').trim() ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com';

    const unsubscribeUrl = await this.buildUnsubscribeUrlForTest(apiUrl, to, body?.userId);

    const result = await this.mail.sendInactivityWarning({
      to,
      name,
      deletionDateISO,
      downloadUrl,
      unsubscribeUrl: unsubscribeUrl || undefined,
    });

    return {
      ok: true,
      sentTo: to,
      unsubscribeUrl: unsubscribeUrl || null,
      note: unsubscribeUrl
        ? 'Unsubscribe REAL incluído (use o link para testar e verificar emailOptOut=true).'
        : 'Unsubscribe NÃO incluído (faltou MAIL_UNSUBSCRIBE_SECRET/CLEANUP_SECRET ou não foi possível obter userId).',
      result,
    };
  }

  private async buildUnsubscribeUrlForTest(apiUrl: string, email: string, userId?: string) {
    const secret =
      (process.env.MAIL_UNSUBSCRIBE_SECRET || '').trim() ||
      (process.env.CLEANUP_SECRET || '').trim();
    if (!secret) return '';

    const uid = (userId || '').trim() || (await this.getUserIdByEmail(email));
    if (!uid) return '';

    const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const data = `${uid}|${email}|${exp}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const raw = `${data}|${sig}`;
    const token = Buffer.from(raw, 'utf8').toString('base64url');

    return `${apiUrl}/mail/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private async getUserIdByEmail(email: string): Promise<string> {
    const r = await this.dataSource.query(
      `
      SELECT id
      FROM user_entity
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email],
    );
    return (r?.[0]?.id ? String(r[0].id) : '').trim();
  }
}

@Controller('mail')
export class MailPublicController {
  constructor(private readonly dataSource: DataSource) {}

  // -----------------------------
  // Unsubscribe
  // -----------------------------
  @Get('unsubscribe')
  async unsubscribeGet(@Query('token') token: string) {
    return this.applyUnsubscribeToken(token);
  }

  @Post('unsubscribe')
  async unsubscribePost(@Query('token') token: string) {
    return this.applyUnsubscribeToken(token);
  }

  private async applyUnsubscribeToken(token: string) {
    const parsed = this.verifySignedToken(token);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const { uid, email } = parsed;

    const res = await this.dataSource.query(
      `
      UPDATE user_entity
      SET "emailOptOut" = true
      WHERE id = $1 AND LOWER(email) = LOWER($2)
      `,
      [uid, email],
    );

    return {
      ok: true,
      message: 'Notificações canceladas com sucesso.',
      updated: (res as any)?.rowCount ?? null,
    };
  }

  // -----------------------------
  // Verify email (NOVO)
  // -----------------------------
  @Get('verify-email')
  async verifyEmailGet(@Query('token') token: string) {
    return this.applyVerifyEmailToken(token);
  }

  @Post('verify-email')
  async verifyEmailPost(@Query('token') token: string) {
    return this.applyVerifyEmailToken(token);
  }

  private async applyVerifyEmailToken(token: string) {
    if (!token) return { ok: false, error: 'Token ausente.' };

    const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');

    // Busca usuário pelo hash do token
    const rows = await this.dataSource.query(
      `
      SELECT id, email, "emailVerified", "emailVerifyTokenExpiresAt"
      FROM user_entity
      WHERE "emailVerifyTokenHash" = $1
      LIMIT 1
      `,
      [tokenHash],
    );

    const u = rows?.[0];
    if (!u?.id) return { ok: false, error: 'Token inválido.' };

    if (u.emailVerified) {
      return { ok: true, message: 'E-mail já verificado.' };
    }

    const exp = u.emailVerifyTokenExpiresAt ? new Date(u.emailVerifyTokenExpiresAt) : null;
    if (!exp || Date.now() > exp.getTime()) {
      return { ok: false, error: 'Token expirado. Peça um novo e-mail de verificação.' };
    }

    const res = await this.dataSource.query(
      `
      UPDATE user_entity
      SET "emailVerified" = true,
          "emailVerifiedAt" = NOW(),
          "emailVerifyTokenHash" = NULL,
          "emailVerifyTokenExpiresAt" = NULL
      WHERE id = $1
      `,
      [u.id],
    );

    return {
      ok: true,
      message: 'E-mail verificado com sucesso. Você já pode fazer login.',
      updated: (res as any)?.rowCount ?? null,
    };
  }

  // ✅ Reuso do verificador HMAC (unsubscribe)
  private verifySignedToken(token: string):
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
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Token inválido (assinatura).' };
    }

    return { ok: true, uid, email, exp };
  }
}
