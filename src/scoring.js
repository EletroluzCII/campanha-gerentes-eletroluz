export const WEIGHTS = Object.freeze({
  obz: 20,
  discount: 35,
  revenue: 40,
  development: 5,
});

export const DISCOUNT_LIMITS = Object.freeze({
  A: 11.4,
  B: 19.52,
});

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateScore(values) {
  const obzPercentage = Number(values.obzPercentage || 0);
  const revenuePercentage = Number(values.revenuePercentage || 0);
  const discountPercentage = Number(values.discountPercentage || 0);
  const discountBand = values.discountBand === 'B' ? 'B' : 'A';
  const initiatives = [
    values.developmentBooks,
    values.developmentCourses,
    values.developmentCertifications,
    values.developmentEvents,
  ].filter(Boolean).length;

  const obzPoints = obzPercentage < 95
    ? 0
    : Math.min(WEIGHTS.obz, (obzPercentage / 100) * WEIGHTS.obz);
  const revenuePoints = Math.min(
    WEIGHTS.revenue,
    (revenuePercentage / 100) * WEIGHTS.revenue,
  );
  const hasDiscountValue = values.discountPercentage !== ''
    && values.discountPercentage !== null
    && values.discountPercentage !== undefined;
  const discountPoints = hasDiscountValue && discountPercentage <= DISCOUNT_LIMITS[discountBand]
    ? WEIGHTS.discount
    : 0;
  const developmentPoints = Math.min(
    WEIGHTS.development,
    (initiatives / 3) * WEIGHTS.development,
  );

  const parts = {
    obzPoints: round2(obzPoints),
    discountPoints: round2(discountPoints),
    revenuePoints: round2(revenuePoints),
    developmentPoints: round2(developmentPoints),
  };

  return {
    ...parts,
    initiatives,
    totalPoints: round2(Object.values(parts).reduce((sum, item) => sum + item, 0)),
  };
}

export function validateMetrics(values) {
  const errors = {};
  const numericFields = [
    ['obzPercentage', 'Informe o atingimento do OBZ.'],
    ['revenuePercentage', 'Informe o atingimento do faturamento.'],
    ['discountPercentage', 'Informe o percentual de desconto.'],
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

  if (!['A', 'B'].includes(values.discountBand)) {
    errors.discountBand = 'Selecione uma faixa válida.';
  }

  return errors;
}
