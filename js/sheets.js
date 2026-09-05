/* Folhas modais: detalhes da tarefa, repetição, editor de pasta e ajustes. */

import { store, TINTS, TINT_LABEL, PRIORITY_LABEL, groupTitle } from './store.js';
import { inkSVG } from './ink.js';
import {
  FREQUENCIES, FREQUENCY_LABEL, defaultRecurrence, recurrenceSummary,
  upcomingDates, weekdayName, monthName
} from './recurrence.js';
import * as sync from './sync.js';

/* Importado tardiamente para não criar ciclo entre ui.js e sheets.js. */
let ui = null;
export function bindUI(module) { ui = module; }

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const tintVar = (t) => `var(--${t || 'blue'})`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const pad2 = (n) => String(n).padStart(2, '0');
const toDateInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const toTimeInput = (iso) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const fromInputs = (dateStr, timeStr) =>
  new Date(`${dateStr}T${timeStr || '09:00'}:00`);

/* ── Infraestrutura das folhas ───────────────────────────── */

/**
 * @param {{title:string,leftLabel?:string,rightLabel?:string,strongRight?:boolean,
 *          render:()=>string,mount?:(root:HTMLElement,api:object)=>void,
 *          onLeft?:(api:object)=>void,onRight?:(api:object)=>void}} first
 */
export function openSheet(first) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <header class="sheet-nav">
      <span class="side left"></span>
      <span class="title"></span>
      <span class="side right"></span>
    </header>
    <div class="sheet-body"></div>`;

  document.body.append(scrim, sheet);
  requestAnimationFrame(() => { scrim.classList.add('shown'); sheet.classList.add('shown'); });

  const pages = [];
  const body = $('.sheet-body', sheet);

  const api = {
    close,
    push: (page) => { pages.push(page); paint(); },
    pop: () => { pages.pop(); paint(); },
    repaint: () => paint(),
    get body() { return body; }
  };

  function paint() {
    const page = pages.at(-1);
    if (!page) return close();

    $('.title', sheet).textContent = page.title;

    const left = $('.side.left', sheet);
    const right = $('.side.right', sheet);

    left.innerHTML = pages.length > 1
      ? `<button type="button" class="nav-text-btn" data-sheet-back>${icon('i-back')}<span>Voltar</span></button>`
      : (page.leftLabel ? `<button type="button" class="nav-text-btn" data-sheet-left>${esc(page.leftLabel)}</button>` : '');

    right.innerHTML = page.rightLabel
      ? `<button type="button" class="nav-text-btn ${page.strongRight ? 'strong' : ''}" data-sheet-right>${esc(page.rightLabel)}</button>`
      : '';

    // Cada redesenho monta num contêiner novo. Assim os ouvintes que a
    // página registra morrem junto com o nó antigo — senão eles se
    // acumulariam a cada repaint e um toque dispararia várias vezes.
    const container = document.createElement('div');
    container.innerHTML = page.render();
    body.replaceChildren(container);
    body.scrollTop = 0;
    page.mount?.(container, api);
  }

  sheet.addEventListener('click', (event) => {
    const page = pages.at(-1);
    if (event.target.closest('[data-sheet-back]')) { api.pop(); return; }
    if (event.target.closest('[data-sheet-left]')) { (page.onLeft || close)(api); return; }
    if (event.target.closest('[data-sheet-right]')) { (page.onRight || close)(api); }
  });

  scrim.addEventListener('click', () => {
    const page = pages.at(-1);
    if (page?.dismissible === false) return;
    (page?.onLeft || close)(api);
  });

  function close() {
    scrim.classList.remove('shown');
    sheet.classList.remove('shown');
    setTimeout(() => { scrim.remove(); sheet.remove(); }, 460);
  }

  api.push(first);
  return api;
}

/* Blocos reutilizáveis ------------------------------------- */

const group = (title, inner, note = '') => `
  <div class="form-group">
    ${title ? `<div class="form-title">${esc(title)}</div>` : ''}
    <div class="form-card">${inner}</div>
    ${note ? `<div class="form-note">${note}</div>` : ''}
  </div>`;

const switchField = (label, iconID, checked, key) => `
  <label class="field">
    <span class="lead">${iconID ? icon(iconID) : ''}<span>${esc(label)}</span></span>
    <span class="switch">
      <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
      <span class="track"></span><span class="knob"></span>
    </span>
  </label>`;

const linkField = (label, iconID, value, key) => `
  <button type="button" class="field" data-push="${key}">
    <span class="lead">${iconID ? icon(iconID) : ''}<span>${esc(label)}</span></span>
    <span class="value">${esc(value)}</span>
    <span class="chev">${icon('i-back')}</span>
  </button>`;

const selectField = (label, iconID, key, options, selected) => `
  <label class="field">
    <span class="lead">${iconID ? icon(iconID) : ''}<span>${esc(label)}</span></span>
    <select data-key="${key}">
      ${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(selected) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
  </label>`;

const stepperField = (label, key, value, suffix) => `
  <div class="field">
    <span class="lead"><span>${esc(label)}</span></span>
    <span class="value">${esc(String(value))} ${esc(suffix)}</span>
    <span class="stepper">
      <button type="button" data-step="${key}:-1" aria-label="Diminuir">−</button>
      <button type="button" data-step="${key}:1" aria-label="Aumentar">+</button>
    </span>
  </div>`;

const choiceRow = (label, key, checked) => `
  <button type="button" class="choice" data-choice="${key}" aria-checked="${checked}">
    <span>${esc(label)}</span><span class="tick">${icon('i-check')}</span>
  </button>`;

/* ── Detalhes da tarefa ──────────────────────────────────── */

export function openTaskSheet(taskID, { onDone } = {}) {
  const original = store.task(taskID);
  if (!original) return;

  let draft = JSON.parse(JSON.stringify(original));
  let hasDue = Boolean(draft.dueDate);
  let dueDate = draft.dueDate ? new Date(draft.dueDate) : defaultDue();

  function defaultDue() {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const page = {
    title: 'Detalhes',
    leftLabel: 'Cancelar',
    rightLabel: 'OK',
    strongRight: true,
    onLeft: (api) => api.close(),
    onRight: (api) => {
      draft.dueDate = hasDue ? dueDate.toISOString() : null;
      if (!hasDue) draft.includesTime = false;
      store.updateTask(draft);
      api.close();
      onDone?.();
    },
    render: () => `
      ${group('', `
        ${draft.ink ? `<div class="field" style="display:block">
            <div style="--ink-h:${Math.min(64, Math.max(30, draft.inkHeight || 32))}px;color:var(--label)">${inkSVG(draft.ink)}</div>
            <div style="font-size:13px;color:var(--label-secondary);margin-top:6px">Escrito à mão</div>
          </div>` : ''}
        <label class="field">
          <input type="text" data-key="text" value="${esc(draft.text)}"
                 placeholder="Tarefa" autocapitalize="sentences">
        </label>`)}

      ${group('Notas', `
        <label class="field">
          <textarea data-key="notes" rows="3" placeholder="Informações adicionais"
                    autocapitalize="sentences">${esc(draft.notes)}</textarea>
        </label>`)}

      ${group('', `
        ${switchField('Data de expiração', 'i-calendar', hasDue, 'hasDue')}
        ${hasDue ? `
          <label class="field">
            <span class="lead"><span>Dia</span></span>
            <input type="date" data-key="date" value="${toDateInput(dueDate)}" style="text-align:right">
          </label>
          ${switchField('Incluir horário', 'i-clock', draft.includesTime, 'includesTime')}
          ${draft.includesTime ? `
            <label class="field">
              <span class="lead"><span>Hora</span></span>
              <input type="time" data-key="time" value="${toTimeInput(dueDate)}" style="text-align:right">
            </label>` : ''}` : ''}`,
        hasDue ? 'O app não envia notificação quando está fechado — um site na tela de início não tem essa permissão no iPhone. As tarefas com data aparecem em destaque em “Hoje” e no selo do ícone.' : '')}

      ${group('', linkField('Repetir', 'i-repeat', recurrenceSummary(draft.recurrence), 'recurrence'),
        draft.recurrence ? 'Ao concluir, a próxima ocorrência é criada automaticamente.' : '')}

      ${group('', `
        <label class="field">
          <span class="lead">${icon('i-pin')}<span>Local</span></span>
          <input type="text" data-key="location" value="${esc(draft.location)}"
                 placeholder="Nenhum" style="text-align:right" autocapitalize="sentences">
        </label>
        <label class="field">
          <span class="lead"><span>URL</span></span>
          <input type="url" data-key="url" value="${esc(draft.url)}" placeholder="—"
                 style="text-align:right" autocapitalize="off" autocorrect="off">
        </label>`)}

      ${group('', `
        ${selectField('Prioridade', null, 'priority',
          Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label })), draft.priority)}
        ${switchField('Sinalizar', 'i-flag', draft.isFlagged, 'isFlagged')}
        ${selectField('Pasta', 'i-folder', 'groupID',
          store.activeGroups().map((g) => ({ value: g.id, label: groupTitle(g) })), draft.groupID)}`)}

      ${group('', `<button type="button" class="field danger" data-delete>
          ${icon('i-trash')}<span style="margin-left:8px">Apagar tarefa</span></button>`)}
    `,
    mount: (root, api) => {
      root.addEventListener('input', (event) => {
        const key = event.target.dataset.key;
        if (!key) return;

        if (key === 'hasDue') { hasDue = event.target.checked; api.repaint(); return; }
        if (key === 'includesTime') { draft.includesTime = event.target.checked; api.repaint(); return; }
        if (key === 'date') {
          const time = draft.includesTime ? toTimeInput(dueDate) : '09:00';
          dueDate = fromInputs(event.target.value, time);
          return;
        }
        if (key === 'time') { dueDate = fromInputs(toDateInput(dueDate), event.target.value); return; }
        if (key === 'isFlagged') { draft.isFlagged = event.target.checked; return; }
        if (key === 'priority') { draft.priority = Number(event.target.value); return; }
        draft[key] = event.target.value;
      });

      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-push="recurrence"]')) {
          api.push(recurrencePage(draft, hasDue ? dueDate : new Date(), (value) => {
            draft.recurrence = value;
          }, api));
          return;
        }
        if (event.target.closest('[data-delete]')) {
          store.deleteTask(taskID);
          api.close();
          onDone?.();
          ui?.toast('Tarefa apagada', { actionLabel: 'Desfazer', onAction: () => { store.undo(); onDone?.(); } });
        }
      });
    }
  };

  openSheet(page);
}

/* ── Editor de repetição ─────────────────────────────────── */

function recurrencePage(draft, anchor, commit, api) {
  let on = Boolean(draft.recurrence);
  let rule = draft.recurrence
    ? JSON.parse(JSON.stringify(draft.recurrence))
    : defaultRecurrence(anchor);

  if (!draft.recurrence) {
    rule.monthlyRule = { kind: 'dayOfMonth', day: anchor.getDate() };
    rule.month = anchor.getMonth() + 1;
  }

  let endMode = rule.endDate ? 'date' : (rule.maxOccurrences != null ? 'count' : 'never');
  let endDate = rule.endDate ? new Date(rule.endDate) : new Date(Date.now() + 365 * 86400000);
  let maxCount = rule.maxOccurrences ?? 10;

  const save = () => {
    rule.endDate = endMode === 'date' ? endDate.toISOString() : null;
    rule.maxOccurrences = endMode === 'count' ? maxCount : null;
    commit(on ? rule : null);
  };

  const kind = () => rule.monthlyRule?.kind || 'firstDay';

  return {
    title: 'Repetir',
    render: () => {
      if (!on) {
        return group('', switchField('Repetir esta tarefa', 'i-repeat', false, 'on'));
      }

      const isWeekly = rule.frequency === 'weekly';
      const isMonthlyLike = rule.frequency === 'monthly' || rule.frequency === 'yearly';
      const unit = { daily: 'dias', weekly: 'semanas', monthly: 'meses', yearly: 'anos' }[rule.frequency];
      const preview = upcomingDates(anchor, { ...rule,
        endDate: endMode === 'date' ? endDate.toISOString() : null,
        maxOccurrences: endMode === 'count' ? maxCount : null }, 5);

      return `
        ${group('', switchField('Repetir esta tarefa', 'i-repeat', true, 'on'),
          esc(recurrenceSummary(rule)))}

        ${group('Com que frequência', `
          ${selectField('Frequência', null, 'frequency',
            FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] })), rule.frequency)}
          ${stepperField('A cada', 'interval', rule.interval, unit)}`)}

        ${isWeekly ? group('Em quais dias', `
          <div class="weekdays">
            ${[1, 2, 3, 4, 5, 6, 7].map((d) => `
              <button type="button" class="weekday" data-weekday="${d}"
                      aria-checked="${rule.weekdays.includes(d)}">${esc(weekdayName(d, true))}</button>`).join('')}
          </div>`) : ''}

        ${rule.frequency === 'yearly' ? group('Em qual mês',
          selectField('Mês', null, 'month',
            Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) })), rule.month)) : ''}

        ${isMonthlyLike ? group('Em qual dia', `
          ${choiceRow('Em um dia fixo', 'dayOfMonth', kind() === 'dayOfMonth')}
          ${kind() === 'dayOfMonth' ? selectField('Dia', null, 'dayOfMonth',
            Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Dia ${i + 1}` })),
            rule.monthlyRule.day || 1) : ''}
          ${choiceRow('No primeiro dia do mês', 'firstDay', kind() === 'firstDay')}
          ${choiceRow('No último dia do mês', 'lastDay', kind() === 'lastDay')}
          ${choiceRow('Em um dia da semana', 'nthWeekday', kind() === 'nthWeekday')}
          ${kind() === 'nthWeekday' ? `
            ${selectField('Ocorrência', null, 'ordinal',
              [1, 2, 3, 4, 5, -1].map((o) => ({ value: o, label: o < 0 ? 'Último' : `${o}º` })),
              rule.monthlyRule.ordinal ?? 1)}
            ${selectField('Dia da semana', null, 'nthWeekdayDay',
              [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: weekdayName(d) })),
              rule.monthlyRule.weekday ?? 2)}` : ''}`) : ''}

        ${group('Terminar', `
          ${choiceRow('Nunca', 'end:never', endMode === 'never')}
          ${choiceRow('Em uma data', 'end:date', endMode === 'date')}
          ${endMode === 'date' ? `<label class="field"><span class="lead"><span>Até</span></span>
            <input type="date" data-key="endDate" value="${toDateInput(endDate)}" style="text-align:right"></label>` : ''}
          ${choiceRow('Depois de N vezes', 'end:count', endMode === 'count')}
          ${endMode === 'count' ? stepperField('Vezes', 'maxCount', maxCount, 'vezes') : ''}`)}

        ${group('Próximas datas', preview.length
          ? preview.map((date) => `<div class="field"><span class="lead">${icon('i-calendar')}
              <span>${esc(ui.fullDateText(date))}</span></span></div>`).join('')
          : '<div class="field"><span class="lead"><span>Nenhuma repetição futura com estas regras.</span></span></div>')}
      `;
    },
    mount: (root, sheetApi) => {
      root.addEventListener('input', (event) => {
        const key = event.target.dataset.key;
        if (!key) return;

        if (key === 'on') { on = event.target.checked; save(); sheetApi.repaint(); return; }
        if (key === 'frequency') { rule.frequency = event.target.value; }
        else if (key === 'month') { rule.month = Number(event.target.value); }
        else if (key === 'dayOfMonth') { rule.monthlyRule = { kind: 'dayOfMonth', day: Number(event.target.value) }; }
        else if (key === 'ordinal') { rule.monthlyRule = { ...rule.monthlyRule, ordinal: Number(event.target.value) }; }
        else if (key === 'nthWeekdayDay') { rule.monthlyRule = { ...rule.monthlyRule, weekday: Number(event.target.value) }; }
        else if (key === 'endDate') { endDate = fromInputs(event.target.value, '09:00'); }
        save();
        sheetApi.repaint();
      });

      root.addEventListener('click', (event) => {
        const step = event.target.closest('[data-step]');
        if (step) {
          const [field, delta] = step.dataset.step.split(':');
          if (field === 'interval') rule.interval = Math.min(99, Math.max(1, rule.interval + Number(delta)));
          if (field === 'maxCount') maxCount = Math.min(365, Math.max(1, maxCount + Number(delta)));
          save();
          sheetApi.repaint();
          return;
        }

        const weekday = event.target.closest('[data-weekday]');
        if (weekday) {
          const day = Number(weekday.dataset.weekday);
          rule.weekdays = rule.weekdays.includes(day)
            ? rule.weekdays.filter((d) => d !== day)
            : [...rule.weekdays, day];
          save();
          sheetApi.repaint();
          return;
        }

        const choice = event.target.closest('[data-choice]');
        if (choice) {
          const value = choice.dataset.choice;
          if (value.startsWith('end:')) {
            endMode = value.slice(4);
          } else if (value === 'dayOfMonth') {
            rule.monthlyRule = { kind: 'dayOfMonth', day: rule.monthlyRule.day || anchor.getDate() };
          } else if (value === 'nthWeekday') {
            rule.monthlyRule = { kind: 'nthWeekday', ordinal: rule.monthlyRule.ordinal ?? 1,
                                 weekday: rule.monthlyRule.weekday ?? (anchor.getDay() + 1) };
          } else {
            rule.monthlyRule = { kind: value };
          }
          save();
          sheetApi.repaint();
        }
      });
    }
  };
}

/* ── Editor de pasta ─────────────────────────────────────── */

/** O app tem um desenho só: aqui dá para mudar o nome e a cor da pasta,
    e mais nada. Sem escolha de fonte, tamanho ou símbolo. */
export function openGroupSheet(groupToEdit, { isNew = false, onDone } = {}) {
  if (!groupToEdit) return;
  const draft = JSON.parse(JSON.stringify(groupToEdit));

  openSheet({
    title: isNew ? 'Nova pasta' : 'Pasta',
    leftLabel: 'Cancelar',
    rightLabel: isNew ? 'Criar' : 'OK',
    strongRight: true,
    onLeft: (api) => {
      if (isNew) store.deleteGroup(draft.id);
      api.close();
      onDone?.();
    },
    onRight: (api) => {
      store.updateGroup(draft);
      api.close();
      onDone?.();
    },
    render: () => `
      <div class="folder-preview">
        ${ui.folderHTML(draft)}
      </div>

      ${group('', `<label class="field">
        <input type="text" data-key="title" value="${esc(draft.title)}"
               placeholder="Nome da pasta" autocapitalize="sentences"
               enterkeyhint="done"></label>`)}

      ${group('Cor', `<div class="swatches">
        ${TINTS.map((tint) => `<button type="button" class="swatch" data-tint="${tint}"
            aria-checked="${draft.tint === tint}" aria-label="${esc(TINT_LABEL[tint])}">
            <i style="background:${tintVar(tint)}"></i></button>`).join('')}
      </div>`)}

      ${isNew ? '' : group('', `<button type="button" class="field danger" data-delete>
        ${icon('i-trash')}<span style="margin-left:8px">Apagar pasta</span></button>`)}
    `,
    mount: (root, api) => {
      const titleInput = $('[data-key="title"]', root);
      if (isNew) setTimeout(() => titleInput?.focus(), 420);

      titleInput?.addEventListener('input', () => { draft.title = titleInput.value; });
      titleInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); titleInput.blur(); }
      });

      root.addEventListener('click', (event) => {
        const tint = event.target.closest('[data-tint]');
        if (tint) {
          draft.tint = tint.dataset.tint;
          // Repinta só o necessário para o campo de texto não perder o foco.
          $('.folder', root).style.setProperty('--folder-tint', tintVar(draft.tint));
          for (const swatch of $$('[data-tint]', root)) {
            swatch.setAttribute('aria-checked', String(swatch.dataset.tint === draft.tint));
          }
          return;
        }

        if (event.target.closest('[data-delete]')) {
          const name = groupTitle(draft);
          store.deleteGroup(draft.id);
          api.close();
          onDone?.();
          ui?.toast(`Pasta “${name}” apagada`, {
            actionLabel: 'Desfazer', onAction: () => { store.undo(); onDone?.(); }
          });
        }
      });
    }
  });
}

/* ── Ajustes ─────────────────────────────────────────────── */

export function openSettingsSheet({ onDone, onSyncNow } = {}) {
  let status = sync.syncConfig.isConfigured
    ? (sync.syncConfig.lastSync
        ? `Sincronizado em ${new Date(sync.syncConfig.lastSync).toLocaleString('pt-BR')}`
        : 'Configurada')
    : 'Desativada';

  openSheet({
    title: 'Ajustes',
    rightLabel: 'OK',
    strongRight: true,
    onRight: (api) => { api.close(); onDone?.(); },
    render: () => `
      ${group('Sincronização entre aparelhos', `
        <div class="field">
          <span class="lead"><span>Estado</span></span>
          <span class="value">${esc(status)}</span>
        </div>
        <label class="field">
          <span class="lead"><span>Repositório</span></span>
          <input type="text" data-key="repo" value="${esc(sync.syncConfig.repo)}"
                 placeholder="usuario/repositorio" style="text-align:right"
                 autocapitalize="off" autocorrect="off" spellcheck="false">
        </label>
        <label class="field">
          <span class="lead"><span>Token</span></span>
          <input type="password" data-key="token" value="${esc(sync.syncConfig.token)}"
                 placeholder="github_pat_…" style="text-align:right"
                 autocapitalize="off" autocorrect="off" spellcheck="false">
        </label>
        <button type="button" class="field" data-test>
          <span class="lead">${icon('i-cloud')}<span>Testar conexão</span></span></button>
        ${sync.syncConfig.isConfigured ? `
          <button type="button" class="field" data-syncnow>
            <span class="lead">${icon('i-repeat')}<span>Sincronizar agora</span></span></button>
          <button type="button" class="field danger" data-syncoff>
            <span class="lead"><span>Desativar sincronização</span></span></button>` : ''}`,
        'Opcional. O app funciona sem isto — os dados moram no aparelho. ' +
        'Crie um repositório <b>privado</b> no GitHub e um token <i>fine-grained</i> ' +
        'limitado a ele, com permissão de <b>Contents: Read and write</b>. ' +
        'O token fica só neste aparelho.')}

      ${group('Backup em arquivo', `
        <button type="button" class="field" data-export>
          <span class="lead">${icon('i-share')}<span>Exportar tudo</span></span></button>
        <button type="button" class="field" data-import>
          <span class="lead">${icon('i-folder')}<span>Importar de um arquivo</span></span></button>`,
        'O arquivo exportado pode ser guardado no iCloud Drive. Importar junta com o que já existe, mantendo a versão mais recente de cada item.')}

      ${group('Sobre', `
        <div class="field"><span class="lead"><span>Pastas</span></span>
          <span class="value">${store.activeGroups().length}</span></div>
        <div class="field"><span class="lead"><span>Tarefas pendentes</span></span>
          <span class="value">${store.smartCount('all')}</span></div>
        <div class="field"><span class="lead"><span>Versão</span></span>
          <span class="value">1.0</span></div>`,
        'Para instalar na tela de início: no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.')}
    `,
    mount: (root, api) => {
      root.addEventListener('input', (event) => {
        const key = event.target.dataset.key;
        if (key === 'repo') sync.syncConfig.repo = event.target.value;
        if (key === 'token') sync.syncConfig.token = event.target.value;
      });

      root.addEventListener('click', async (event) => {
        if (event.target.closest('[data-test]')) {
          try {
            const info = await sync.testConnection();
            status = info.private
              ? `Conectado a ${info.fullName} (privado)`
              : `Conectado a ${info.fullName} — atenção: este repositório é público`;
            ui?.toast(info.private ? 'Conexão OK' : 'Conectado, mas o repositório é público');
          } catch (error) {
            status = error.message;
            ui?.toast(error.message);
          }
          api.repaint();
          return;
        }

        if (event.target.closest('[data-syncnow]')) {
          ui?.toast('Sincronizando…');
          await onSyncNow?.();
          status = `Sincronizado em ${new Date().toLocaleString('pt-BR')}`;
          api.repaint();
          return;
        }

        if (event.target.closest('[data-syncoff]')) {
          sync.syncConfig.clear();
          status = 'Desativada';
          api.repaint();
          return;
        }

        if (event.target.closest('[data-export]')) {
          sync.exportToFile(store.document());
          ui?.toast('Arquivo de backup gerado');
          return;
        }

        if (event.target.closest('[data-import]')) {
          try {
            const incoming = await sync.importFromFile();
            if (!incoming) return;
            const { mergeDocuments } = await import('./store.js');
            store.applyDocument(mergeDocuments(store.document(), incoming));
            await store.persist();
            ui?.toast('Backup importado');
            api.repaint();
            onDone?.();
          } catch (error) {
            ui?.toast(error.message || 'Não deu para ler o arquivo');
          }
        }
      });
    }
  });
}
