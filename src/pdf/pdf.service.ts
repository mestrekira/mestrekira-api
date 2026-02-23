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

// Útil para header/footer do puppeteer (evita quebrar template com caracteres especiais)
function escapeHtmlAttr(s: any) {
  // header/footer aceitam HTML; melhor escapar igual.
  return escapeHtml(s);
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

// Donut SVG segmentado (mantido)
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

    // ✅ Logo: tenta URL pública primeiro (se existir), senão cai pra assets base64
    // IMPORTANTÍSSIMO: header/footer do puppeteer às vezes falha com imagens remotas (CORS/rede).
    // Então: se PDF_LOGO_URL for http(s), tentamos baixar e converter pra data-url.
    const logoUrlEnv = String(process.env.PDF_LOGO_URL || '').trim();
    let logoDataUrl = '';

    async function tryUrlToDataUrl(url: string): Promise<string> {
      try {
        // já é data-url
        if (/^data:image\//i.test(url)) return url;

        // baixa e converte pra base64
        const res = await fetch(url);
        if (!res.ok) return '';

        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        // fallback: png
        const mime =
          ct.includes('image/') ? ct.split(';')[0].trim() : 'image/png';

        const arrBuf = await res.arrayBuffer();
        const base64 = Buffer.from(arrBuf).toString('base64');
        return `data:${mime};base64,${base64}`;
      } catch {
        return '';
      }
    }

    if (logoUrlEnv) {
      // Se for URL remota, converte pra data-url pra garantir no header.
      logoDataUrl =
        /^https?:\/\//i.test(logoUrlEnv) ? await tryUrlToDataUrl(logoUrlEnv) : logoUrlEnv;
    }

    if (!logoDataUrl) {
      try {
        const logoPath = path.join(process.cwd(), 'assets', 'logo1.png');
        const logoBase64 = fs.readFileSync(logoPath, 'base64');
        logoDataUrl = `data:image/png;base64,${logoBase64}`;
      } catch {
        console.warn(
          '[PDF] Logo não encontrada em assets/logo1.png e PDF_LOGO_URL não definido/indisponível.',
        );
        logoDataUrl = '';
      }
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
            <td class="cell-title">${escapeHtml(title)}</td>
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

        // Conteúdo escapado e seguro
        const content = escapeHtml(e.content || 'Redação não disponível.');

        return `
          <div class="card task">
            <div class="taskGrid">
              <div class="taskInfo">
                <div class="task-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                <div class="muted">Enviada em: ${escapeHtml(formatDateBR(e.createdAt ?? e.updatedAt))}</div>
                <div class="muted">Nota: ${
                  score == null ? '— (não corrigida)' : `${escapeHtml(score)} / 1000`
                }</div>
              </div>

              <div class="taskChart" aria-label="Gráfico de competências">
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
              <div class="essayHeader">Redação</div>
              <div class="essayContent">${content}</div>
            </div>
          </div>
        `;
      })
      .join('');

    // --------------------
    // ✅ MARGENS / HEADER / CAPA (corrigidos)
    // Ideia:
    // - Definir UMA largura de conteúdo (container) com padding lateral = margem do PDF
    // - Usar @page margin 0 e controlar margens exclusivamente pelo container + pdf margin (top/bottom)
    // - Capa com grid: logo + marca à esquerda, e bloco de info abaixo, alinhado à esquerda
    // - Header/footer com logo via data-url (mais confiável)
    // --------------------

    const MARGIN_X_MM = 12;     // esquerda/direita
    const HEADER_H_MM = 18;     // altura do header
    const FOOTER_H_MM = 14;     // altura do footer
    const BODY_TOP_MM = 25;     // espaço reservado (header + folga)
    const BODY_BOTTOM_MM = 20;  // espaço reservado (footer + folga)

    const headerRoom = escapeHtmlAttr(roomName);
    const headerStudent = escapeHtmlAttr(studentName);

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root{
    --ink:#0f172a;
    --muted:#64748b;
    --line:#e5e7eb;
    --soft:#f8fafc;
  }

  /* ✅ margin 0: quem define "margem" é o pdf() + o container */
  @page { size:A4; margin: 0; }

  html, body { padding:0; margin:0; }
  body { font-family: Arial, sans-serif; color:var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  h2, h3 { margin: 0 0 10px 0; }
  .muted { font-size:12px; color:var(--muted); }

  /* ✅ Container que simula as margens laterais */
  .container {
    box-sizing: border-box;
    width: 100%;
    padding: 0 ${MARGIN_X_MM}mm;
  }

  /* ✅ Seções: sem padding extra */
  .section { padding: 0; }

  /* ✅ Capa: centraliza verticalmente com “min-height” e flex */
  .cover {
    page-break-after: always;
    break-after: page;
  }
  .coverInner{
    min-height: 240mm;         /* ~altura útil A4, com folga */
    display:flex;
    flex-direction:column;
    justify-content:center;    /* ✅ centraliza vertical */
    gap: 10mm;
  }

  /* ✅ Marca à esquerda, estável */
  .brand {
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap: 10px;
  }
  .logo { height:52px; width:auto; display:block; }
  .title { font-size:28px; font-weight:900; line-height:1.1; }

  .coverMeta p { margin: 4px 0; }
  .coverMeta strong { color: var(--ink); }

  .card {
    border:1px solid var(--line);
    border-radius:14px;
    padding:14px;
    margin: 0 0 12px 0;
    background:#fff;

    break-inside: avoid;
    page-break-inside: avoid;
  }

  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th,td { padding:8px; border-bottom:1px solid var(--line); font-size:12px; vertical-align:top; }
  th { text-align:left; background: var(--soft); color: var(--muted); }
  .cell-title { max-width: 70mm; word-break: break-word; overflow-wrap:anywhere; }

  .taskGrid {
    display:grid;
    grid-template-columns: 1fr 140px;
    gap: 12px;
    align-items: start;
  }
  .taskInfo { min-width: 0; }
  .taskChart {
    width: 140px;
    min-height: 44mm;
    display:flex;
    justify-content:center;
    align-items:flex-start;
    padding-top: 2mm;
    box-sizing:border-box;
  }

  .task-title {
    font-weight:900;
    font-size:13px;
    margin-bottom:2px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .essayBox {
    margin-top:10px;
    padding:14px;
    border:1px solid var(--line);
    border-radius:12px;
    background:var(--soft);
  }

  .essayHeader {
    font-weight: 900;
    margin-bottom: 8px;
    font-size: 12px;
  }

  .essayContent {
    white-space: pre-wrap;
    line-height: 1.7;
    text-align: justify;
    overflow-wrap: anywhere;
    word-break: break-word;
    hyphens: auto;
    break-inside: auto;
    page-break-inside: auto;
  }

  .kpiRow{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    margin-top:10px;
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

  .pageBreakBefore { page-break-before: always; break-before: page; }

</style>
</head>
<body>

<!-- CAPA -->
<section class="section cover">
  <div class="container">
    <div class="coverInner">
      <div class="brand">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Mestre Kira"/>` : ``}
        <div>
          <div class="title">Mestre Kira</div>
          <div class="muted">Relatório de desempenho</div>
        </div>
      </div>

      <div class="coverMeta">
        <p><strong>Estudante:</strong> ${safeStudent}</p>
        <p><strong>Sala:</strong> ${safeRoom}</p>
        <p><strong>Gerado em:</strong> ${escapeHtml(formatDateBR(new Date()))}</p>
      </div>
    </div>
  </div>
</section>

<!-- CONTEÚDO -->
<section class="section">
  <div class="container">
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

    <div class="pageBreakBefore"></div>
    <h2>Detalhes por tarefa</h2>
    ${details}
  </div>
</section>

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

      // ajuda se tiver fonte/imagens, e evita bloqueios em configs mais restritas
      await page.setBypassCSP(true);

      // Dica: dá tempo do Chrome desenhar imagens/data-url antes do PDF
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // ✅ garante que imagens carregaram (inclui data-url)
      await page.evaluate(async () => {
        const imgs = Array.from(document.images || []);
        await Promise.all(
          imgs.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (!img) return resolve();
                if ((img as any).complete) return resolve();
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              }),
          ),
        );
      });

      // ✅ Header/Footer: em puppeteer, estilos precisam ser inline
      // Nota: manter altura fixa para não variar entre páginas
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,

        headerTemplate: `
          <div style="
            width:100%;
            height:${HEADER_H_MM}mm;
            padding:0 ${MARGIN_X_MM}mm;
            display:flex;
            align-items:center;
            justify-content:space-between;
            box-sizing:border-box;
            font-family: Arial, sans-serif;
          ">
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
              ${
                logoDataUrl
                  ? `<img src="${logoDataUrl}" style="height:14px; width:auto; display:block;" />`
                  : ``
              }
              <span style="color:#475569; font-weight:700; white-space:nowrap;">Mestre Kira</span>
              <span style="color:#94a3b8;">•</span>
              <span style="
                color:#64748b;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
                max-width:260px;
              ">
                ${headerRoom}
              </span>
            </div>

            <span style="
              color:#64748b;
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
              max-width:240px;
            ">
              Estudante: ${headerStudent}
            </span>
          </div>
        `,

        footerTemplate: `
          <div style="
            width:100%;
            height:${FOOTER_H_MM}mm;
            padding:0 ${MARGIN_X_MM}mm;
            display:flex;
            align-items:center;
            justify-content:space-between;
            box-sizing:border-box;
            font-family: Arial, sans-serif;
          ">
            <span style="color:#64748b; font-size:9px;">© 2026 Mestre Kira. Todos os direitos reservados.</span>
            <span style="color:#64748b; font-size:9px;">
              Página <span class="pageNumber"></span> de <span class="totalPages"></span>
            </span>
          </div>
        `,

        // ✅ Margens: reservam espaço para header/footer + conteúdo
        margin: {
          top: `${BODY_TOP_MM}mm`,
          bottom: `${BODY_BOTTOM_MM}mm`,
          left: `${MARGIN_X_MM}mm`,
          right: `${MARGIN_X_MM}mm`,
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
