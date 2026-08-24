import {
  demoEvidenceBySubmission,
  demoHistory,
  demoLatest,
  demoProfile,
  demoRanking,
} from './demo-data.js';
import { calculateDevelopmentScore, calculateScore } from './scoring.js';
import { hasSupabaseConfig, supabase, usernameToEmail } from './supabase.js';

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const demoRole = new URLSearchParams(window.location.search).get('demo');
export const isDemo = isLocalhost && ['manager', 'admin'].includes(demoRole);

const flattenSubmission = (row) => ({
  ...row,
  branch_name: row.branch_name || row.branches?.name || '',
  evidence_count: row.evidence_count ?? row.submission_evidence?.length ?? 0,
});

const evidenceFields = [
  ['books', 'developmentBooks'],
  ['courses', 'developmentCourses'],
  ['certifications', 'developmentCertifications'],
  ['events', 'developmentEvents'],
];

const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const EVIDENCE_BUCKET = 'campaign-gerentes-2026-evidence';
let demoSemesterDevelopment = {
  id: 'demo-semester-development',
  development_books: true,
  development_courses: true,
  development_certifications: false,
  development_events: false,
  development_points: 3.33,
  updated_at: '2026-08-20T14:00:00.000Z',
  semester_development_evidence: [
    { category: 'books', original_name: 'livro-demo.jpg', mime_type: 'image/jpeg', size_bytes: 150000 },
    { category: 'courses', original_name: 'curso-demo.pdf', mime_type: 'application/pdf', size_bytes: 220000 },
  ],
};

const assertNoError = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const appService = {
  isConfigured: hasSupabaseConfig || isDemo,
  isDemo,

  async login(username, password) {
    if (isDemo) return demoProfile(demoRole);
    const data = assertNoError(await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    }));
    return this.getProfile(data.user.id);
  },

  async getCurrentProfile() {
    if (isDemo) return demoProfile(demoRole);
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return this.getProfile(session.user.id);
  },

  async getProfile(userId) {
    const data = assertNoError(await supabase
      .from('profiles')
      .select('id, branch_id, role, display_name')
      .eq('id', userId)
      .single());
    return data;
  },

  async logout() {
    if (!isDemo && supabase) assertNoError(await supabase.auth.signOut());
  },

  async changePassword(password) {
    if (isDemo) return;
    assertNoError(await supabase.auth.updateUser({ password }));
  },

  async getRanking(metricPeriod = null) {
    if (isDemo) return structuredClone(demoRanking);
    return assertNoError(await supabase.rpc('get_campaign_ranking', {
      p_metric_period: metricPeriod,
    }));
  },

  async getHistory(profile, filters = {}) {
    if (isDemo) {
      if (profile.role === 'admin') {
        return demoLatest.map((row, index) => ({
          ...demoHistory[index % demoHistory.length],
          ...row,
          id: `admin-history-${index}`,
        }));
      }
      return structuredClone(demoHistory);
    }

    let query = supabase
      .from('metric_submissions')
      .select('*, branches(name), submission_evidence(id, category)')
      .order('created_at', { ascending: false });
    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00-03:00`);
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59-03:00`);
    const data = assertNoError(await query.limit(500));
    return data.map(flattenSubmission);
  },

  async getAdminLatest(metricPeriod = null) {
    if (isDemo) return structuredClone(demoLatest);
    return assertNoError(await supabase.rpc('get_admin_latest_metrics', {
      p_metric_period: metricPeriod,
    }));
  },

  async getCurrentSubmission(metricPeriod) {
    if (isDemo) return null;
    const data = assertNoError(await supabase
      .from('metric_submissions')
      .select('*, submission_evidence(id, category, storage_path, original_name, mime_type, size_bytes)')
      .eq('metric_period', metricPeriod)
      .maybeSingle());
    return data ? flattenSubmission(data) : null;
  },

  async getSemesterDevelopment() {
    if (isDemo) return structuredClone(demoSemesterDevelopment);
    return assertNoError(await supabase
      .from('semester_development')
      .select('*, semester_development_evidence(id, category, storage_path, original_name, mime_type, size_bytes)')
      .maybeSingle());
  },

  async getAdminSemesterDevelopment() {
    if (isDemo) return demoRanking.map((row, index) => ({
      development_id: index === 0 ? demoSemesterDevelopment.id : null,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      development_points: index === 0 ? demoSemesterDevelopment.development_points : null,
      initiatives: index === 0 ? 2 : 0,
      evidence_count: index === 0 ? 2 : 0,
      updated_at: index === 0 ? demoSemesterDevelopment.updated_at : null,
    }));
    return assertNoError(await supabase.rpc('get_admin_semester_development'));
  },

  async getEvidence(submissionId) {
    if (isDemo) {
      const adminMatch = submissionId.match(/^admin-history-(\d+)$/);
      const sourceId = adminMatch
        ? demoHistory[Number(adminMatch[1]) % demoHistory.length].id
        : submissionId;
      return structuredClone(demoEvidenceBySubmission.get(sourceId) || []);
    }
    const items = assertNoError(await supabase
      .from('submission_evidence')
      .select('id, category, storage_path, original_name, mime_type, size_bytes, created_at')
      .eq('submission_id', submissionId)
      .order('category'));

    return Promise.all(items.map(async (item) => {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(item.storage_path, 120);
      return { ...item, signed_url: error ? null : data.signedUrl };
    }));
  },

  async getSemesterEvidence(developmentId) {
    if (isDemo) return [];
    const items = assertNoError(await supabase
      .from('semester_development_evidence')
      .select('id, category, storage_path, original_name, mime_type, size_bytes, created_at')
      .eq('development_id', developmentId)
      .order('category'));
    return Promise.all(items.map(async (item) => {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(item.storage_path, 120);
      return { ...item, signed_url: error ? null : data.signedUrl };
    }));
  },

  async getBranches() {
    if (isDemo) return demoRanking.map((row) => ({ id: row.branch_id, name: row.branch_name }));
    return assertNoError(await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order'));
  },

  async submitMetrics(values, onProgress = () => {}) {
    const score = calculateScore(values);
    if (isDemo) {
      const now = new Date().toISOString();
      const submissionId = `demo-${Date.now()}`;
      onProgress({ completed: 0, total: 0, stage: 'saving' });
      const record = {
        id: submissionId,
        branch_id: 'demo-1',
        branch_name: demoProfile('manager').display_name,
        obz_percentage: Number(values.obzPercentage),
        obz_points: score.obzPoints,
        revenue_percentage: Number(values.revenuePercentage),
        revenue_points: score.revenuePoints,
        discount_band: values.metricKind === 'profitability' ? null : values.discountBand,
        discount_percentage: values.metricKind === 'profitability' ? null : Number(values.discountPercentage),
        metric_period: values.metricPeriod,
        metric_kind: values.metricKind,
        discount_points: values.metricKind === 'profitability' ? null : score.indicatorPoints,
        profitability_percentage: values.metricKind === 'profitability' ? Number(values.profitabilityPercentage) : null,
        profitability_points: values.metricKind === 'profitability' ? score.indicatorPoints : null,
        development_books: false,
        development_courses: false,
        development_certifications: false,
        development_events: false,
        development_points: 0,
        total_points: score.totalPoints,
        evidence_count: 0,
        created_at: now,
      };
      const index = demoHistory.findIndex((item) => item.metric_period === values.metricPeriod);
      if (index >= 0) demoHistory.splice(index, 1, record);
      else demoHistory.unshift(record);
      demoRanking[0].total_points = score.totalPoints;
      demoRanking[0].updated_at = now;
      return { id: submissionId, ...score };
    }

    onProgress({ completed: 0, total: 0, stage: 'saving' });
    return assertNoError(await supabase.rpc('submit_metrics', {
      p_metric_period: values.metricPeriod,
      p_obz_percentage: Number(values.obzPercentage),
      p_revenue_percentage: Number(values.revenuePercentage),
      p_discount_band: values.metricKind === 'profitability' ? null : values.discountBand,
      p_discount_percentage: values.metricKind === 'profitability' ? null : Number(values.discountPercentage),
      p_profitability_percentage: values.metricKind === 'profitability' ? Number(values.profitabilityPercentage) : null,
      p_development_books: false,
      p_development_courses: false,
      p_development_certifications: false,
      p_development_events: false,
      p_evidence: [],
    }));
  },

  async submitSemesterDevelopment(values, evidenceFiles = {}, existingEvidence = [], onProgress = () => {}) {
    const score = calculateDevelopmentScore(values);
    if (isDemo) {
      demoSemesterDevelopment = {
        ...demoSemesterDevelopment,
        development_books: Boolean(values.developmentBooks),
        development_courses: Boolean(values.developmentCourses),
        development_certifications: Boolean(values.developmentCertifications),
        development_events: Boolean(values.developmentEvents),
        development_points: score.developmentPoints,
        updated_at: new Date().toISOString(),
      };
      onProgress({ completed: 0, total: 0, stage: 'saving' });
      return demoSemesterDevelopment;
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw userError || new Error('Sessão expirada.');
    const selectedEvidence = evidenceFields
      .filter(([, field]) => values[field] && evidenceFiles[field])
      .map(([category, field]) => ({ category, file: evidenceFiles[field] }));
    const batchId = crypto.randomUUID();
    const uploadedPaths = [];
    const evidencePayload = existingEvidence
      .filter((item) => {
        const mapped = evidenceFields.find(([category]) => category === item.category);
        return mapped && values[mapped[1]] && !selectedEvidence.some(({ category }) => category === item.category);
      })
      .map((item) => ({ category: item.category, storage_path: item.storage_path, original_name: item.original_name, mime_type: item.mime_type, size_bytes: item.size_bytes }));
    try {
      for (let index = 0; index < selectedEvidence.length; index += 1) {
        const { category, file } = selectedEvidence[index];
        const path = `${userData.user.id}/${batchId}/semester-development/${category}/${crypto.randomUUID()}.${extensionByType[file.type]}`;
        onProgress({ completed: index, total: selectedEvidence.length, stage: 'uploading' });
        const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        evidencePayload.push({ category, storage_path: path, original_name: file.name, mime_type: file.type, size_bytes: file.size });
        onProgress({ completed: index + 1, total: selectedEvidence.length, stage: 'uploading' });
      }
      onProgress({ completed: selectedEvidence.length, total: selectedEvidence.length, stage: 'saving' });
      return assertNoError(await supabase.rpc('submit_semester_development', {
        p_development_books: Boolean(values.developmentBooks),
        p_development_courses: Boolean(values.developmentCourses),
        p_development_certifications: Boolean(values.developmentCertifications),
        p_development_events: Boolean(values.developmentEvents),
        p_evidence: evidencePayload,
      }));
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
      throw error;
    }
  },
};
