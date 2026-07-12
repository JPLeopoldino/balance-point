import type { Locale } from "./locale";

/**
 * Server-built, user-facing strings (soft warnings and the errors a normal
 * flow can hit). Rare/technical errors stay in English. UI copy lives in the
 * web app's dictionaries; only messages composed server-side belong here.
 */
export const serverMessages = {
  en: {
    negativeBalance: (name: string, amount: string) => `${name} is now negative (${amount}).`,
    negativeBalanceShort: (name: string) => `${name} is now negative.`,
    missingFxRate: (pair: string) =>
      `Set the ${pair} exchange rate in Settings to include all amounts.`,
    setRateBeforePaying: (pair: string) => `Set the ${pair} exchange rate before paying this bill.`,
    cardChargeNotPayable: "This is a card charge — it is settled through the card's statement bill.",
    chargeSettledViaStatement:
      "This charge was settled by the card's statement — mark the statement bill unpaid instead.",
    statementBillName: (card: string) => `${card} statement`,
    unpayBeforeEditing: "This bill is already paid — mark it unpaid before changing its amount.",
    unpayBeforeWontPay: "This bill is already paid — mark it unpaid before flagging it as won't pay.",
    refundAccountGone:
      "The account this bill was paid from no longer exists — reassign a source account first.",
    categoryExists: "A category with this name already exists",
  },
  "pt-BR": {
    negativeBalance: (name: string, amount: string) => `${name} ficou negativa (${amount}).`,
    negativeBalanceShort: (name: string) => `${name} ficou negativa.`,
    missingFxRate: (pair: string) =>
      `Defina a taxa de câmbio ${pair} em Ajustes para incluir todos os valores.`,
    setRateBeforePaying: (pair: string) =>
      `Defina a taxa de câmbio ${pair} antes de pagar esta conta.`,
    cardChargeNotPayable: "Isto é um gasto no cartão — ele é quitado pela fatura do cartão.",
    chargeSettledViaStatement:
      "Este gasto foi quitado pela fatura do cartão — desfaça o pagamento da fatura.",
    statementBillName: (card: string) => `Fatura ${card}`,
    unpayBeforeEditing: "Esta conta já foi paga — desfaça o pagamento antes de alterar o valor.",
    unpayBeforeWontPay:
      "Esta conta já foi paga — desfaça o pagamento antes de marcá-la como “não vou pagar”.",
    refundAccountGone:
      "A conta de onde este pagamento saiu não existe mais — defina outra conta de origem antes.",
    categoryExists: "Já existe uma categoria com esse nome",
  },
} satisfies Record<Locale, unknown>;

export type ServerMessages = (typeof serverMessages)["en"];

export function messagesFor(locale: Locale): ServerMessages {
  return serverMessages[locale] ?? serverMessages.en;
}
