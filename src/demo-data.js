const branches = [
  'Eletroluz Matriz Maringá',
  'Eletroluz Express Maringá',
  'Eletroluz Sarandi',
  'Eletroluz Campo Mourão',
  'Eletroluz Apucarana',
  'Eletroluz Cianorte',
  'Eletroluz Umuarama',
  'Eletroluz Londrina',
  'Eletroluz Ponta Grossa',
  'Eletroluz Presidente Prudente',
  'Exceleds Iluminação',
  'FOCO Distribuidora',
];

const scores = [92.6, 88.75, 84.2, 79.9, 76.35, 72.8, 69.4, 65.2, 61.75, 57.4, null, null];

export const demoRanking = branches.map((branchName, index) => ({
  branch_id: `demo-${index + 1}`,
  branch_name: branchName,
  total_points: scores[index],
  updated_at: scores[index] === null ? null : new Date(Date.now() - index * 86400000).toISOString(),
  rank_position: scores[index] === null ? null : index + 1,
}));

export const demoProfile = (role = 'manager') => ({
  id: `demo-${role}`,
  role,
  branch_id: role === 'manager' ? 'demo-1' : null,
  display_name: role === 'manager' ? branches[0] : 'Administrador',
});

export const demoHistory = [
  {
    id: 'history-1', branch_id: 'demo-1', branch_name: branches[0], obz_percentage: 101.2,
    obz_points: 20, revenue_percentage: 96.5, revenue_points: 38.6,
    discount_band: 'A', discount_percentage: 10.8, discount_points: 35,
    development_points: 5, total_points: 98.6, created_at: new Date().toISOString(),
  },
  {
    id: 'history-2', branch_id: 'demo-1', branch_name: branches[0], obz_percentage: 98,
    obz_points: 19.6, revenue_percentage: 90, revenue_points: 36,
    discount_band: 'A', discount_percentage: 11.2, discount_points: 35,
    development_points: 3.33, total_points: 93.93,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

export const demoLatest = demoRanking
  .filter((entry) => entry.total_points !== null)
  .map((entry, index) => ({
    ...entry,
    obz_percentage: 96 + (index % 5),
    revenue_percentage: 85 + (index % 12),
    discount_percentage: 10.4 + (index * 0.7),
    discount_band: index < 5 ? 'A' : 'B',
    development_points: index % 3 === 0 ? 5 : 3.33,
  }));
