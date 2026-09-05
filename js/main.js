/* Ponto de partida: carrega os dados, monta a estante, cuida da navegação
   e mantém a sincronização em segundo plano. */

import { store, mergeDocuments } from './store.js';
import * as ui from './ui.js';
import * as sheets from './sheets.js';
import * as sync from './sync.js';

sheets.bindUI(ui);

const { $, $$ } = ui;

const stack = $('#stack');
const shelfScreen = $('[data-screen="shelf"]');
const shelfScroll = $('#shelf-scroll');
const shelfNav = $('.nav', shelfScreen);
const searchInput = $('#search-input');

/** Telas empilhadas. A estante é sempre a de baixo. */
const screens = [shelfScreen];

/* ── Navegação ───────────────────────────────────────────── */

function pushScreen(screen) {
  const current = screens.at(-1);
  stack.appendChild(screen);
  screens.push(screen);

  current.dataset.state = 'pushing-back';
  screen.dataset.state = 'entering';

  ui.afterAnimation(screen, 520, () => {
    screen.dataset.state = '';
    current.dataset.state = 'behind';
  });
}

function popScreen() {
  if (screens.length < 2) return;
  const top = screens.pop();
  const below = screens.at(-1);

  top.dataset.state = 'leaving';
  below.dataset.state = 'returning';

  ui.afterAnimation(below, 520, () => { below.dataset.state = ''; });
  ui.afterAnimation(top, 520, () => { top.remove(); refreshShelf(); });
}

/* ── Abrir uma pasta ─────────────────────────────────────── */

let folderOverlay = null;

function openFolder(groupID) {
  if (folderOverlay) return;

  const cell = $(`.folder-cell[data-group="${groupID}"]`);
  const group = store.group(groupID);
  if (!cell || !group) return;

  const rect = cell.querySelector('.folder').getBoundingClientRect();
  ui.tap();

  const overlay = document.createElement('div');
  overlay.className = 'folder-overlay';

  const flyer = document.createElement('div');
  flyer.className = 'flyer';
  Object.assign(flyer.style, {
    left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`
  });
  flyer.innerHTML = ui.folderHTML(group, store.pendingCount(groupID));

  const contents = document.createElement('div');
  contents.className = 'contents';
  contents.appendChild(
    ui.buildListScreen({ kind: 'group', id: groupID }, { onBack: closeFolder, backLabel: 'Pastas' })
  );

  overlay.append(flyer, contents);
  $('#overlay-host').appendChild(overlay);
  cell.classList.add('is-open');

  folderOverlay = { overlay, flyer, groupID };

  // Força o navegador a calcular o layout com a geometria inicial antes de
  // trocar para a final — senão ele junta as duas mudanças e não há
  // transição nenhuma. Um `requestAnimationFrame` aqui seria frágil: ele
  // não dispara com a aba em segundo plano, e a pasta ficaria travada.
  void flyer.offsetWidth;

  Object.assign(flyer.style, {
    left: '0px', top: '0px', width: '100vw', height: '100vh'
  });
  flyer.querySelector('.folder').classList.add('open');
  flyer.classList.add('expanded');
  overlay.classList.add('expanded');
}

function closeFolder() {
  if (!folderOverlay) return;
  const { overlay, flyer, groupID } = folderOverlay;
  folderOverlay = null;

  // Redesenha a estante para o cartão voltar ao lugar certo (a contagem
  // pode ter mudado), mas mantém ele invisível: quem o usuário vê
  // encolhendo é a camada de cima.
  refreshShelf();
  const cell = $(`.folder-cell[data-group="${groupID}"]`);
  cell?.classList.add('is-open');
  const rect = cell?.querySelector('.folder')?.getBoundingClientRect();

  overlay.classList.remove('expanded');
  flyer.classList.remove('expanded');
  flyer.querySelector('.folder').classList.remove('open');

  if (rect) {
    Object.assign(flyer.style, {
      left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`
    });
  }

  setTimeout(() => {
    overlay.remove();
    $(`.folder-cell[data-group="${groupID}"]`)?.classList.remove('is-open');
    refreshShelf();
  }, 470);
}

/* ── Estante ─────────────────────────────────────────────── */

function refreshShelf() {
  ui.renderShelf();
  if (searchInput.value.trim()) ui.renderSearch(searchInput.value);
}

shelfScroll.addEventListener('scroll', () => {
  shelfNav.classList.toggle('scrolled', shelfScroll.scrollTop > 14);
});

searchInput.addEventListener('input', () => {
  $('.search-clear').hidden = !searchInput.value;
  ui.renderSearch(searchInput.value);
});

shelfScreen.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="clear-search"]')) {
    searchInput.value = '';
    $('.search-clear').hidden = true;
    ui.renderSearch('');
    return;
  }

  const smart = event.target.closest('[data-smart]');
  if (smart) {
    pushScreen(ui.buildListScreen(
      { kind: 'smart', id: smart.dataset.smart },
      { onBack: popScreen, backLabel: 'Minhas Tarefas' }
    ));
    return;
  }

  const folder = event.target.closest('[data-group]');
  if (folder) { openFolder(folder.dataset.group); return; }

  const result = event.target.closest('[data-task]');
  if (result) { sheets.openTaskSheet(result.dataset.task, { onDone: refreshShelf }); return; }

  if (event.target.closest('[data-action="new-folder"]')) { newFolder(); return; }

  const menuBtn = event.target.closest('[data-action="open-menu"]');
  if (menuBtn) {
    ui.openMenu(menuBtn, [
      { key: 'organize', label: 'Organizar pastas', icon: 'i-sort',
        action: () => sheets.openOrganizeSheet({ onDone: refreshShelf }) },
      { key: 'settings', label: 'Ajustes', icon: 'i-gear',
        action: () => sheets.openSettingsSheet({ onDone: refreshShelf, onSyncNow: syncNow }) },
      { separator: true },
      { key: 'undo', label: 'Desfazer', icon: 'i-undo', disabled: !store.canUndo,
        action: () => { store.undo(); refreshShelf(); } }
    ]);
  }
});

function newFolder() {
  ui.tap();
  const created = store.addGroup();
  refreshShelf();
  sheets.openGroupSheet(created, { isNew: true, onDone: refreshShelf });
}

/* ── Sincronização ───────────────────────────────────────── */

let syncing = false;

async function syncNow({ silent = true } = {}) {
  if (!sync.syncConfig.isConfigured || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const remote = await sync.pull();
    if (remote) {
      store.applyDocument(mergeDocuments(store.document(), remote));
      await store.persist();
      repaintAll();
    }
    await sync.push(store.document());
  } catch (error) {
    if (!silent) ui.toast(error.message || 'Falha na sincronização');
  } finally {
    syncing = false;
  }
}

store.onSyncNeeded = () => syncNow();

function repaintAll() {
  refreshShelf();
  for (const screen of screens) screen.__render?.();
  $('.folder-overlay .screen')?.__render?.();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow();
});
window.addEventListener('online', () => syncNow());
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);

/* ── Teclado (Mac e iPad com teclado) ────────────────────── */

document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
  const meta = event.metaKey || event.ctrlKey;

  if (meta && event.key.toLowerCase() === 'z' && !typing) {
    event.preventDefault();
    if (store.undo()) { repaintAll(); ui.toast('Desfeito'); }
    return;
  }
  if (meta && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    newFolder();
    return;
  }
  if (event.key === 'Escape' && !typing) {
    if (folderOverlay) closeFolder();
    else if (screens.length > 1) popScreen();
  }
});

/* ── Boot ────────────────────────────────────────────────── */

async function boot() {
  await store.load();
  store.subscribe(() => { /* redesenhos são explícitos, para não piscar */ });
  refreshShelf();

  // Guarda o espaço em disco contra a limpeza automática do navegador.
  navigator.storage?.persist?.().catch(() => {});

  syncNow();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch { /* sem service worker o app ainda funciona, só não fica offline */ }
  }
}

boot();

/* Ajuda no console para depurar sem abrir as ferramentas do Safari. */
window.MinhasTarefas = { store, sync, syncNow, repaintAll };
