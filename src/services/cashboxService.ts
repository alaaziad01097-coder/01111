import { getDesktopApi } from '@/lib/electronBridge';

export async function resolveActiveCashboxId(requestedId?: string | null): Promise<string> {
  const cashboxes = await getDesktopApi().farm.treasury.cashboxes();
  const active = cashboxes.filter((box) => box.is_active);
  if (requestedId) {
    const match = active.find((box) => box.id === requestedId);
    if (!match) throw new Error('الخزينة المختارة غير موجودة أو غير مفعّلة');
    return match.id;
  }
  if (active.length === 0) throw new Error('لا توجد خزينة مفعّلة. أنشئ خزينة أولاً');
  return active[0].id;
}
