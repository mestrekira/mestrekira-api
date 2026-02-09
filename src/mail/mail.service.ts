import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

function escapeHtml(s: string) {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor() {
    const key = (process.env.RESEND_API_KEY || '').trim();
    this.resend = key ? new Resend(key) : null;
  }

  // -----------------------------
  // 1) Inactivity (você já usa)
  // -----------------------------
  async sendInactivityWarning(params: {
    to: string;
    name: string;
    deletionDateISO: string;
    downloadUrl: string;
    unsubscribeUrl?: string;
  }) {
    const from = (process.env.MAIL_FROM || '').trim();
    const replyTo = (process.env.MAIL_REPLY_TO || '').trim();

    if (!from) {
      this.logger.warn('MAIL_FROM não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'MAIL_FROM missing' };
    }
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' };
    }

    const subject = 'Sua conta está inativa — veja como evitar a remoção';

    const { html, text } = this.buildInactivityContent(params);

    const unsub = (params.unsubscribeUrl || '').trim();
    const headers =
      unsub.length > 0
        ? {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined;

    try {
      const payload: any = {
        from,
        to: params.to,
        subject,
        html,
        text,
        headers,
        tags: [{ name: 'type', value: 'inactivity-warning' }],
      };
      if (replyTo) payload.reply_to = replyTo;

      const result = await this.resend.emails.send(payload);
      this.logger.log(`Resend OK: to=${params.to} | result=${JSON.stringify(result)}`);
      return { ok: true, result };
    } catch (err: any) {
      this.logger.error(`Resend FAIL: ${params.to} | ${err?.message || err}`, err?.stack);
      throw err;
    }
  }

  private buildInactivityContent({
    name,
    deletionDateISO,
    downloadUrl,
    unsubscribeUrl,
  }: {
    name: string;
    deletionDateISO: string;
    downloadUrl: string;
    unsubscribeUrl?: string;
  }) {
    const safeName = escapeHtml((name || '').trim() || 'Olá');

    const date = new Date(deletionDateISO).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const safeUrl = escapeAttr(downloadUrl);

    const safeUnsub = (unsubscribeUrl || '').trim()
      ? escapeAttr(unsubscribeUrl as string)
      : '';

    const preheader = 'Baixe suas redações e gráficos e evite a remoção automática da conta.';

    let text =
`Olá, ${name || 'tudo bem?'}

Identificamos que sua conta está inativa. Para liberar armazenamento, sua conta está programada para remoção em ${date}.

Antes disso, você pode baixar seu desempenho e suas redações:
${downloadUrl}

Se você voltar a usar a plataforma, a remoção pode ser evitada automaticamente.

— Mestre Kira
`;

    if (safeUnsub) {
      text += `\nPara parar de receber estes avisos: ${unsubscribeUrl}\n`;
    }

    const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  ${escapeHtml(preheader)}
</div>

<div style="font-family: Arial, sans-serif; line-height: 1.5;">
  <h2 style="margin: 0 0 12px;">${safeName}, sua conta está inativa</h2>

  <p style="margin:0 0 12px;">
    Identificamos que sua conta está inativa. Para liberar armazenamento,
    sua conta está programada para remoção em <b>${date}</b>.
  </p>

  <p style="margin:0 0 12px;">
    Antes disso, você pode baixar seu desempenho e suas redações:
  </p>

  <p style="margin:0 0 16px;">
    <a href="${safeUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
      Baixar meus dados
    </a>
  </p>

  <p style="color:#666;font-size:12px;margin-top:18px;">
    Se você voltar a usar a plataforma, a remoção pode ser evitada automaticamente.
  </p>

  ${
    safeUnsub
      ? `
  <p style="color:#666;font-size:12px;margin-top:10px;">
    Não quer mais receber este aviso?
    <a href="${safeUnsub}" style="color:#666;">Cancelar notificações</a>
  </p>
  `
      : ''
  }
</div>
`;
    return { html, text };
  }

  // -----------------------------
  // 2) Email Verification (NOVO)
  // -----------------------------
  async sendEmailVerification(params: {
    to: string;
    name: string;
    verifyUrl: string;
  }) {
    const from = (process.env.MAIL_FROM || '').trim();
    const replyTo = (process.env.MAIL_REPLY_TO || '').trim();

    if (!from) {
      this.logger.warn('MAIL_FROM não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'MAIL_FROM missing' };
    }
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' };
    }

    const subject = 'Confirme seu e-mail para acessar o Mestre Kira';
    const { html, text } = this.buildVerifyEmailContent(params);

    try {
      const payload: any = {
        from,
        to: params.to,
        subject,
        html,
        text,
        tags: [{ name: 'type', value: 'email-verify' }],
      };
      if (replyTo) payload.reply_to = replyTo;

      const result = await this.resend.emails.send(payload);
      this.logger.log(`VerifyEmail OK: to=${params.to} | result=${JSON.stringify(result)}`);
      return { ok: true, result };
    } catch (err: any) {
      this.logger.error(`VerifyEmail FAIL: ${params.to} | ${err?.message || err}`, err?.stack);
      throw err;
    }
  }

  private buildVerifyEmailContent({
    name,
    verifyUrl,
  }: {
    name: string;
    verifyUrl: string;
  }) {
    const safeName = escapeHtml((name || '').trim() || 'Olá');
    const safeUrl = escapeAttr(verifyUrl);

    const preheader = 'Confirme seu e-mail para liberar o acesso à sua conta.';

    const text =
`Olá, ${name || 'tudo bem?'}

Para acessar sua conta no Mestre Kira, confirme seu e-mail clicando no link abaixo:
${verifyUrl}

Se você não criou esta conta, ignore este e-mail.

— Mestre Kira
`;

    const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  ${escapeHtml(preheader)}
</div>

<div style="font-family: Arial, sans-serif; line-height: 1.5;">
  <h2 style="margin: 0 0 12px;">${safeName}, confirme seu e-mail</h2>

  <p style="margin:0 0 12px;">
    Para acessar sua conta no <b>Mestre Kira</b>, confirme seu e-mail:
  </p>

  <p style="margin:0 0 16px;">
    <a href="${safeUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
      Confirmar e-mail
    </a>
  </p>

  <p style="color:#666;font-size:12px;margin-top:18px;">
    Se você não criou esta conta, ignore este e-mail.
  </p>
</div>
`;
    return { html, text };
  }

    // -----------------------------
  // 3) Password Reset (NOVO)
  // -----------------------------
  async sendPasswordReset(params: {
    to: string;
    name: string;
    resetUrl: string;
  }) {
    const from = (process.env.MAIL_FROM || '').trim();
    const replyTo = (process.env.MAIL_REPLY_TO || '').trim();

    if (!from) {
      this.logger.warn('MAIL_FROM não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'MAIL_FROM missing' };
    }
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' };
    }

    const subject = 'Redefina sua senha no Mestre Kira';

    const safeName = escapeHtml((params.name || '').trim() || 'Olá');
    const safeUrl = escapeAttr(params.resetUrl);

    const text =
`Olá, ${params.name || 'tudo bem?'}

Recebemos uma solicitação para redefinir sua senha.
Clique no link abaixo para criar uma nova senha:
${params.resetUrl}

Se você não solicitou isso, ignore este e-mail.

— Mestre Kira
`;

    const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  Redefina sua senha no Mestre Kira.
</div>

<div style="font-family: Arial, sans-serif; line-height: 1.5;">
  <h2 style="margin: 0 0 12px;">${safeName}, redefina sua senha</h2>

  <p style="margin:0 0 12px;">
    Recebemos uma solicitação para redefinir sua senha.
  </p>

  <p style="margin:0 0 16px;">
    <a href="${safeUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
      Redefinir senha
    </a>
  </p>

  <p style="color:#666;font-size:12px;margin-top:18px;">
    Se você não solicitou isso, ignore este e-mail.
  </p>
</div>
`;

    try {
      const payload: any = {
        from,
        to: params.to,
        subject,
        html,
        text,
        tags: [{ name: 'type', value: 'password-reset' }],
      };
      if (replyTo) payload.reply_to = replyTo;

      const result = await this.resend.emails.send(payload);
      this.logger.log(`PasswordReset OK: to=${params.to} | result=${JSON.stringify(result)}`);
      return { ok: true, result };
    } catch (err: any) {
      this.logger.error(`PasswordReset FAIL: ${params.to} | ${err?.message || err}`, err?.stack);
      throw err;
    }
  }
}

