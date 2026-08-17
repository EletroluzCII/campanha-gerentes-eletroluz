import { demoHistory, demoLatest, demoProfile, demoRanking } from './demo-data.js';
import { calculateScore } from './scoring.js';
import { hasSupabaseConfig, supabase, usernameToEmail } from './supabase.js';

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const demoRole = new URLSearchParams(window.location.search).get('demo');
export const isDemo = isLocalhost && ['manager', 'admin'].includes(demoRole);

const flattenSubmission = (row) => ({
  ...row,
  branch_name: row.branch_name || row.branches?.name || '',
});

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

  async getRanking() {
    if (isDemo) return structuredClone(demoRanking);
    return assertNoError(await supabase.rpc('get_campaign_ranking'));
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
      .select('*, branches(name)')
      .order('created_at', { ascending: false });
    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00-03:00`);
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59-03:00`);
    const data = assertNoError(await query.limit(500));
    return data.map(flattenSubmission);
  },

  async getAdminLatest() {
    if (isDemo) return structuredClone(demoLatest);
    return assertNoError(await supabase.rpc('get_admin_latest_metrics'));
  },

  async getBranches() {
    if (isDemo) return demoRanking.map((row) => ({ id: row.branch_id, name: row.branch_name }));
    return assertNoError(await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order'));
  },

  async submitMetrics(values) {
    const score = calculateScore(values);
    if (isDemo) {
      const now = new Date().toISOString();
      demoHistory.unshift({
        id: `demo-${Date.now()}`,
        branch_id: 'demo-1',
        branch_name: demoProfile('manager').display_name,
        obz_percentage: Number(values.obzPercentage),
        obz_points: score.obzPoints,
        revenue_percentage: Number(values.revenuePercentage),
        revenue_points: score.revenuePoints,
        discount_band: values.discountBand,
        discount_percentage: Number(values.discountPercentage),
        discount_points: score.discountPoints,
        development_books: values.developmentBooks,
        development_courses: values.developmentCourses,
        development_certifications: values.developmentCertifications,
        development_events: values.developmentEvents,
        development_points: score.developmentPoints,
        total_points: score.totalPoints,
        created_at: now,
      });
      demoRanking[0].total_points = score.totalPoints;
      demoRanking[0].updated_at = now;
      return { id: demoHistory[0].id, ...score };
    }

    return assertNoError(await supabase.rpc('submit_metrics', {
      p_obz_percentage: Number(values.obzPercentage),
      p_revenue_percentage: Number(values.revenuePercentage),
      p_discount_band: values.discountBand,
      p_discount_percentage: Number(values.discountPercentage),
      p_development_books: Boolean(values.developmentBooks),
      p_development_courses: Boolean(values.developmentCourses),
      p_development_certifications: Boolean(values.developmentCertifications),
      p_development_events: Boolean(values.developmentEvents),
    }));
  },
};
