/* Escrita à mão.
   O Apple Pencil chega no navegador como Pointer Event com
   `pointerType === 'pen'`, trazendo pressão e inclinação — dá para
   escrever no Safari do iPad com a mesma fidelidade de um app nativo.

   Formato da tinta (compacto, para caber bem no arquivo de sincronização):
     { w, h, s: [ { w: espessura, p: [x0,y0, x1,y1, …] } ] }
   Coordenadas já normalizadas com origem no canto da própria letra. */

const BASE_WIDTH = 2.3;

/* ── Desenhar tinta guardada ─────────────────────────────── */

function pathData(points) {
  if (points.length < 4) {
    // Um ponto só: um pingo.
    return `M${points[0].toFixed(1)},${points[1].toFixed(1)}l0.01,0`;
  }
  let d = `M${points[0].toFixed(1)},${points[1].toFixed(1)}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    const cx = points[i], cy = points[i + 1];
    const mx = (cx + points[i + 2]) / 2;
    const my = (cy + points[i + 3]) / 2;
    d += `Q${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  d += `L${points[points.length - 2].toFixed(1)},${points[points.length - 1].toFixed(1)}`;
  return d;
}

/** SVG da tinta. Usa `currentColor`, então a letra recebe a cor do app —
    é isso que a mantém legível no modo claro e no escuro. */
export function inkSVG(ink) {
  if (!ink?.s?.length) return '';
  const pad = 3;
  const width = (ink.w || 1) + pad * 2;
  const height = (ink.h || 1) + pad * 2;
  const paths = ink.s.map((stroke) =>
    `<path d="${pathData(stroke.p)}" fill="none" stroke="currentColor" stroke-width="${stroke.w}" stroke-linecap="round" stroke-linejoin="round"/>`
  ).join('');
  return `<svg class="ink-img" viewBox="${-pad} ${-pad} ${width} ${height}" `
       + `preserveAspectRatio="xMinYMid meet" aria-hidden="true">${paths}</svg>`;
}

export function inkAspect(ink) {
  if (!ink?.w || !ink?.h) return 4;
  return (ink.w + 6) / (ink.h + 6);
}

/* ── Prancheta ───────────────────────────────────────────── */

export class InkPad {
  /**
   * @param {HTMLElement} layer     contêiner com as pautas
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} scroller  quem rola (a área de escrita)
   * @param {object} options  { lineHeight, lineCount, gutter, onLinesChanged }
   */
  constructor(layer, canvas, scroller, options) {
    this.layer = layer;
    this.canvas = canvas;
    this.scroller = scroller;
    this.ctx = canvas.getContext('2d');

    this.lineHeight = options.lineHeight ?? 62;
    this.lineCount = options.lineCount ?? 26;
    this.gutter = options.gutter ?? 54;
    this.onLinesChanged = options.onLinesChanged ?? (() => {});
    this.onStrokeStart = options.onStrokeStart ?? (() => {});

    /** @type {{p:number[], w:number}[]} */
    this.strokes = [];
    this.current = null;
    this.activePointer = null;
    this.mode = 'draw';          // 'draw' | 'erase'
    this.touchMode = options.touchMode === 'draw' ? 'draw' : 'scroll';  // o que o dedo faz
    this.idleTimer = null;

    // Estado da rolagem manual (ver comentário em `startScroll`).
    this.scrollPointer = null;
    this.inertia = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);

    this.resize();
  }

  destroy() {
    clearTimeout(this.idleTimer);
    cancelAnimationFrame(this.inertiaFrame);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  get height() { return this.lineHeight * this.lineCount; }

  resize() {
    const width = this.layer.clientWidth || 320;
    const height = this.height;
    // Limitar a 2× evita canvas gigante em telas 3×, sem perda visível.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);

    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.cssWidth = width;
    this.redraw();
  }

  /* ── Entrada ──────────────────────────────────────────────
     O canvas usa `touch-action: none`. Sem isso o Safari do iPad
     interpreta um traço vertical do Apple Pencil como rolagem e a tela
     balança em vez de escrever — `preventDefault` não desfaz isso, porque
     `touch-action` é decidido antes do evento chegar ao JavaScript.

     Como o navegador não rola mais sozinho, a rolagem é feita aqui: a
     caneta sempre desenha, e o dedo rola (ou desenha, se você trocar no
     botão "Dedo" — para quem não tem Apple Pencil). */

  wantsToDraw(event) {
    if (event.pointerType === 'pen' || event.pointerType === 'mouse') return true;
    return this.touchMode === 'draw';
  }

  pointFrom(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  strokeWidthFor(event) {
    if (event.pointerType !== 'pen') return BASE_WIDTH;
    const pressure = event.pressure > 0 ? event.pressure : 0.5;
    return BASE_WIDTH * (0.55 + pressure * 0.95);
  }

  onPointerDown(event) {
    event.preventDefault();
    cancelAnimationFrame(this.inertiaFrame);

    if (!this.wantsToDraw(event)) { this.startScroll(event); return; }

    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* segue */ }
    this.activePointer = event.pointerId;
    clearTimeout(this.idleTimer);
    this.onStrokeStart();

    const [x, y] = this.pointFrom(event);

    if (this.mode === 'erase') {
      this.eraseAt(x, y);
      return;
    }

    this.current = { p: [x, y], w: this.strokeWidthFor(event) };
    this.strokes.push(this.current);
    this.drawDot(x, y, this.current.w);
  }

  onPointerMove(event) {
    if (event.pointerId === this.scrollPointer) { this.moveScroll(event); return; }
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault();

    // O Apple Pencil manda mais amostras do que quadros de tela; as
    // "coalesced" recuperam todas e deixam o traço liso. Nem sempre elas
    // vêm (o próprio evento pode ser a única amostra), então o evento
    // continua sendo o retorno padrão — sem isso o traço fica sem pontos.
    let samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    if (!samples.length) samples = [event];

    if (this.mode === 'erase') {
      for (const sample of samples) {
        const [x, y] = this.pointFrom(sample);
        this.eraseAt(x, y);
      }
      return;
    }

    if (!this.current) return;

    for (const sample of samples) {
      const [x, y] = this.pointFrom(sample);
      const points = this.current.p;
      const lastX = points[points.length - 2];
      const lastY = points[points.length - 1];
      // Descarta micro-movimentos: menos pontos, arquivo menor, traço igual.
      if (Math.hypot(x - lastX, y - lastY) < 1.1) continue;
      points.push(x, y);
      this.drawSegment(lastX, lastY, x, y, this.current.w);
    }
  }

  onPointerUp(event) {
    if (event.pointerId === this.scrollPointer) { this.endScroll(); return; }
    if (event.pointerId !== this.activePointer) return;
    this.activePointer = null;

    if (this.current) {
      if (this.current.p.length < 4) this.current.p.push(...this.current.p.slice(0, 2));
      this.current = null;
    }

    this.scheduleIdle();
  }

  /* ── Rolagem feita à mão, com inércia ── */

  startScroll(event) {
    this.scrollPointer = event.pointerId;
    this.scrollFromY = event.clientY;
    this.scrollFromTop = this.scroller.scrollTop;
    this.lastY = event.clientY;
    this.lastTime = performance.now();
    this.velocity = 0;
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* segue */ }
  }

  moveScroll(event) {
    const top = this.scrollFromTop - (event.clientY - this.scrollFromY);
    this.scroller.scrollTop = top;

    // Amostras muito juntas dariam um `dt` quase zero e uma velocidade
    // absurda — que viraria um arremesso violento ao soltar o dedo.
    const now = performance.now();
    const dt = now - this.lastTime;
    if (dt >= 4) {
      const bruta = (event.clientY - this.lastY) / dt;
      this.velocity = Math.max(-3, Math.min(3, bruta));   // px por ms
      this.lastY = event.clientY;
      this.lastTime = now;
    }
  }

  endScroll() {
    this.scrollPointer = null;
    let v = this.velocity * 16;          // pixels por quadro
    const step = () => {
      if (Math.abs(v) < 0.4) return;
      this.scroller.scrollTop -= v;
      v *= 0.94;
      this.inertiaFrame = requestAnimationFrame(step);
    };
    step();
  }

  setTouchMode(mode) { this.touchMode = mode; }

  /** Só avisamos que as linhas mudaram depois de uma pausa — assim uma
      palavra inteira vira uma tarefa, e não cada traço solto. */
  scheduleIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.onLinesChanged(this.extractLines()), 900);
  }

  flush() {
    clearTimeout(this.idleTimer);
    this.onLinesChanged(this.extractLines());
  }

  /* ── Desenho ── */

  inkColor() {
    return getComputedStyle(document.body).getPropertyValue('--label').trim() || '#000';
  }

  drawDot(x, y, width) {
    const ctx = this.ctx;
    ctx.fillStyle = this.inkColor();
    ctx.beginPath();
    ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSegment(x1, y1, x2, y2, width) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.inkColor();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.height);
    ctx.strokeStyle = this.inkColor();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of this.strokes) {
      const points = stroke.p;
      if (points.length < 4) {
        this.drawDot(points[0], points[1], stroke.w);
        continue;
      }
      ctx.lineWidth = stroke.w;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length - 2; i += 2) {
        const mx = (points[i] + points[i + 2]) / 2;
        const my = (points[i + 1] + points[i + 3]) / 2;
        ctx.quadraticCurveTo(points[i], points[i + 1], mx, my);
      }
      ctx.lineTo(points[points.length - 2], points[points.length - 1]);
      ctx.stroke();
    }
  }

  /* ── Borracha e desfazer ── */

  eraseAt(x, y, radius = 12) {
    const before = this.strokes.length;
    this.strokes = this.strokes.filter((stroke) => {
      const points = stroke.p;
      for (let i = 0; i < points.length; i += 2) {
        if (Math.hypot(points[i] - x, points[i + 1] - y) <= radius) return false;
      }
      return true;
    });
    if (this.strokes.length !== before) {
      this.redraw();
      this.scheduleIdle();
    }
  }

  undo() {
    if (!this.strokes.length) return;
    this.strokes.pop();
    this.redraw();
    this.scheduleIdle();
  }

  clear() {
    this.strokes = [];
    this.redraw();
    this.scheduleIdle();
  }

  setMode(mode) { this.mode = mode; }

  /* ── Traços → linhas ── */

  lineOf(stroke) {
    const points = stroke.p;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < points.length; i += 2) {
      if (points[i] < min) min = points[i];
      if (points[i] > max) max = points[i];
    }
    const middle = (min + max) / 2;
    return Math.max(0, Math.floor(middle / this.lineHeight));
  }

  /** Agrupa os traços por pauta e normaliza cada grupo para a origem.
      Devolve um Map: índice da linha → objeto de tinta. */
  extractLines() {
    const byLine = new Map();
    for (const stroke of this.strokes) {
      const line = this.lineOf(stroke);
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push(stroke);
    }

    const result = new Map();
    for (const [line, strokes] of byLine) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of strokes) {
        for (let i = 0; i < stroke.p.length; i += 2) {
          const x = stroke.p[i], y = stroke.p[i + 1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const width = maxX - minX;
      const height = maxY - minY;
      if (width < 2 && height < 2) continue;

      result.set(line, {
        w: Math.round(width * 10) / 10,
        h: Math.round(height * 10) / 10,
        s: strokes.map((stroke) => ({
          w: Math.round(stroke.w * 100) / 100,
          p: stroke.p.map((value, index) =>
            Math.round((value - (index % 2 ? minY : minX)) * 10) / 10)
        }))
      });
    }
    return result;
  }
}
