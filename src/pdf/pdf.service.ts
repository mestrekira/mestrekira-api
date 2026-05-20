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

function clamp0to1000(n: any) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1000, v));
}

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(s: any) {
  return escapeHtml(s).replace(/`/g, '&#096;');
}

function formatDateBR(value: any, tz?: string) {
  if (!value) return '—';

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  const timeZone = String(tz || process.env.PDF_TZ || 'America/Sao_Paulo').trim();

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  }
}

function mean(nums: Array<number | null | undefined>) {
  const v = nums
    .map((n) => (n == null ? null : Number(n)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));

  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

function statusLabel(score: any) {
  return score === null || score === undefined ? 'Aguardando correção' : 'Corrigida';
}

function scoreText(score: any) {
  return score === null || score === undefined ? '—' : String(score);
}

function donutSvg({
  c1,
  c2,
  c3,
  c4,
  c5,
  totalText,
  totalValue,
  size = 120,
  thickness = 17,
}: {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  totalText: string;
  totalValue?: number | null;
  size?: number;
  thickness?: number;
}) {
  const colors = {
    c1: '#4f46e5',
    c2: '#16a34a',
    c3: '#f59e0b',
    c4: '#0ea5e9',
    c5: '#ef4444',
    margin: '#ffffff',
    base: '#e5e7eb',
    border: 'rgba(15,23,42,0.18)',
  };

  const score =
    totalValue === null || totalValue === undefined
      ? clamp0to1000(
          Number(c1 || 0) +
            Number(c2 || 0) +
            Number(c3 || 0) +
            Number(c4 || 0) +
            Number(c5 || 0),
        )
      : clamp0to1000(totalValue);

  const values = [
    { value: clamp0to200(c1), color: colors.c1 },
    { value: clamp0to200(c2), color: colors.c2 },
    { value: clamp0to200(c3), color: colors.c3 },
    { value: clamp0to200(c4), color: colors.c4 },
    { value: clamp0to200(c5), color: colors.c5 },
    { value: Math.max(0, 1000 - score), color: colors.margin },
  ];

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  let offset = 0;

  const circles = values
    .map((seg) => {
      const len = Math.max(0, (seg.value / 1000) * C);
      const out = `
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${r}"
          fill="none"
          stroke="${seg.color}"
          stroke-width="${thickness}"
          stroke-dasharray="${len} ${C - len}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cy})"
        />
      `;
      offset += len;
      return out;
    })
    .join('');

  return `
    <svg class="donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.base}" stroke-width="${thickness}" />
      ${circles}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.border}" stroke-width="1" />
      <circle cx="${cx}" cy="${cy}" r="${Math.max(1, r - thickness / 2 - 3)}" fill="#ffffff" />
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="19" font-weight="900" fill="#0f172a">
        ${escapeHtml(totalText)}
      </text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="8" font-weight="700" fill="#64748b">
        pontos
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

    const safeStudent = escapeHtml(studentName || 'Estudante');
    const safeRoom = escapeHtml(roomName || 'Sala');
    const timeZone = String(process.env.PDF_TZ || 'America/Sao_Paulo').trim();

    const logoUrlEnv = String(process.env.PDF_LOGO_URL || '').trim();
    let logoDataUrl = '';

    const loadLocalLogo = () => {
      try {
        const logoPath = path.join(process.cwd(), 'assets', 'logo1.png');
        const logoBase64 = fs.readFileSync(logoPath, 'base64');
        return `data:image/png;base64,${logoBase64}`;
      } catch {
        return '';
      }
    };

    if (logoUrlEnv) {
      const isData = /^data:image\//i.test(logoUrlEnv);
      logoDataUrl = isData ? logoUrlEnv : loadLocalLogo() || logoUrlEnv;
    } else {
      logoDataUrl = loadLocalLogo();
      if (!logoDataUrl) {
        console.warn('[PDF] Logo não encontrada em assets/logo1.png e PDF_LOGO_URL não definido.');
      }
    }

    const tasksMap = new Map((tasks || []).map((t) => [String(t.id), t.title]));

    const sorted = [...(essays || [])].sort((a, b) => {
      const ta = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
      return tb - ta;
    });

    const corrected = sorted.filter((e) => e.score !== null && e.score !== undefined);

    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    const generatedAt = formatDateBR(new Date(), timeZone);
    const totalEssays = sorted.length;
    const correctedCount = corrected.length;
    const pendingCount = Math.max(0, totalEssays - correctedCount);

    const avgDonut =
      averages.total !== null
        ? donutSvg({
            c1: averages.c1 ?? 0,
            c2: averages.c2 ?? 0,
            c3: averages.c3 ?? 0,
            c4: averages.c4 ?? 0,
            c5: averages.c5 ?? 0,
            totalText: String(averages.total),
            totalValue: averages.total,
            size: 128,
            thickness: 18,
          })
        : `<div class="empty-chart">Sem correções</div>`;

    const summaryRows = sorted
      .map((e, index) => {
        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || 'Tarefa';
        const dt = formatDateBR(e.createdAt ?? e.updatedAt, timeZone);
        const score = e.score ?? null;

        return `
          <tr>
            <td class="summary-index">${index + 1}</td>
            <td class="summary-title">${escapeHtml(title)}</td>
            <td>${escapeHtml(dt)}</td>
            <td>
              <span class="status-pill ${score == null ? 'pending' : 'done'}">${escapeHtml(statusLabel(score))}</span>
            </td>
            <td class="summary-score">${escapeHtml(scoreText(score))}</td>
          </tr>
        `;
      })
      .join('');

    const details = sorted
      .map((e, idx) => {
        const title = e.taskTitle || tasksMap.get(String(e.taskId)) || `Tarefa ${idx + 1}`;
        const score = e.score ?? null;

        const c1 = clamp0to200(e.c1);
        const c2 = clamp0to200(e.c2);
        const c3 = clamp0to200(e.c3);
        const c4 = clamp0to200(e.c4);
        const c5 = clamp0to200(e.c5);

        const content = escapeHtml(e.content || 'Redação não disponível.');
        const sentAt = formatDateBR(e.createdAt ?? e.updatedAt, timeZone);

        const chart =
          score !== null && score !== undefined
            ? donutSvg({
                c1,
                c2,
                c3,
                c4,
                c5,
                totalText: String(score),
                totalValue: Number(score),
                size: 104,
                thickness: 15,
              })
            : `<div class="empty-chart small">Sem correção</div>`;

        return `
          <article class="essay-card">
            <div class="essay-head">
              <div class="essay-meta">
                <div class="essay-number">Redação ${idx + 1}</div>
                <h3>${escapeHtml(title)}</h3>
                <p>Enviada em: <strong>${escapeHtml(sentAt)}</strong></p>
              </div>

              <div class="essay-chart-box">
                ${chart}
              </div>
            </div>

            <div class="competence-grid">
              <div class="competence c1"><span>C1</span><strong>${score == null ? '—' : c1}</strong></div>
              <div class="competence c2"><span>C2</span><strong>${score == null ? '—' : c2}</strong></div>
              <div class="competence c3"><span>C3</span><strong>${score == null ? '—' : c3}</strong></div>
              <div class="competence c4"><span>C4</span><strong>${score == null ? '—' : c4}</strong></div>
              <div class="competence c5"><span>C5</span><strong>${score == null ? '—' : c5}</strong></div>
              <div class="competence total"><span>Nota</span><strong>${score == null ? '—' : `${escapeHtml(score)} / 1000`}</strong></div>
            </div>

            <div class="essay-text-box">
              <div class="essay-text-head">Texto da redação</div>
              <div class="essay-content">${content}</div>
            </div>
          </article>
        `;
      })
      .join('');

    const HEADER_MM = Number(process.env.PDF_HEADER_MM || 14);
    const FOOTER_MM = Number(process.env.PDF_FOOTER_MM || 12);
    const LR_MM = Number(process.env.PDF_MARGIN_LR_MM || 16);

    const marginTop = `${Math.max(Number(process.env.PDF_MARGIN_TOP_MM || 30), HEADER_MM + 16)}mm`;
    const marginBottom = `${Math.max(Number(process.env.PDF_MARGIN_BOTTOM_MM || 24), FOOTER_MM + 12)}mm`;
    const marginLR = `${Math.max(LR_MM, 14)}mm`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --soft: #f8fafc;
    --line: #e2e8f0;
    --navy: #0b1f4b;
    --purple: #6d28d9;
    --c1: #4f46e5;
    --c2: #16a34a;
    --c3: #f59e0b;
    --c4: #0ea5e9;
    --c5: #ef4444;
  }

  @page {
    size: A4;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    padding: 0;
    margin: 0;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: var(--ink);
    background: #ffffff;
    font-size: 12px;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 19px;
    margin-bottom: 10px;
    color: var(--navy);
    letter-spacing: -0.02em;
  }

  h3 {
    font-size: 15px;
    color: var(--ink);
    line-height: 1.25;
  }

  .page-section {
    width: 100%;
  }

  .cover {
    min-height: 224mm;
    page-break-after: always;
    break-after: page;
  }

  .cover-shell {
    width: 100%;
    min-height: 210mm;
    border: 1px solid var(--line);
    border-radius: 20px;
    overflow: hidden;
    display: table;
    table-layout: fixed;
  }

  .cover-band {
    display: table-cell;
    width: 18mm;
    background: linear-gradient(180deg, var(--navy), var(--purple));
  }

  .cover-main {
    display: table-cell;
    vertical-align: top;
    padding: 24mm 20mm 18mm;
    background: #ffffff;
  }

  .brand {
    display: table;
    table-layout: fixed;
    width: 100%;
  }

  .brand-logo-wrap {
    display: table-cell;
    width: 18mm;
    vertical-align: middle;
  }

  .brand-logo {
    width: 14mm;
    height: 14mm;
    object-fit: contain;
    display: block;
  }

  .brand-text {
    display: table-cell;
    vertical-align: middle;
  }

  .brand-title {
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
    color: var(--navy);
    letter-spacing: -0.04em;
  }

  .brand-subtitle {
    margin-top: 4px;
    color: var(--muted);
    font-weight: 700;
    font-size: 12px;
  }

  .cover-title {
    margin-top: 26mm;
    max-width: 130mm;
  }

  .cover-title h1 {
    font-size: 33px;
    line-height: 1.08;
    color: var(--navy);
    letter-spacing: -0.05em;
  }

  .cover-title p {
    margin-top: 10px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .cover-info {
    margin-top: 20mm;
    display: table;
    table-layout: fixed;
    width: 100%;
    border-spacing: 8px;
  }

  .cover-info-row {
    display: table-row;
  }

  .info-card {
    display: table-cell;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px;
    background: var(--soft);
    vertical-align: top;
  }

  .info-card-full {
    display: block;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px;
    background: var(--soft);
    margin-bottom: 8px;
  }

  .info-label {
    display: block;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 900;
    margin-bottom: 5px;
  }

  .info-value {
    color: var(--ink);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.35;
  }

  .cover-footer {
    margin-top: 28mm;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .summary-layout {
    display: table;
    table-layout: fixed;
    width: 100%;
    border-spacing: 0;
    margin-bottom: 12px;
  }

  .summary-chart-cell {
    display: table-cell;
    width: 60mm;
    vertical-align: top;
    padding-right: 12px;
  }

  .summary-kpi-cell {
    display: table-cell;
    vertical-align: top;
  }

  .card {
    border: 1px solid var(--line);
    background: #ffffff;
    border-radius: 16px;
    padding: 14px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .score-card {
    width: 58mm;
    height: 58mm;
    min-height: 58mm;
    max-height: 58mm;
    display: table;
    table-layout: fixed;
    overflow: hidden;
    background: #ffffff;
  }

  .score-card-inner {
    display: table-cell;
    width: 58mm;
    height: 58mm;
    vertical-align: middle;
    text-align: center;
  }

  .kpi-grid {
    display: table;
    table-layout: fixed;
    width: 100%;
    border-spacing: 7px;
  }

  .kpi-row {
    display: table-row;
  }

  .kpi {
    display: table-cell;
    width: 33.333%;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px;
    background: var(--soft);
    vertical-align: top;
  }

  .kpi span {
    display: block;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-weight: 900;
    margin-bottom: 5px;
  }

  .kpi strong {
    display: block;
    font-size: 19px;
    color: var(--navy);
    line-height: 1.05;
  }

  .competence-legend {
    display: table;
    table-layout: fixed;
    width: 100%;
    border-spacing: 5px;
    margin-top: 8px;
  }

  .legend-pill {
    display: table-cell;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 7px 8px;
    background: #ffffff;
    font-size: 10px;
    color: var(--muted);
    font-weight: 800;
    white-space: nowrap;
    text-align: center;
  }

  .legend-pill i {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 3px;
    margin-right: 4px;
    vertical-align: -1px;
  }

  .c1-dot { background: var(--c1); }
  .c2-dot { background: var(--c2); }
  .c3-dot { background: var(--c3); }
  .c4-dot { background: var(--c4); }
  .c5-dot { background: var(--c5); }

  .summary-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 4px;
  }

  .summary-table th {
    text-align: left;
    background: var(--navy);
    color: #ffffff;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .06em;
    padding: 9px 8px;
  }

  .summary-table td {
    border-bottom: 1px solid var(--line);
    padding: 9px 8px;
    font-size: 11.5px;
    vertical-align: middle;
    overflow-wrap: anywhere;
  }

  .summary-table tr:nth-child(even) td {
    background: var(--soft);
  }

  .summary-index {
    width: 10mm;
    color: var(--muted);
    font-weight: 900;
  }

  .summary-title {
    width: 66mm;
    font-weight: 800;
    color: var(--ink);
  }

  .summary-score {
    text-align: right;
    font-weight: 900;
    color: var(--navy);
  }

  .status-pill {
    display: inline-block;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 9.5px;
    font-weight: 900;
    white-space: nowrap;
  }

  .status-pill.done {
    color: #166534;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
  }

  .status-pill.pending {
    color: #92400e;
    background: #fef3c7;
    border: 1px solid #fde68a;
  }

  .details-title {
    page-break-before: always;
    break-before: page;
  }

  .essay-card {
    border: 1px solid var(--line);
    border-radius: 18px;
    background: #ffffff;
    margin-bottom: 14px;
    overflow: hidden;
    page-break-inside: auto;
    break-inside: auto;
  }

  .essay-head {
    display: table;
    table-layout: fixed;
    width: 100%;
    min-height: 40mm;
    background: #f8fafc;
    border-bottom: 1px solid var(--line);
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .essay-meta {
    display: table-cell;
    vertical-align: top;
    padding: 14px;
    min-width: 0;
    overflow: hidden;
  }

  .essay-chart-box {
    display: table-cell;
    width: 38mm;
    height: 38mm;
    min-width: 38mm;
    max-width: 38mm;
    min-height: 38mm;
    max-height: 38mm;
    padding: 8px;
    vertical-align: middle;
    text-align: center;
    overflow: hidden;
  }

  .essay-number {
    display: inline-block;
    margin-bottom: 6px;
    border-radius: 999px;
    padding: 4px 9px;
    color: var(--purple);
    background: rgba(109, 40, 217, .10);
    border: 1px solid rgba(109, 40, 217, .18);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .essay-meta h3 {
    max-width: 100%;
    font-size: 17px;
    color: var(--navy);
    margin-bottom: 5px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .essay-meta p {
    color: var(--muted);
    font-size: 11px;
  }

  .competence-grid {
    display: table;
    table-layout: fixed;
    width: 100%;
    border-spacing: 7px;
    padding: 5px 7px;
    background: #ffffff;
    border-bottom: 1px solid var(--line);
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .competence {
    display: table-cell;
    width: 16.666%;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 8px;
    min-height: 16mm;
    background: var(--soft);
    vertical-align: top;
  }

  .competence span {
    display: block;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-weight: 900;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .competence strong {
    display: block;
    font-size: 13px;
    color: var(--ink);
    white-space: nowrap;
  }

  .competence.c1 { border-top: 3px solid var(--c1); }
  .competence.c2 { border-top: 3px solid var(--c2); }
  .competence.c3 { border-top: 3px solid var(--c3); }
  .competence.c4 { border-top: 3px solid var(--c4); }
  .competence.c5 { border-top: 3px solid var(--c5); }

  .competence.total {
    border-top: 3px solid var(--navy);
    background: #f8fafc;
  }

  .essay-text-box {
    padding: 14px;
    background: #ffffff;
  }

  .essay-text-head {
    display: inline-block;
    color: var(--navy);
    font-weight: 900;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .essay-content {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--soft);
    padding: 13px 14px;
    white-space: pre-wrap;
    line-height: 1.72;
    text-align: justify;
    overflow-wrap: anywhere;
    word-break: break-word;
    hyphens: auto;
    font-size: 12.2px;
    page-break-inside: auto;
    break-inside: auto;
  }

  .empty-chart {
    width: 34mm;
    height: 34mm;
    border-radius: 999px;
    border: 1px dashed var(--line);
    background: var(--soft);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 10px;
    font-weight: 900;
    text-align: center;
    padding: 8px;
  }

  .empty-chart.small {
    width: 28mm;
    height: 28mm;
  }

  .empty-state {
    border: 1px dashed var(--line);
    border-radius: 16px;
    padding: 18px;
    color: var(--muted);
    background: var(--soft);
  }

  .donut-svg {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    flex: 0 0 auto;
    margin: 0 auto;
  }

  .score-card .donut-svg {
    width: 46mm;
    max-width: 46mm;
  }

  .essay-chart-box .donut-svg {
    width: 30mm;
    max-width: 30mm;
  }

  svg text {
    dominant-baseline: auto;
  }
</style>
</head>

<body>
  <section class="page-section cover">
    <div class="cover-shell">
      <div class="cover-band"></div>

      <div class="cover-main">
        <div class="brand">
          <div class="brand-logo-wrap">
            ${logoDataUrl ? `<img src="${escapeAttr(logoDataUrl)}" class="brand-logo" alt="Mestre Kira"/>` : ''}
          </div>
          <div class="brand-text">
            <div class="brand-title">Mestre Kira</div>
            <div class="brand-subtitle">Plataforma de Redação</div>
          </div>
        </div>

        <div class="cover-title">
          <h1>Relatório de desempenho em redação</h1>
          <p>
            Síntese das redações enviadas, médias por competência e histórico de desempenho do estudante.
          </p>
        </div>

        <div class="cover-info">
          <div class="info-card-full">
            <span class="info-label">Estudante</span>
            <div class="info-value">${safeStudent}</div>
          </div>

          <div class="cover-info-row">
            <div class="info-card">
              <span class="info-label">Sala</span>
              <div class="info-value">${safeRoom}</div>
            </div>

            <div class="info-card">
              <span class="info-label">Gerado em</span>
              <div class="info-value">${escapeHtml(generatedAt)}</div>
            </div>
          </div>
        </div>

        <div class="cover-footer">
          Este relatório reúne apenas redações registradas na plataforma e considera, nas médias,
          as produções que já possuem correção lançada.
        </div>
      </div>
    </div>
  </section>

  <section class="page-section">
    <h2>Resumo geral</h2>

    <div class="summary-layout">
      <div class="summary-chart-cell">
        <div class="card score-card">
          <div class="score-card-inner">
            ${avgDonut}
          </div>
        </div>
      </div>

      <div class="summary-kpi-cell">
        <div class="card">
          <div class="kpi-grid">
            <div class="kpi-row">
              <div class="kpi"><span>Média geral</span><strong>${averages.total ?? '—'}</strong></div>
              <div class="kpi"><span>Redações</span><strong>${totalEssays}</strong></div>
              <div class="kpi"><span>Corrigidas</span><strong>${correctedCount}</strong></div>
            </div>

            <div class="kpi-row">
              <div class="kpi"><span>Aguardando</span><strong>${pendingCount}</strong></div>
              <div class="kpi"><span>Sala</span><strong style="font-size:13px; line-height:1.2;">${safeRoom}</strong></div>
              <div class="kpi"><span>Escala</span><strong>1000</strong></div>
            </div>
          </div>

          <div class="competence-legend">
            <div class="legend-pill"><i class="c1-dot"></i>C1: ${averages.c1 ?? '—'}</div>
            <div class="legend-pill"><i class="c2-dot"></i>C2: ${averages.c2 ?? '—'}</div>
            <div class="legend-pill"><i class="c3-dot"></i>C3: ${averages.c3 ?? '—'}</div>
            <div class="legend-pill"><i class="c4-dot"></i>C4: ${averages.c4 ?? '—'}</div>
            <div class="legend-pill"><i class="c5-dot"></i>C5: ${averages.c5 ?? '—'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:17px; margin-bottom:8px;">Sumário das redações</h2>

      <table class="summary-table">
        <thead>
          <tr>
            <th style="width:10mm;">#</th>
            <th style="width:68mm;">Tarefa</th>
            <th style="width:36mm;">Data</th>
            <th style="width:38mm;">Status</th>
            <th style="width:20mm; text-align:right;">Nota</th>
          </tr>
        </thead>
        <tbody>
          ${
            summaryRows ||
            `<tr><td colspan="5" class="empty-state">Nenhuma redação encontrada.</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <h2 class="details-title">Detalhes por tarefa</h2>
    ${
      details ||
      `<div class="empty-state">Nenhuma redação foi encontrada para este estudante nesta sala.</div>`
    }
  </section>
</body>
</html>
`;

    const execPath =
      (await chromium.executablePath()) ||
      String(process.env.CHROME_EXECUTABLE_PATH || '').trim() ||
      undefined;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: execPath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    try {
      const page = await browser.newPage();
      await page.setBypassCSP(true);

      try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
      } catch {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
      }

      const headerTemplate = `
        <div style="width:100%; box-sizing:border-box; padding:0 ${marginLR}; height:${HEADER_MM}mm; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(15,23,42,0.10); font-family:Arial, Helvetica, sans-serif;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            ${
              logoDataUrl
                ? `<img src="${escapeAttr(logoDataUrl)}" style="height:13px; width:auto; display:block;" />`
                : ``
            }
            <span style="color:#0b1f4b; font-weight:900; font-size:10px; white-space:nowrap;">Mestre Kira</span>
            <span style="color:#94a3b8; font-size:10px;">•</span>
            <span style="color:#64748b; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:250px;">
              ${safeRoom}
            </span>
          </div>
          <span style="color:#64748b; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:270px;">
            ${safeStudent}
          </span>
        </div>
      `;

      const footerTemplate = `
        <div style="width:100%; box-sizing:border-box; padding:0 ${marginLR}; height:${FOOTER_MM}mm; display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(15,23,42,0.10); font-family:Arial, Helvetica, sans-serif;">
          <span style="color:#64748b; font-size:9px;">© 2026 Mestre Kira. Todos os direitos reservados.</span>
          <span style="color:#64748b; font-size:9px;">
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </span>
        </div>
      `;

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: {
          top: marginTop,
          bottom: marginBottom,
          left: marginLR,
          right: marginLR,
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
