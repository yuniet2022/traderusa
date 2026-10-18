export interface PositionSizeInput {
  capital: number;
  riskPercent: number;
  entry: number;
  stop: number;
  target: number;
  direction: 'long' | 'short';
  fractional: boolean;
  feePercent?: number;
  fixedFee?: number;
  slippagePercent?: number;
}

export function calculatePositionSize(input: PositionSizeInput) {
  const { capital, riskPercent, entry, stop, target, direction, fractional } = input;
  const { feePercent = 0, fixedFee = 0, slippagePercent = 0 } = input;
  if (![capital, riskPercent, entry, stop, target].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Introduce valores positivos en todos los campos.');
  }
  if (riskPercent > 100) throw new Error('El riesgo no puede superar el 100% del capital.');
  if (![feePercent, fixedFee, slippagePercent].every(value => Number.isFinite(value) && value >= 0)
    || feePercent >= 100 || slippagePercent >= 100) throw new Error('Introduce costes positivos o cero, con porcentajes inferiores al 100%.');
  const sign = direction === 'long' ? 1 : -1;
  if (sign * (entry - stop) <= 0) throw new Error(direction === 'long' ? 'El stop debe estar por debajo de la entrada.' : 'El stop debe estar por encima de la entrada.');
  if (sign * (target - entry) <= 0) throw new Error(direction === 'long' ? 'El objetivo debe estar por encima de la entrada.' : 'El objetivo debe estar por debajo de la entrada.');

  // Model an adverse fill on both entry and exit, then charge each side separately.
  const friction = slippagePercent / 100;
  const fee = feePercent / 100;
  const entryFill = entry * (1 + sign * friction);
  const stopFill = stop * (1 - sign * friction);
  const targetFill = target * (1 - sign * friction);
  const distance = sign * (entryFill - stopFill);
  const reward = sign * (targetFill - entryFill);
  const lossPerUnit = distance + fee * (entryFill + stopFill);
  const entryPerUnit = entryFill * (1 + fee);

  const riskBudget = capital * (riskPercent / 100);
  const rawQuantity = Math.max(0, Math.min((riskBudget - 2 * fixedFee) / lossPerUnit, (capital - fixedFee) / entryPerUnit));
  // Round down: never increase exposure to reach a whole share or fractional unit.
  const precision = fractional ? 1e8 : 1;
  let quantity = Math.floor(rawQuantity * precision) / precision;
  if (quantity > 0 && (quantity * lossPerUnit + 2 * fixedFee > riskBudget || quantity * entryPerUnit + fixedFee > capital)) quantity = Math.max(0, quantity - 1 / precision);
  const entryCost = quantity > 0 ? quantity * entryFill * fee + fixedFee : 0;
  const stopCost = quantity > 0 ? quantity * stopFill * fee + fixedFee : 0;
  const targetCost = quantity > 0 ? quantity * targetFill * fee + fixedFee : 0;
  const positionValue = quantity * entryFill;
  const capitalUsed = positionValue + entryCost;
  const estimatedLoss = quantity * distance + entryCost + stopCost;
  const estimatedGain = quantity * reward - entryCost - targetCost;
  const rewardRisk = estimatedLoss > 0 ? estimatedGain / estimatedLoss : 0;
  const targetFriction = quantity * sign * ((entryFill - entry) + (target - targetFill));
  const totalTargetCosts = entryCost + targetCost + targetFriction;
  const breakEvenWinRate = estimatedGain > 0 && estimatedLoss > 0 ? estimatedLoss / (estimatedGain + estimatedLoss) * 100 : null;
  if (![quantity, positionValue, capitalUsed, estimatedLoss, estimatedGain, rewardRisk, totalTargetCosts, entryFill, stopFill, targetFill].every(Number.isFinite)) {
    throw new Error('Los valores introducidos exceden el rango de cálculo.');
  }
  return { quantity, positionValue, capitalUsed, estimatedLoss, estimatedGain, rewardRisk, riskBudget, entryFill, stopFill, targetFill, totalTargetCosts, breakEvenWinRate };
}
