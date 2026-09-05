/* Estado do app e persistência.
   Os dados vivem no aparelho (IndexedDB). A nuvem, quando ligada, é só
   uma cópia do mesmo documento — nunca uma dependência para o app abrir. */

import { nextDate } from './recurrence.js';

const DB_NAME = 'minhas-tarefas';
const DB_STORE = 'kv';
const DOC_KEY = 'documento';

export const TINTS = [
  'blue', 'indigo', 'purple', 'pink', 'red', 'orange',
  'yellow', 'green', 'mint', 'teal', 'brown', 'gray'
];

export const TINT_LABEL = {
  blue: 'Azul', indigo: 'Índigo', purple: 'Roxo', pink: 'Rosa',
  red: 'Vermelho', orange: 'Laranja', yellow: 'Amarelo', green: 'Verde',
  mint: 'Menta', teal: 'Turquesa', brown: 'Marrom', gray: 'Grafite'
};

export const PRIORITY_LABEL = { 0: 'Nenhuma', 1: 'Baixa', 2: 'Média', 3: 'Alta' };
export const PRIORITY_MARK = { 0: '', 1: '!', 2: '!!', 3: '!!!' };

export const SMART_LISTS = [
  { id: 'today',     title: 'Hoje',        icon: 'i-calendar',    tint: 'blue' },
  { id: 'scheduled', title: 'Agendadas',   icon: 'i-clock',       tint: 'red' },
  { id: 'flagged',   title: 'Sinalizadas', icon: 'i-flag',        tint: 'orange' },
  { id: 'all',       title: 'Todas',       icon: 'i-tray',        tint: 'gray' },
  { id: 'completed', title: 'Concluídas',  icon: 'i-check',       tint: 'green' }
];

export const DEFAULT_TITLE_STYLE = {
  family: 'rounded', weight: '700', size: 22, italic: false
};

export const FONT_FAMILIES = {
  system:     { label: 'São Francisco', css: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  rounded:    { label: 'Arredondada',   css: 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif' },
  serif:      { label: 'Serifada',      css: 'ui-serif, Georgia, "Times New Roman", serif' },
  monospaced: { label: 'Monoespaçada',  css: 'ui-monospace, "SF Mono", Menlo, monospace' }
};

export const FONT_WEIGHTS = {
  300: 'Fina', 400: 'Normal', 500: 'Média', 600: 'Seminegrito', 700: 'Negrito', 800: 'Pesada'
};

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
                     : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const nowISO = () => new Date().toISOString();

export function deviceId() {
  let id = localStorage.getItem('device.id');
  if (!id) { id = uid(); localStorage.setItem('device.id', id); }
  return id;
}

/* ── IndexedDB (um documento só, sob uma chave) ──────────── */

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ── Modelo ──────────────────────────────────────────────── */

export function makeGroup(sortIndex, tint = 'blue') {
  return {
    id: uid(),
    title: '',
    titleStyle: { ...DEFAULT_TITLE_STYLE },
    tint,
    symbol: null,
    sortIndex,
    hidesCompleted: false,
    createdAt: nowISO(),
    modifiedAt: nowISO(),
    deletedAt: null
  };
}

export function makeTask(groupID, sortIndex) {
  return {
    id: uid(),
    groupID,
    text: '',
    ink: null,
    inkHeight: 32,
    isCompleted: false,
    completedAt: null,
    isFlagged: false,
    priority: 0,
    notes: '',
    dueDate: null,
    includesTime: false,
    location: '',
    url: '',
    recurrence: null,
    sortIndex,
    createdAt: nowISO(),
    modifiedAt: nowISO(),
    deletedAt: null
  };
}

export const groupTitle = (group) =>
  (group.title || '').trim() || 'Sem título';

export const taskLabel = (task) => {
  const trimmed = (task.text || '').trim();
  if (trimmed) return trimmed;
  return task.ink ? 'Tarefa manuscrita' : 'Nova tarefa';
};

export const hasDetails = (task) =>
  Boolean(task.notes || task.dueDate || task.location || task.recurrence || task.url);

export function isOverdue(task, now = new Date()) {
  if (task.isCompleted || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (task.includesTime) return due < now;
  return startOfDay(due) < startOfDay(now);
}

export function isDueToday(task, now = new Date()) {
  if (!task.dueDate) return false;
  return startOfDay(new Date(task.dueDate)).getTime() === startOfDay(now).getTime();
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ── Merge entre aparelhos ───────────────────────────────── */

function mergeByID(local, remote) {
  const table = new Map();
  for (const item of local) table.set(item.id, item);
  for (const item of remote) {
    const existing = table.get(item.id);
    if (!existing || new Date(item.modifiedAt) > new Date(existing.modifiedAt)) {
      table.set(item.id, item);
    }
  }
  return [...table.values()];
}

/** Junta dois documentos escolhendo, item a item, a versão mais recente.
    Exclusões viram lápides (`deletedAt`), então apagar num aparelho
    apaga no outro em vez de o item "ressuscitar". */
export function mergeDocuments(local, remote) {
  return {
    formatVersion: Math.max(local.formatVersion || 1, remote.formatVersion || 1),
    groups: mergeByID(local.groups || [], remote.groups || []),
    tasks: mergeByID(local.tasks || [], remote.tasks || []),
    savedAt: nowISO(),
    savedBy: deviceId()
  };
}

function purgeTombstones(doc, days = 90) {
  const cutoff = Date.now() - days * 86400000;
  const deadGroups = new Set(
    doc.groups.filter((g) => g.deletedAt && new Date(g.deletedAt).getTime() < cutoff).map((g) => g.id)
  );
  doc.groups = doc.groups.filter((g) => !deadGroups.has(g.id));
  doc.tasks = doc.tasks.filter((t) => {
    if (t.deletedAt && new Date(t.deletedAt).getTime() < cutoff) return false;
    return !deadGroups.has(t.groupID);
  });
  return doc;
}

/* ── Store ───────────────────────────────────────────────── */

class Store {
  constructor() {
    this.groups = [];
    this.tasks = [];
    this.listeners = new Set();
    this.undoStack = [];
    this.saveTimer = null;
    this.syncTimer = null;
    this.onSyncNeeded = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of this.listeners) fn(); }

  async load() {
    const stored = await idbGet(DOC_KEY).catch(() => null);
    if (stored?.groups) {
      this.groups = stored.groups;
      this.tasks = stored.tasks || [];
    } else {
      this.seed();
      await this.persist();
    }
  }

  document() {
    return {
      formatVersion: 1,
      groups: this.groups,
      tasks: this.tasks,
      savedAt: nowISO(),
      savedBy: deviceId()
    };
  }

  applyDocument(doc) {
    const clean = purgeTombstones({ ...doc, groups: [...(doc.groups || [])], tasks: [...(doc.tasks || [])] });
    this.groups = clean.groups;
    this.tasks = clean.tasks;
    this.notify();
  }

  async persist() {
    await idbSet(DOC_KEY, purgeTombstones(this.document())).catch(() => {});
  }

  /** Grava com um pequeno atraso, para digitação não escrever a cada tecla. */
  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 400);
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.onSyncNeeded?.(), 2500);
    this.notify();
  }

  /* ── Leituras ── */

  activeGroups() {
    return this.groups.filter((g) => !g.deletedAt).sort((a, b) => a.sortIndex - b.sortIndex);
  }

  group(id) { return this.groups.find((g) => g.id === id && !g.deletedAt) || null; }
  task(id) { return this.tasks.find((t) => t.id === id && !t.deletedAt) || null; }

  /** Pendentes na ordem manual, concluídas depois (mais recentes primeiro). */
  items(groupID, hideCompleted) {
    const all = this.tasks.filter((t) => t.groupID === groupID && !t.deletedAt);
    const pending = all.filter((t) => !t.isCompleted).sort((a, b) => a.sortIndex - b.sortIndex);
    if (hideCompleted) return pending;
    const done = all.filter((t) => t.isCompleted)
      .sort((a, b) => new Date(b.completedAt || b.modifiedAt) - new Date(a.completedAt || a.modifiedAt));
    return [...pending, ...done];
  }

  pendingCount(groupID) {
    return this.tasks.filter((t) => t.groupID === groupID && !t.deletedAt && !t.isCompleted).length;
  }

  completedCount(groupID) {
    return this.tasks.filter((t) => t.groupID === groupID && !t.deletedAt && t.isCompleted).length;
  }

  smartItems(listID, hideCompleted, now = new Date()) {
    const live = this.tasks.filter((t) => !t.deletedAt);
    let result;

    switch (listID) {
      case 'today':
        result = live.filter((t) => !t.isCompleted && (isDueToday(t, now) || isOverdue(t, now)));
        break;
      case 'scheduled':
        result = live.filter((t) => !t.isCompleted && t.dueDate);
        break;
      case 'flagged':
        result = live.filter((t) => !t.isCompleted && t.isFlagged);
        break;
      case 'completed':
        return live.filter((t) => t.isCompleted)
          .sort((a, b) => new Date(b.completedAt || b.modifiedAt) - new Date(a.completedAt || a.modifiedAt));
      case 'all':
      default:
        result = hideCompleted ? live.filter((t) => !t.isCompleted) : live;
    }

    if (hideCompleted) result = result.filter((t) => !t.isCompleted);

    return result.sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.sortIndex - b.sortIndex;
    });
  }

  smartCount(listID) {
    return this.smartItems(listID, listID !== 'completed').length;
  }

  search(query) {
    const needle = (query || '').trim().toLowerCase();
    if (!needle) return [];
    return this.tasks.filter((t) =>
      !t.deletedAt && (
        (t.text || '').toLowerCase().includes(needle) ||
        (t.notes || '').toLowerCase().includes(needle) ||
        (t.location || '').toLowerCase().includes(needle)
      ));
  }

  /* ── Desfazer ── */

  checkpoint() {
    this.undoStack.push({
      groups: JSON.parse(JSON.stringify(this.groups)),
      tasks: JSON.parse(JSON.stringify(this.tasks))
    });
    if (this.undoStack.length > 25) this.undoStack.shift();
  }

  get canUndo() { return this.undoStack.length > 0; }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.groups = snapshot.groups;
    this.tasks = snapshot.tasks;
    this.scheduleSave();
    return true;
  }

  /* ── Pastas ── */

  addGroup(title = '') {
    this.checkpoint();
    const active = this.activeGroups();
    const group = makeGroup(
      (active.at(-1)?.sortIndex ?? 0) + 1,
      TINTS[active.length % TINTS.length]
    );
    group.title = title;
    this.groups.push(group);
    this.scheduleSave();
    return group;
  }

  updateGroup(updated) {
    const index = this.groups.findIndex((g) => g.id === updated.id);
    if (index < 0) return;
    this.checkpoint();
    this.groups[index] = { ...updated, modifiedAt: nowISO() };
    this.scheduleSave();
  }

  deleteGroup(id) {
    this.checkpoint();
    const stamp = nowISO();
    const group = this.groups.find((g) => g.id === id);
    if (group) { group.deletedAt = stamp; group.modifiedAt = stamp; }
    for (const task of this.tasks) {
      if (task.groupID === id && !task.deletedAt) { task.deletedAt = stamp; task.modifiedAt = stamp; }
    }
    this.scheduleSave();
  }

  reorderGroups(orderedIDs) {
    this.checkpoint();
    orderedIDs.forEach((id, position) => {
      const group = this.groups.find((g) => g.id === id);
      if (group) { group.sortIndex = position; group.modifiedAt = nowISO(); }
    });
    this.scheduleSave();
  }

  /* ── Tarefas ── */

  addTask(groupID, fields = {}, position = null) {
    this.checkpoint();
    const pending = this.items(groupID, true);
    let sortIndex;
    if (position != null && position < pending.length) {
      const upper = pending[position].sortIndex;
      const lower = position > 0 ? pending[position - 1].sortIndex : upper - 2;
      sortIndex = (upper + lower) / 2;
    } else {
      sortIndex = (pending.at(-1)?.sortIndex ?? 0) + 1;
    }
    const task = { ...makeTask(groupID, sortIndex), ...fields };
    this.tasks.push(task);
    this.scheduleSave();
    return task;
  }

  updateTask(updated, { checkpoint = true } = {}) {
    const index = this.tasks.findIndex((t) => t.id === updated.id);
    if (index < 0) return;
    if (checkpoint) this.checkpoint();
    this.tasks[index] = { ...updated, modifiedAt: nowISO() };
    this.scheduleSave();
  }

  deleteTask(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    this.checkpoint();
    task.deletedAt = nowISO();
    task.modifiedAt = task.deletedAt;
    this.scheduleSave();
  }

  deleteTasks(ids) {
    if (!ids.length) return;
    this.checkpoint();
    const stamp = nowISO();
    for (const id of ids) {
      const task = this.tasks.find((t) => t.id === id);
      if (task) { task.deletedAt = stamp; task.modifiedAt = stamp; }
    }
    this.scheduleSave();
  }

  moveTask(taskID, groupID) {
    const task = this.tasks.find((t) => t.id === taskID);
    if (!task) return;
    this.checkpoint();
    task.groupID = groupID;
    task.sortIndex = (this.items(groupID, true).at(-1)?.sortIndex ?? 0) + 1;
    task.modifiedAt = nowISO();
    this.scheduleSave();
  }

  reorderTasks(groupID, orderedIDs) {
    this.checkpoint();
    orderedIDs.forEach((id, position) => {
      const task = this.tasks.find((t) => t.id === id);
      if (task) { task.sortIndex = position; task.modifiedAt = nowISO(); }
    });
    this.scheduleSave();
  }

  toggleFlag(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    this.checkpoint();
    task.isFlagged = !task.isFlagged;
    task.modifiedAt = nowISO();
    this.scheduleSave();
  }

  /** Marca/desmarca. Se a tarefa se repete, cria a próxima ocorrência. */
  setCompleted(id, completed) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    this.checkpoint();

    const stamp = nowISO();
    task.isCompleted = completed;
    task.completedAt = completed ? stamp : null;
    task.modifiedAt = stamp;

    let spawned = null;
    if (completed && task.recurrence) spawned = this.spawnNextOccurrence(task);

    this.scheduleSave();
    return spawned;
  }

  spawnNextOccurrence(completed) {
    const base = completed.dueDate ? new Date(completed.dueDate) : new Date();
    const due = nextDate(base, completed.recurrence);
    if (!due) return null;

    const next = {
      ...JSON.parse(JSON.stringify(completed)),
      id: uid(),
      isCompleted: false,
      completedAt: null,
      dueDate: due.toISOString(),
      createdAt: nowISO(),
      modifiedAt: nowISO(),
      deletedAt: null,
      sortIndex: (this.items(completed.groupID, true).at(-1)?.sortIndex ?? 0) + 1
    };
    next.recurrence.occurrenceCount = (next.recurrence.occurrenceCount || 0) + 1;

    this.tasks.push(next);
    return next;
  }

  /* ── Conteúdo inicial ── */

  seed() {
    const group = makeGroup(0, 'blue');
    group.title = 'Primeiros passos';
    group.symbol = '✨';
    this.groups = [group];

    const lines = [
      'Toque no círculo à esquerda para concluir',
      'Deslize para a esquerda para apagar',
      'Nos 3 pontinhos, use “Ocultar tarefas concluídas”',
      'No iPad, toque no lápis para escrever com o Apple Pencil',
      'Toque numa tarefa para data, repetição e local'
    ];
    this.tasks = lines.map((text, index) => ({ ...makeTask(group.id, index), text }));
  }
}

export const store = new Store();
