import { getDesktopApi } from '@/lib/electronBridge';
import { egpToPiastres } from '@/lib/format';
import { resolveActiveCashboxId } from '@/services/cashboxService';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Employee {
  id: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  hire_date: string | null;
  base_salary: number;
  salary_type: string;
  status: string;
  activity_id: string | null;
}

export async function listEmployees(): Promise<Employee[]> {
  return (await getDesktopApi().farm.employees.list()) as Employee[];
}

export async function createEmployee(data: {
  name: string; phone?: string; jobTitle?: string; hireDate?: string;
  baseSalary: number; salaryType: string; activityId?: string | null;
}): Promise<Employee> {
  const created = await getDesktopApi().farm.employees.create({ ...data, baseSalary: egpToPiastres(data.baseSalary) });
  const employee = (await listEmployees()).find((row) => row.id === created.id);
  if (!employee) throw new Error('تعذر إنشاء الموظف');
  return employee;
}

export interface Attendance {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
}

export async function listAttendance(employeeId?: string, month?: string): Promise<Attendance[]> {
  const rows = (await getDesktopApi().farm.employees.attendance({ month: month ?? currentMonth() })) as Attendance[];
  return employeeId ? rows.filter((row) => row.employee_id === employeeId) : rows;
}

export async function recordAttendance(data: {
  employeeId: string; date: string; status: string; checkIn?: string; checkOut?: string; notes?: string;
}): Promise<void> {
  await getDesktopApi().farm.employees.recordAttendance(data);
}

export interface SalaryRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  month: string;
  base_salary: number;
  overtime: number;
  deductions: number;
  advance_deduct: number;
  net_salary: number;
  status: string;
}

export async function listSalaryRecords(month?: string): Promise<SalaryRecord[]> {
  return (await getDesktopApi().farm.employees.salaries({ month: month ?? currentMonth() })) as SalaryRecord[];
}

export async function generatePayroll(data: { month: string; createdBy?: string | null }): Promise<void> {
  const api = getDesktopApi().farm.employees;
  const month = data.month.slice(0, 7);
  const [employees, existing] = await Promise.all([listEmployees(), listSalaryRecords(month)]);
  const alreadyGenerated = new Set(existing.map((record) => record.employee_id));
  for (const employee of employees) {
    if (employee.status !== 'active' || alreadyGenerated.has(employee.id)) continue;
    await api.createSalary({
      employeeId: employee.id,
      month,
      date: today(),
      createdBy: data.createdBy ?? null,
    });
  }
}

export async function paySalary(id: string, createdBy?: string | null, cashboxId?: string | null): Promise<void> {
  const resolvedCashboxId = await resolveActiveCashboxId(cashboxId);
  await getDesktopApi().farm.employees.paySalary({ salaryId: id, date: today(), cashboxId: resolvedCashboxId, createdBy: createdBy ?? null });
}

export interface EmployeeAdvance {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  amount: number;
  repayment_method: string;
  installment_amount: number;
  total_paid: number;
  remaining: number;
  status: string;
}

export async function listAdvances(): Promise<EmployeeAdvance[]> {
  return (await getDesktopApi().farm.employees.advances()) as EmployeeAdvance[];
}

export async function createAdvance(data: {
  employeeId: string; date: string; amount: number; installmentAmount?: number; cashboxId?: string | null; createdBy?: string | null;
}): Promise<void> {
  if (data.amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const cashboxId = await resolveActiveCashboxId(data.cashboxId);
  await getDesktopApi().farm.employees.createAdvance({
    employeeId: data.employeeId,
    date: data.date,
    amount: egpToPiastres(data.amount),
    installmentAmount: data.installmentAmount !== undefined ? egpToPiastres(data.installmentAmount) : undefined,
    cashboxId,
    createdBy: data.createdBy ?? null,
  });
}

export async function recordDeduction(data: { employeeId: string; date: string; amount: number; description?: string; createdBy?: string | null }): Promise<void> {
  const record = getDesktopApi().farm.employees.recordDeduction;
  if (!record) throw new Error('تسجيل الخصم غير مدعوم');
  await record(data);
}
