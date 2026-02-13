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
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateBR(value: any) {
  const d = toDateSafe(value);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
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

// Donut SVG segmentado (C1..C5 colorido)
function donutSvgSegments({
  c1,
  c2,
  c3,
  c4,
  c5,
  totalText,
  size = 110,
  hole = 36,
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
    text: '#0f172a',
  };

  const segments = [
    { value: Number(c1) || 0, color: colors.c1 },
    { value: Number(c2) || 0, color: colors.c2 },
    { value: Number(c3) || 0, color: colors.c3 },
    { value: Number(c4) || 0, color: colors.c4 },
    { value: Number(c5) || 0, color: colors.c5 },
    { value: Number(gap) || 0, color: colors.gap },
  ].filter((s) => s.value > 0);

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
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16" font-weight="900" fill="${colors.text}">
      ${escapeHtml(totalText || '')}
    </text>
  </svg>`;
}

/**
 * ✅ Logo: prioridade (mais estável no Render)
 * 1) PDF_LOGO_PATH (caminho local)
 * 2) ./assets/logo.png (projeto)
 * 3) PDF_LOGO_URL (url pública)
 */
function resolveLogoDataUrl(): { dataUrl: string; kind: 'data' | 'url' | 'none' } {
  const envPath = (process.env.PDF_LOGO_PATH || '').trim();
  const envUrl = (process.env.PDF_LOGO_URL || '').trim();

  const candidates: string[] = [];

  if (envPath) candidates.push(envPath);
  // caminho padrão do projeto: ./assets/logo.png
  candidates.push(path.join(process.cwd(), 'assets', 'logo.png'));
  candidates.push(path.join(process.cwd(), 'assets', 'logo.jpg'));
  candidates.push(path.join(process.cwd(), 'assets', 'logo.jpeg'));

  for (const p of candidates) {
    try {
      if (!p) continue;
      if (!fs.existsSync(p)) continue;
      const ext = path.extname(p).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : '';
      if (!mime) continue;

      const base64 = fs.readFileSync(p, 'base64');
      return { dataUrl: `data:${mime};base64,${base64}`, kind: 'data' };
    } catch {
      // ignora e tenta o próximo
    }
  }

  if (envUrl) return { dataUrl: envUrl, kind: 'url' };
  return { dataUrl: '', kind: 'none' };
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
      const at =
        toDateSafe(a?.submittedAt || a?.createdAt || a?.updatedAt)?.getTime() ??
        -Infinity;
      const bt =
        toDateSafe(b?.submittedAt || b?.createdAt || b?.updatedAt)?.getTime() ??
        -Infinity;
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

    const { dataUrl: logoSrc, kind: logoKind } = resolveLogoDataUrl();
    const hasLogo = !!logoSrc;

    const summaryRows = sorted
      .map((e, i) => {
        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || `Tarefa ${i + 1}`;
        const sentAt = formatDateBR(e.submittedAt || e.createdAt || e.updatedAt);
        const score = e.score === null || e.score === undefined ? '—' : `${e.score}`;
        return `<tr><td>${escapeHtml(title)}</td><td>${escapeHtml(sentAt)}</td><td style="text-align:right;">${escapeHtml(score)}</td></tr>`;
      })
      .join('');

    // Mini cards com gráficos por redação (no resumo)
    const miniCards = sorted
      .map((e, idx) => {
        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || `Tarefa ${idx + 1}`;
        const sentAt = formatDateBR(e.submittedAt || e.createdAt || e.updatedAt);

        if (e.score == null) {
          return `
            <div class="mini-card">
              <div class="mini-title">${escapeHtml(title)}</div>
              <div class="mini-muted">${escapeHtml(sentAt)}</div>
              <div class="mini-muted" style="margin-top:8px;">Não corrigida.</div>
            </div>
          `;
        }

        const c1 = clamp0to200(e.c1);
        const c2 = clamp0to200(e.c2);
        const c3 = clamp0to200(e.c3);
        const c4 = clamp0to200(e.c4);
        const c5 = clamp0to200(e.c5);

        return `
          <div class="mini-card avoid-break">
            <div class="mini-title">${escapeHtml(title)}</div>
            <div class="mini-muted">${escapeHtml(sentAt)}</div>
            <div class="mini-row">
              <div class="mini-score">
                <div class="mini-score-num">${escapeHtml(e.score)}</div>
                <div class="mini-muted">/ 1000</div>
              </div>
              <div>
                ${donutSvgSegments({
                  c1, c2, c3, c4, c5,
                  totalText: String(e.score),
                  size: 88,
                  hole: 28,
                })}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <style>
    :root{
      --ink:#0f172a; --muted:#64748b; --line:#e5e7eb; --soft:#f1f5f9;
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: var(--ink); margin:0; }
    .page { padding: 22px; }
    .cover {
      display:flex; flex-direction:column; justify-content:center;
      height: 92vh;
      border: 1px solid var(--line);
      border-radius: 18px;
      margin: 10px;
      padding: 26px;
      background: #fff;
    }
    .brand { display:flex; align-items:center; gap:12px; }
    .brand-title { font-size: 28px; font-weight: 900; letter-spacing: .2px; }
    .logo { height: 46px; width: auto; display: ${hasLogo ? 'block' : 'none'}; }
    .subtitle { margin-top: 8px; font-size: 13px; color: var(--muted); }
    .meta { margin-top: 18px; font-size: 13px; color: var(--ink); line-height:1.6; }
    .break { page-break-after: always; }

    h1 { font-size: 18px; margin: 0 0 6px; }
    .sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
    .card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      margin-bottom: 12px;
      background:#fff;
      box-shadow: 0 1px 0 rgba(15,23,42,.04);
    }
    .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: space-between; }

    .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; width: 100%; margin-top:12px; }
    .kpi { padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: #fff; text-align:center; }
    .kpi .lab { font-size: 11px; color: var(--muted); }
    .kpi .val { font-size: 16px; font-weight: 900; margin-top: 2px; }

    .sectionTitle { font-size: 14px; font-weight: 900; margin: 14px 0 8px; }
    table { width:100%; border-collapse: collapse; }
    th, td { font-size: 12px; padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { text-align: left; color: var(--muted); background: var(--soft); }
    tr:last-child td { border-bottom: none; }

    .cards-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .mini-card { border:1px solid var(--line); border-radius:14px; padding:10px; background:#fff; }
    .mini-title { font-weight: 900; font-size: 12px; margin-bottom: 2px; }
    .mini-muted { font-size: 11px; color: var(--muted); }
    .mini-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px; }
    .mini-score-num { font-weight: 900; font-size: 18px; line-height: 1; }

    .task { page-break-inside: avoid; break-inside: avoid; }
    .essayBox {
      margin-top: 10px;
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--soft);
      white-space: pre-wrap;
      line-height: 1.75;
      text-align: justify;
      font-size: 13px;
    }

    .legend { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
    .chip { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid var(--line); border-radius:999px; font-size:11px; color:var(--muted); background:#fff; }
    .dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
    .dot.c1{background:#4f46e5}.dot.c2{background:#16a34a}.dot.c3{background:#f59e0b}.dot.c4{background:#0ea5e9}.dot.c5{background:#ef4444}

    @page { size: A4; margin: 18mm 12mm; }
    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>

  <!-- CAPA -->
  <div class="cover break">
    <div class="brand">
      ${hasLogo ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="Mestre Kira"/>` : ``}
      <div class="brand-title">Mestre Kira</div>
    </div>
    <div class="subtitle">Relatório de Desempenho (Redações + Gráficos)</div>

    <div class="meta">
      <div>Aluno: <strong>${escapeHtml(studentName)}</strong></div>
      <div>Sala: <strong>${escapeHtml(roomName)}</strong></div>
      <div>Gerado em: <strong>${escapeHtml(nowStr)}</strong></div>
      ${logoKind === 'none'
        ? `<div style="margin-top:10px; color:#64748b; font-size:11px;">
             (Dica: adicione ./assets/logo.png ou defina PDF_LOGO_URL/PDF_LOGO_PATH)
           </div>`
        : ``}
    </div>
  </div>

  <div class="page">
    <h1>Resumo Geral</h1>
    <div class="sub">Média geral e gráficos por redação.</div>

    <div class="card">
      <div class="sectionTitle">Média (somente corrigidas)</div>

      <div class="row">
        <div style="min-width: 260px;">
          <div class="mini-muted">Média total: <strong>${averages.total ?? '—'}</strong> / 1000</div>
          <div class="mini-muted">Sala: <strong>${escapeHtml(roomName)}</strong></div>

          <div class="legend">
            <span class="chip"><span class="dot c1"></span> C1</span>
            <span class="chip"><span class="dot c2"></span> C2</span>
            <span class="chip"><span class="dot c3"></span> C3</span>
            <span class="chip"><span class="dot c4"></span> C4</span>
            <span class="chip"><span class="dot c5"></span> C5</span>
          </div>
        </div>

        <div>
          ${
            averages.total !== null
              ? donutSvgSegments({
                  c1: averages.c1 ?? 0,
                  c2: averages.c2 ?? 0,
                  c3: averages.c3 ?? 0,
                  c4: averages.c4 ?? 0,
                  c5: averages.c5 ?? 0,
                  totalText: String(averages.total),
                  size: 120,
                  hole: 38,
                })
              : `<div class="mini-muted">Sem correções ainda.</div>`
          }
        </div>
      </div>

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
            </div>
          `,
          )
          .join('')}
      </div>

      <div class="sectionTitle" style="margin-top:14px;">Gráficos por redação</div>
      <div class="cards-grid">
        ${miniCards || `<div class="mini-muted">Nenhuma redação encontrada.</div>`}
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
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;">
            <div>
              <div style="font-weight:900; font-size:13px;">${escapeHtml(title)}</div>
              <div class="mini-muted">Enviada em: ${escapeHtml(sentAt)}</div>
              <div class="mini-muted">Nota: ${
                score === null ? '— (não corrigida)' : `${escapeHtml(score)} / 1000`
              }</div>
            </div>
            <div>
              ${
                score === null
                  ? `<div class="mini-muted">Sem gráfico (não corrigida).</div>`
                  : donutSvgSegments({ c1, c2, c3, c4, c5, totalText: String(score), size: 120, hole: 38 })
              }
            </div>
          </div>

          ${
            e.content
              ? `<div class="essayBox"><strong>Redação</strong>\n\n${escapeHtml(e.content)}</div>`
              : `<div class="essayBox"><strong>Redação</strong>\n\n<span style="color:#64748b;">Redação não disponível (verifique se o endpoint do PDF está trazendo "content").</span></div>`
          }
        </div>`;
      })
      .join('')}
  </div>
</body>
</html>
`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    // Header/Footer (logo + paginação)
    const safeRoomName = escapeHtml(roomName);
    const safeStudentName = escapeHtml(studentName);

    const headerTemplate = `
      <div style="width:100%; padding:0 12mm; font-size:9px; color:#64748b; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:6px;">
          ${
            hasLogo
              ? `<img src="${escapeHtml(logoSrc)}" style="height:14px; width:auto; vertical-align:middle;" />`
              : ``
          }
          <span style="font-weight:700; color:#475569;">Mestre Kira</span>
          <span>•</span>
          <span>${safeRoomName}</span>
        </div>
        <div style="color:#64748b;">${safeStudentName}</div>
      </div>
    `;

    const footerTemplate = `
      <div style="width:100%; padding:0 12mm; font-size:9px; color:#64748b; display:flex; align-items:center; justify-content:space-between;">
        <span>© 2026 Mestre Kira. Todos os direitos reservados.</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    `;

    try {
      const page = await browser.newPage();

      // Se a logo for URL externa, pode ser útil dar um tempinho pra carregar recursos
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '22mm', right: '12mm', bottom: '22mm', left: '12mm' },
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
