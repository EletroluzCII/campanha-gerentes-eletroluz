import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDevelopmentScore,
  calculateScore,
  PROFITABILITY_TARGETS,
  validateEvidenceFile,
  validateMetrics,
  validateSemesterDevelopment,
} from '../src/scoring.js';

const base = {
  obzPercentage: 100,
  revenuePercentage: 100,
  discountUnder500Percentage: 11.4,
  discount501To2000Percentage: 19.52,
  developmentBooks: true,
  developmentBooksEvidence: true,
  developmentCourses: true,
  developmentCoursesEvidence: true,
  developmentCertifications: true,
  developmentCertificationsEvidence: true,
  developmentEvents: false,
  developmentEventsEvidence: false,
};

test('calcula a pontuação operacional máxima em 95 pontos', () => {
  assert.deepEqual(calculateScore(base), {
    obzPoints: 20,
    indicatorPoints: 35,
    revenuePoints: 40,
    discountUnder500Points: 18,
    discount501To2000Points: 17,
    totalPoints: 95,
  });
});

test('OBZ abaixo de 95% não pontua', () => {
  assert.equal(calculateScore({ ...base, obzPercentage: 94.99 }).obzPoints, 0);
});

test('OBZ em 95% é proporcional e elegível', () => {
  assert.equal(calculateScore({ ...base, obzPercentage: 95 }).obzPoints, 19);
});

test('pontuação fica limitada ao máximo quando metas são superadas', () => {
  const score = calculateScore({ ...base, obzPercentage: 140, revenuePercentage: 175 });
  assert.equal(score.obzPoints, 20);
  assert.equal(score.revenuePoints, 40);
});

test('cada faixa de desconto recebe sua pontuação independente ao atingir a meta', () => {
  assert.equal(calculateScore(base).indicatorPoints, 35);
  assert.equal(calculateScore({ ...base, discountUnder500Percentage: 11.41 }).indicatorPoints, 17);
  assert.equal(calculateScore({ ...base, discount501To2000Percentage: 19.53 }).indicatorPoints, 18);
  assert.equal(calculateScore({ ...base, discountUnder500Percentage: 11.41, discount501To2000Percentage: 19.53 }).indicatorPoints, 0);
});

test('faixa vazia não concede seus pontos, sem remover os pontos da outra faixa', () => {
  assert.equal(calculateScore({ ...base, discountUnder500Percentage: '' }).indicatorPoints, 17);
  assert.equal(calculateScore({ ...base, discount501To2000Percentage: '' }).indicatorPoints, 18);
});

test('rentabilidade da Exceleds só pontua a partir de 95% da meta e limita em 35 pontos', () => {
  const common = { ...base, metricKind: 'profitability', profitabilityTarget: PROFITABILITY_TARGETS.exceleds };
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 68.3 }).indicatorPoints, 0);
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 68.31 }).indicatorPoints, 33.25);
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 71.9 }).indicatorPoints, 35);
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 80 }).indicatorPoints, 35);
});

test('rentabilidade da FOCO usa a meta própria para elegibilidade e pontos', () => {
  const common = { ...base, metricKind: 'profitability', profitabilityTarget: PROFITABILITY_TARGETS.foco };
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 36.09 }).indicatorPoints, 0);
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 36.1 }).indicatorPoints, 33.25);
  assert.equal(calculateScore({ ...common, profitabilityPercentage: 38 }).indicatorPoints, 35);
});

test('rentabilidade não exige os campos de desconto', () => {
  const errors = validateMetrics({
    ...base,
    metricKind: 'profitability',
    profitabilityPercentage: 80,
    discountUnder500Percentage: '',
    discount501To2000Percentage: '',
  });
  assert.equal(errors.discountUnder500Percentage, undefined);
  assert.equal(errors.discount501To2000Percentage, undefined);
});

test('desenvolvimento pontua proporcionalmente e limita em três iniciativas', () => {
  assert.equal(calculateDevelopmentScore({ ...base, developmentCourses: false, developmentCertifications: false }).developmentPoints, 1.67);
  assert.equal(calculateDevelopmentScore({ ...base, developmentEvents: true, developmentEventsEvidence: true }).developmentPoints, 5);
});

test('iniciativa selecionada sem comprovante não pontua', () => {
  const score = calculateDevelopmentScore({
    ...base,
    developmentBooksEvidence: false,
    developmentCoursesEvidence: false,
    developmentCertificationsEvidence: false,
  });
  assert.equal(score.developmentPoints, 0);
  assert.equal(score.initiatives, 0);
});

test('validação exige comprovante para toda iniciativa selecionada', () => {
  const errors = validateSemesterDevelopment({ ...base, developmentBooksEvidence: false });
  assert.equal(errors.developmentBooksEvidence, 'Anexe um comprovante do livro.');
});

test('validação de arquivo aceita formatos permitidos e limita tamanho', () => {
  assert.equal(validateEvidenceFile({ type: 'application/pdf', size: 1024 }), '');
  assert.match(validateEvidenceFile({ type: 'text/plain', size: 1024 }), /Formato não permitido/);
  assert.match(validateEvidenceFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 }), /no máximo 10 MB/);
  assert.match(validateEvidenceFile({ type: 'image/png', size: 0 }), /vazio/);
});

test('validação rejeita campos vazios, negativos e fora do limite', () => {
  const errors = validateMetrics({
    ...base,
    obzPercentage: '',
    revenuePercentage: -1,
    discountUnder500Percentage: 1000,
    discount501To2000Percentage: '',
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    'discount501To2000Percentage',
    'discountUnder500Percentage',
    'obzPercentage',
    'revenuePercentage',
  ]);
});
