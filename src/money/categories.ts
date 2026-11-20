import type { TxKind } from '../data/types';

export interface Category {
  id: string;
  name: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'groceries', name: 'Groceries' },
  { id: 'eating', name: 'Eating out' },
  { id: 'housing', name: 'Housing' },
  { id: 'bills', name: 'Bills & utilities' },
  { id: 'transport', name: 'Transport' },
  { id: 'health', name: 'Health' },
  { id: 'fun', name: 'Fun' },
  { id: 'games', name: 'Games' },
  { id: 'books', name: 'Books' },
  { id: 'shopping', name: 'Shopping' },
  { id: 'education', name: 'Education' },
  { id: 'subscriptions', name: 'Subscriptions' },
  { id: 'card', name: 'Credit card bill' },
  { id: 'debt', name: 'Debt payment' },
  { id: 'savings', name: 'Savings' },
  { id: 'other', name: 'Other' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salary' },
  { id: 'extra', name: 'Extra income' },
  { id: 'interest', name: 'Interest' },
  { id: 'refund', name: 'Refund' },
  { id: 'other-income', name: 'Other income' },
];

/** Used for "correct the balance"; never offered as a choice. */
export const ADJUSTMENT = 'adjustment';

const NAMES = new Map<string, string>([
  ...[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c.name] as [string, string]),
  [ADJUSTMENT, 'Balance correction'],
]);

export const categoryName = (id: string): string => NAMES.get(id) ?? 'Other';

export const categoriesFor = (kind: TxKind): Category[] => (kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES);

export const defaultCategory = (kind: TxKind): string => (kind === 'expense' ? 'other' : 'other-income');

/**
 * Money going out that isn't "spending": paying off a debt, putting money aside,
 * and balance corrections. These don't count against the monthly budget.
 */
export const NOT_SPENDING = new Set(['debt', 'savings', ADJUSTMENT]);

const RULES: [RegExp, string][] = [
  [/ifood|rappi|restaurante|lanchonete|padaria|pizza|burger|mc ?donald|cafe|café|bar /i, 'eating'],
  [/mercado|supermerc|carrefour|assai|atacad|hortifruti|pao de acucar|pão de açúcar|extra hiper/i, 'groceries'],
  [/uber|99 ?app|99 ?pop|posto|combust|gasolina|estaciona|metro|metrô|onibus|ônibus|bilhete|pedagio|pedágio/i, 'transport'],
  [/netflix|spotify|prime video|amazon prime|disney|hbo|youtube|icloud|apple\.com|google one|assinatura/i, 'subscriptions'],
  [/farmacia|farmácia|drogaria|droga ?raia|drogasil|hospital|clinica|clínica|unimed|laborat/i, 'health'],
  [/aluguel|condom[ií]ni|iptu/i, 'housing'],
  [/energia|enel|cemig|copel|ceee|light |sabesp|agua|água|internet|vivo|claro|tim |oi fibra|telefone|gas |gás|consigaz|comgas|seguro/i, 'bills'],
  [/steam|playstation|\bpsn\b|xbox|nintendo|epic ?games|gog\.com|\briot\b|blizzard|ubisoft|nuuvem|\bgames?/i, 'games'],
  [/livraria|\blivros?\b|kindle|\bbooks?\b|saraiva|\bmang[aá]s?(?![a-z])/i, 'books'],
  [/cinema|ingresso|show /i, 'fun'],
  [/curso|udemy|alura|faculdade|escola|mensalidade/i, 'education'],
  [/amazon|mercado ?livre|shopee|magalu|magazine|americanas|aliexpress|shein/i, 'shopping'],
  [/fatura/i, 'card'],
  [/emprestimo|empréstimo|financiamento|parcela|credi[aá]rio|juros/i, 'debt'],
  [/poupanca|poupança|invest|aplicacao|aplicação|cdb|tesouro/i, 'savings'],
];

const INCOME_RULES: [RegExp, string][] = [
  [/salario|salário|remunera|folha|proventos/i, 'salary'],
  [/estorno|reembolso|devolu|devolvid/i, 'refund'],
  [/rendimento|rend pago/i, 'interest'],
];

/** A first guess at the category from a bank statement's description. The user can change it. */
export function guessCategory(memo: string, kind: TxKind): string {
  for (const [pattern, category] of kind === 'expense' ? RULES : INCOME_RULES) {
    if (pattern.test(memo)) return category;
  }
  return defaultCategory(kind);
}
