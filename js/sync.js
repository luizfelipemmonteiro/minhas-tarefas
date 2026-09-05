/* Sincronização entre aparelhos, e backup em arquivo.

   O app funciona 100% sem nada disto: os dados moram no aparelho.
   Quando ligada, a sincronização guarda o mesmo documento num arquivo
   dentro de um repositório **privado** do GitHub — de graça, para sempre,
   sem servidor para manter.

   Por que repositório privado e não gist: gist "secreto" só é não-listado,
   quem tiver o endereço lê. Repositório privado é privado de verdade.

   O token nunca sai deste aparelho: fica no localStorage e vai só para a
   api.github.com. Use um token *fine-grained* limitado a este repositório,
   com permissão de Contents (leitura e escrita) — nada além disso. */

const API = 'https://api.github.com';
const FILE_PATH = 'minhas-tarefas.json';

const KEY_TOKEN = 'sync.token';
const KEY_REPO = 'sync.repo';       // "usuario/repositorio"
const KEY_SHA = 'sync.sha';
const KEY_LAST = 'sync.lastSync';

export const syncConfig = {
  get token() { return localStorage.getItem(KEY_TOKEN) || ''; },
  set token(value) {
    if (value) localStorage.setItem(KEY_TOKEN, value.trim());
    else localStorage.removeItem(KEY_TOKEN);
  },
  get repo() { return localStorage.getItem(KEY_REPO) || ''; },
  set repo(value) {
    if (value) localStorage.setItem(KEY_REPO, value.trim().replace(/^https?:\/\/github\.com\//, ''));
    else localStorage.removeItem(KEY_REPO);
  },
  get lastSync() { return localStorage.getItem(KEY_LAST) || ''; },
  set lastSync(value) { localStorage.setItem(KEY_LAST, value); },
  get isConfigured() { return Boolean(this.token && this.repo); },
  clear() {
    [KEY_TOKEN, KEY_REPO, KEY_SHA, KEY_LAST].forEach((k) => localStorage.removeItem(k));
  }
};

/* ── Base64 que aguenta acentos ──────────────────────────── */

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ── Chamadas à API ──────────────────────────────────────── */

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${syncConfig.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  return response;
}

function friendlyError(response) {
  if (response.status === 401) return 'Token inválido ou expirado.';
  if (response.status === 403) return 'O token não tem permissão de Contents neste repositório.';
  if (response.status === 404) return 'Repositório ou caminho não encontrado. Confira "usuário/repositório".';
  if (response.status === 409) return 'Conflito de versão — tente sincronizar de novo.';
  return `Falha na sincronização (HTTP ${response.status}).`;
}

/** Confere se o token e o repositório funcionam, sem gravar nada. */
export async function testConnection() {
  if (!syncConfig.isConfigured) throw new Error('Faltam o token e o repositório.');
  const response = await api(`/repos/${syncConfig.repo}`);
  if (!response.ok) throw new Error(friendlyError(response));
  const data = await response.json();
  return { private: data.private, fullName: data.full_name };
}

/** Lê o documento remoto. Devolve `null` se o arquivo ainda não existe. */
export async function pull() {
  if (!syncConfig.isConfigured) return null;

  const response = await api(
    `/repos/${syncConfig.repo}/contents/${FILE_PATH}?ref=HEAD&t=${Date.now()}`,
    { cache: 'no-store' }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(friendlyError(response));

  const payload = await response.json();
  localStorage.setItem(KEY_SHA, payload.sha);

  // Arquivos grandes vêm sem `content`; aí buscamos o conteúdo cru.
  let text;
  if (payload.content) {
    text = decodeBase64(payload.content);
  } else {
    const raw = await fetch(payload.download_url, { cache: 'no-store' });
    if (!raw.ok) throw new Error('Não deu para baixar o arquivo de dados.');
    text = await raw.text();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('O arquivo de dados na nuvem está corrompido.');
  }
}

/** Grava o documento. Em caso de conflito, quem chama deve juntar e repetir. */
export async function push(document) {
  if (!syncConfig.isConfigured) return;

  const body = {
    message: `Minhas Tarefas — ${new Date().toLocaleString('pt-BR')}`,
    content: encodeBase64(JSON.stringify(document, null, 1))
  };

  const sha = localStorage.getItem(KEY_SHA);
  if (sha) body.sha = sha;

  let response = await api(`/repos/${syncConfig.repo}/contents/${FILE_PATH}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  // Alguém gravou antes: pega o sha novo e tenta de novo uma vez.
  if (response.status === 409 || response.status === 422) {
    const head = await api(`/repos/${syncConfig.repo}/contents/${FILE_PATH}`);
    if (head.ok) {
      const current = await head.json();
      body.sha = current.sha;
      response = await api(`/repos/${syncConfig.repo}/contents/${FILE_PATH}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    }
  }

  if (!response.ok) throw new Error(friendlyError(response));

  const payload = await response.json();
  if (payload?.content?.sha) localStorage.setItem(KEY_SHA, payload.content.sha);
  syncConfig.lastSync = new Date().toISOString();
}

/* ── Backup em arquivo (sem nuvem nenhuma) ───────────────── */

export function exportToFile(document) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(document, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `minhas-tarefas-${stamp}.json`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function importFromFile() {
  return new Promise((resolve, reject) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.tasks)) {
          throw new Error('Este arquivo não parece um backup do Minhas Tarefas.');
        }
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

/* ── Selo no ícone ───────────────────────────────────────── */

export function updateBadge(count) {
  if (!('setAppBadge' in navigator)) return;
  try {
    if (count > 0) navigator.setAppBadge(count);
    else navigator.clearAppBadge?.();
  } catch { /* sem permissão: segue sem selo */ }
}
