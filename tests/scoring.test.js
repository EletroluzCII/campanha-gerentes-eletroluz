import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore, validateMetrics } from '../src/scoring.js';

const base = {
  obzPercentage: 100,
  revenuePercentage: 100,
  discountBand: 'A',
  discountPercentage: 11.4,
  developmentBooks: true,
  developmentCourses: true,
  developmentCertifications: true,
  developmentEvents: false,
};

test('calcula a pontuação máxima em 100 pontos', () => {
  assert.deepEqual(calculateScore(base), {
    obzPoints: 20,
    discountPoints: 35,
    revenuePoints: 40,
    developmentPoints: 5,
    initiatives: 3,
    totalPoints: 100,
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

test('desconto no teto pontua e acima do teto não pontua na faixa A', () => {
  assert.equal(calculateScore({ ...base, discountPercentage: 11.4 }).discountPoints, 35);
  assert.equal(calculateScore({ ...base, discountPercentage: 11.41 }).discountPoints, 0);
});

test('desconto respeita o teto da faixa B', () => {
  assert.equal(calculateScore({ ...base, discountBand: 'B', discountPercentage: 19.52 }).discountPoints, 35);
  assert.equal(calculateScore({ ...base, discountBand: 'B', discountPercentage: 19.53 }).discountPoints, 0);
});

test('desconto vazio não concede pontos antes do preenchimento', () => {
  assert.equal(calculateScore({ ...base, discountPercentage: '' }).discountPoints, 0);
});

test('desenvolvimento pontua proporcionalmente e limita em três iniciativas', () => {
  assert.equal(calculateScore({ ...base, developmentCourses: false, developmentCertifications: false }).developmentPoints, 1.67);
  assert.equal(calculateScore({ ...base, developmentEvents: true }).developmentPoints, 5);
});

test('validação rejeita campos vazios, negativos e fora do limite', () => {
  const errors = validateMetrics({
    ...base,
    obzPercentage: '',
    revenuePercentage: -1,
    discountPercentage: 1000,
    discountBand: 'C',
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    'discountBand',
    'discountPercentage',
    'obzPercentage',
    'revenuePercentage',
  ]);
});
