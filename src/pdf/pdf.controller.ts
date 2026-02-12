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

type Task = {
  id: string;
  title?: string;
  createdAt?: any;
  created_at?: any;
  updatedAt?: any;
  updated_at?: any;
};

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

function pickDate(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return null;
}

function toDateSafe(value: any) {
  if (!value) return null;

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (!s) return null;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;

  const asNum = Number(s);
  if (!Number.isNaN(asNum)) {
    const d2 = new Date(asNum);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }

  return null;
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
  const only = (nums || []).filter(
    (n): n is number => typeof n === 'number' && !Number.isNaN(n),
  );
  if (only.length === 0) return null;
  const sum = only.reduce((a, b) => a + b, 0);
  return Math.round(sum / only.length);
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

@Injectable()
export class PdfService {
  // ✅ NOVO: método que o controller espera
  async generateStudentPerformancePdf(params: {
    roomId: string;
    studentId: string;
    essays: any[];
    tasks: any[];
  }): Promise<Buffer> {
    const essaysRaw = Array.isArray(params.essays) ? params.essays : [];
    const tasksRaw = Array.isArray(params.tasks) ? params.tasks : [];

    // Map taskId -> title
    const taskTitleMap = new Map<string, string>();
    tasksRaw.forEach((t: Task) => {
      const id = String((t as any)?.id || '').trim();
      if (!id) return;
      const title = String((t as any)?.title || 'Tarefa').trim();
      taskTitleMap.set(id, title || 'Tarefa');
    });

    // Normaliza essays
    const essays: Essay[] = essaysRaw.map((e: any) => {
      const taskId = String(e?.taskId || '').trim();
      return {
        id: String(e?.id || '').trim(),
        taskId,
        taskTitle: String(e?.taskTitle || taskTitleMap.get(taskId) || '').trim(),
        score: e?.score ?? null,
        c1: e?.c1 ?? null,
        c2: e?.c2 ?? null,
        c3: e?.c3 ?? null,
        c4: e?.c4 ?? null,
        c5: e?.c5 ?? null,
        content: e?.content ?? null,
        submittedAt: e?.submittedAt,
        createdAt: e?.createdAt,
        updatedAt: e?.updatedAt,
      };
    });

    // Ordena por “mais recente” (pela melhor data possível)
    function essaySentAt(e: Essay) {
      return pickDate(e, [
        'submittedAt',
        'createdAt',
        'updatedAt',
        'submitted_at',
        'created_at',
        'updated_at',
      ]);
    }

    essays.sort((a, b) => {
      const ta = toDateSafe(essaySentAt(a))?.getTime?.() ?? -Infinity;
      const tb = toDateSafe(essaySentAt(b))?.getTime?.() ?? -Infinity;
      return tb - ta;
    });

    // Médias (somente corrigidas)
    const corrected = essays.filter((e) => e.score !== null && e.score !== undefined);

    const averages = {
      total: mean(corrected.map((e) => (e.score ?? null) as any)),
      c1: mean(corrected.map((e) => (e.c1 ?? null) as any)),
      c2: mean(corrected.map((e) => (e.c2 ?? null) as any)),
      c3: mean(corrected.map((e) => (e.c3 ?? null) as any)),
      c4: mean(corrected.map((e) => (e.c4 ?? null) as any)),
      c5: mean(corrected.map((e) => (e.c5 ?? null) as any)),
    };

    // Aqui não temos roomName/studentName vindo do endpoint atual;
    // então deixo profissional com placeholders (podemos puxar via RoomsService/UsersService depois).
    return this.performancePdf({
      studentName: 'Aluno',
      roomName: 'Sala',
      essays,
      averages,
    });
  }

  // ✅ mantém seu gerador base, mas SEM feedback (como você pediu)
  async performancePdf(params: {
    studentName: string;
    roomName: string;
    essays: Essay[];
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
    .meta { font-size: 12px; opacity: .75; margin-top: 4px; }
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

  <div class="sectionTitle">Histórico</div>

  ${essays
    .map((e, idx) => {
      const score = e.score ?? null;
      const c1 = clamp0to200(e.c1);
      const c2 = clamp0to200(e.c2);
      const c3 = clamp0to200(e.c3);
      const c4 = clamp0to200(e.c4);
      const c5 = clamp0to200(e.c5);

      const sentAt = formatDateBR(
        pickDate(e, ['submittedAt', 'createdAt', 'updatedAt', 'submitted_at', 'created_at', 'updated_at']),
      );

      return `
      <div class="card task">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;">${escapeHtml(e.taskTitle || `Tarefa ${idx + 1}`)}</div>
            <div class="muted">Nota: ${score === null ? '— (não corrigida)' : `${score} / 1000`}</div>
            <div class="meta">Enviada em: ${escapeHtml(sentAt)}</div>
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
  }
}
