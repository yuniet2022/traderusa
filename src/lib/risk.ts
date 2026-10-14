export interface PositionSizeInput {
  capital: number;
  riskPercent: number;
  entry: number;
  stop: number;
  target: number;
  direction: 'long' | 'short';
  fractional: boolean;
}

export function calculatePositionSize(input: PositionSizeInput) {
  const { capital, riskPercent, entry, stop, target, direction, fractional } = input;
  if (![capital, riskPercent, entry, stop, target].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Introduce valores positivos en todos los campos.');
  }
  if (riskPercent > 100) throw new Error('El riesgo no puede superar el 100% del capital.');
  const distance = direction === 'long' ? entry - stop : stop - entry;
  const reward = direction === 'long' ? target - entry : entry - target;
  if (distance <= 0) throw new Error(direction === 'long' ? 'El stop debe estar por debajo de la entrada.' : 'El stop debe estar por encima de la entrada.');
  if (reward <= 0) throw new Error(direction === 'long' ? 'El objetivo debe estar por encima de la entrada.' : 'El objetivo debe estar por debajo de la entrada.');

  const riskBudget = capital * (riskPercent / 100);
  const rawQuantity = Math.min(riskBudget / distance, capital / entry);
  // Round down: never increase exposure to reach a whole share or fractional unit.
  const precision = fractional ? 1e8 : 1;
  const quantity = Math.floor(rawQuantity * precision) / precision;
  const positionValue = quantity * entry;
  const estimatedLoss = quantity * distance;
  const estimatedGain = quantity * reward;
  const rewardRisk = reward / distance;
  if (![quantity, positionValue, estimatedLoss, estimatedGain, rewardRisk].every(Number.isFinite)) {
    throw new Error('Los valores introducidos exceden el rango de cálculo.');
  }
  return { quantity, positionValue, estimatedLoss, estimatedGain, rewardRisk, riskBudget };
}
