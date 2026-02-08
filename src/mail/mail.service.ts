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
    const key = process.env.RESEND_API_KEY?.trim();
    this.resend = key ? new Resend(key) : null;
  }

  async sendInactivityWarning(params: {
    to: string;
    name: string;
    deletionDateISO: string;
    downloadUrl: string;
  }) {
    const from = process.env.MAIL_FROM?.trim();
    const replyTo = process.env.MAIL_REPLY_TO?.trim(); // opcional

    if (!from) {
      this.logger.warn('MAIL_FROM não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'MAIL_FROM missing' };
    }

    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' };
    }

    // ✅ assunto menos “agressivo” (ajuda a não cair no spam)
    const subject = 'Sua conta está inativa — veja como evitar a remoção';

    const { html, text } = this.buildInactivityContent(params);

    try {
      const result = await this.resend.emails.send({
        from,
        to: params.to,
        subject,
        html,
        text, // ✅ importante
        replyTo: replyTo || undefined,
        tags: [{ name: 'type', value: 'inactivity-warning' }],
      });

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
  }: {
    name: string;
    deletionDateISO: string;
    downloadUrl: string;
  }) {
    const safeName = escapeHtml((name || '').trim() || 'Olá');

    // ✅ melhor para BR do que UTC (evita “virar o dia” dependendo da hora)
    const date = new Date(deletionDateISO).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const safeUrl = escapeAttr(downloadUrl);

    const preheader = 'Baixe suas redações e gráficos e evite a remoção automática da conta.';

    const text =
`Olá, ${name || 'tudo bem?'}

Identificamos que sua conta está inativa. Para liberar armazenamento, sua conta está programada para remoção em ${date}.

Antes disso, você pode baixar seu desempenho e suas redações:
${downloadUrl}

Se você voltar a usar a plataforma, a remoção pode ser evitada automaticamente.

— Mestre Kira
`;

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
</div>
`;
    return { html, text };
  }
}
