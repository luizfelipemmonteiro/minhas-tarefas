/* Regras de repetição.
   Dias da semana seguem a convenção do Calendar da Apple:
   1 = domingo … 7 = sábado. (Em JS, Date.getDay() é 0-based, por isso o +1.) */

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

export const FREQUENCY_LABEL = {
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
  yearly: 'Anualmente'
};

const UNIT = {
  daily:   ['dia', 'dias'],
  weekly:  ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
  yearly:  ['ano', 'anos']
};

export function defaultRecurrence(anchor = new Date()) {
  return {
    frequency: 'monthly',
    interval: 1,
    weekdays: [],
    monthlyRule: { kind: 'firstDay' },
    month: anchor.getMonth() + 1,
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 0
  };
}

const fmtWeekdayLong  = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const fmtWeekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const fmtMonthLong    = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

export function weekdayName(weekday, short = false) {
  // 2024-01-07 é um domingo, então +（weekday-1) cobre os sete dias.
  const probe = new Date(2024, 0, 6 + weekday);
  const raw = short ? fmtWeekdayShort.format(probe) : fmtWeekdayLong.format(probe);
  const clean = raw.replace(/\.$/, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function monthName(month) {
  const raw = fmtMonthLong.format(new Date(2024, month - 1, 1));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/* ── Cálculo da próxima data ─────────────────────────────── */

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/* Somar meses sem o "transbordo" do JS: `new Date(2025,0,31).setMonth(1)`
   viraria 3 de março. Aqui só o par ano/mês anda; o dia vem da regra. */
function shiftMonth(date, months) {
  const total = date.getMonth() + months;
  return {
    year: date.getFullYear() + Math.floor(total / 12),
    month: ((total % 12) + 12) % 12
  };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function placeInMonth(year, month, rule, hours, minutes) {
  const last = daysInMonth(year, month);

  switch (rule?.kind) {
    case 'lastDay':
      return new Date(year, month, last, hours, minutes, 0, 0);

    case 'dayOfMonth': {
      const day = Math.min(Math.max(1, rule.day || 1), last);
      return new Date(year, month, day, hours, minutes, 0, 0);
    }

    case 'nthWeekday': {
      const matches = [];
      for (let day = 1; day <= last; day++) {
        const candidate = new Date(year, month, day, hours, minutes, 0, 0);
        if (candidate.getDay() + 1 === rule.weekday) matches.push(candidate);
      }
      if (!matches.length) return null;
      if (rule.ordinal < 0) return matches[matches.length - 1];
      return matches[rule.ordinal - 1] || matches[matches.length - 1];
    }

    case 'firstDay':
    default:
      return new Date(year, month, 1, hours, minutes, 0, 0);
  }
}

function nextWeekly(date, recurrence, interval) {
  const days = [...new Set(recurrence.weekdays || [])].sort((a, b) => a - b);
  if (!days.length) return addDays(date, 7 * interval);

  const current = date.getDay() + 1;
  const upcoming = days.find((day) => day > current);
  if (upcoming != null) return addDays(date, upcoming - current);

  return addDays(date, (7 - current) + days[0] + 7 * (interval - 1));
}

/** Próxima ocorrência depois de `after`, ou `null` se a regra já terminou. */
export function nextDate(after, recurrence) {
  if (!recurrence) return null;

  const from = new Date(after);
  if (Number.isNaN(from.getTime())) return null;

  const hours = from.getHours();
  const minutes = from.getMinutes();
  const interval = Math.max(1, Math.trunc(recurrence.interval) || 1);

  let candidate = null;

  switch (recurrence.frequency) {
    case 'daily':
      candidate = addDays(from, interval);
      break;

    case 'weekly':
      candidate = nextWeekly(from, recurrence, interval);
      break;

    case 'monthly': {
      const { year, month } = shiftMonth(from, interval);
      candidate = placeInMonth(year, month, recurrence.monthlyRule, hours, minutes);
      break;
    }

    case 'yearly': {
      const year = from.getFullYear() + interval;
      const month = Math.min(Math.max(1, recurrence.month || 1), 12) - 1;
      candidate = placeInMonth(year, month, recurrence.monthlyRule, hours, minutes);
      break;
    }
  }

  if (!candidate) return null;

  const done = recurrence.occurrenceCount || 0;
  if (recurrence.maxOccurrences != null && done >= recurrence.maxOccurrences) return null;
  if (recurrence.endDate && candidate > new Date(recurrence.endDate)) return null;

  return candidate;
}

/** As próximas `count` datas — usado na pré-visualização do editor. */
export function upcomingDates(from, recurrence, count) {
  const result = [];
  let cursor = new Date(from);
  let rule = { ...recurrence };

  for (let i = 0; i < count; i++) {
    const next = nextDate(cursor, rule);
    if (!next) break;
    result.push(next);
    cursor = next;
    rule = { ...rule, occurrenceCount: (rule.occurrenceCount || 0) + 1 };
  }
  return result;
}

/* ── Texto em português ──────────────────────────────────── */

export function monthlyRuleText(rule) {
  switch (rule?.kind) {
    case 'lastDay': return 'no último dia';
    case 'dayOfMonth': return `no dia ${rule.day}`;
    case 'nthWeekday': {
      const name = weekdayName(rule.weekday).toLowerCase();
      return rule.ordinal < 0 ? `na última ${name}` : `na ${rule.ordinal}ª ${name}`;
    }
    case 'firstDay':
    default: return 'no primeiro dia';
  }
}

export function recurrenceSummary(recurrence) {
  if (!recurrence) return 'Nunca';

  const n = Math.max(1, Math.trunc(recurrence.interval) || 1);
  const [one, many] = UNIT[recurrence.frequency] || UNIT.monthly;

  switch (recurrence.frequency) {
    case 'daily':
      return n === 1 ? 'Todo dia' : `A cada ${n} ${many}`;

    case 'weekly': {
      const prefix = n === 1 ? 'Toda semana' : `A cada ${n} ${many}`;
      const days = [...(recurrence.weekdays || [])].sort((a, b) => a - b);
      if (!days.length) return prefix;
      return `${prefix}, ${days.map((d) => weekdayName(d, true)).join(', ')}`;
    }

    case 'monthly': {
      const prefix = n === 1 ? 'Todo mês' : `A cada ${n} ${many}`;
      return `${prefix}, ${monthlyRuleText(recurrence.monthlyRule)}`;
    }

    case 'yearly': {
      const prefix = n === 1 ? 'Todo ano' : `A cada ${n} ${many}`;
      return `${prefix}, em ${monthName(recurrence.month)} ${monthlyRuleText(recurrence.monthlyRule)}`;
    }

    default:
      return `A cada ${n} ${n === 1 ? one : many}`;
  }
}
