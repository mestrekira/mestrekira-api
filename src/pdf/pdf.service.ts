import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

type AnyObj = Record<string, any>;

type TaskLike = {
  id?: string;
  title?: string;
  name?: string;
  taskTitle?: string;
} & AnyObj;

type EssayLike = {
  id: string;
  taskId: string;

  // notas
  score?: number | null;
  c1?: number | null;
  c2?: number | null;
  c3?: number | null;
  c4?: number | null;
  c5?: number | null;

  // texto
  content?: string | null;

  // datas (opcional)
  submittedAt?: any;
  createdAt?: any;
  updatedAt?: any;

  // opcional
  taskTitle?: string;
} & AnyObj;

function clamp0to200(n: any) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(200, v));
}

function safeNum(n: any): number | null {
  const v = Number(n);
  return Number.isNaN(v) ? null : v;
}

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mean(nums: Array<any>): number | null {
  const v = (Array.isArray(nums) ? nums : [])
    .map(safeNum)
    .filter((x): x is number => typeof x === 'number' && !Number.isNaN(x));
  if (v.length === 0) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

// ✅ Donut em SVG (similar ao seu front)
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

  const total = segments.reduce((a, s) => a + s.value, 0);
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

function buildTasksTitleMap(tasks: TaskLike[]) {
  const map = new Map<string, string>();
  (Array.isArray(tasks) ? tasks : []).forEach((t) => {
    const id = String(t?.id ?? '').trim();
    if (!id) return;
    const title =
      String(t?.title ?? t?.taskTitle ?? t?.name ?? '').trim() || 'Tarefa';
    map.set(id, title);
  });
  return map;
}

@Injectable()
export class PdfService {
  /**
   * ✅ Exatamente o que o seu PdfController chama hoje.
   * Gera PDF do desempenho do aluno (sem feedback).
   */
  async generateStudentPerformancePdf(params: {
    roomId: string;
    studentId: string;
    essays: EssayLike[];
    tasks: TaskLike[];
  }): Promise<Buffer> {
    const { roomId, studentId } = params;

    const essaysRaw = Array.isArray(params.essays) ? params.essays : [];
    const tasksRaw = Array.isArray(params.tasks) ? params.tasks : [];

    const tasksMap = buildTasksTitleMap(tasksRaw);

    // Enriquecer redações com taskTitle
    const essays: EssayLike[] = essaysRaw.map((e, idx) => {
      const tTitle =
        tasksMap.get(String(e?.taskId ?? '').trim()) ||
        e?.taskTitle ||
        `Tarefa ${idx + 1}`;
      return { ...e, taskTitle: tTitle };
    });

    // médias somente corrigidas
    const corrected = essays.filter(
      (e) => e?.score !== null && e?.score !== undefined,
    );

    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    // Como seu controller não passa nomes, usamos identificadores por enquanto.
    // (Se você quiser, depois a gente puxa User/Room via services e coloca aqui.)
    const studentName = `Aluno (${studentId})`;
    const roomName = `Sala (${roomId})`;

    return this.performancePdf({
      studentName,
      roomName,
      essays,
      averages,
    });
  }

  private async performancePdf(params: {
    studentName: string;
    roomName: string;
    essays: EssayLike[];
    averages: {
      total: number | null;
      c1: number | null;
      c2: number | null;
      c3: number | null;
      c4: number | null;
      c5: number | null;
    };
  }): Promise<Buffer> {
    const { studentName, roomName, essays, averages } = params;

    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0b1220; margin: 22px; }
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
    .task { page-break-inside: avoid; }
    .essayBox { margin-top: 10px; padding: 12px; border-radius: 12px; border: 1px solid #e5e7eb; white-space: pre-wrap; line-height: 1.6; text-align: justify; }
    .badge { display:inline-block; font-size:11px; font-weight:900; padding:3px 8px; border-radius:999px; border:1px solid #e5e7eb; background:#f8fafc; }
  </style>
</head>
<body>
  <h1>Desempenho do aluno</h1>
  <div class="sub">
    Aluno: <strong>${escapeHtml(studentName)}</strong> • Sala: <strong>${escapeHtml(roomName)}</strong>
  </div>

  <div class="card">
    <div class="row">
      <div>
        <div class="sectionTitle">Média geral (somente redações corrigidas)</div>
        <div class="muted">Total: ${averages.total ?? '—'} / 1000</div>
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

  <div class="sectionTitle">Histórico por tarefa</div>

  ${essays
    .map((e, idx) => {
      const score = e?.score ?? null;
      const c1 = clamp0to200(e?.c1);
      const c2 = clamp0to200(e?.c2);
      const c3 = clamp0to200(e?.c3);
      const c4 = clamp0to200(e?.c4);
      const c5 = clamp0to200(e?.c5);

      return `
      <div class="card task">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;">${escapeHtml(e?.taskTitle || `Tarefa ${idx + 1}`)}</div>
            <div class="muted">Nota: ${
              score === null ? '— (não corrigida)' : `${score} / 1000`
            }</div>
          </div>
          <div>
            ${
              score === null
                ? `<span class="badge">Sem gráfico</span>`
                : donutSvg({ c1, c2, c3, c4, c5, totalText: String(score) })
            }
          </div>
        </div>

        ${
          e?.content
            ? `<div class="essayBox"><strong>Redação</strong>\n\n${escapeHtml(e.content)}</div>`
            : ''
        }
      </div>`;
    })
    .join('')}
</body>
</html>
`;

    const browser = await puppeteer.launch({
      headless: true, // ✅ Render-friendly e sem erro TS
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
  }
}
