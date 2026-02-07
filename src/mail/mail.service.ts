import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

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
    if (!from) {
      this.logger.warn('MAIL_FROM não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'MAIL_FROM missing' };
    }

    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY não configurado. Pulando envio.');
      return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' };
    }

    const subject = 'Aviso: sua conta será removida por inatividade';
    const html = this.buildInactivityHtml(params);

    try {
      const result = await this.resend.emails.send({
        from,
        to: params.to,
        subject,
        html,
      });

      this.logger.log(`Resend OK: to=${params.to} | result=${JSON.stringify(result)}`);
      return { ok: true, result };
    } catch (err: any) {
      this.logger.error(
        `Resend FAIL: ${params.to} | ${err?.message || err}`,
        err?.stack,
      );
      throw err;
    }
  }

  private buildInactivityHtml({
    name,
    deletionDateISO,
    downloadUrl,
  }: {
    name: string;
    deletionDateISO: string;
    downloadUrl: string;
  }) {
    const safeName = (name || '').trim() || 'Olá';
    const date = new Date(deletionDateISO).toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
    });

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">${safeName}, aviso de inatividade</h2>

        <p>
          Identificamos que sua conta está inativa. Para liberar armazenamento,
          sua conta está programada para remoção em <b>${date}</b>.
        </p>

        <p>
          Antes disso, você pode baixar seu desempenho e suas redações:
        </p>

        <p>
          <a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none;">
            Baixar meus dados
          </a>
        </p>

        <p style="color:#666;font-size:12px;margin-top:18px;">
          Se você voltar a usar a plataforma, a remoção pode ser evitada automaticamente.
        </p>
      </div>
    `;
  }
}

