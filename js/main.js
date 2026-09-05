/* Ponto de partida: carrega os dados, monta a estante e mantém a
   sincronização em segundo plano.

   A tela inicial tem só as pastas e o botão de criar. Abrir uma pasta é a
   única navegação do app, e ela acontece numa camada por cima — por isso
   não existe pilha de telas aqui. */

import { store, mergeDocuments } from './store.js';
import * as ui from './ui.js';
import * as sheets from './sheets.js';
import * as sync from './sync.js';

sheets.bindUI(ui);

const { $ } = ui;

const shelfScreen = $('[data-screen="shelf"]');
const shelfScroll = $('#shelf-scroll');
const shelfNav = $('.nav', shelfScreen);

/* ── Abrir e fechar uma pasta ────────────────────────────── */

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
  flyer.innerHTML = ui.folderHTML(group);

  const contents = document.createElement('div');
  contents.className = 'contents';
  contents.appendChild(ui.buildListScreen(groupID, { onBack: closeFolder }));

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

  // Redesenha a estante para o cartão voltar ao lugar certo, mas mantém
  // ele invisível: quem o usuário vê encolhendo é a camada de cima.
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
}

shelfScroll.addEventListener('scroll', () => {
  shelfNav.classList.toggle('scrolled', shelfScroll.scrollTop > 14);
});

shelfScreen.addEventListener('click', (event) => {
  const folder = event.target.closest('[data-group]');
  if (folder) { openFolder(folder.dataset.group); return; }

  if (event.target.closest('[data-action="new-folder"]')) { newFolder(); return; }

  // Só aparece quando não há nenhuma pasta — sem ela os Ajustes ficariam
  // inalcançáveis, já que eles moram no menu de dentro da pasta.
  if (event.target.closest('[data-action="settings"]')) {
    sheets.openSettingsSheet({ onDone: refreshShelf, onSyncNow: syncNow });
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
  if (event.key === 'Escape' && !typing && folderOverlay) closeFolder();
});

/* ── Boot ────────────────────────────────────────────────── */

async function boot() {
  await store.load();
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
