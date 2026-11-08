import { getDesktopApi } from '@/lib/electronBridge';

const ALL_TIME_FROM = '1970-01-01';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DashboardStats {
  totalRevenues: number;
  totalExpenses: number;
  netProfit: number;
  cashBalance: number;
  totalReceivables: number;
  totalPayables: number;
  totalPurchases: number;
  totalSales: number;
  inventoryValue: number;
  salariesDue: number;
  advancesDue: number;
  checksDue: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const s = await getDesktopApi().farm.dashboard.summary({ asOf: todayIso() });
  return {
    totalRevenues: s.totalRevenues / 100,
    totalExpenses: s.totalExpenses / 100,
    netProfit: s.netProfit / 100,
    cashBalance: s.cashOnHand / 100,
    totalReceivables: Math.max(0, s.receivables / 100),
    totalPayables: Math.max(0, s.payables / 100),
    totalPurchases: s.totalPurchases / 100,
    totalSales: s.totalSales / 100,
    inventoryValue: s.inventoryValue / 100,
    salariesDue: s.salariesDue / 100,
    advancesDue: s.advancesDue / 100,
    checksDue: s.checksDue / 100,
  };
}

export interface ProfitLossReport {
  revenues: { account: string; amount: number }[];
  expenses: { account: string; amount: number }[];
  totalRevenues: number;
  totalExpenses: number;
  netProfit: number;
}

export async function getProfitLoss(activityId?: string | null, dateFrom?: string, dateTo?: string): Promise<ProfitLossReport> {
  const report = (await getDesktopApi().farm.accounting.profitLoss({
    activityId, dateFrom: dateFrom ?? ALL_TIME_FROM, dateTo: dateTo ?? todayIso(),
  })) as {
    lines: { name: string; type: string; amount: number }[];
    revenue: number;
    expenses: number;
  };
  const revenues = report.lines.filter((l) => l.type === 'revenue').map((l) => ({ account: l.name, amount: l.amount / 100 }));
  const expenses = report.lines.filter((l) => l.type === 'expense').map((l) => ({ account: l.name, amount: l.amount / 100 }));
  const totalRevenues = report.revenue / 100;
  const totalExpenses = report.expenses / 100;
  return { revenues, expenses, totalRevenues, totalExpenses, netProfit: totalRevenues - totalExpenses };
}

export interface ActivitySummary {
  activity_id: string;
  activity_name: string;
  revenues: number;
  expenses: number;
  profit: number;
}

export async function getActivitySummaries(dateFrom?: string, dateTo?: string): Promise<ActivitySummary[]> {
  const api = getDesktopApi();
  const activities = await api.farm.activities.list();
  return Promise.all(activities.map(async (activity) => {
    const report = (await api.farm.accounting.profitLoss({
      activityId: activity.id, dateFrom: dateFrom ?? ALL_TIME_FROM, dateTo: dateTo ?? todayIso(),
    })) as { revenue: number; expenses: number };
    return {
      activity_id: activity.id,
      activity_name: activity.name,
      revenues: report.revenue / 100,
      expenses: report.expenses / 100,
      profit: (report.revenue - report.expenses) / 100,
    };
  }));
}
