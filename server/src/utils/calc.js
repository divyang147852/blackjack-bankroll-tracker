function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function computeSessionMetrics({
  startBalance,
  profitLoss,
  withdrawalPercent,
  stopLossPercent,
  profitTargetPercent
}) {
  const safeStart = Math.max(0, Number(startBalance || 0));
  const safePL = Number(profitLoss || 0);
  const balanceBeforeWithdrawal = safeStart + safePL;

  if (balanceBeforeWithdrawal < 0) {
    return {
      endBalance: round2(balanceBeforeWithdrawal),
      suggestedWithdrawal: 0,
      unitSize: 0,
      nextDayStopLoss: 0,
      nextDayProfitTarget: 0
    };
  }

  const suggestedWithdrawal = round2(
    Math.max(0, balanceBeforeWithdrawal * (Number(withdrawalPercent || 0) / 100))
  );
  const endBalance = round2(Math.max(0, balanceBeforeWithdrawal - suggestedWithdrawal));
  const unitSize = round2(endBalance * 0.01);
  const nextDayStopLoss = round2(endBalance * (Number(stopLossPercent || 0) / 100));
  const nextDayProfitTarget = round2(endBalance * (Number(profitTargetPercent || 0) / 100));

  return {
    endBalance,
    suggestedWithdrawal,
    unitSize,
    nextDayStopLoss,
    nextDayProfitTarget
  };
}

function computeGoalProgress({ yearlyTarget, currentBalance, totalWithdrawn, daysPlayed }) {
  const safeTarget = Math.max(0, Number(yearlyTarget || 0));
  const totalValue = round2(Number(currentBalance || 0) + Number(totalWithdrawn || 0));
  const progressPercent = safeTarget > 0 ? round2((totalValue / safeTarget) * 100) : 0;

  const safeDaysPlayed = Math.max(Number(daysPlayed || 0), 0);
  const daysRemaining = safeDaysPlayed > 0 ? Math.max(365 - (safeDaysPlayed - 1), 0) : 365;

  const remaining = Math.max(safeTarget - totalValue, 0);
  const requiredAverageDailyGrowth = daysRemaining > 0 ? round2(remaining / daysRemaining) : round2(remaining);

  return {
    totalValue,
    progressPercent,
    daysRemaining,
    requiredAverageDailyGrowth
  };
}

function computeDailyPlan({
  currentBalance,
  stopLossPercent,
  profitTargetPercent,
  withdrawalPercent
}) {
  const safeBalance = Math.max(0, Number(currentBalance || 0));
  const safeStopLossPercent = Math.max(0, Number(stopLossPercent || 0));
  const safeProfitTargetPercent = Math.max(0, Number(profitTargetPercent || 0));
  const safeWithdrawalPercent = Math.max(0, Number(withdrawalPercent || 0));

  const todayStopLossAmount = round2(safeBalance * (safeStopLossPercent / 100));
  const todayProfitNeeded = round2(safeBalance * (safeProfitTargetPercent / 100));

  const projectedBalanceAtStopLoss = round2(Math.max(0, safeBalance - todayStopLossAmount));
  const projectedBalanceAtProfitTarget = round2(safeBalance + todayProfitNeeded);

  const projectedWithdrawalAtStopLoss = round2(
    projectedBalanceAtStopLoss * (safeWithdrawalPercent / 100)
  );
  const projectedWithdrawalAtProfitTarget = round2(
    projectedBalanceAtProfitTarget * (safeWithdrawalPercent / 100)
  );

  return {
    todayStopLossAmount,
    todayProfitNeeded,
    projectedBalanceAtStopLoss,
    projectedBalanceAtProfitTarget,
    projectedWithdrawalAtStopLoss,
    projectedWithdrawalAtProfitTarget
  };
}

module.exports = {
  round2,
  computeSessionMetrics,
  computeGoalProgress,
  computeDailyPlan
};
