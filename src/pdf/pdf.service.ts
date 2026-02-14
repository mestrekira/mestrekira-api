import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import * as fs from 'fs';
import * as path from 'path';

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
  createdAt?: any;
  updatedAt?: any;
};

type Task = { id: string; title: string };

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

function formatDateBR(value: any) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

function mean(nums: Array<number | null | undefined>) {
  const v = nums
    .map((n) => (n == null ? null : Number(n)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

// Donut colorido segmentado
function donutSvg({
  c1,
  c2,
  c3,
  c4,
  c5,
  totalText,
  size = 120,
  hole = 38,
}: {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  totalText: string;
  size?: number;
  hole?: number;
}) {
  const colors = ['#4f46e5', '#16a34a', '#f59e0b', '#0ea5e9', '#ef4444'];
  const values = [c1, c2, c3, c4, c5].map((n) => Number(n) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return '';

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  let angle = 0;
  const segments: string[] = [];

  values.forEach((val, i) => {
    const delta = (val / total) * 360;
    const start = angle;
    const end = angle + delta;

    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(start));
    const y1 = cy + r * Math.sin(rad(start));
    const x2 = cx + r * Math.cos(rad(end));
    const y2 = cy + r * Math.sin(rad(end));

    const large = delta > 180 ? 1 : 0;

    segments.push(
      `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i]}" />`,
    );

    angle += delta;
  });

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${segments.join('\n')}
    <circle cx="${cx}" cy="${cy}" r="${hole}" fill="#fff"/>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16" font-weight="900" fill="#0f172a">
      ${escapeHtml(totalText)}
    </text>
  </svg>
  `;
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

    const safeStudent = escapeHtml(studentName);
    const safeRoom = escapeHtml(roomName);

    // ✅ Logo local (assets/logo1.png) em Base64
    let logoDataUrl = '';
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'logo1.png');
      const logoBase64 = fs.readFileSync(logoPath, 'base64');
      logoDataUrl = `data:image/png;base64,${logoBase64}`;
    } catch {
      // sem logo local; não quebra PDF
      console.warn('[PDF] assets/logo1.png não encontrada.');
    }

    const tasksMap = new Map((tasks || []).map((t) => [t.id, t.title]));

    const sorted = [...(essays || [])].sort((a, b) => {
      const ta = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
      return tb - ta;
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

    const summaryRows = sorted
      .map((e) => {
        const title = e.taskTitle || tasksMap.get(e.taskId) || 'Tarefa';
        const dt = formatDateBR(e.createdAt ?? e.updatedAt);
        const score = e.score ?? '—';
        return `
          <tr>
            <td>${escapeHtml(title)}</td>
            <td>${escapeHtml(dt)}</td>
            <td style="text-align:right;">${escapeHtml(score)}</td>
          </tr>
        `;
      })
      .join('');

    const details = sorted
      .map((e, idx) => {
        const title =
          e.taskTitle || tasksMap.get(e.taskId) || `Tarefa ${idx + 1}`;
        const score = e.score ?? null;

        const c1 = clamp0to200(e.c1);
        const c2 = clamp0to200(e.c2);
        const c3 = clamp0to200(e.c3);
        const c4 = clamp0to200(e.c4);
        const c5 = clamp0to200(e.c5);

        return `
          <div class="card task">
            <div class="taskGrid">
              <div class="taskInfo">
                <div class="task-title">${escapeHtml(title)}</div>
                <div class="muted">Enviada em: ${escapeHtml(
                  formatDateBR(e.createdAt ?? e.updatedAt),
                )}</div>
                <div class="muted">Nota: ${
                  score == null ? '— (não corrigida)' : `${escapeHtml(score)} / 1000`
                }</div>
              </div>

              <div class="taskChart">
                ${
                  score != null
                    ? donutSvg({
                        c1,
                        c2,
                        c3,
                        c4,
                        c5,
                        totalText: String(score),
                        size: 120,
                        hole: 38,
                      })
                    : `<div class="muted">—</div>`
                }
              </div>
            </div>

            <div class="essayBox">
              <strong>Redação</strong><br/><br/>
              ${escapeHtml(e.content || 'Redação não disponível.')}
            </div>
          </div>
        `;
      })
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<style>
  :root{
    --ink:#0f172a; --muted:#64748b; --line:#e5e7eb; --soft:#f8fafc;
  }
  body { font-family: Arial, sans-serif; color:var(--ink); margin:0; }
  .page { padding: 20px; }
  .cover { display:flex; flex-direction:column; justify-content:center; height:90vh; }
  .brand { display:flex; align-items:center; gap:12px; }
  .logo { height:50px; width:auto; }
  .title { font-size:26px; font-weight:900; }
  .card { border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:12px; }
  .muted { font-size:12px; color:var(--muted); }

  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th,td { padding:8px; border-bottom:1px solid var(--line); font-size:12px; vertical-align:top; }
  th { text-align:left; background: var(--soft); color: var(--muted); }

  /* ✅ layout FIXO do gráfico: coluna da direita fixa */
  .taskGrid {
    display:grid;
    grid-template-columns: 1fr 140px;
    gap: 12px;
    align-items: start;
  }
  .taskInfo { min-width: 0; } /* permite quebra de linha sem empurrar o gráfico */
  .taskChart {
    width: 140px;
    display:flex;
    justify-content:center;
    align-items:flex-start;
  }
  .task-title { font-weight:900; font-size:13px; margin-bottom:2px; }

  .essayBox {
    margin-top:10px;
    padding:14px;
    border:1px solid var(--line);
    border-radius:12px;
    background:var(--soft);
    white-space:pre-wrap;
    line-height:1.7;
    text-align:justify;

    /* ✅ impede estouro por strings longas */
    overflow-wrap:anywhere;
    word-break:break-word;
    hyphens:auto;
  }

  .kpiRow{
    display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;
  }
  .kpi{
    border:1px solid var(--line);
    border-radius:999px;
    padding:6px 10px;
    font-size:12px;
    background:#fff;
    color: var(--muted);
  }
  .kpi b{ color: var(--ink); }

  @page { size:A4; margin:20mm 12mm; }
</style>
</head>
<body>

<div class="page cover">
  <div class="brand">
    ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Mestre Kira"/>` : ``}
    <div class="title">Mestre Kira</div>
  </div>
  <p class="muted">Relatório de desempenho</p>
  <p><strong>Estudante:</strong> ${safeStudent}</p>
  <p><strong>Sala:</strong> ${safeRoom}</p>
  <p><strong>Gerado em:</strong> ${escapeHtml(formatDateBR(new Date()))}</p>
</div>

<div class="page">
  <h2>Resumo Geral</h2>

  <div class="card">
    ${
      averages.total != null
        ? donutSvg({
            c1: averages.c1 ?? 0,
            c2: averages.c2 ?? 0,
            c3: averages.c3 ?? 0,
            c4: averages.c4 ?? 0,
            c5: averages.c5 ?? 0,
            totalText: String(averages.total),
            size: 120,
            hole: 38,
          })
        : `<div class="muted">Sem correções ainda.</div>`
    }

    <div class="kpiRow">
      <span class="kpi"><b>C1</b>: ${averages.c1 ?? '—'}</span>
      <span class="kpi"><b>C2</b>: ${averages.c2 ?? '—'}</span>
      <span class="kpi"><b>C3</b>: ${averages.c3 ?? '—'}</span>
      <span class="kpi"><b>C4</b>: ${averages.c4 ?? '—'}</span>
      <span class="kpi"><b>C5</b>: ${averages.c5 ?? '—'}</span>
    </div>
  </div>

  <div class="card">
    <h3>Sumário</h3>
    <table>
      <thead>
        <tr><th>Tarefa</th><th>Data</th><th style="text-align:right;">Nota</th></tr>
      </thead>
      <tbody>
        ${summaryRows || `<tr><td colspan="3">Nenhuma redação encontrada.</td></tr>`}
      </tbody>
    </table>
  </div>

  <h2>Detalhes por tarefa</h2>
  ${details}
</div>

</body>
</html>
`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size:9px; width:100%; padding:0 12mm; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:6px;">
              ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:14px; width:auto;" />` : ``}
              <span style="color:#475569; font-weight:700;">Mestre Kira</span>
              <span style="color:#94a3b8;">•</span>
              <span style="color:#64748b;">${safeRoom}</span>
            </div>
            <span style="color:#64748b;">Estudante: ${safeStudent}</span>
          </div>
        `,
        footerTemplate: `
          <div style="font-size:9px; width:100%; padding:0 12mm; display:flex; justify-content:space-between;">
            <span style="color:#64748b;">© 2026 Mestre Kira. Todos os direitos reservados.</span>
            <span style="color:#64748b;">
              Página <span class="pageNumber"></span> de <span class="totalPages"></span>
            </span>
          </div>
        `,
        margin: { top: '25mm', bottom: '20mm', left: '12mm', right: '12mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
