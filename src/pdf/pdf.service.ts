import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

type Essay = {
  id: string;
  taskId: string;
  taskTitle?: string;
  score?: number | null;
  c1?: number | null;
  c2?: number | null;
  c3?: number | null;
  c4?: number | null;
  c5?: number | null;
  content?: string | null;
  submittedAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

type Task = { id: string; title: string; createdAt?: any };

function clamp0to200(n: any) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(200, v));
}

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateBR(value: any) {
  const d = toDateSafe(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

function mean(nums: Array<number | null | undefined>) {
  const valid = nums
    .map((n) => (n == null ? null : Number(n)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));

  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/* ---------------------------
   Donut SVG (profissional)
----------------------------*/
function donutSvg(total: number | null) {
  if (total == null) return '';

  const pct = Math.max(0, Math.min(100, (total / 1000) * 100));
  const r = 42;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  const empty = c - filled;

  return `
  <svg width="110" height="110" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="10"/>
    <circle cx="60" cy="60" r="${r}" fill="none"
      stroke="#111827"
      stroke-width="10"
      stroke-dasharray="${filled} ${empty}"
      stroke-dashoffset="${c * 0.25}"
      stroke-linecap="round"/>
    <text x="60" y="65" text-anchor="middle"
      font-size="18"
      font-weight="900"
      fill="#111827">
      ${total}
    </text>
  </svg>`;
}

@Injectable()
export class PdfService {
  async generateStudentPerformancePdf(params: {
    studentName: string;
    roomName: string;
    essays: Essay[];
    tasks: Task[];
  }): Promise<Buffer> {
    const { studentName, roomName, essays, tasks } = params;

    const tasksMap = new Map<string, string>();
    tasks?.forEach((t) => {
      if (t?.id) tasksMap.set(String(t.id), t.title || 'Tarefa');
    });

    const sorted = [...(essays || [])].sort((a, b) => {
      const at = toDateSafe(a.submittedAt || a.createdAt || a.updatedAt)?.getTime() ?? 0;
      const bt = toDateSafe(b.submittedAt || b.createdAt || b.updatedAt)?.getTime() ?? 0;
      return bt - at;
    });

    const corrected = sorted.filter((e) => e.score != null);

    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    const nowStr = formatDateBR(new Date());

    /* ============================
       HTML PROFISSIONAL
    ============================= */

    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; margin:0; color:#0f172a; }
  .page { padding: 24px; }
  .cover { height: 92vh; display:flex; flex-direction:column; justify-content:center; }
  .brand { font-size: 26px; font-weight:900; }
  .subtitle { margin-top:6px; font-size:13px; color:#64748b; }
  .meta { margin-top:18px; font-size:13px; }
  .break { page-break-after: always; }

  h1 { font-size:18px; margin-bottom:6px; }
  .sub { font-size:12px; color:#64748b; margin-bottom:18px; }

  .card {
    border:1px solid #e5e7eb;
    border-radius:16px;
    padding:16px;
    margin-bottom:14px;
  }

  .dashboard {
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:14px;
  }

  .kpis { display:grid; grid-template-columns: repeat(6,1fr); gap:8px; margin-top:12px; }
  .kpi {
    border:1px solid #e5e7eb;
    border-radius:12px;
    padding:10px;
    text-align:center;
  }
  .kpi .lab { font-size:11px; color:#64748b; }
  .kpi .val { font-weight:900; font-size:16px; }

  table { width:100%; border-collapse:collapse; }
  th, td { padding:8px; font-size:12px; border-bottom:1px solid #e5e7eb; }
  th { text-align:left; color:#64748b; }

  .essayBox {
    margin-top:12px;
    border:1px solid #e5e7eb;
    border-radius:14px;
    padding:14px;
    white-space:pre-wrap;
    line-height:1.7;
    text-align:justify;
    font-size:13px;
  }

  @page { size:A4; margin:14mm 12mm; }
</style>
</head>
<body>

  <!-- CAPA -->
  <div class="page cover break">
    <div class="brand">Mestre Kira</div>
    <div class="subtitle">Relatório de Desempenho em Redações</div>

    <div class="meta">
      <div>Aluno: <strong>${escapeHtml(studentName)}</strong></div>
      <div>Sala: <strong>${escapeHtml(roomName)}</strong></div>
      <div>Gerado em: <strong>${escapeHtml(nowStr)}</strong></div>
    </div>
  </div>

  <!-- DASHBOARD -->
  <div class="page">
    <h1>Resumo Geral</h1>
    <div class="sub">
      Desempenho consolidado das redações corrigidas.
    </div>

    <div class="dashboard">
      <div class="card">
        <div><strong>Média Geral</strong></div>
        <div style="margin-top:10px;">
          ${donutSvg(averages.total)}
        </div>
      </div>

      <div class="card">
        <div><strong>Médias por Competência</strong></div>
        <div class="kpis">
          ${[
            ['Total', averages.total],
            ['C1', averages.c1],
            ['C2', averages.c2],
            ['C3', averages.c3],
            ['C4', averages.c4],
            ['C5', averages.c5],
          ]
            .map(
              ([lab, val]) => `
            <div class="kpi">
              <div class="lab">${lab}</div>
              <div class="val">${val ?? '—'}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <strong>Sumário das Redações</strong>
      <table>
        <thead>
          <tr>
            <th>Tarefa</th>
            <th>Data</th>
            <th style="text-align:right;">Nota</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((e, i) => {
              const title =
                e.taskTitle ||
                tasksMap.get(String(e.taskId)) ||
                `Tarefa ${i + 1}`;

              return `
                <tr>
                  <td>${escapeHtml(title)}</td>
                  <td>${formatDateBR(e.submittedAt || e.createdAt || e.updatedAt)}</td>
                  <td style="text-align:right;">
                    ${e.score ?? '—'}
                  </td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- DETALHES -->
  ${sorted
    .map((e, i) => {
      const title =
        e.taskTitle ||
        tasksMap.get(String(e.taskId)) ||
        `Tarefa ${i + 1}`;

      return `
      <div class="page break">
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">
          Enviada em ${formatDateBR(e.submittedAt || e.createdAt || e.updatedAt)}
          • Nota: ${e.score ?? '—'} / 1000
        </div>

        ${donutSvg(e.score ?? null)}

        ${
          e.content
            ? `<div class="essayBox">
                ${escapeHtml(e.content)}
               </div>`
            : `<div class="essayBox">Redação não disponível.</div>`
        }
      </div>`;
    })
    .join('')}

</body>
</html>
`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
