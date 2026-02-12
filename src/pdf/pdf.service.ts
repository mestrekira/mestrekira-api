import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

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
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return '—';
  }
}

function mean(nums: Array<number | null | undefined>) {
  const v = (Array.isArray(nums) ? nums : [])
    .map((n) => (n === null || n === undefined ? null : Number(n)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));

  if (v.length === 0) return null;

  const sum = v.reduce((acc, cur) => acc + cur, 0);
  return Math.round(sum / v.length);
}

// Donut SVG
function donutSvg({ c1, c2, c3, c4, c5, totalText }: any) {
  const MAX = 1000;
  const used = Math.max(0, Math.min(MAX, c1 + c2 + c3 + c4 + c5));
  const gap = Math.max(0, MAX - used);

  const colors = {
    c1: '#4f46e5',
    c2: '#16a34a',
    c3: '#f59e0b',
    c4: '#0ea5e9',
    c5: '#ef4444',
    gap: '#ffffff',
    stroke: '#e5e7eb',
    text: '#0b1220',
  };

  const segments = [
    { value: c1, color: colors.c1 },
    { value: c2, color: colors.c2 },
    { value: c3, color: colors.c3 },
    { value: c4, color: colors.c4 },
    { value: c5, color: colors.c5 },
    { value: gap, color: colors.gap },
  ].filter((s) => s.value > 0);

  const size = 96;
  const hole = 30;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

 const total = segments.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
  if (total <= 0) return '';

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180.0;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(startAngle: number, endAngle: number) {
    const start = polarToCartesian(endAngle);
    const end = polarToCartesian(startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  }

  let angle = 0;
  const paths: string[] = [];
  for (const seg of segments) {
    const portion = seg.value / total;
    const delta = portion * 360;
    const start = angle;
    const end = angle + delta;
    paths.push(
      `<path d="${arcPath(start, end)}" fill="${seg.color}" stroke="${colors.stroke}" stroke-width="1"></path>`,
    );
    angle += delta;
  }

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${colors.stroke}" stroke-width="1"></circle>
    ${paths.join('\n')}
    <circle cx="${cx}" cy="${cy}" r="${hole}" fill="#fff"></circle>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="14" font-weight="900" fill="${colors.text}">
      ${escapeHtml(totalText || '')}
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
    (Array.isArray(tasks) ? tasks : []).forEach((t) => {
      if (t?.id) tasksMap.set(String(t.id), String(t.title || 'Tarefa'));
    });

    const sorted = [...(Array.isArray(essays) ? essays : [])].sort((a, b) => {
      const at = toDateSafe(a?.submittedAt || a?.createdAt || a?.updatedAt)?.getTime?.() ?? -Infinity;
      const bt = toDateSafe(b?.submittedAt || b?.createdAt || b?.updatedAt)?.getTime?.() ?? -Infinity;
      return bt - at;
    });

    const corrected = sorted.filter((e) => e?.score !== null && e?.score !== undefined);
    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    const nowStr = formatDateBR(new Date());

    const summaryRows = sorted
      .map((e, i) => {
        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || `Tarefa ${i + 1}`;
        const sentAt = formatDateBR(e.submittedAt || e.createdAt || e.updatedAt);
        const score = e.score === null || e.score === undefined ? '—' : `${e.score}`;
        return `<tr><td>${escapeHtml(title)}</td><td>${escapeHtml(sentAt)}</td><td style="text-align:right;">${escapeHtml(score)}</td></tr>`;
      })
      .join('');

    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0b1220; }
    .page { padding: 22px; }
    .cover { display:flex; flex-direction:column; justify-content:center; height: 92vh; }
    .brand { font-size: 28px; font-weight: 900; letter-spacing: .2px; }
    .subtitle { margin-top: 6px; font-size: 13px; opacity: .82; }
    .meta { margin-top: 18px; font-size: 13px; }
    .pill { display:inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 900; background: rgba(109,40,217,.12); border: 1px solid rgba(109,40,217,.35); }
    .break { page-break-after: always; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .sub { font-size: 12px; opacity: .8; margin-bottom: 16px; }
    .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
    .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
    .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; width: 100%; }
    .kpi { padding: 10px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; }
    .kpi .lab { font-size: 11px; opacity: .7; }
    .kpi .val { font-size: 16px; font-weight: 800; margin-top: 2px; }
    .muted { font-size: 12px; opacity: .8; }
    .sectionTitle { font-size: 14px; font-weight: 900; margin: 14px 0 8px; }
    table { width:100%; border-collapse: collapse; }
    th, td { font-size: 12px; padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { text-align: left; opacity: .85; }
    .task { page-break-inside: avoid; }
    .essayBox { margin-top: 10px; padding: 12px; border-radius: 12px; border: 1px solid #e5e7eb; white-space: pre-wrap; line-height: 1.6; text-align: justify; }
    @page { size: A4; margin: 14mm 12mm; }
  </style>
</head>
<body>

  <!-- CAPA -->
  <div class="page cover break">
    <div class="brand">Mestre Kira</div>
    <div class="subtitle">Relatório de desempenho (Redações + Gráficos)</div>

    <div class="meta">
      <div>Aluno: <strong>${escapeHtml(studentName)}</strong></div>
      <div>Sala: <strong>${escapeHtml(roomName)}</strong></div>
      <div>Gerado em: <strong>${escapeHtml(nowStr)}</strong></div>
    </div>
  </div>

  <!-- CONTEÚDO -->
  <div class="page">
    <h1>Desempenho do aluno</h1>
    <div class="sub">
      Aluno: <strong>${escapeHtml(studentName)}</strong> • Sala: <strong>${escapeHtml(roomName)}</strong>
    </div>

    <div class="card">
      <div class="sectionTitle">Resumo <span class="pill">somente corrigidas</span></div>

      <div class="row">
        <div style="min-width: 260px;">
          <div class="muted">Média total: <strong>${averages.total ?? '—'}</strong> / 1000</div>
        </div>
        <div>
          ${
            averages.total !== null
              ? donutSvg({
                  c1: averages.c1 ?? 0,
                  c2: averages.c2 ?? 0,
                  c3: averages.c3 ?? 0,
                  c4: averages.c4 ?? 0,
                  c5: averages.c5 ?? 0,
                  totalText: String(averages.total),
                })
              : `<div class="muted">Sem correções ainda.</div>`
          }
        </div>
      </div>

      <div class="kpis" style="margin-top:12px;">
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
            </div>
          `,
          )
          .join('')}
      </div>
    </div>

    <div class="card">
      <div class="sectionTitle">Sumário (tarefas)</div>
      <table>
        <thead>
          <tr><th>Tarefa</th><th>Enviada em</th><th style="text-align:right;">Nota</th></tr>
        </thead>
        <tbody>
          ${summaryRows || `<tr><td colspan="3">Nenhuma redação encontrada.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="sectionTitle">Detalhes por tarefa</div>

    ${sorted
      .map((e, idx) => {
        const score = e.score ?? null;
        const c1 = clamp0to200(e.c1);
        const c2 = clamp0to200(e.c2);
        const c3 = clamp0to200(e.c3);
        const c4 = clamp0to200(e.c4);
        const c5 = clamp0to200(e.c5);

        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || `Tarefa ${idx + 1}`;
        const sentAt = formatDateBR(e.submittedAt || e.createdAt || e.updatedAt);

        return `
        <div class="card task">
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${escapeHtml(title)}</div>
              <div class="muted">Enviada em: ${escapeHtml(sentAt)}</div>
              <div class="muted">Nota: ${
                score === null ? '— (não corrigida)' : `${escapeHtml(score)} / 1000`
              }</div>
            </div>
            <div>
              ${
                score === null
                  ? `<div class="muted">Sem gráfico (não corrigida).</div>`
                  : donutSvg({ c1, c2, c3, c4, c5, totalText: String(score) })
              }
            </div>
          </div>

          ${
            e.content
              ? `<div class="essayBox"><strong>Redação</strong>\n\n${escapeHtml(e.content)}</div>`
              : ''
          }
        </div>`;
      })
      .join('')}
  </div>
</body>
</html>
`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
function toDateSafe(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
    
  }
}

