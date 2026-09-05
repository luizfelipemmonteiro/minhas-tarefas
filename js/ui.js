/* Telas: estante, lista de tarefas, menus, avisos e a folha de escrita. */

import {
  store, PRIORITY_MARK, groupTitle, taskLabel, hasDetails, isOverdue
} from './store.js';
import { inkSVG, InkPad } from './ink.js';
import { recurrenceSummary } from './recurrence.js';
import { openTaskSheet, openGroupSheet } from './sheets.js';
import { updateBadge } from './sync.js';

/* ── Utilitários ─────────────────────────────────────────── */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const icon = (id, cls = '') =>
  `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

export const tintVar = (tint) => `var(--${tint || 'blue'})`;

const fmtDayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtDayYear  = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime     = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtFull     = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function dayText(value) {
  const date = new Date(value);
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(today)) / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  return date.getFullYear() === today.getFullYear()
    ? fmtDayShort.format(date).replace(/\./g, '')
    : fmtDayYear.format(date).replace(/\./g, '');
}

export function dueText(task) {
  if (!task.dueDate) return '';
  const base = dayText(task.dueDate);
  return task.includesTime ? `${base}, ${fmtTime.format(new Date(task.dueDate))}` : base;
}

export const fullDateText = (value) => fmtFull.format(new Date(value));

/** Vibração curta onde o navegador permite (Android). O iOS não expõe isso
    para a web; lá o retorno é só visual. */
export function tap(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* ignorado */ }
}


/** Roda `fn` quando a animação acabar — ou depois de `ms`, o que vier antes.
    Transições e animações CSS não avançam com a aba em segundo plano nem se
    o elemento for substituído no meio; sem essa rede de segurança a tela
    ficaria presa. */
export function afterAnimation(element, ms, fn) {
  let ran = false;
  const run = () => { if (ran) return; ran = true; fn(); };
  element.addEventListener('animationend', run, { once: true });
  element.addEventListener('transitionend', run, { once: true });
  setTimeout(run, ms);
}

/* ── Avisos rápidos ──────────────────────────────────────── */

export function toast(message, { actionLabel, onAction, duration = 3200 } = {}) {
  const host = $('#toast-host');
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<span>${esc(message)}</span>` +
    (actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : '');

  if (actionLabel) {
    node.querySelector('button').addEventListener('click', () => {
      onAction?.();
      dismiss();
    });
  }

  host.appendChild(node);
  const timer = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timer);
    if (!node.isConnected) return;
    node.classList.add('out');
    afterAnimation(node, 400, () => node.remove());
  }
  return dismiss;
}

/* ── Menu suspenso ───────────────────────────────────────── */

export function openMenu(anchor, items) {
  const scrim = document.createElement('div');
  scrim.className = 'menu-scrim';

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');

  menu.innerHTML = items.map((item) => {
    if (item.separator) return '<div class="sep"></div>';
    return `<button type="button" ${item.disabled ? 'disabled' : ''}
              class="${item.danger ? 'danger' : ''}" data-key="${esc(item.key)}">
              <span>${esc(item.label)}</span>${item.icon ? icon(item.icon) : ''}
            </button>`;
  }).join('');

  document.body.append(scrim, menu);

  const rect = anchor.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  menu.style.width = `${width}px`;
  const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
  menu.style.left = `${left}px`;

  const below = rect.bottom + 6;
  if (below + menu.offsetHeight > window.innerHeight - 12) {
    menu.style.top = `${Math.max(12, rect.top - menu.offsetHeight - 6)}px`;
    menu.style.transformOrigin = 'bottom right';
  } else {
    menu.style.top = `${below}px`;
  }

  const close = () => { scrim.remove(); menu.remove(); };
  scrim.addEventListener('click', close);
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-key]');
    if (!button) return;
    close();
    items.find((item) => item.key === button.dataset.key)?.action?.();
  });
  return close;
}

/* ── Pasta desenhada ─────────────────────────────────────── */

export function folderHTML(group, { open = false } = {}) {
  // Uma forma só, plana. O degradê é neutro e mora no `<defs>` do
  // documento, então as dezoito cores reaproveitam o mesmo.
  return `<div class="folder ${open ? 'open' : ''}" style="--folder-tint:${tintVar(group.tint)}">
      <svg viewBox="0 0 100 82" aria-hidden="true">
        <path d="M5 20C5 13.4 10.4 8 17 8h19.5c3.1 0 6 1.4 7.9 3.9l3.8 5c1.3 1.7 3.3 2.7 5.4 2.7H83c6.6 0 12 5.4 12 12V62c0 6.6-5.4 12-12 12H17C10.4 74 5 68.6 5 62Z" fill="currentColor"/>
        <path d="M5 20C5 13.4 10.4 8 17 8h19.5c3.1 0 6 1.4 7.9 3.9l3.8 5c1.3 1.7 3.3 2.7 5.4 2.7H83c6.6 0 12 5.4 12 12V62c0 6.6-5.4 12-12 12H17C10.4 74 5 68.6 5 62Z" fill="url(#folderShade)"/>
      </svg>
    </div>`;
}

/* ── Estante ─────────────────────────────────────────────── */

/** A tela inicial mostra só as pastas. Nada de contadores, busca ou
    listas automáticas: quem manda na tela são as pastas. */
export function renderShelf() {
  const groups = store.activeGroups();
  const grid = $('#folder-grid');

  if (!groups.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <h3>Nenhuma pasta ainda</h3>
        <p>Toque em + para criar a primeira.</p>
      </div>`;
  } else {
    grid.innerHTML = groups.map((group) => `
      <button type="button" class="folder-cell" data-group="${group.id}"
              aria-label="${esc(groupTitle(group))}">
        ${folderHTML(group)}
        <span class="folder-name">${esc(groupTitle(group))}</span>
      </button>`).join('');
  }

  updateBadge(store.smartCount('today'));
}

/* ── Linha de tarefa ─────────────────────────────────────── */

function subtitleHTML(task) {
  const bits = [];
  if (task.dueDate) bits.push({ icon: 'i-calendar', text: dueText(task), overdue: isOverdue(task) });
  if (task.recurrence) bits.push({ icon: 'i-repeat', text: recurrenceSummary(task.recurrence) });
  if (task.location) bits.push({ icon: 'i-pin', text: task.location });
  if (task.notes) bits.push({ icon: 'i-notes', text: task.notes });
  if (!bits.length) return '';
  return `<span class="task-sub">${bits.map((bit) =>
    `<span class="bit ${bit.overdue ? 'overdue' : ''}">${icon(bit.icon)}<span>${esc(bit.text)}</span></span>`
  ).join('')}</span>`;
}

export function taskHTML(task) {
  const content = task.ink
    ? `<span class="task-content ink" style="--ink-h:${Math.min(52, Math.max(24, task.inkHeight || 32))}px">
         ${inkSVG(task.ink)}<span class="strike"></span></span>`
    : `<span class="task-content"><span class="task-text">${esc(taskLabel(task))}</span></span>`;

  const showInfo = hasDetails(task) || task.ink;

  return `<div class="task-swipe" data-task="${task.id}">
      <div class="swipe-actions">
        <button type="button" class="det" data-swipe="details">${icon('i-info')}<span>Detalhes</span></button>
        <button type="button" class="del" data-swipe="delete">${icon('i-trash')}<span>Apagar</span></button>
      </div>
      <div class="task ${task.isCompleted ? 'done' : ''}">
        <button type="button" class="check" data-check="${task.id}"
                aria-label="${task.isCompleted ? 'Concluída' : 'Marcar como concluída'}">
          ${task.priority && !task.isCompleted
            ? `<span class="priority">${PRIORITY_MARK[task.priority]}</span>` : ''}
          <span class="ring"></span><span class="fill"></span>
          <span class="tick">${icon('i-check')}</span>
        </button>
        <span class="task-body">${content}${subtitleHTML(task)}</span>
        <span class="task-actions">
          ${task.isFlagged ? `<span class="flagged">${icon('i-flag')}</span>` : ''}
          ${showInfo ? `<button type="button" class="info" data-details="${task.id}"
                          aria-label="Detalhes da tarefa">${icon('i-info')}</button>` : ''}
        </span>
      </div>
    </div>`;
}

/* ── Deslizar para revelar ações ─────────────────────────── */

const ACTIONS_WIDTH = 156;

function attachSwipe(container) {
  let row = null, startX = 0, startY = 0, dx = 0, locked = null, openRow = null;

  const closeOpen = () => {
    if (!openRow) return;
    openRow.querySelector('.task').style.transform = '';
    openRow.classList.remove('dragging', 'open');
    openRow = null;
  };

  container.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.check, .info, button[data-swipe]')) return;
    const candidate = event.target.closest('.task-swipe');
    if (!candidate) return;
    if (openRow && openRow !== candidate) { closeOpen(); return; }
    row = candidate;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    locked = null;
  });

  container.addEventListener('pointermove', (event) => {
    if (!row) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (locked === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      locked = Math.abs(deltaX) > Math.abs(deltaY) * 1.4 ? 'x' : 'y';
      if (locked === 'x') row.classList.add('dragging');
    }
    if (locked !== 'x') return;

    event.preventDefault();
    dx = Math.min(0, deltaX);
    // Resistência ao passar do limite, como no iOS.
    const shown = dx < -ACTIONS_WIDTH
      ? -ACTIONS_WIDTH - (Math.abs(dx) - ACTIONS_WIDTH) * 0.32
      : dx;
    row.querySelector('.task').style.transform = `translateX(${shown}px)`;
  });

  const finish = () => {
    if (!row) return;
    const task = row.querySelector('.task');
    row.classList.remove('dragging');

    if (locked === 'x' && dx < -(container.clientWidth * 0.55)) {
      // Deslizou até o fim: apaga direto, com chance de desfazer.
      const id = row.dataset.task;
      task.style.transform = `translateX(-100%)`;
      deleteWithUndo(id);
    } else if (locked === 'x' && dx < -ACTIONS_WIDTH * 0.5) {
      task.style.transform = `translateX(${-ACTIONS_WIDTH}px)`;
      row.classList.add('open');
      openRow = row;
    } else {
      task.style.transform = '';
      row.classList.remove('open');
      if (openRow === row) openRow = null;
    }
    row = null;
    locked = null;
  };

  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', finish);
  container.addEventListener('scroll', closeOpen, true);
  return closeOpen;
}

export function deleteWithUndo(taskID) {
  const task = store.task(taskID);
  if (!task) return;
  const label = taskLabel(task);
  store.deleteTask(taskID);
  tap(12);
  toast(`“${label}” apagada`, {
    actionLabel: 'Desfazer',
    onAction: () => { store.undo(); }
  });
}

/* ── Tela de lista ───────────────────────────────────────── */

function hidesCompleted(groupID) {
  return Boolean(store.group(groupID)?.hidesCompleted);
}

/**
 * Monta a tela de uma pasta.
 *
 * A tira de abas no topo lista todas as pastas: um toque troca de pasta
 * sem voltar para a estante, como as divisórias de um ficheiro.
 *
 * @param {string} groupID pasta em que a tela abre
 * @param {{onBack:()=>void, onGroupChange?:(id:string)=>void}} options
 */
export function buildListScreen(groupID, { onBack, onGroupChange }) {
  let currentID = groupID;

  const screen = document.createElement('section');
  screen.className = 'screen list-screen';

  screen.innerHTML = `
    <header class="nav">
      <div class="nav-bar">
        <span class="nav-leading">
          <button type="button" class="nav-text-btn" data-back>${icon('i-back')}<span>Pastas</span></button>
        </span>
        <span class="nav-title-inline" data-title></span>
        <span class="nav-actions">
          <button type="button" class="nav-btn" data-menu aria-label="Mais">${icon('i-ellipsis')}</button>
        </span>
      </div>
      <nav class="folder-tabs" data-tabs aria-label="Pastas"></nav>
    </header>
    <main class="scroll" data-scroll></main>
    <div class="toolbar">
      <button type="button" class="primary" data-add>${icon('i-plus')}<span>Nova tarefa</span></button>
      <span class="spacer"></span>
      <button type="button" class="primary" data-ink aria-label="Escrever à mão">${icon('i-pencil')}</button>
    </div>`;

  const scroll = $('[data-scroll]', screen);
  const tabsBar = $('[data-tabs]', screen);
  const nav = $('.nav', screen);
  scroll.addEventListener('scroll', () => nav.classList.toggle('scrolled', scroll.scrollTop > 8));

  attachSwipe(scroll);

  /* ── Abas ── */

  function renderTabs() {
    const groups = store.activeGroups();
    tabsBar.classList.toggle('has-many', groups.length > 1);
    tabsBar.innerHTML = groups.map((group) => `
      <button type="button" class="ftab ${group.id === currentID ? 'active' : ''}"
              data-tab="${group.id}" style="--ftab:${tintVar(group.tint)}"
              aria-current="${group.id === currentID}">${esc(groupTitle(group))}</button>`).join('');

    const active = $('.ftab.active', tabsBar);
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function switchTo(id) {
    if (id === currentID || !store.group(id)) return;
    tap();
    currentID = id;
    onGroupChange?.(id);
    render();
    scroll.scrollTop = 0;
    $('.list', screen)?.classList.add('list-fade');
  }

  /* ── Conteúdo ── */

  function render() {
    let group = store.group(currentID);

    // A pasta pode ter sido apagada: cai para a vizinha em vez de fechar.
    if (!group) {
      const next = store.activeGroups()[0];
      if (!next) { onBack?.(); return; }
      currentID = next.id;
      onGroupChange?.(currentID);
      group = next;
    }

    $('[data-title]', screen).textContent = groupTitle(group);
    screen.style.setProperty('--tint', tintVar(group.tint));

    renderTabs();

    // Com várias pastas, a aba ativa já diz onde você está e o título na
    // barra seria repetição. Com uma pasta só não há tira nenhuma, e aí
    // o título é a única indicação.
    screen.classList.toggle('single-folder', store.activeGroups().length <= 1);

    const hide = hidesCompleted(currentID);
    const items = store.items(currentID, hide);
    const hidden = store.completedCount(currentID);

    scroll.innerHTML = `
      ${hide && hidden > 0
        ? `<div class="list-note">${hidden === 1 ? '1 concluída oculta' : `${hidden} concluídas ocultas`}</div>`
        : ''}
      <div class="list">
        ${items.map((task) => taskHTML(task)).join('')}
        <button type="button" class="add-row" data-add>
          <span class="plus">${icon('i-plus')}</span>Nova tarefa
        </button>
      </div>`;
  }

  /* ── Ações ── */

  function startEditing(taskID, selectAll = false) {
    const wrap = $(`.task-swipe[data-task="${taskID}"] .task-content`, screen);
    if (!wrap || wrap.classList.contains('ink')) return;
    const task = store.task(taskID);
    if (!task) return;

    wrap.classList.add('editing');
    wrap.innerHTML = `<input class="task-text" type="text" value="${esc(task.text)}"
        placeholder="Nova tarefa" enterkeyhint="done" autocapitalize="sentences">`;
    const input = $('input', wrap);
    input.focus();
    if (selectAll) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);

    input.addEventListener('input', () => {
      const current = store.task(taskID);
      if (current) store.updateTask({ ...current, text: input.value }, { checkpoint: false });
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); submitRow(taskID, input.value); }
      if (event.key === 'Escape') { event.preventDefault(); input.blur(); }
    });

    input.addEventListener('blur', () => {
      const current = store.task(taskID);
      if (current && !current.text.trim() && !current.ink && !hasDetails(current)) {
        store.deleteTask(taskID);
      }
      render();
    }, { once: true });
  }

  function submitRow(taskID, value) {
    if (!value.trim()) { $('input.task-text', screen)?.blur(); return; }
    const pending = store.items(currentID, true);
    const position = pending.findIndex((t) => t.id === taskID);
    const created = store.addTask(currentID, {}, position >= 0 ? position + 1 : null);
    render();
    startEditing(created.id);
  }

  function addTask() {
    tap();
    const created = store.addTask(currentID);
    render();
    startEditing(created.id);
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
  }

  function openMenuFor(anchor) {
    const hide = hidesCompleted(currentID);
    const done = store.completedCount(currentID);

    const items = [
      {
        key: 'hide',
        label: hide ? 'Mostrar tarefas concluídas' : 'Ocultar tarefas concluídas',
        icon: hide ? 'i-eye' : 'i-eye-slash',
        action: () => {
          const group = store.group(currentID);
          if (group) store.updateGroup({ ...group, hidesCompleted: !hide });
          render();
        }
      },
      { separator: true },
      {
        key: 'edit', label: 'Renomear e cor', icon: 'i-pencil',
        action: () => openGroupSheet(store.group(currentID), { onDone: render })
      },
      {
        key: 'ink', label: 'Escrever à mão', icon: 'i-pencil',
        action: () => openInkScreen(currentID, render)
      }
    ];

    if (done > 0) {
      items.push({ separator: true });
      items.push({
        key: 'clear', label: 'Apagar concluídas', icon: 'i-trash', danger: true,
        action: () => {
          const ids = store.items(currentID, false).filter((t) => t.isCompleted).map((t) => t.id);
          store.deleteTasks(ids);
          toast(`${ids.length} ${ids.length === 1 ? 'tarefa apagada' : 'tarefas apagadas'}`, {
            actionLabel: 'Desfazer', onAction: () => store.undo()
          });
          render();
        }
      });
    }

    items.push({ separator: true });
    items.push({
      key: 'delete', label: 'Apagar pasta', icon: 'i-trash', danger: true,
      action: () => {
        const name = groupTitle(store.group(currentID) || {});
        store.deleteGroup(currentID);
        render();
        toast(`Pasta “${name}” apagada`, { actionLabel: 'Desfazer', onAction: () => { store.undo(); render(); } });
      }
    });

    openMenu(anchor, items);
  }

  screen.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { switchTo(tab.dataset.tab); return; }

    if (event.target.closest('[data-back]')) { onBack?.(); return; }

    const menuBtn = event.target.closest('[data-menu]');
    if (menuBtn) { openMenuFor(menuBtn); return; }

    if (event.target.closest('[data-add]')) { addTask(); return; }
    if (event.target.closest('[data-ink]')) { openInkScreen(currentID, render); return; }

    const check = event.target.closest('[data-check]');
    if (check) {
      tap(10);
      const id = check.dataset.check;
      const task = store.task(id);
      const spawned = store.setCompleted(id, !task.isCompleted);
      check.closest('.task').classList.toggle('done', !task.isCompleted);
      // Deixa o risco correr antes de reordenar a lista.
      setTimeout(render, 340);
      if (spawned) toast(`Próxima: ${dayText(spawned.dueDate)}`);
      return;
    }

    const details = event.target.closest('[data-details]');
    if (details) { openTaskSheet(details.dataset.details, { onDone: render }); return; }

    const swipeAction = event.target.closest('[data-swipe]');
    if (swipeAction) {
      const id = swipeAction.closest('.task-swipe').dataset.task;
      if (swipeAction.dataset.swipe === 'delete') { deleteWithUndo(id); render(); }
      else openTaskSheet(id, { onDone: render });
      return;
    }

    const body = event.target.closest('.task-body');
    if (body) {
      const id = body.closest('.task-swipe').dataset.task;
      const task = store.task(id);
      if (task?.ink) openTaskSheet(id, { onDone: render });
      else startEditing(id);
    }
  });

  render();
  screen.__render = render;
  return screen;
}

/* ── Tela de escrita à mão ───────────────────────────────── */

const LINE_HEIGHT = 62;
const LINE_COUNT = 26;
const GUTTER = 54;

export function openInkScreen(groupID, onDone) {
  const group = store.group(groupID);
  if (!group) return;

  const host = $('#ink-host');
  const screen = document.createElement('div');
  screen.className = 'ink-screen';
  screen.style.setProperty('--tint', tintVar(group.tint));

  screen.innerHTML = `
    <header class="sheet-nav">
      <span class="side"><button type="button" class="nav-text-btn" data-hint>Ajuda</button></span>
      <span class="title" data-count>0 tarefas</span>
      <span class="side right"><button type="button" class="nav-text-btn strong" data-done>Concluir</button></span>
    </header>
    <div class="ink-canvas-wrap">
      <div class="ink-hint">${icon('i-pencil')}<span>Uma tarefa por linha. O dedo rola a página — toque em “Dedo” para desenhar com ele.</span></div>
      <div class="ink-layer" style="min-height:${LINE_HEIGHT * LINE_COUNT}px;
           background-image:repeating-linear-gradient(to bottom, transparent, transparent ${LINE_HEIGHT - 1}px,
             var(--separator) ${LINE_HEIGHT - 1}px, var(--separator) ${LINE_HEIGHT}px);
           background-position:0 0;">
        <canvas></canvas>
      </div>
    </div>
    <div class="ink-tools">
      <button type="button" class="tool" data-tool="draw" aria-pressed="true">${icon('i-pencil')}<span>Caneta</span></button>
      <button type="button" class="tool" data-tool="erase" aria-pressed="false">Borracha</button>
      <button type="button" class="tool" data-undo aria-label="Desfazer traço">${icon('i-undo')}</button>
      <span style="flex:1"></span>
      <button type="button" class="tool" data-touch>Dedo</button>
      <button type="button" class="tool" data-clear>Limpar</button>
    </div>`;

  host.appendChild(screen);

  const layer = $('.ink-layer', screen);
  const canvas = $('canvas', screen);
  const hint = $('.ink-hint', screen);
  const countLabel = $('[data-count]', screen);

  // Círculos de conclusão no começo de cada pauta.
  for (let line = 0; line < LINE_COUNT; line++) {
    const dot = document.createElement('div');
    dot.className = 'rule-check';
    dot.style.top = `${line * LINE_HEIGHT + LINE_HEIGHT - 34}px`;
    dot.dataset.line = String(line);
    layer.appendChild(dot);
  }

  const lineTasks = new Map();   // índice da linha → id da tarefa

  const modoDedo = localStorage.getItem('ink.touchMode') === 'draw' ? 'draw' : 'scroll';

  const pad = new InkPad(layer, canvas, $('.ink-canvas-wrap', screen), {
    touchMode: modoDedo,
    lineHeight: LINE_HEIGHT,
    lineCount: LINE_COUNT,
    gutter: GUTTER,
    onStrokeStart: () => { hint.hidden = true; },
    onLinesChanged: syncLines
  });

  function syncLines(lines) {
    // Linhas com tinta: cria ou atualiza a tarefa.
    for (const line of [...lines.keys()].sort((a, b) => a - b)) {
      const ink = lines.get(line);
      const height = Math.min(52, Math.max(24, ink.h));
      const existingID = lineTasks.get(line);
      const existing = existingID ? store.task(existingID) : null;

      if (existing) {
        if (JSON.stringify(existing.ink) === JSON.stringify(ink)) continue;
        store.updateTask({ ...existing, ink, inkHeight: height }, { checkpoint: false });
      } else {
        const created = store.addTask(groupID, { ink, inkHeight: height });
        lineTasks.set(line, created.id);
        tap();
      }
    }

    // Linhas apagadas: some com a tarefa.
    for (const [line, id] of [...lineTasks]) {
      if (lines.has(line)) continue;
      store.deleteTask(id);
      lineTasks.delete(line);
    }

    for (const dot of $$('.rule-check', screen)) {
      dot.classList.toggle('active', lineTasks.has(Number(dot.dataset.line)));
    }
    const total = lineTasks.size;
    countLabel.textContent = total === 1 ? '1 tarefa' : `${total} tarefas`;
  }

  function pintarBotaoDedo() {
    const botao = $('[data-touch]', screen);
    const desenha = pad.touchMode === 'draw';
    botao.setAttribute('aria-pressed', String(desenha));
    botao.textContent = desenha ? 'Dedo: desenha' : 'Dedo: rola';
  }
  pintarBotaoDedo();

  setTimeout(() => { hint.hidden = true; }, 6000);

  const onResize = () => pad.resize();
  window.addEventListener('resize', onResize);

  screen.addEventListener('click', (event) => {
    const tool = event.target.closest('[data-tool]');
    if (tool) {
      pad.setMode(tool.dataset.tool);
      $$('[data-tool]', screen).forEach((b) =>
        b.setAttribute('aria-pressed', String(b === tool)));
      return;
    }
    const touchBtn = event.target.closest('[data-touch]');
    if (touchBtn) {
      const desenha = pad.touchMode !== 'draw';
      pad.setTouchMode(desenha ? 'draw' : 'scroll');
      localStorage.setItem('ink.touchMode', desenha ? 'draw' : 'scroll');
      pintarBotaoDedo();
      return;
    }
    if (event.target.closest('[data-undo]')) { pad.undo(); return; }
    if (event.target.closest('[data-clear]')) { pad.clear(); return; }
    if (event.target.closest('[data-hint]')) { hint.hidden = !hint.hidden; return; }
    if (event.target.closest('[data-done]')) { close(); }
  });

  function close() {
    pad.flush();
    window.removeEventListener('resize', onResize);
    pad.destroy();
    screen.classList.add('closing');
    afterAnimation(screen, 620, () => {
      screen.remove();
      onDone?.();
    });
  }

  return close;
}
