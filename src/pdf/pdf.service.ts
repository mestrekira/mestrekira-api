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

// donut colorido
function donutSvg({ c1, c2, c3, c4, c5, totalText }: any) {
  const colors = ['#4f46e5', '#16a34a', '#f59e0b', '#0ea5e9', '#ef4444'];
  const values = [c1, c2, c3, c4, c5].map((n) => Number(n) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return '';

  const size = 110;
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
  <svg width="${size}" height="${size}">
    ${segments.join('\n')}
    <circle cx="${cx}" cy="${cy}" r="35" fill="#fff"/>
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

    // ✅ Logo local em Base64
    let logoDataUrl = '';
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'logo1.png');
      const logoBase64 = fs.readFileSync(logoPath, 'base64');
      logoDataUrl = `data:image/png;base64,${logoBase64}`;
    } catch {
      console.warn('[PDF] logo1.png não encontrada em assets/');
    }

    const tasksMap = new Map(tasks.map((t) => [t.id, t.title]));

    const sorted = [...(essays || [])].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );

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
        return `
        <tr>
          <td>${escapeHtml(title)}</td>
          <td>${formatDateBR(e.createdAt)}</td>
          <td style="text-align:right;">${e.score ?? '—'}</td>
        </tr>`;
      })
      .join('');

    const details = sorted
      .map((e) => {
        const title = e.taskTitle || tasksMap.get(e.taskId) || 'Tarefa';
        const score = e.score ?? null;

        return `
        <div class="card task">
          <div class="task-header">
            <div>
              <div class="task-title">${escapeHtml(title)}</div>
              <div class="muted">Enviada em: ${formatDateBR(e.createdAt)}</div>
              <div class="muted">Nota: ${
                score == null ? '—' : score + ' / 1000'
              }</div>
            </div>
            ${
              score != null
                ? donutSvg({
                    c1: clamp0to200(e.c1),
                    c2: clamp0to200(e.c2),
                    c3: clamp0to200(e.c3),
                    c4: clamp0to200(e.c4),
                    c5: clamp0to200(e.c5),
                    totalText: String(score),
                  })
                : ''
            }
          </div>

          <div class="essayBox">
            <strong>Redação</strong><br/><br/>
            ${escapeHtml(e.content || 'Redação não disponível.')}
          </div>
        </div>`;
      })
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; color:#0f172a; }
  .page { padding: 20px; }
  .cover { display:flex; flex-direction:column; justify-content:center; height:90vh; }
  .brand { display:flex; align-items:center; gap:12px; }
  .logo { height:50px; }
  .title { font-size:26px; font-weight:900; }
  .card { border:1px solid #e5e7eb; border-radius:14px; padding:14px; margin-bottom:12px; }
  .task-header { display:flex; justify-content:space-between; gap:12px; }
  .task-title { font-weight:900; }
  .muted { font-size:12px; color:#64748b; }
  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th,td { padding:8px; border-bottom:1px solid #e5e7eb; font-size:12px; }
  .essayBox {
    margin-top:10px;
    padding:14px;
    border:1px solid #e5e7eb;
    border-radius:12px;
    background:#f8fafc;
    white-space:pre-wrap;
    line-height:1.7;
    text-align:justify;
    overflow-wrap:anywhere;
    word-break:break-word;
    hyphens:auto;
  }
  @page { size:A4; margin:20mm 12mm; }
</style>
</head>
<body>

<div class="page cover">
  <div class="brand">
    ${
      logoDataUrl
        ? `<img src="${logoDataUrl}" class="logo"/>`
        : ''
    }
    <div class="title">Mestre Kira</div>
  </div>
  <p>Relatório de desempenho</p>
  <p><strong>Aluno:</strong> ${safeStudent}</p>
  <p><strong>Sala:</strong> ${safeRoom}</p>
  <p><strong>Gerado em:</strong> ${formatDateBR(new Date())}</p>
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
          })
        : '<p>Sem correções ainda.</p>'
    }
  </div>

  <div class="card">
    <h3>Sumário</h3>
    <table>
      <thead>
        <tr><th>Tarefa</th><th>Data</th><th>Nota</th></tr>
      </thead>
      <tbody>
        ${summaryRows}
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
              ${
                logoDataUrl
                  ? `<img src="${logoDataUrl}" style="height:14px;"/>`
                  : ''
              }
              <span style="color:#475569; font-weight:700;">Mestre Kira</span>
            </div>
            <span style="color:#64748b;">${safeStudent}</span>
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
        margin: { top: '25mm', bottom: '20mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
