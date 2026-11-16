import {
  BudgetCycle,
  CATEGORY_LABELS,
  LedgerTransaction,
  MonthlyStatement,
  WorkspaceSettings,
} from '../types/finance';

function escapeCsvCell(val: string | number | boolean): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(transactions: LedgerTransaction[], baseCurrency: string) {
  const headers = [
    'Date',
    'CycleMonth',
    'Type',
    'Category',
    'Description',
    'OriginalCurrency',
    'OriginalAmount',
    'FxRateToBase',
    `BaseAmount(${baseCurrency})`,
  ];
  const rows = transactions.map((tx) => [
    tx.occurredAt,
    tx.cycleMonth,
    tx.type,
    CATEGORY_LABELS[tx.category] || tx.category,
    tx.description,
    tx.currency,
    tx.amount.toFixed(2),
    tx.fxRateToBase.toFixed(6),
    tx.baseAmount.toFixed(2),
  ]);

  const csv = [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
  triggerFileDownload(`jescamp-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
}

export function exportStatementsAndTaxCsv(statements: MonthlyStatement[]) {
  const headers = [
    'MonthKey',
    'Currency',
    'TotalRevenue',
    'TaxSegregated',
    'BusinessMaterials',
    'Transportation',
    'WorkerSalaries',
    'SistersSchoolFees',
    'PendingLoansDebts',
    'SavingsAllocated',
    'GrowthAllocated',
    'DiscretionarySpent',
    'ClosingLiquidity',
    'SealedForAudit',
  ];
  const sorted = [...statements].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const rows = sorted.map((s) => [
    s.monthKey,
    s.currency,
    s.totalRevenue.toFixed(2),
    s.taxSegregated.toFixed(2),
    s.businessMaterials.toFixed(2),
    s.transportation.toFixed(2),
    s.workerSalaries.toFixed(2),
    s.sistersSchoolFees.toFixed(2),
    s.pendingLoansDebts.toFixed(2),
    s.savingsAllocated.toFixed(2),
    s.growthAllocated.toFixed(2),
    s.discretionarySpent.toFixed(2),
    s.closingLiquidity.toFixed(2),
    s.isClosed ? 'YES' : 'NO',
  ]);
  const csv = [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
  triggerFileDownload(`jescamp-statements-tax-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
}

export function exportFullArchiveJson(payload: {
  settings: WorkspaceSettings;
  statements: MonthlyStatement[];
  cycles: BudgetCycle[];
  transactions: LedgerTransaction[];
}) {
  const archive = {
    exportedAt: new Date().toISOString(),
    application: 'Jescamp Gifts & Deco',
    ...payload,
  };
  triggerFileDownload(
    `jescamp-treasury-archive-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(archive, null, 2),
    'application/json;charset=utf-8;'
  );
}

export function computeChecksum(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `FNV1A-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
