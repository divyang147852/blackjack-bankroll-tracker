const dayjs = require("dayjs");
const db = require("../db");
const { computeDailyPlan, computeGoalProgress, round2 } = require("../utils/calc");

async function getUserSettings(userId) {
  return db.get(
    `SELECT stop_loss_percent, profit_target_percent, withdrawal_percent, yearly_target, currency, theme
     FROM settings WHERE user_id = ?`,
    [userId]
  );
}

async function getAggregate(userId) {
  const row = await db.get(
    `SELECT
      COUNT(*) AS days_played,
      SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS days_won,
      SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) AS days_lost,
      COALESCE(SUM(profit_loss), 0) AS total_pl,
      COALESCE(SUM(withdrawal), 0) AS total_withdrawn,
      COALESCE(MAX(end_balance), 0) AS current_balance
     FROM sessions
     WHERE user_id = ?`,
    [userId]
  );

  return {
    daysPlayed: Number(row?.days_played || 0),
    daysWon: Number(row?.days_won || 0),
    daysLost: Number(row?.days_lost || 0),
    totalPL: round2(row?.total_pl || 0),
    totalWithdrawn: round2(row?.total_withdrawn || 0),
    currentBalance: round2(row?.current_balance || 0)
  };
}

async function getStreaks(userId) {
  const rows = await db.all(
    `SELECT date, profit_loss FROM sessions
     WHERE user_id = ?
     ORDER BY date ASC`,
    [userId]
  );

  let currentWin = 0;
  let currentLoss = 0;
  let bestWin = 0;
  let bestLoss = 0;

  rows.forEach((r) => {
    if (r.profit_loss > 0) {
      currentWin += 1;
      currentLoss = 0;
    } else if (r.profit_loss < 0) {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }

    bestWin = Math.max(bestWin, currentWin);
    bestLoss = Math.max(bestLoss, currentLoss);
  });

  return {
    currentWinStreak: currentWin,
    currentLossStreak: currentLoss,
    bestWinStreak: bestWin,
    bestLossStreak: bestLoss
  };
}

async function buildDashboard(userId) {
  const settings = await getUserSettings(userId);
  const aggregate = await getAggregate(userId);
  const streaks = await getStreaks(userId);

  const goal = computeGoalProgress({
    yearlyTarget: settings.yearly_target,
    currentBalance: aggregate.currentBalance,
    totalWithdrawn: aggregate.totalWithdrawn,
    daysPlayed: aggregate.daysPlayed
  });

  const roiPercent =
    aggregate.daysPlayed > 0 && aggregate.currentBalance > 0
      ? round2((aggregate.totalPL / Math.max(aggregate.currentBalance - aggregate.totalPL, 1)) * 100)
      : 0;

  const todayTarget = round2(aggregate.currentBalance * 0.01);
  const dailyPlan = computeDailyPlan({
    currentBalance: aggregate.currentBalance,
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent,
    withdrawalPercent: settings.withdrawal_percent
  });

  return {
    ...aggregate,
    ...streaks,
    roiPercent,
    totalValue: goal.totalValue,
    goalProgressPercent: goal.progressPercent,
    daysRemaining: goal.daysRemaining,
    requiredAverageDailyGrowth: goal.requiredAverageDailyGrowth,
    todayTarget,
    todayStopLoss: dailyPlan.todayStopLossAmount,
    todayProfitGoal: dailyPlan.todayProfitNeeded,
    todayProfitNeeded: dailyPlan.todayProfitNeeded,
    projectedBalanceAtStopLoss: dailyPlan.projectedBalanceAtStopLoss,
    projectedBalanceAtProfitTarget: dailyPlan.projectedBalanceAtProfitTarget,
    projectedWithdrawalAtStopLoss: dailyPlan.projectedWithdrawalAtStopLoss,
    projectedWithdrawalAtProfitTarget: dailyPlan.projectedWithdrawalAtProfitTarget,
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent,
    withdrawalPercent: settings.withdrawal_percent,
    yearlyTarget: settings.yearly_target,
    currency: settings.currency
  };
}

async function buildAnalytics(userId) {
  const rows = await db.all(
    `SELECT date, start_balance, profit_loss, withdrawal, end_balance
     FROM sessions
     WHERE user_id = ?
     ORDER BY date ASC`,
    [userId]
  );

  const monthlyMap = new Map();
  let wins = 0;
  let losses = 0;

  const balanceGrowth = rows.map((r) => ({ date: r.date, balance: round2(r.end_balance) }));
  const withdrawals = rows.map((r) => ({ date: r.date, withdrawal: round2(r.withdrawal) }));
  const dailyPL = rows.map((r) => ({ date: r.date, pl: round2(r.profit_loss) }));

  rows.forEach((r) => {
    const month = dayjs(r.date).format("YYYY-MM");
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, pl: 0, withdrawals: 0, sessions: 0 });
    }

    const current = monthlyMap.get(month);
    current.pl += r.profit_loss;
    current.withdrawals += r.withdrawal;
    current.sessions += 1;

    if (r.profit_loss > 0) {
      wins += 1;
    } else if (r.profit_loss < 0) {
      losses += 1;
    }
  });

  const monthlySummary = Array.from(monthlyMap.values()).map((m) => ({
    month: m.month,
    pl: round2(m.pl),
    withdrawals: round2(m.withdrawals),
    sessions: m.sessions
  }));

  const totalDecisions = wins + losses;
  const winRate = totalDecisions > 0 ? round2((wins / totalDecisions) * 100) : 0;

  return {
    balanceGrowth,
    withdrawals,
    dailyPL,
    monthlySummary,
    winLossPie: [
      { name: "Wins", value: wins },
      { name: "Losses", value: losses }
    ],
    winRate
  };
}

module.exports = {
  getUserSettings,
  getAggregate,
  buildDashboard,
  buildAnalytics
};
