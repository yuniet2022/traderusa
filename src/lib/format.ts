export const fmtPrice = (value: number) =>
  value >= 1000 ? '$' + value.toLocaleString('es', { maximumFractionDigits: 0 })
    : value >= 1 ? '$' + value.toFixed(2) : '$' + value.toPrecision(4);
