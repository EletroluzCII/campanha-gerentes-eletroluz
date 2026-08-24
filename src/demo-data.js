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
    discount_under_500_percentage: 10.8, discount_under_500_points: 18,
    discount_501_to_2000_percentage: 18.2, discount_501_to_2000_points: 17, discount_points: 35,
    development_points: 5, total_points: 98.6, evidence_count: 3, created_at: new Date().toISOString(),
  },
  {
    id: 'history-2', branch_id: 'demo-1', branch_name: branches[0], obz_percentage: 98,
    obz_points: 19.6, revenue_percentage: 90, revenue_points: 36,
    discount_under_500_percentage: 11.2, discount_under_500_points: 18,
    discount_501_to_2000_percentage: 19.1, discount_501_to_2000_points: 17, discount_points: 35,
    development_points: 3.33, total_points: 93.93, evidence_count: 2,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

const demoDocumentUrl = 'data:text/plain;charset=utf-8,Comprovante%20demonstrativo%20Eletroluz';

export const demoEvidenceBySubmission = new Map([
  ['history-1', [
    { category: 'books', original_name: 'foto-livro.jpg', mime_type: 'image/jpeg', size_bytes: 842311, signed_url: demoDocumentUrl },
    { category: 'courses', original_name: 'certificado-curso.pdf', mime_type: 'application/pdf', size_bytes: 1240900, signed_url: demoDocumentUrl },
    { category: 'events', original_name: 'foto-evento.webp', mime_type: 'image/webp', size_bytes: 654210, signed_url: demoDocumentUrl },
  ]],
  ['history-2', [
    { category: 'books', original_name: 'leitura-lideranca.png', mime_type: 'image/png', size_bytes: 721110, signed_url: demoDocumentUrl },
    { category: 'certifications', original_name: 'certificacao.pdf', mime_type: 'application/pdf', size_bytes: 992112, signed_url: demoDocumentUrl },
  ]],
]);

export const demoLatest = demoRanking
  .filter((entry) => entry.total_points !== null)
  .map((entry, index) => ({
    ...entry,
    obz_percentage: 96 + (index % 5),
    revenue_percentage: 85 + (index % 12),
    discount_under_500_percentage: 10.4 + (index * 0.2),
    discount_under_500_points: index < 5 ? 18 : 0,
    discount_501_to_2000_percentage: 17.4 + (index * 0.3),
    discount_501_to_2000_points: index < 7 ? 17 : 0,
    development_points: index % 3 === 0 ? 5 : 3.33,
  }));
