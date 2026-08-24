export const WEIGHTS = Object.freeze({
  obz: 20,
  indicator: 35,
  revenue: 40,
  development: 5,
});

export const DISCOUNT_LIMITS = Object.freeze({
  under500: 11.4,
  from501To2000: 19.52,
});

export const DISCOUNT_POINTS = Object.freeze({
  under500: 18,
  from501To2000: 17,
});

export const PROFITABILITY_TARGETS = Object.freeze({
  exceleds: 71.9,
  foco: 38,
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
  const profitabilityTarget = Number(values.profitabilityTarget || 100);
  const discountUnder500Percentage = Number(values.discountUnder500Percentage || 0);
  const discount501To2000Percentage = Number(values.discount501To2000Percentage || 0);
  const isProfitability = values.metricKind === 'profitability';
  const obzPoints = obzPercentage < 95
    ? 0
    : Math.min(WEIGHTS.obz, (obzPercentage / 100) * WEIGHTS.obz);
  const revenuePoints = Math.min(
    WEIGHTS.revenue,
    (revenuePercentage / 100) * WEIGHTS.revenue,
  );
  const hasProfitabilityValue = values.profitabilityPercentage !== '' && values.profitabilityPercentage !== null && values.profitabilityPercentage !== undefined;
  const hasDiscountUnder500Value = values.discountUnder500Percentage !== '' && values.discountUnder500Percentage !== null && values.discountUnder500Percentage !== undefined;
  const hasDiscount501To2000Value = values.discount501To2000Percentage !== '' && values.discount501To2000Percentage !== null && values.discount501To2000Percentage !== undefined;
  const discountUnder500Points = !hasDiscountUnder500Value || isProfitability
    ? 0
    : discountUnder500Percentage <= DISCOUNT_LIMITS.under500 ? DISCOUNT_POINTS.under500 : 0;
  const discount501To2000Points = !hasDiscount501To2000Value || isProfitability
    ? 0
    : discount501To2000Percentage <= DISCOUNT_LIMITS.from501To2000 ? DISCOUNT_POINTS.from501To2000 : 0;
  const indicatorPoints = isProfitability
    ? !hasProfitabilityValue
      ? 0
      : profitabilityPercentage < profitabilityTarget * 0.95
        ? 0
        : Math.min(WEIGHTS.indicator, (profitabilityPercentage / profitabilityTarget) * WEIGHTS.indicator)
    : discountUnder500Points + discount501To2000Points;
  const parts = {
    obzPoints: round2(obzPoints),
    indicatorPoints: round2(indicatorPoints),
    revenuePoints: round2(revenuePoints),
  };

  return {
    ...parts,
    discountUnder500Points: round2(discountUnder500Points),
    discount501To2000Points: round2(discount501To2000Points),
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
      : ['discountUnder500Percentage', 'Informe o desconto da faixa até R$ 500.'],
    ...(values.metricKind === 'profitability'
      ? []
      : [['discount501To2000Percentage', 'Informe o desconto da faixa de R$ 501 a R$ 2.000.']]),
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
