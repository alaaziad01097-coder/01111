import { getDesktopApi } from '@/lib/electronBridge';
import { egpToPiastres } from '@/lib/format';
import { resolveActiveCashboxId } from '@/services/cashboxService';

export interface ExpenseCategory {
  id: string;
  name: string;
  account_id: string | null;
}

export interface IncomeCategory {
  id: string;
  name: string;
  account_id: string | null;
}

export interface Expense {
  id: string;
  doc_number: string;
  date: string;
  category_name: string | null;
  amount: number;
  activity_id: string | null;
  payment_method: string;
  description: string | null;
  is_shared: boolean;
}

export interface Income {
  id: string;
  doc_number: string;
  date: string;
  category_name: string | null;
  amount: number;
  activity_id: string | null;
  payment_method: string;
  description: string | null;
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  return (await getDesktopApi().farm.expenses.categories()).expense;
}

export async function listIncomeCategories(): Promise<IncomeCategory[]> {
  return (await getDesktopApi().farm.expenses.categories()).income;
}

export async function listExpenses(): Promise<Expense[]> {
  return (await getDesktopApi().farm.expenses.list()) as Expense[];
}

export async function listIncomes(): Promise<Income[]> {
  return (await getDesktopApi().farm.incomes.list()) as Income[];
}

export async function createExpenseCategory(data: { name: string; accountId: string }): Promise<{ id: string }> {
  return getDesktopApi().farm.expenses.createCategory({ name: data.name, accountId: data.accountId });
}

export async function createIncomeCategory(data: { name: string; accountId: string }): Promise<{ id: string }> {
  return getDesktopApi().farm.incomes.createCategory({ name: data.name, accountId: data.accountId });
}

// النسب تُرسل بالجنيه كنسبة مئوية، وتُحوَّل إلى نقاط أساس (100% = 10000)
function toBasisPointDistributions(allocations: { activityId: string; percentage: number }[] | undefined) {
  return (allocations ?? []).map((row) => ({
    activityId: row.activityId,
    basisPoints: Math.round(row.percentage * 100),
  }));
}

export async function createExpense(data: {
  date: string;
  categoryId: string;
  amount: number;
  activityId?: string | null;
  paymentMethod?: string;
  description?: string;
  isShared?: boolean;
  createdBy?: string | null;
  cashboxId?: string | null;
  allocations?: { activityId: string; percentage: number }[];
}): Promise<void> {
  if (data.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const cashboxId = await resolveActiveCashboxId(data.cashboxId);
  await getDesktopApi().farm.expenses.create({
    date: data.date,
    categoryId: data.categoryId,
    amount: egpToPiastres(data.amount),
    activityId: data.activityId ?? null,
    description: data.description,
    cashboxId,
    distributions: toBasisPointDistributions(data.allocations),
    createdBy: data.createdBy ?? null,
  });
}

export async function createIncome(data: {
  date: string;
  categoryId: string;
  amount: number;
  activityId?: string | null;
  paymentMethod?: string;
  description?: string;
  createdBy?: string | null;
  cashboxId?: string | null;
}): Promise<void> {
  if (data.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const cashboxId = await resolveActiveCashboxId(data.cashboxId);
  await getDesktopApi().farm.incomes.create({
    date: data.date,
    categoryId: data.categoryId,
    amount: egpToPiastres(data.amount),
    activityId: data.activityId ?? null,
    description: data.description,
    cashboxId,
    createdBy: data.createdBy ?? null,
  });
}
