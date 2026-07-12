"use client";

import { Badge } from "@balance-point/ui/components/badge";

import { type MessageKey, useT } from "@/i18n";
import { type BillStatus, billStatus } from "@/lib/format";

/**
 * Status → badge mapping, shared by the desktop table and the mobile card list
 * so the two views can never drift apart. Colour is always paired with a label
 * (doc 08 §8.10 — never encode meaning with colour alone).
 */
export const STATUS_BADGE: Record<BillStatus, { labelKey: MessageKey; className: string }> = {
  paid: { labelKey: "status.paid", className: "bg-success/15 text-success" },
  overdue: { labelKey: "status.overdue", className: "bg-destructive/15 text-destructive" },
  "due-soon": { labelKey: "status.dueSoon", className: "bg-warning/15 text-warning" },
  pending: { labelKey: "status.pending", className: "bg-muted text-muted-foreground" },
  "on-card": { labelKey: "status.onCard", className: "bg-primary/10 text-primary/80" },
  "wont-pay": {
    labelKey: "status.wontPay",
    className: "bg-muted text-muted-foreground/80 line-through",
  },
};

export const STATUS_OPTIONS: BillStatus[] = [
  "overdue",
  "due-soon",
  "pending",
  "on-card",
  "paid",
  "wont-pay",
];

export function BillStatusBadge({
  bill,
}: {
  bill: { paid: boolean; wontPay: boolean; dueDate: string; creditCardId?: string | null };
}) {
  const t = useT();
  const badge = STATUS_BADGE[billStatus(bill)];
  return (
    <Badge className={`border-transparent text-[10px] ${badge.className}`}>
      {t(badge.labelKey)}
    </Badge>
  );
}
