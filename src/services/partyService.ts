import { getDb, toCents } from '@/db/db';
import {
  getDesktopApi,
  type DesktopPartyRow,
} from '@/lib/electronBridge';

export interface Party {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  address: string | null;
  contact: string | null;
  opening_balance: number;
  notes: string | null;
  status: string;
  activity_id: string | null;
  balance: number;
  total_transactions: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fromDesktopRow(row: DesktopPartyRow): Party {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    phone: row.phone,
    address: null,
    contact: null,
    opening_balance: 0,
    notes: null,
    status: row.status,
    activity_id: row.activity_id,
    balance: row.balance,
    total_transactions: 0,
  };
}

export async function listParties(typeFilter?: string): Promise<Party[]> {
  const rows = await getDesktopApi().farm.parties.list();
  return rows
    .filter((row) => !typeFilter || row.type === typeFilter || row.type === 'both')
    .map(fromDesktopRow);
}

export interface CreatePartyInput {
  name: string;
  type: string;
  phone?: string;
  address?: string;
  contact?: string;
  openingBalance?: number;
  notes?: string;
  activityId?: string | null;
}

// الرصيد الافتتاحي بالجنيه: الموجب مدين (عميل)، والسالب دائن (مورد)
export async function createParty(data: CreatePartyInput): Promise<{ id: string }> {
  return getDesktopApi().farm.parties.create({
    name: data.name,
    type: data.type,
    phone: data.phone ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
    activityId: data.activityId ?? null,
    openingBalance: Math.round((data.openingBalance ?? 0) * 100),
    date: todayIso(),
  });
}

export async function deleteParty(id: string): Promise<void> {
  await getDesktopApi().farm.parties.delete(id);
}

export interface PartyStatementRow {
  date: string;
  type: string;
  reference_type: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export async function getPartyStatement(partyId: string, dateFrom?: string, dateTo?: string): Promise<{ party: Party; rows: PartyStatementRow[]; opening: number; closing: number }> {
  const statement = await getDesktopApi().farm.parties.statement({
    partyId,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  });
  const rows: PartyStatementRow[] = [
    { date: '', type: 'opening', reference_type: null, description: 'رصيد افتتاحي', debit: 0, credit: 0, balance: statement.opening },
    ...statement.rows.map((row) => ({
      date: row.date,
      type: row.type,
      reference_type: row.reference_type,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      balance: 0,
    })),
  ];
  let running = statement.opening;
  for (const row of rows.slice(1)) {
    running += row.debit - row.credit;
    row.balance = running;
  }
  return {
    party: fromDesktopRow({ ...statement.party, balance: statement.closing }),
    rows,
    opening: statement.opening,
    closing: statement.closing,
  };
}

// يُستخدم فقط من مسار الفواتير في المتصفح؛ لا يُستدعى في نسخة سطح المكتب
export async function recordPartyTransaction(data: {
  partyId: string;
  date: string;
  type: string;
  referenceType?: string;
  referenceId?: string;
  debit?: number;
  credit?: number;
  description?: string;
}): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO party_transactions (party_id, date, type, reference_type, reference_id, debit, credit, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.partyId, data.date, data.type, data.referenceType ?? null, data.referenceId ?? null,
     toCents(data.debit ?? 0), toCents(data.credit ?? 0), data.description ?? null]
  );
}
