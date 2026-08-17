export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatPoints(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPercentage(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function formatDate(value, includeTime = true) {
  if (!value) return 'Sem atualização';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(value));
}

export function toNumberInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  return Number(String(value).replace(',', '.'));
}

export function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
