export const WEIGHTS = Object.freeze({
  obz: 20,
  indicator: 35,
  revenue: 40,
  development: 5,
});

export const DISCOUNT_LIMITS = Object.freeze({
  A: 11.4,
  B: 19.52,
});

export const EVIDENCE_RULES = Object.freeze({
  maxSizeBytes: 10 * 1024 * 1024,
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
});

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateScore(values) {
  const obzPercentage = Number(values.obzPercentage || 0);
  const revenuePercentage = Number(values.revenuePercentage || 0);
  const profitabilityPercentage = Number(values.profitabilityPercentage || 0);
  const discountPercentage = Number(values.discountPercentage || 0);
  const discountBand = values.discountBand === 'B' ? 'B' : 'A';
  const isProfitability = values.metricKind === 'profitability';
  const obzPoints = obzPercentage < 95
    ? 0
    : Math.min(WEIGHTS.obz, (obzPercentage / 100) * WEIGHTS.obz);
  const revenuePoints = Math.min(
    WEIGHTS.revenue,
    (revenuePercentage / 100) * WEIGHTS.revenue,
  );
  const hasIndicatorValue = isProfitability
    ? values.profitabilityPercentage !== '' && values.profitabilityPercentage !== null && values.profitabilityPercentage !== undefined
    : values.discountPercentage !== '' && values.discountPercentage !== null && values.discountPercentage !== undefined;
  const indicatorPoints = !hasIndicatorValue
    ? 0
    : isProfitability
      ? Math.min(WEIGHTS.indicator, (profitabilityPercentage / 100) * WEIGHTS.indicator)
      : discountPercentage <= DISCOUNT_LIMITS[discountBand] ? WEIGHTS.indicator : 0;
  const parts = {
    obzPoints: round2(obzPoints),
    indicatorPoints: round2(indicatorPoints),
    revenuePoints: round2(revenuePoints),
  };

  return {
    ...parts,
    totalPoints: round2(Object.values(parts).reduce((sum, item) => sum + item, 0)),
  };
}

export function calculateDevelopmentScore(values) {
  const initiatives = [
    values.developmentBooks && values.developmentBooksEvidence,
    values.developmentCourses && values.developmentCoursesEvidence,
    values.developmentCertifications && values.developmentCertificationsEvidence,
    values.developmentEvents && values.developmentEventsEvidence,
  ].filter(Boolean).length;
  return {
    initiatives,
    developmentPoints: round2(Math.min(
      WEIGHTS.development,
      (initiatives / 3) * WEIGHTS.development,
    )),
  };
}

export function validateMetrics(values) {
  const errors = {};
  const numericFields = [
    ['obzPercentage', 'Informe o atingimento do OBZ.'],
    ['revenuePercentage', 'Informe o atingimento do faturamento.'],
    values.metricKind === 'profitability'
      ? ['profitabilityPercentage', 'Informe o percentual de rentabilidade.']
      : ['discountPercentage', 'Informe o percentual de desconto.'],
  ];

  numericFields.forEach(([field, requiredMessage]) => {
    if (values[field] === '' || values[field] === null || values[field] === undefined) {
      errors[field] = requiredMessage;
      return;
    }
    const number = Number(values[field]);
    if (!Number.isFinite(number) || number < 0 || number > 999.99) {
      errors[field] = 'Use um percentual entre 0 e 999,99.';
    }
  });

  if (values.metricKind !== 'profitability' && !['A', 'B'].includes(values.discountBand)) {
    errors.discountBand = 'Selecione uma faixa válida.';
  }

  return errors;
}

export function validateSemesterDevelopment(values) {
  const errors = {};
  [
    ['developmentBooks', 'developmentBooksEvidence', 'Anexe um comprovante do livro.'],
    ['developmentCourses', 'developmentCoursesEvidence', 'Anexe um comprovante do curso.'],
    ['developmentCertifications', 'developmentCertificationsEvidence', 'Anexe a certificação.'],
    ['developmentEvents', 'developmentEventsEvidence', 'Anexe um comprovante do evento.'],
  ].forEach(([selectedField, evidenceField, message]) => {
    if (values[selectedField] && !values[evidenceField]) errors[evidenceField] = message;
  });

  return errors;
}

export function validateEvidenceFile(file) {
  if (!file) return 'Selecione um comprovante.';
  if (!EVIDENCE_RULES.acceptedTypes.includes(file.type)) {
    return 'Formato não permitido. Use JPG, PNG, WebP ou PDF.';
  }
  if (file.size > EVIDENCE_RULES.maxSizeBytes) {
    return 'O arquivo deve ter no máximo 10 MB.';
  }
  if (file.size <= 0) return 'O arquivo está vazio.';
  return '';
}
