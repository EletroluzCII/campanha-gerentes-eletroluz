import './styles.css';
import { icon } from './icons.js';
import {
  calculateDevelopmentScore,
  calculateScore,
  DISCOUNT_LIMITS,
  DISCOUNT_POINTS,
  EVIDENCE_RULES,
  PROFITABILITY_TARGETS,
  validateEvidenceFile,
  validateMetrics,
  validateSemesterDevelopment,
} from './scoring.js';
import { appService } from './services.js';
import {
  downloadCsv,
  escapeHtml,
  formatDate,
  formatPercentage,
  formatPoints,
  toNumberInput,
} from './utils.js';

const app = document.querySelector('#app');

const DEVELOPMENT_ITEMS = Object.freeze([
  { field: 'developmentBooks', evidenceField: 'developmentBooksEvidence', category: 'books', emoji: '📚', title: 'Livros', description: 'Foto do livro ou registro da leitura' },
  { field: 'developmentCourses', evidenceField: 'developmentCoursesEvidence', category: 'courses', emoji: '🎓', title: 'Cursos', description: 'Certificado, declaração ou registro do curso' },
  { field: 'developmentCertifications', evidenceField: 'developmentCertificationsEvidence', category: 'certifications', emoji: '🏅', title: 'Certificações', description: 'Arquivo ou imagem da certificação' },
  { field: 'developmentEvents', evidenceField: 'developmentEventsEvidence', category: 'events', emoji: '🎤', title: 'Eventos', description: 'Foto, ingresso ou comprovante de participação' },
]);

const CAMPAIGN_PERIODS = Object.freeze([
  ['2026-07-01', 'Julho'],
  ['2026-08-01', 'Agosto'],
  ['2026-09-01', 'Setembro'],
  ['2026-10-01', 'Outubro'],
  ['2026-11-01', 'Novembro'],
  ['2026-12-01', 'Dezembro'],
]);
const TOTAL_PERIOD = 'total';
const defaultCampaignPeriod = () => {
  const month = new Date().getMonth() + 1;
  const clamped = Math.min(12, Math.max(7, month));
  return `2026-${String(clamped).padStart(2, '0')}-01`;
};
const profitabilityTargetForBranch = (branchName) => ({
  'Exceleds Iluminação': PROFITABILITY_TARGETS.exceleds,
  'FOCO Distribuidora': PROFITABILITY_TARGETS.foco,
}[branchName] || null);
const isProfitabilityBranch = () => profitabilityTargetForBranch(state.profile?.display_name) !== null;
const isTotalPeriod = () => state.selectedPeriod === TOTAL_PERIOD;
const selectedPeriodDate = () => isTotalPeriod() ? null : state.selectedPeriod;
const selectedPeriodLabel = () => isTotalPeriod()
  ? 'Total'
  : CAMPAIGN_PERIODS.find(([value]) => value === state.selectedPeriod)?.[1] || 'Período';
const selectedPeriodName = (period) => CAMPAIGN_PERIODS.find(([value]) => value === period)?.[1] || '—';

const emptyMetrics = () => ({
  obzPercentage: '',
  revenuePercentage: '',
  profitabilityPercentage: '',
  metricKind: 'discount',
  profitabilityTarget: null,
  discountUnder500Percentage: '',
  discount501To2000Percentage: '',
});

const emptySemesterDevelopment = () => ({
  developmentBooks: false,
  developmentBooksEvidence: false,
  developmentCourses: false,
  developmentCoursesEvidence: false,
  developmentCertifications: false,
  developmentCertificationsEvidence: false,
  developmentEvents: false,
  developmentEventsEvidence: false,
});

const emptyEvidenceFiles = () => Object.fromEntries(
  DEVELOPMENT_ITEMS.map((item) => [item.field, null]),
);

const state = {
  profile: null,
  view: 'dashboard',
  ranking: [],
  history: [],
  adminLatest: [],
  branches: [],
  metrics: emptyMetrics(),
  semesterDevelopment: emptySemesterDevelopment(),
  semesterEvidenceFiles: emptyEvidenceFiles(),
  existingSemesterEvidence: [],
  adminSemesterDevelopment: [],
  selectedPeriod: defaultCampaignPeriod(),
  errors: {},
  loading: false,
  modalOpen: false,
  evidenceModal: null,
  submitting: false,
  toast: null,
  historyFilters: { branchId: '', dateFrom: '', dateTo: '' },
};

const roleLabel = () => state.profile?.role === 'admin' ? 'Administrador' : 'Gerente de filial';

const formatFileSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
};

const evidenceCategoryLabel = (category) => {
  const item = DEVELOPMENT_ITEMS.find((entry) => entry.category === category);
  return item
    ? `<span aria-hidden="true">${item.emoji}</span> ${escapeHtml(item.title)}`
    : escapeHtml(category);
};

function renderBoot() {
  app.innerHTML = `
    <main class="boot-screen" id="main-content">
      <img class="boot-logo" src="./logo-eletroluz.png" alt="Eletroluz" />
      <div class="spinner" aria-label="Carregando"></div>
      <p>Preparando seu painel...</p>
    </main>`;
}

function renderLogin(message = '') {
  const configWarning = !appService.isConfigured
    ? `<div class="setup-notice" role="status">
        ${icon('alert', 18)}
        <div><strong>Configuração necessária</strong><span>Adicione as chaves públicas do Supabase no arquivo <code>.env</code> para habilitar o login.</span></div>
      </div>`
    : '';
  const demoLinks = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? `<div class="demo-links"><span>Visualização local:</span><a href="?demo=manager">Gerente</a><a href="?demo=admin">Administrador</a></div>`
    : '';

  app.innerHTML = `
    <main class="login-layout" id="main-content">
      <section class="login-brand" aria-label="Campanha de desempenho Eletroluz">
        <div class="brand-content">
          <img src="./logo-eletroluz.png" alt="Eletroluz" class="login-logo" />
          <span class="brand-kicker">Campanha de desempenho 2026</span>
          <h1>Resultados que iluminam o nosso caminho.</h1>
          <p>Acompanhe suas métricas, registre a evolução da filial e veja o desempenho de toda a equipe.</p>
          <div class="brand-feature">${icon('trophy', 22)}<span><strong>100 pontos</strong> distribuídos em quatro indicadores estratégicos.</span></div>
        </div>
        <div class="brand-pattern" aria-hidden="true"></div>
      </section>
      <section class="login-panel">
        <form class="login-card" id="login-form" novalidate>
          <div class="mobile-brand"><img src="./logo-eletroluz.png" alt="Eletroluz" /></div>
          <div class="login-heading">
            <span class="eyebrow">Acesso restrito</span>
            <h2>Bem-vindo</h2>
            <p>Entre com o acesso fornecido para a sua filial.</p>
          </div>
          ${configWarning}
          <div class="field-group">
            <label for="username">Usuário da filial</label>
            <div class="input-wrap">${icon('users', 19)}<input id="username" name="username" autocomplete="username" required placeholder="Ex.: matriz_maringa" /></div>
          </div>
          <div class="field-group">
            <label for="password">Senha</label>
            <div class="input-wrap">${icon('key', 19)}<input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Digite sua senha" /><button class="password-toggle" type="button" aria-label="Mostrar senha" data-action="toggle-password">${icon('eye', 19)}</button></div>
          </div>
          <div class="form-message ${message ? 'is-visible' : ''}" id="login-message" role="alert">${escapeHtml(message)}</div>
          <button class="button button-primary button-wide" type="submit" ${!appService.isConfigured ? 'disabled' : ''}>Entrar no painel</button>
          ${demoLinks}
          <p class="login-help">Problemas com o acesso? Procure o administrador da campanha.</p>
        </form>
      </section>
    </main>`;

  document.querySelector('#username')?.focus();
}

function navItem(view, label, iconName) {
  const active = state.view === view;
  return `<button class="nav-item ${active ? 'is-active' : ''}" data-view="${view}" ${active ? 'aria-current="page"' : ''}>${icon(iconName, 20)}<span>${label}</span></button>`;
}

function renderShell() {
  const isAdmin = state.profile.role === 'admin';
  app.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand"><img src="./logo-eletroluz.png" alt="Eletroluz" /></div>
        <nav class="main-nav" aria-label="Navegação principal">
          <span class="nav-label">Principal</span>
          ${navItem('dashboard', isAdmin ? 'Visão geral' : 'Meu desempenho', 'chart')}
          ${navItem('history', 'Histórico', 'history')}
          <span class="nav-label">Conta</span>
          ${navItem('password', 'Alterar senha', 'key')}
        </nav>
        <div class="sidebar-user">
          <div class="avatar">${escapeHtml(state.profile.display_name.charAt(0))}</div>
          <div><strong>${escapeHtml(state.profile.display_name)}</strong><span>${roleLabel()}</span></div>
          <button class="icon-button" data-action="logout" aria-label="Sair">${icon('logout', 19)}</button>
        </div>
      </aside>
      <div class="app-main">
        <header class="topbar">
          <button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu" aria-controls="sidebar">${icon('menu', 22)}</button>
          <div class="topbar-title"><span>${isAdmin ? 'Administração' : 'Campanha de gerentes'}</span><strong>${escapeHtml(state.profile.display_name)}</strong></div>
          <button class="button button-ghost topbar-logout" data-action="logout">${icon('logout', 18)} Sair</button>
        </header>
        <main class="content" id="main-content"></main>
      </div>
      <div class="sidebar-backdrop" data-action="close-menu"></div>
      <div id="modal-root"></div>
      <div id="toast-root"></div>
    </div>`;
  renderCurrentView();
}

function renderCurrentView() {
  const content = document.querySelector('#main-content');
  if (!content) return;
  if (state.view === 'history') renderHistory(content);
  else if (state.view === 'password') renderPassword(content);
  else if (state.profile.role === 'admin') renderAdminDashboard(content);
  else renderManagerDashboard(content);
  renderToast();
}

function latestOwnRanking() {
  return state.ranking.find((entry) => entry.branch_id === state.profile.branch_id) || null;
}

function pageHeading(kicker, title, description, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function dashboardBanner() {
  return `<figure class="campaign-banner"><img src="./banner-campanha.jpg" alt="Campanha de premiação Imersão EUA — segundo semestre" /></figure>`;
}

function periodControl() {
  return `<div class="period-control field-group"><label for="campaignPeriod">Período</label><select id="campaignPeriod" name="campaignPeriod" aria-label="Período das métricas"><option value="${TOTAL_PERIOD}" ${isTotalPeriod() ? 'selected' : ''}>Total</option>${CAMPAIGN_PERIODS.map(([value, label]) => `<option value="${value}" ${state.selectedPeriod === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}

function summaryCard(label, value, detail, iconName, tone = '') {
  return `<article class="summary-card ${tone}"><div class="summary-icon">${icon(iconName, 21)}</div><div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div></article>`;
}

function renderManagerDashboard(content) {
  const own = latestOwnRanking();
  const score = own?.total_points ?? null;
  const position = own?.rank_position ?? '—';
  const completed = state.ranking.filter((entry) => entry.total_points !== null).length;
  const scoreText = score === null ? 'Sem dados' : `${formatPoints(score)} pts`;
  const progress = score === null ? 0 : Math.min(100, Number(score));

  content.innerHTML = `
    ${dashboardBanner()}
    ${pageHeading('Meu painel', `Olá, ${escapeHtml(state.profile.display_name)}`, isTotalPeriod() ? 'Consulte a média dos meses preenchidos e acompanhe sua posição na campanha.' : `Preencha ou corrija as métricas de ${selectedPeriodLabel().toLowerCase()} e acompanhe sua evolução.`)}
    ${appService.isDemo ? '<div class="demo-banner" role="status">Modo de demonstração local — nenhum dado real será gravado.</div>' : ''}
    <section class="manager-hero" aria-label="Resumo do desempenho">
      <div class="score-overview">
        <span>${isTotalPeriod() ? 'Sua média atual' : 'Sua pontuação do mês (até 95)'}</span><strong>${scoreText}</strong>
        <div class="progress-track" aria-label="${progress}% da pontuação máxima"><span style="width:${progress}%"></span></div>
        <small>${own?.updated_at ? `${isTotalPeriod() ? `${own.periods_count} meses preenchidos · ` : ''}Atualizado em ${formatDate(own.updated_at)}` : 'Envie suas primeiras métricas para entrar no ranking.'}</small>
      </div>
      <div class="hero-position"><span>Posição</span><strong>${position === '—' ? '—' : `${position}º`}</strong><small>entre 12 filiais participantes</small></div>
      <div class="hero-mark" aria-hidden="true">${icon('trophy', 120)}</div>
    </section>
    <section class="summary-grid" aria-label="Resumo da campanha">
      ${summaryCard('Resultado final', '100 pts', '95 mensais + 5 semestrais', 'target')}
      ${summaryCard('Filiais com dados', `${completed} de 12`, `${12 - completed} ainda sem envio em ${selectedPeriodLabel().toLowerCase()}`, 'users')}
      ${summaryCard('Última atualização', own?.updated_at ? formatDate(own.updated_at, false) : '—', own?.updated_at ? formatDate(own.updated_at).split(' ')[1] || '' : 'Nenhum envio', 'history')}
    </section>
    ${renderMetricsForm()}
    ${renderSemesterDevelopment()}
    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">Classificação</span><h2>Ranking das filiais</h2><p>${isTotalPeriod() ? 'O ranking considera a média mensal e acrescenta o Desenvolvimento Pessoal uma única vez.' : `O ranking considera os resultados operacionais de ${selectedPeriodLabel().toLowerCase()}, até 95 pontos.`}</p></div><button class="button button-secondary" data-action="refresh-ranking">${icon('refresh', 18)} Atualizar</button></div>
      ${renderRankingTable()}
    </section>`;
}

function scoreBadge(points, max, status = '') {
  return `<div class="points-preview"><div><span>Pontos calculados</span><strong>${formatPoints(points)} <small>/ ${max}</small></strong></div>${status ? `<span class="status-pill">${status}</span>` : ''}</div>`;
}

function fieldError(name) {
  return `<span class="field-error" id="${name}-error" role="alert">${escapeHtml(state.errors[name] || '')}</span>`;
}

const hasMetricValue = (value) => value !== '' && value !== null && value !== undefined;

function discountStatus(values = state.metrics) {
  const under500Ready = hasMetricValue(values.discountUnder500Percentage);
  const from501Ready = hasMetricValue(values.discount501To2000Percentage);
  if (!under500Ready && !from501Ready) return 'Aguardando valores';
  const under500Reached = under500Ready && Number(values.discountUnder500Percentage) <= DISCOUNT_LIMITS.under500;
  const from501Reached = from501Ready && Number(values.discount501To2000Percentage) <= DISCOUNT_LIMITS.from501To2000;
  if (under500Reached && from501Reached) return 'Metas atingidas';
  if (!under500Reached && !from501Reached && under500Ready && from501Ready) return 'Metas não atingidas';
  return 'Uma meta atingida';
}

function discountBreakdown(score) {
  return `<small class="rule-note" id="discount-breakdown">Até R$ 500: ${formatPoints(score.discountUnder500Points)} / ${DISCOUNT_POINTS.under500} pts · R$ 501 a R$ 2.000: ${formatPoints(score.discount501To2000Points)} / ${DISCOUNT_POINTS.from501To2000} pts</small>`;
}

function profitabilityStatus(values = state.metrics) {
  if (!hasMetricValue(values.profitabilityPercentage)) return 'Aguardando valor';
  const target = Number(values.profitabilityTarget || 100);
  if (Number(values.profitabilityPercentage) < target * 0.95) return 'Abaixo do mínimo';
  return Number(values.profitabilityPercentage) >= target ? 'Meta atingida' : 'Em andamento';
}

function renderMetricsForm() {
  if (isTotalPeriod()) {
    const own = latestOwnRanking();
    return `<section class="section-block metrics-section">
      <div class="section-heading"><div><span class="eyebrow">Visão consolidada</span><h2>Média das métricas</h2><p>Selecione um mês no filtro para preencher ou corrigir os dados da filial.</p></div><div class="period-total-actions">${periodControl()}<div class="total-chip"><span>Resultado Total</span><strong>${own?.total_points === null || !own ? 'Sem dados' : `${formatPoints(own.total_points)} pts`}</strong></div></div></div>
      <div class="period-readonly" role="status">${icon('chart', 22)}<div><strong>Média mensal + Desenvolvimento semestral</strong><span>A opção Total considera somente os ${own?.periods_count || 0} meses preenchidos (até 95 pontos) e acrescenta os ${formatPoints(calculateDevelopmentScore(state.semesterDevelopment).developmentPoints)} pontos de Desenvolvimento Pessoal uma única vez.</span></div></div>
    </section>`;
  }

  const score = calculateScore(state.metrics);
  const isProfitability = state.metrics.metricKind === 'profitability';
  const indicatorStatus = isProfitability
    ? profitabilityStatus()
    : discountStatus();
  return `<section class="section-block metrics-section">
    <div class="section-heading"><div><span class="eyebrow">${state.metrics.obzPercentage !== '' ? 'Lançamento mensal' : 'Novo lançamento'}</span><h2>Atualize suas métricas</h2><p>Dados de ${selectedPeriodLabel().toLowerCase()}. Um novo salvamento corrige este mesmo mês.</p></div><div class="period-total-actions">${periodControl()}<div class="total-chip"><span>Total previsto do mês</span><strong id="form-total">${formatPoints(score.totalPoints)} / 95 pts</strong></div></div></div>
    <form id="metrics-form" novalidate>
      <div class="metrics-grid">
        <article class="metric-card">
          <div class="metric-head"><span class="metric-icon">${icon('target', 22)}</span><div><span>Indicador 1</span><h3>OBZ — Atingimento orçamentário</h3></div><span class="weight">20%</span></div>
          <p>Meta de 100%, com elegibilidade mínima de 95%.</p>
          <div class="field-group"><label for="obzPercentage">Atingimento do orçamento (%)</label><div class="input-suffix"><input type="number" id="obzPercentage" name="obzPercentage" min="0" max="999.99" step="0.01" value="${state.metrics.obzPercentage}" placeholder="Ex.: 97,5" aria-describedby="obzPercentage-help obzPercentage-error" /><span>%</span></div><small id="obzPercentage-help">Abaixo de 95% não gera pontuação.</small>${fieldError('obzPercentage')}</div>
          <div id="obz-score">${scoreBadge(score.obzPoints, 20, Number(state.metrics.obzPercentage) >= 95 ? 'Elegível' : 'Abaixo do mínimo')}</div>
        </article>
        <article class="metric-card">
          <div class="metric-head"><span class="metric-icon">${icon('growth', 22)}</span><div><span>Indicador 2</span><h3>Faturamento orçado</h3></div><span class="weight">40%</span></div>
          <p>Avalia a receita alcançada em relação à meta do período.</p>
          <div class="field-group"><label for="revenuePercentage">Atingimento da meta (%)</label><div class="input-suffix"><input type="number" id="revenuePercentage" name="revenuePercentage" min="0" max="999.99" step="0.01" value="${state.metrics.revenuePercentage}" placeholder="Ex.: 98,5" aria-describedby="revenuePercentage-help revenuePercentage-error" /><span>%</span></div><small id="revenuePercentage-help">A pontuação máxima é atingida em 100%.</small>${fieldError('revenuePercentage')}</div>
          <div id="revenue-score">${scoreBadge(score.revenuePoints, 40, Number(state.metrics.revenuePercentage) >= 100 ? 'Meta atingida' : 'Em andamento')}</div>
        </article>
        <article class="metric-card">
          <div class="metric-head"><span class="metric-icon">${icon(isProfitability ? 'growth' : 'tag', 22)}</span><div><span>Indicador 3</span><h3>${isProfitability ? 'Rentabilidade' : 'Controle de descontos'}</h3></div><span class="weight">35%</span></div>
          ${isProfitability ? `<p>Avalia a rentabilidade alcançada no mês em relação à meta da filial.</p><div class="field-group"><label for="profitabilityPercentage">Rentabilidade (%)</label><div class="input-suffix"><input type="number" id="profitabilityPercentage" name="profitabilityPercentage" min="0" max="999.99" step="0.01" value="${state.metrics.profitabilityPercentage}" placeholder="Ex.: 68,5" aria-describedby="profitabilityPercentage-help profitabilityPercentage-error" /><span>%</span></div><small id="profitabilityPercentage-help">Meta: ${formatPercentage(state.metrics.profitabilityTarget)} · abaixo de ${formatPercentage(state.metrics.profitabilityTarget * 0.95)} não pontua. A pontuação é proporcional até a meta.</small>${fieldError('profitabilityPercentage')}</div>` : `<p>Informe o desconto aplicado em cada faixa. As metas são avaliadas de forma independente.</p><div class="two-fields"><div class="field-group"><label for="discountUnder500Percentage">Até R$ 500 · desconto (%)</label><div class="input-suffix"><input type="number" id="discountUnder500Percentage" name="discountUnder500Percentage" min="0" max="999.99" step="0.01" value="${state.metrics.discountUnder500Percentage}" placeholder="Ex.: 10,8" aria-describedby="discountUnder500Percentage-help discountUnder500Percentage-error" /><span>%</span></div><small id="discountUnder500Percentage-help">Meta: até ${formatPercentage(DISCOUNT_LIMITS.under500)} · vale ${DISCOUNT_POINTS.under500} pts.</small>${fieldError('discountUnder500Percentage')}</div><div class="field-group"><label for="discount501To2000Percentage">R$ 501 a R$ 2.000 · desconto (%)</label><div class="input-suffix"><input type="number" id="discount501To2000Percentage" name="discount501To2000Percentage" min="0" max="999.99" step="0.01" value="${state.metrics.discount501To2000Percentage}" placeholder="Ex.: 18,4" aria-describedby="discount501To2000Percentage-help discount501To2000Percentage-error" /><span>%</span></div><small id="discount501To2000Percentage-help">Meta: até ${formatPercentage(DISCOUNT_LIMITS.from501To2000)} · vale ${DISCOUNT_POINTS.from501To2000} pts.</small>${fieldError('discount501To2000Percentage')}</div></div>${discountBreakdown(score)}`}
          <div id="indicator-score">${scoreBadge(score.indicatorPoints, 35, indicatorStatus)}</div>
        </article>
      </div>
      <div class="form-submit-bar"><div><span>Pontuação prevista do mês</span><strong id="submit-total">${formatPoints(score.totalPoints)} <small>/ 95 pts</small></strong></div><button class="button button-primary" type="submit">${icon('save', 18)} ${state.metrics.obzPercentage !== '' ? 'Revisar e atualizar' : 'Revisar e salvar'}</button></div>
    </form>
  </section>`;
}

function renderSemesterDevelopment() {
  const score = calculateDevelopmentScore(state.semesterDevelopment);
  return `<section class="section-block semester-development-section">
    <div class="section-heading"><div><span class="eyebrow">Indicador semestral · Julho a Dezembro</span><h2>Desenvolvimento pessoal</h2><p>Esta pontuação é registrada uma única vez para todo o semestre e entra integralmente no resultado Total. Ela não se repete em cada mês.</p></div><div class="total-chip semester-chip"><span>Pontuação semestral</span><strong id="semester-total">${formatPoints(score.developmentPoints)} / 5 pts</strong></div></div>
    <form id="semester-development-form" novalidate>
      <div class="semester-notice" role="status">${icon('history', 20)}<span>Complete até três iniciativas comprovadas. Você pode revisar este mesmo registro durante o semestre.</span></div>
      <fieldset class="check-grid"><legend class="sr-only">Iniciativas semestrais concluídas</legend>${DEVELOPMENT_ITEMS.map(semesterDevelopmentCheck).join('')}</fieldset>
      <div class="form-submit-bar"><div><span>Iniciativas comprovadas</span><strong id="semester-initiatives">${score.initiatives} <small>de 3 para a pontuação máxima</small></strong></div><button class="button button-primary" type="submit">${icon('save', 18)} ${state.existingSemesterEvidence.length ? 'Revisar e atualizar' : 'Salvar desenvolvimento semestral'}</button></div>
    </form>
  </section>`;
}

function semesterDevelopmentCheck(item) {
  const selected = state.semesterDevelopment[item.field];
  const file = state.semesterEvidenceFiles[item.field];
  const existingFile = state.existingSemesterEvidence.find((entry) => entry.category === item.category);
  const evidenceLabel = file || existingFile;
  const inputId = `semester-evidence-${item.category}`;
  const accept = EVIDENCE_RULES.acceptedTypes.join(',');
  return `<div class="development-option ${selected ? 'is-selected' : ''} ${evidenceLabel ? 'has-file' : ''}">
    <label class="check-option"><input type="checkbox" name="${item.field}" ${selected ? 'checked' : ''} /><span class="custom-check">${icon('check', 15)}</span><span><strong><span class="development-emoji" aria-hidden="true">${item.emoji}</span> ${item.title}</strong><small>${item.description}</small></span></label>
    ${selected ? `<div class="evidence-upload">
      <div class="evidence-heading"><span>Comprovante obrigatório</span><small>${file ? 'Arquivo pronto para envio' : existingFile ? 'Comprovante já salvo' : 'Ainda não anexado'}</small></div>
      <input class="evidence-input" type="file" id="${inputId}" data-semester-evidence-for="${item.field}" accept="${accept}" aria-describedby="${item.evidenceField}-help ${item.evidenceField}-error" />
      <label class="evidence-picker" for="${inputId}">${icon('download', 17)} ${evidenceLabel ? 'Substituir arquivo' : 'Selecionar arquivo'}</label>
      <small id="${item.evidenceField}-help" class="evidence-help">JPG, PNG, WebP ou PDF · máximo 10 MB</small>
      ${evidenceLabel ? `<div class="selected-file"><span class="file-mark">${evidenceLabel.mime_type === 'application/pdf' || evidenceLabel.type === 'application/pdf' ? 'PDF' : 'IMG'}</span><span><strong>${escapeHtml(evidenceLabel.original_name || evidenceLabel.name)}</strong><small>${file ? formatFileSize(file.size) : 'Comprovante salvo'}</small></span><button type="button" class="icon-button remove-file" data-action="remove-semester-evidence" data-evidence-for="${item.field}" aria-label="Remover comprovante de ${item.title}">${icon('close', 18)}</button></div>` : ''}
      ${fieldError(item.evidenceField)}
    </div>` : ''}
  </div>`;
}

function rankMedal(position) {
  if (position === 1) return '<span class="rank-badge rank-1">1</span>';
  if (position === 2) return '<span class="rank-badge rank-2">2</span>';
  if (position === 3) return '<span class="rank-badge rank-3">3</span>';
  return `<span class="rank-number">${position || '—'}</span>`;
}

function renderRankingTable() {
  if (!state.ranking.length) return renderEmpty('trophy', 'Ranking ainda não disponível', 'Os resultados aparecerão assim que houver lançamentos.');
  return `<div class="table-card"><div class="table-scroll"><table class="data-table ranking-table"><thead><tr><th>Posição</th><th>Filial</th><th>Pontuação</th><th>Desempenho</th><th>Última atualização</th></tr></thead><tbody>${state.ranking.map((entry) => {
    const isMe = entry.branch_id === state.profile.branch_id;
    const hasData = entry.total_points !== null;
    return `<tr class="${isMe ? 'is-me' : ''} ${!hasData ? 'no-data' : ''}"><td data-label="Posição">${rankMedal(entry.rank_position)}</td><td data-label="Filial"><div class="branch-cell"><strong>${escapeHtml(entry.branch_name)}</strong>${isMe ? '<span>Você</span>' : ''}</div></td><td data-label="Pontuação"><strong>${hasData ? `${formatPoints(entry.total_points)} pts` : 'Sem dados'}</strong></td><td data-label="Desempenho"><div class="mini-progress"><span style="width:${hasData ? Math.min(100, Number(entry.total_points)) : 0}%"></span></div><small>${hasData ? formatPercentage(entry.total_points) : '—'}</small></td><td data-label="Última atualização">${formatDate(entry.updated_at)}</td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

function renderAdminDashboard(content) {
  const completed = state.ranking.filter((entry) => entry.total_points !== null);
  const leader = completed[0];
  const average = completed.length ? completed.reduce((sum, item) => sum + Number(item.total_points), 0) / completed.length : 0;
  content.innerHTML = `
    ${dashboardBanner()}
    ${pageHeading('Painel administrativo', 'Visão geral da campanha', isTotalPeriod() ? 'Acompanhe a média dos meses preenchidos, compare resultados e consulte os indicadores.' : `Acompanhe os resultados de ${selectedPeriodLabel().toLowerCase()}, compare filiais e consulte os indicadores.`, `<div class="heading-actions">${periodControl()}<button class="button button-secondary" data-action="refresh-admin">${icon('refresh', 18)} Atualizar dados</button></div>`)}
    ${appService.isDemo ? '<div class="demo-banner" role="status">Modo de demonstração local — dados ilustrativos.</div>' : ''}
    <section class="summary-grid admin-summary">
      ${summaryCard('Filiais participantes', `${completed.length} de 12`, `${12 - completed.length} aguardando envio em ${selectedPeriodLabel().toLowerCase()}`, 'users', 'blue')}
      ${summaryCard('Líder atual', leader ? escapeHtml(leader.branch_name) : 'Sem dados', leader ? `${formatPoints(leader.total_points)} pontos` : 'Nenhum lançamento', 'trophy', 'red')}
      ${summaryCard('Média geral', `${formatPoints(average)} pts`, 'Entre filiais com dados', 'chart')}
      ${summaryCard('Última atualização', leader?.updated_at ? formatDate(leader.updated_at, false) : '—', leader?.updated_at ? `às ${formatDate(leader.updated_at).split(' ')[1]}` : 'Nenhum lançamento', 'history')}
    </section>
    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">Classificação</span><h2>Ranking geral</h2><p>${isTotalPeriod() ? 'Posições calculadas pela média dos meses preenchidos.' : `Posições calculadas pelos dados de ${selectedPeriodLabel().toLowerCase()}.`}</p></div></div>
      ${renderRankingTable()}
    </section>
    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">Indicadores</span><h2>${isTotalPeriod() ? 'Médias por filial' : 'Métricas por filial'}</h2><p>Visão detalhada disponível somente para administradores.</p></div><button class="button button-secondary" data-action="export-latest">${icon('download', 18)} Exportar CSV</button></div>
      ${renderAdminLatestTable()}
    </section>
    <section class="section-block semester-development-section">
      <div class="section-heading"><div><span class="eyebrow">Indicador semestral · Julho a Dezembro</span><h2>Desenvolvimento pessoal</h2><p>Vale até 5 pontos uma única vez no resultado Total; não é repetido nos meses.</p></div></div>
      ${renderAdminSemesterDevelopmentTable()}
    </section>`;
}

function renderAdminLatestTable() {
  if (!state.adminLatest.length) return renderEmpty('chart', 'Nenhuma métrica enviada', 'As métricas detalhadas aparecerão após o primeiro lançamento.');
  return `<div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Filial</th><th>OBZ</th><th>Faturamento</th><th>Indicador 35%</th><th>Desenvolvimento</th><th>Total</th></tr></thead><tbody>${state.adminLatest.map((row) => {
    const profitability = row.metric_kind === 'profitability';
    const profitabilityTarget = profitabilityTargetForBranch(row.branch_name);
    const indicator = profitability
      ? `${formatPercentage(row.profitability_percentage)} <small>Rentabilidade · meta ${formatPercentage(profitabilityTarget)}</small>`
      : `<strong>Até R$ 500: ${formatPercentage(row.discount_under_500_percentage)}</strong><small>${formatPoints(row.discount_under_500_points)} / ${DISCOUNT_POINTS.under500} pts</small><br /><strong>R$ 501 a R$ 2.000: ${formatPercentage(row.discount_501_to_2000_percentage)}</strong><small>${formatPoints(row.discount_501_to_2000_points)} / ${DISCOUNT_POINTS.from501To2000} pts</small>`;
    return `<tr><td data-label="Filial"><strong>${escapeHtml(row.branch_name)}</strong></td><td data-label="OBZ">${formatPercentage(row.obz_percentage)}</td><td data-label="Faturamento">${formatPercentage(row.revenue_percentage)}</td><td data-label="${profitability ? 'Rentabilidade' : 'Desconto'}">${indicator}</td><td data-label="Desenvolvimento semestral">${isTotalPeriod() ? `${formatPoints(row.development_points)} / 5` : 'Ver quadro semestral'}</td><td data-label="Total"><strong class="score-text">${formatPoints(row.total_points)} pts</strong><small>${isTotalPeriod() ? `${row.periods_count} meses` : '/ 95 pts'}</small></td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

function renderAdminSemesterDevelopmentTable() {
  if (!state.adminSemesterDevelopment.length) return renderEmpty('book', 'Nenhum desenvolvimento registrado', 'Os comprovantes semestrais aparecerão aqui após o primeiro envio.');
  return `<div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Filial</th><th>Iniciativas</th><th>Pontos semestrais</th><th>Comprovantes</th><th>Atualizado em</th></tr></thead><tbody>${state.adminSemesterDevelopment.map((row) => {
    const hasData = row.development_points !== null;
    return `<tr><td data-label="Filial"><strong>${escapeHtml(row.branch_name)}</strong></td><td data-label="Iniciativas">${hasData ? `${row.initiatives} comprovadas` : 'Sem envio'}</td><td data-label="Pontos semestrais"><strong class="score-text">${hasData ? `${formatPoints(row.development_points)} / 5` : '—'}</strong></td><td data-label="Comprovantes">${row.evidence_count ? `<button type="button" class="button button-table" data-action="view-semester-evidence" data-development-id="${row.development_id}">${icon('eye', 16)} Ver ${row.evidence_count}</button>` : '<span class="muted-text">Nenhum</span>'}</td><td data-label="Atualizado em">${formatDate(row.updated_at)}</td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

function renderHistory(content) {
  const isAdmin = state.profile.role === 'admin';
  const filters = isAdmin ? `<form class="filter-bar" id="history-filter"><div class="field-group"><label for="historyBranch">Filial</label><select id="historyBranch" name="branchId"><option value="">Todas as filiais</option>${state.branches.map((branch) => `<option value="${branch.id}" ${state.historyFilters.branchId === branch.id ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`).join('')}</select></div><div class="field-group"><label for="dateFrom">De</label><input id="dateFrom" name="dateFrom" type="date" value="${state.historyFilters.dateFrom}" /></div><div class="field-group"><label for="dateTo">Até</label><input id="dateTo" name="dateTo" type="date" value="${state.historyFilters.dateTo}" /></div><button class="button button-secondary" type="submit">Aplicar filtros</button></form>` : '';
  content.innerHTML = `
    ${pageHeading('Auditoria', isAdmin ? 'Histórico da campanha' : 'Meu histórico', isAdmin ? 'Consulte todos os lançamentos preservados por filial e período.' : 'Veja a evolução dos lançamentos feitos pela sua filial.', `<button class="button button-secondary" data-action="export-history">${icon('download', 18)} Exportar CSV</button>`)}
    <section class="section-block history-section">${filters}${renderHistoryTable()}</section>`;
}

function renderHistoryTable() {
  if (!state.history.length) return renderEmpty('history', 'Nenhum lançamento encontrado', 'Quando houver envios dentro do filtro escolhido, eles aparecerão aqui.');
  return `<div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr>${state.profile.role === 'admin' ? '<th>Filial</th>' : ''}<th>Período</th><th>Atualizado em</th><th>OBZ</th><th>Faturamento</th><th>Indicador 35%</th><th>Desenvolvimento</th><th>Comprovantes</th><th>Total</th></tr></thead><tbody>${state.history.map((row) => {
    const evidenceCount = Number(row.evidence_count || 0);
    const profitability = row.metric_kind === 'profitability';
    const profitabilityTarget = profitabilityTargetForBranch(row.branch_name || state.profile.display_name);
    const indicator = profitability
      ? `${formatPercentage(row.profitability_percentage)} <small>${formatPoints(row.profitability_points)} pts · Rentabilidade · meta ${formatPercentage(profitabilityTarget)}</small>`
      : `Até R$ 500: ${formatPercentage(row.discount_under_500_percentage)} <small>${formatPoints(row.discount_under_500_points)} / ${DISCOUNT_POINTS.under500} pts</small><br />R$ 501 a R$ 2.000: ${formatPercentage(row.discount_501_to_2000_percentage)} <small>${formatPoints(row.discount_501_to_2000_points)} / ${DISCOUNT_POINTS.from501To2000} pts</small>`;
    return `<tr>${state.profile.role === 'admin' ? `<td data-label="Filial"><strong>${escapeHtml(row.branch_name)}</strong></td>` : ''}<td data-label="Período">${row.metric_period ? selectedPeriodName(row.metric_period) : '—'}</td><td data-label="Atualizado em">${formatDate(row.created_at)}</td><td data-label="OBZ">${formatPercentage(row.obz_percentage)} <small>${formatPoints(row.obz_points)} pts</small></td><td data-label="Faturamento">${formatPercentage(row.revenue_percentage)} <small>${formatPoints(row.revenue_points)} pts</small></td><td data-label="${profitability ? 'Rentabilidade' : 'Desconto'}">${indicator}</td><td data-label="Desenvolvimento">${formatPoints(row.development_points)} pts</td><td data-label="Comprovantes">${evidenceCount ? `<button type="button" class="button button-table" data-action="view-evidence" data-submission-id="${row.id}">${icon('eye', 16)} Ver ${evidenceCount}</button>` : '<span class="muted-text">Nenhum</span>'}</td><td data-label="Total"><strong class="score-text">${formatPoints(row.total_points)} pts</strong></td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

function renderPassword(content) {
  content.innerHTML = `
    ${pageHeading('Segurança', 'Alterar minha senha', 'Use uma senha exclusiva, longa e difícil de adivinhar.')}
    <section class="password-page"><form class="password-card" id="password-form" novalidate>
      <div class="security-mark">${icon('key', 26)}</div><h2>Nova senha</h2><p>A senha deve ter ao menos 12 caracteres, incluindo letras, número e símbolo.</p>
      <div class="field-group"><label for="newPassword">Nova senha</label><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" required /></div>
      <div class="field-group"><label for="confirmPassword">Confirmar nova senha</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required /></div>
      <div class="form-message" id="password-message" role="alert"></div>
      <button class="button button-primary" type="submit">Atualizar senha</button>
    </form></section>`;
}

function renderEmpty(iconName, title, description) {
  return `<div class="empty-state">${icon(iconName, 30)}<strong>${title}</strong><p>${description}</p></div>`;
}

function renderConfirmModal() {
  const root = document.querySelector('#modal-root');
  if (!root) return;
  if (state.evidenceModal) {
    const modal = state.evidenceModal;
    const body = modal.loading
      ? '<div class="evidence-modal-loading"><div class="spinner"></div><span>Carregando comprovantes...</span></div>'
      : modal.error
        ? `<div class="empty-state compact">${icon('alert', 26)}<strong>Não foi possível abrir</strong><p>${escapeHtml(modal.error)}</p></div>`
        : modal.items.length
          ? `<div class="evidence-list">${modal.items.map((item) => `<article class="evidence-list-item"><span class="file-mark">${item.mime_type === 'application/pdf' ? 'PDF' : 'IMG'}</span><div><strong>${evidenceCategoryLabel(item.category)}</strong><span>${escapeHtml(item.original_name)}</span><small>${formatFileSize(item.size_bytes)}</small></div>${item.signed_url ? `<a class="button button-secondary" href="${escapeHtml(item.signed_url)}" target="_blank" rel="noopener noreferrer">${icon('eye', 16)} Abrir</a>` : '<span class="file-unavailable">Indisponível</span>'}</article>`).join('')}</div>`
          : renderEmpty('history', 'Nenhum comprovante', 'Este lançamento não possui arquivos vinculados.');
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-modal-title" data-modal-panel><button class="icon-button modal-close" data-action="close-modal" aria-label="Fechar">${icon('close', 20)}</button><div class="modal-icon">${icon('eye', 25)}</div><h2 id="evidence-modal-title">Comprovantes do lançamento</h2><p>Arquivos privados disponíveis somente para a filial proprietária e o administrador.</p>${body}<div class="modal-actions"><button class="button button-secondary" data-action="close-modal">Fechar</button></div></section></div>`;
    setTimeout(() => root.querySelector('[data-action="close-modal"]')?.focus(), 0);
    return;
  }
  if (!state.modalOpen) {
    root.innerHTML = '';
    return;
  }
  if (state.modalOpen === 'semester-development') {
    const score = calculateDevelopmentScore(state.semesterDevelopment);
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" data-action="close-modal" aria-label="Fechar">${icon('close', 20)}</button><div class="modal-icon">${icon('book', 25)}</div><h2 id="modal-title">Confirmar desenvolvimento semestral</h2><p>Esta pontuação é registrada uma única vez e será acrescentada integralmente ao resultado Total da filial.</p><div class="review-list"><span>Iniciativas comprovadas <strong>${score.initiatives}</strong></span><span class="review-total">Pontuação semestral <strong>${formatPoints(score.developmentPoints)} / 5</strong></span></div><div class="upload-progress" id="upload-progress" role="status"></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">Voltar e revisar</button><button class="button button-primary" data-action="confirm-semester-development">Confirmar envio</button></div></section></div>`;
    setTimeout(() => root.querySelector('[data-action="confirm-semester-development"]')?.focus(), 0);
    return;
  }
  const score = calculateScore(state.metrics);
  const indicatorLabel = state.metrics.metricKind === 'profitability' ? 'Rentabilidade' : 'Descontos';
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" data-action="close-modal" aria-label="Fechar">${icon('close', 20)}</button><div class="modal-icon">${icon('save', 25)}</div><h2 id="modal-title">Confirmar lançamento mensal</h2><p>Revise a pontuação operacional antes de registrar. O Desenvolvimento Pessoal é preenchido em uma seção semestral separada.</p><div class="review-list"><span>OBZ <strong>${formatPoints(score.obzPoints)} / 20</strong></span><span>Faturamento <strong>${formatPoints(score.revenuePoints)} / 40</strong></span><span>${indicatorLabel} <strong>${formatPoints(score.indicatorPoints)} / 35</strong></span><span class="review-total">Pontuação do mês <strong>${formatPoints(score.totalPoints)} / 95</strong></span></div><div class="upload-progress" id="upload-progress" role="status"></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">Voltar e revisar</button><button class="button button-primary" data-action="confirm-submit">Confirmar envio</button></div></section></div>`;
  setTimeout(() => root.querySelector('[data-action="confirm-submit"]')?.focus(), 0);
}

function showToast(message, type = 'success') {
  state.toast = { message, type };
  renderToast();
  window.setTimeout(() => {
    state.toast = null;
    renderToast();
  }, 5000);
}

function renderToast() {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  root.innerHTML = state.toast ? `<div class="toast toast-${state.toast.type}" role="status">${icon(state.toast.type === 'success' ? 'check' : 'alert', 20)}<span>${escapeHtml(state.toast.message)}</span></div>` : '';
}

async function loadDashboardData() {
  const period = selectedPeriodDate();
  state.ranking = await appService.getRanking(period);
  if (state.profile.role === 'admin') {
    state.adminLatest = await appService.getAdminLatest(period);
    state.adminSemesterDevelopment = await appService.getAdminSemesterDevelopment();
    return;
  }
  state.metrics = { ...emptyMetrics(), metricKind: isProfitabilityBranch() ? 'profitability' : 'discount', profitabilityTarget: profitabilityTargetForBranch(state.profile.display_name), metricPeriod: state.selectedPeriod };
  state.semesterDevelopment = emptySemesterDevelopment();
  state.semesterEvidenceFiles = emptyEvidenceFiles();
  state.existingSemesterEvidence = [];
  const semesterDevelopment = await appService.getSemesterDevelopment();
  if (semesterDevelopment) {
    state.semesterDevelopment = {
      ...state.semesterDevelopment,
      developmentBooks: semesterDevelopment.development_books,
      developmentCourses: semesterDevelopment.development_courses,
      developmentCertifications: semesterDevelopment.development_certifications,
      developmentEvents: semesterDevelopment.development_events,
    };
    state.existingSemesterEvidence = semesterDevelopment.semester_development_evidence || [];
    DEVELOPMENT_ITEMS.forEach((item) => {
      state.semesterDevelopment[item.evidenceField] = state.existingSemesterEvidence.some((entry) => entry.category === item.category);
    });
  }
  if (!isTotalPeriod()) {
    const submission = await appService.getCurrentSubmission(state.selectedPeriod);
    if (submission) {
      state.metrics = {
        ...state.metrics,
        obzPercentage: toNumberInput(submission.obz_percentage),
        revenuePercentage: toNumberInput(submission.revenue_percentage),
        metricKind: submission.metric_kind,
        discountUnder500Percentage: submission.discount_under_500_percentage === null
          ? (submission.discount_band === 'A' ? toNumberInput(submission.discount_percentage) : '')
          : toNumberInput(submission.discount_under_500_percentage),
        discount501To2000Percentage: submission.discount_501_to_2000_percentage === null
          ? (submission.discount_band === 'B' ? toNumberInput(submission.discount_percentage) : '')
          : toNumberInput(submission.discount_501_to_2000_percentage),
        profitabilityPercentage: submission.profitability_percentage === null ? '' : toNumberInput(submission.profitability_percentage),
      };
    }
  }
}

async function loadHistoryData() {
  if (state.profile.role === 'admin' && !state.branches.length) state.branches = await appService.getBranches();
  state.history = await appService.getHistory(state.profile, state.historyFilters);
}

function updateMetricPreview() {
  const score = calculateScore(state.metrics);
  const set = (selector, html) => { const node = document.querySelector(selector); if (node) node.innerHTML = html; };
  set('#form-total', `${formatPoints(score.totalPoints)} / 95 pts`);
  set('#submit-total', `${formatPoints(score.totalPoints)} <small>/ 95 pts</small>`);
  set('#obz-score', scoreBadge(score.obzPoints, 20, Number(state.metrics.obzPercentage) >= 95 ? 'Elegível' : 'Abaixo do mínimo'));
  set('#revenue-score', scoreBadge(score.revenuePoints, 40, Number(state.metrics.revenuePercentage) >= 100 ? 'Meta atingida' : 'Em andamento'));
  const isProfitability = state.metrics.metricKind === 'profitability';
  const indicatorStatus = isProfitability
    ? profitabilityStatus()
    : discountStatus();
  set('#indicator-score', scoreBadge(score.indicatorPoints, 35, indicatorStatus));
  if (!isProfitability) set('#discount-breakdown', `Até R$ 500: ${formatPoints(score.discountUnder500Points)} / ${DISCOUNT_POINTS.under500} pts · R$ 501 a R$ 2.000: ${formatPoints(score.discount501To2000Points)} / ${DISCOUNT_POINTS.from501To2000} pts`);
}

function updateSemesterPreview() {
  const score = calculateDevelopmentScore(state.semesterDevelopment);
  const set = (selector, html) => { const node = document.querySelector(selector); if (node) node.innerHTML = html; };
  set('#semester-total', `${formatPoints(score.developmentPoints)} / 5 pts`);
  set('#semester-initiatives', `${score.initiatives} <small>de 3 para a pontuação máxima</small>`);
}

function syncMetricState(target) {
  if (!target.name || !(target.name in state.metrics)) return;
  state.metrics[target.name] = target.type === 'checkbox' ? target.checked : target.value;
  if (state.errors[target.name]) {
    delete state.errors[target.name];
    const error = document.querySelector(`#${target.name}-error`);
    if (error) error.textContent = '';
  }
  updateMetricPreview();
}

function handleSemesterEvidenceSelection(target) {
  const item = DEVELOPMENT_ITEMS.find((entry) => entry.field === target.dataset.semesterEvidenceFor);
  if (!item) return;
  const file = target.files?.[0] || null;
  const error = validateEvidenceFile(file);
  if (error) {
    state.semesterEvidenceFiles[item.field] = null;
    state.semesterDevelopment[item.evidenceField] = false;
    state.errors[item.evidenceField] = error;
  } else {
    state.semesterEvidenceFiles[item.field] = file;
    state.semesterDevelopment[item.evidenceField] = true;
    delete state.errors[item.evidenceField];
  }
  renderCurrentView();
}

function syncSemesterDevelopmentState(target) {
  if (!target.name || !(target.name in state.semesterDevelopment)) return;
  state.semesterDevelopment[target.name] = target.type === 'checkbox' ? target.checked : target.value;
  if (state.errors[target.name]) delete state.errors[target.name];
  updateSemesterPreview();
}

function validatePassword(password, confirmation) {
  if (password.length < 12) return 'A senha deve ter pelo menos 12 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return 'Inclua letras, número e símbolo na senha.';
  if (password !== confirmation) return 'As duas senhas não coincidem.';
  return '';
}

document.addEventListener('input', (event) => {
  if (event.target.closest('#metrics-form')) syncMetricState(event.target);
  if (event.target.closest('#semester-development-form')) syncSemesterDevelopmentState(event.target);
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'campaignPeriod') {
    state.selectedPeriod = event.target.value;
    state.errors = {};
    loadDashboardData()
      .then(() => renderCurrentView())
      .catch(() => showToast('Não foi possível carregar o período selecionado.', 'error'));
    return;
  }
  if (event.target.matches('[data-semester-evidence-for]')) {
    handleSemesterEvidenceSelection(event.target);
    return;
  }
  if (event.target.closest('#semester-development-form')) {
    syncSemesterDevelopmentState(event.target);
    if (event.target.type === 'checkbox') {
      const item = DEVELOPMENT_ITEMS.find((entry) => entry.field === event.target.name);
      if (item) {
        if (!event.target.checked) {
          state.semesterEvidenceFiles[item.field] = null;
          state.existingSemesterEvidence = state.existingSemesterEvidence.filter((entry) => entry.category !== item.category);
        }
        state.semesterDevelopment[item.evidenceField] = Boolean(event.target.checked && (
          state.semesterEvidenceFiles[item.field]
          || state.existingSemesterEvidence.some((entry) => entry.category === item.category)
        ));
        if (!event.target.checked) delete state.errors[item.evidenceField];
        renderCurrentView();
      }
    }
    return;
  }
  if (event.target.closest('#metrics-form')) {
    syncMetricState(event.target);
  }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id === 'login-form') {
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector('#login-message');
    button.disabled = true;
    button.textContent = 'Entrando...';
    try {
      state.profile = await appService.login(form.username.value, form.password.value);
      await loadDashboardData();
      renderShell();
    } catch {
      message.textContent = 'Usuário ou senha inválidos. Verifique os dados e tente novamente.';
      message.classList.add('is-visible');
      button.disabled = false;
      button.textContent = 'Entrar no painel';
    }
  }

  if (event.target.id === 'metrics-form') {
    state.errors = validateMetrics(state.metrics);
    if (Object.keys(state.errors).length) {
      Object.entries(state.errors).forEach(([field, message]) => {
        const node = document.querySelector(`#${field}-error`);
        if (node) node.textContent = message;
      });
      const firstField = Object.keys(state.errors)[0];
      document.querySelector(`#${firstField}`)?.focus();
      showToast('Revise os campos destacados antes de continuar.', 'error');
      return;
    }
    state.modalOpen = true;
    renderConfirmModal();
  }

  if (event.target.id === 'semester-development-form') {
    state.errors = validateSemesterDevelopment(state.semesterDevelopment);
    if (Object.keys(state.errors).length) {
      Object.entries(state.errors).forEach(([field, message]) => {
        const node = document.querySelector(`#${field}-error`);
        if (node) node.textContent = message;
      });
      const firstField = Object.keys(state.errors)[0];
      const item = DEVELOPMENT_ITEMS.find((entry) => entry.evidenceField === firstField);
      document.querySelector(item ? `#semester-evidence-${item.category}` : `#${firstField}`)?.focus();
      showToast('Anexe os comprovantes das iniciativas selecionadas.', 'error');
      return;
    }
    state.modalOpen = 'semester-development';
    renderConfirmModal();
  }

  if (event.target.id === 'history-filter') {
    const data = new FormData(event.target);
    state.historyFilters = Object.fromEntries(data.entries());
    try {
      await loadHistoryData();
      renderCurrentView();
    } catch {
      showToast('Não foi possível aplicar os filtros.', 'error');
    }
  }

  if (event.target.id === 'password-form') {
    const message = event.target.querySelector('#password-message');
    const error = validatePassword(event.target.newPassword.value, event.target.confirmPassword.value);
    if (error) {
      message.textContent = error;
      message.classList.add('is-visible');
      return;
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await appService.changePassword(event.target.newPassword.value);
      event.target.reset();
      message.textContent = '';
      message.classList.remove('is-visible');
      showToast('Senha atualizada com sucesso.');
    } catch {
      message.textContent = 'Não foi possível alterar a senha. Tente novamente.';
      message.classList.add('is-visible');
    } finally {
      button.disabled = false;
    }
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action], [data-view]');
  if (!button) return;
  const view = button.dataset.view;
  if (view) {
    state.view = view;
    document.body.classList.remove('menu-open');
    try {
      if (view === 'history') await loadHistoryData();
      renderShell();
    } catch {
      showToast('Não foi possível carregar esta página.', 'error');
    }
    return;
  }

  const action = button.dataset.action;
  if (action === 'toggle-password') {
    const input = document.querySelector('#password');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    button.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    button.innerHTML = icon(isPassword ? 'eyeOff' : 'eye', 19);
  }
  if (action === 'menu') document.body.classList.add('menu-open');
  if (action === 'close-menu') document.body.classList.remove('menu-open');
  if (action === 'logout') {
    await appService.logout();
    state.profile = null;
    state.view = 'dashboard';
    state.metrics = emptyMetrics();
    state.semesterDevelopment = emptySemesterDevelopment();
    state.semesterEvidenceFiles = emptyEvidenceFiles();
    state.existingSemesterEvidence = [];
    state.errors = {};
    renderLogin();
  }
  if (action === 'remove-semester-evidence') {
    const item = DEVELOPMENT_ITEMS.find((entry) => entry.field === button.dataset.evidenceFor);
    if (item) {
      state.semesterEvidenceFiles[item.field] = null;
      state.existingSemesterEvidence = state.existingSemesterEvidence.filter((entry) => entry.category !== item.category);
      state.semesterDevelopment[item.evidenceField] = false;
      state.errors[item.evidenceField] = 'Anexe um comprovante para esta iniciativa.';
      renderCurrentView();
    }
  }
  if (action === 'close-modal' && !event.target.closest('[data-modal-panel]')) {
    if (state.submitting) return;
    state.modalOpen = false;
    state.evidenceModal = null;
    renderConfirmModal();
  } else if (action === 'close-modal' && button.matches('[data-action="close-modal"]')) {
    if (state.submitting) return;
    state.modalOpen = false;
    state.evidenceModal = null;
    renderConfirmModal();
  }
  if (action === 'view-evidence') {
    state.modalOpen = false;
    state.evidenceModal = { loading: true, error: '', items: [], submissionId: button.dataset.submissionId };
    renderConfirmModal();
    try {
      state.evidenceModal.items = await appService.getEvidence(button.dataset.submissionId);
      state.evidenceModal.loading = false;
    } catch {
      state.evidenceModal.loading = false;
      state.evidenceModal.error = 'Tente novamente em alguns instantes.';
    }
    renderConfirmModal();
  }
  if (action === 'view-semester-evidence') {
    state.modalOpen = false;
    state.evidenceModal = { loading: true, error: '', items: [], developmentId: button.dataset.developmentId };
    renderConfirmModal();
    try {
      state.evidenceModal.items = await appService.getSemesterEvidence(button.dataset.developmentId);
      state.evidenceModal.loading = false;
    } catch {
      state.evidenceModal.loading = false;
      state.evidenceModal.error = 'Tente novamente em alguns instantes.';
    }
    renderConfirmModal();
  }
  if (action === 'confirm-submit') {
    state.submitting = true;
    button.disabled = true;
    button.textContent = 'Enviando...';
    document.querySelectorAll('#modal-root button').forEach((modalButton) => { modalButton.disabled = true; });
    try {
      await appService.submitMetrics(state.metrics, ({ completed, total, stage }) => {
        const progress = document.querySelector('#upload-progress');
        if (!progress) return;
        progress.classList.add('is-visible');
        progress.textContent = stage === 'saving'
          ? total > 0 ? 'Comprovantes enviados. Registrando o lançamento...' : 'Registrando o lançamento...'
          : `Enviando comprovantes: ${completed} de ${total}`;
      });
      state.modalOpen = false;
      state.metrics = emptyMetrics();
      state.errors = {};
      await loadDashboardData();
      await loadHistoryData();
      renderCurrentView();
      renderConfirmModal();
      showToast('Métricas registradas com sucesso.');
    } catch {
      button.disabled = false;
      button.textContent = 'Confirmar envio';
      document.querySelectorAll('#modal-root button').forEach((modalButton) => { modalButton.disabled = false; });
      showToast('Não foi possível enviar os comprovantes. Seus valores continuam na tela.', 'error');
    } finally {
      state.submitting = false;
    }
  }
  if (action === 'confirm-semester-development') {
    state.submitting = true;
    button.disabled = true;
    button.textContent = 'Enviando...';
    document.querySelectorAll('#modal-root button').forEach((modalButton) => { modalButton.disabled = true; });
    try {
      await appService.submitSemesterDevelopment(state.semesterDevelopment, state.semesterEvidenceFiles, state.existingSemesterEvidence, ({ completed, total, stage }) => {
        const progress = document.querySelector('#upload-progress');
        if (!progress) return;
        progress.classList.add('is-visible');
        progress.textContent = stage === 'saving'
          ? total > 0 ? 'Comprovantes enviados. Salvando o indicador semestral...' : 'Salvando o indicador semestral...'
          : `Enviando comprovantes: ${completed} de ${total}`;
      });
      state.modalOpen = false;
      state.errors = {};
      await loadDashboardData();
      renderCurrentView();
      renderConfirmModal();
      showToast('Desenvolvimento semestral registrado com sucesso.');
    } catch {
      button.disabled = false;
      button.textContent = 'Confirmar envio';
      document.querySelectorAll('#modal-root button').forEach((modalButton) => { modalButton.disabled = false; });
      showToast('Não foi possível salvar o desenvolvimento semestral. Seus dados continuam na tela.', 'error');
    } finally {
      state.submitting = false;
    }
  }
  if (action === 'refresh-ranking' || action === 'refresh-admin') {
    button.disabled = true;
    try {
      await loadDashboardData();
      renderCurrentView();
      showToast('Dados atualizados.');
    } catch {
      button.disabled = false;
      showToast('Não foi possível atualizar os dados.', 'error');
    }
  }
  if (action === 'export-latest') {
    downloadCsv(state.adminLatest.map((row) => ({
      Filial: row.branch_name,
      Periodo: isTotalPeriod() ? 'Total (média)' : selectedPeriodLabel(),
      OBZ: row.obz_percentage,
      Faturamento: row.revenue_percentage,
      Indicador: row.metric_kind === 'profitability' ? 'Rentabilidade' : 'Desconto',
      Rentabilidade: row.profitability_percentage,
      Meta_rentabilidade: row.metric_kind === 'profitability' ? profitabilityTargetForBranch(row.branch_name) : null,
      Desconto_ate_R_500: row.discount_under_500_percentage,
      Pontos_desconto_ate_R_500: row.discount_under_500_points,
      Desconto_R_501_a_R_2000: row.discount_501_to_2000_percentage,
      Pontos_desconto_R_501_a_R_2000: row.discount_501_to_2000_points,
      Desenvolvimento: row.development_points,
      Total: row.total_points,
      Meses_preenchidos: row.periods_count,
      Atualizado_em: formatDate(row.updated_at),
    })), 'ultimas-metricas-eletroluz.csv');
  }
  if (action === 'export-history') {
    downloadCsv(state.history.map((row) => ({
      Filial: row.branch_name || state.profile.display_name,
      Data: formatDate(row.created_at),
      OBZ_percentual: row.obz_percentage,
      OBZ_pontos: row.obz_points,
      Faturamento_percentual: row.revenue_percentage,
      Faturamento_pontos: row.revenue_points,
      Indicador: row.metric_kind === 'profitability' ? 'Rentabilidade' : 'Desconto',
      Rentabilidade_percentual: row.profitability_percentage,
      Rentabilidade_pontos: row.profitability_points,
      Meta_rentabilidade: row.metric_kind === 'profitability' ? profitabilityTargetForBranch(row.branch_name || state.profile.display_name) : null,
      Desconto_ate_R_500_percentual: row.discount_under_500_percentage,
      Desconto_ate_R_500_pontos: row.discount_under_500_points,
      Desconto_R_501_a_R_2000_percentual: row.discount_501_to_2000_percentage,
      Desconto_R_501_a_R_2000_pontos: row.discount_501_to_2000_points,
      Desconto_pontos: row.discount_points,
      Periodo: selectedPeriodName(row.metric_period),
      Desenvolvimento_pontos: row.development_points,
      Comprovantes: row.evidence_count || 0,
      Total: row.total_points,
    })), 'historico-campanha-eletroluz.csv');
  }
});

async function init() {
  renderBoot();
  try {
    state.profile = await appService.getCurrentProfile();
    if (!state.profile) {
      renderLogin();
      return;
    }
    await loadDashboardData();
    renderShell();
  } catch {
    renderLogin('Não foi possível iniciar a sessão. Verifique a configuração e tente novamente.');
  }
}

init();
