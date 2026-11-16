import { Timestamp } from 'firebase/firestore';

export type SupportedCurrency = 'KES' | 'USD' | 'EUR' | 'GBP';

export type TransactionType = 'income' | 'expense';

export type Tier1Category =
  | 'business_materials'
  | 'transportation'
  | 'worker_salaries'
  | 'sisters_school_fees'
  | 'pending_loans_debts';

export type SurplusCategory =
  | 'savings_vault'
  | 'growth_reinvestment'
  | 'discretionary';

export type LedgerCategory = 'client_revenue' | Tier1Category | SurplusCategory;

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['KES', 'USD', 'EUR', 'GBP'];

export const CURRENCY_META: Record<
  SupportedCurrency,
  { symbol: string; name: string; decimals: number }
> = {
  KES: { symbol: 'KES', name: 'Kenyan Shilling', decimals: 0 },
  USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', decimals: 2 },
};

export interface Tier1Definition {
  key: Tier1Category;
  rank: number;
  label: string;
  description: string;
}

export const TIER1_PRIORITY_ORDER: Tier1Definition[] = [
  {
    key: 'business_materials',
    rank: 1,
    label: 'Business Materials',
    description: 'Core inventory, raw stock, and direct production supplies.',
  },
  {
    key: 'transportation',
    rank: 2,
    label: 'Transportation & Food',
    description: 'Logistics, delivery fuel, transit, client dispatch, and daily meals.',
  },
  {
    key: 'worker_salaries',
    rank: 3,
    label: 'Worker Salaries',
    description: 'Staff payroll, contractor wages, and statutory labor pay.',
  },
  {
    key: 'sisters_school_fees',
    rank: 4,
    label: "Sister's School Fees",
    description: 'Non-negotiable tuition, boarding, and academic obligations.',
  },
  {
    key: 'pending_loans_debts',
    rank: 5,
    label: 'Pending Loans / Debts',
    description: 'Confirmed debt service and credit obligations for this cycle.',
  },
];

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  client_revenue: 'Client Revenue',
  business_materials: 'Business Materials',
  transportation: 'Transportation & Food',
  worker_salaries: 'Worker Salaries',
  sisters_school_fees: "Sister's School Fees",
  pending_loans_debts: 'Pending Loans / Debts',
  savings_vault: 'Savings Vault',
  growth_reinvestment: 'Growth Reinvestment',
  discretionary: 'Discretionary Spend',
};

export interface WorkspaceSettings {
  ownerId: string;
  companyName: string;
  baseCurrency: SupportedCurrency;
  taxReserveRate: number; // e.g. 0.16
  essentialsPct: number; // e.g. 0.60
  debtPct: number; // e.g. 0.20
  saveInvestPct: number; // e.g. 0.15
  guiltFreePct: number; // e.g. 0.05
  essentialsMaterialsTarget: number; // default 150000
  essentialsTransportFoodTarget: number; // default 20000
  essentialsSalariesTarget: number; // default 40000
  essentialsSchoolFeesTarget: number; // default 20000
  savingsWeight: number;
  growthWeight: number;
  discretionaryWeight: number;
  lowLiquidityThresholdPct: number;
  savingsMilestoneTarget: number;
  autoBackupEnabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MonthlyStatement {
  ownerId: string;
  monthKey: string; // YYYY-MM
  currency: SupportedCurrency;
  totalRevenue: number;
  taxSegregated: number;
  businessMaterials: number;
  transportation: number;
  workerSalaries: number;
  sistersSchoolFees: number;
  pendingLoansDebts: number;
  savingsAllocated: number;
  growthAllocated: number;
  discretionarySpent: number;
  closingLiquidity: number;
  isClosed: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BudgetCycle {
  ownerId: string;
  cycleMonth: string; // YYYY-MM
  baselineMonth: string; // T-2 YYYY-MM
  currency: SupportedCurrency;
  debtCheckCompleted: boolean;
  confirmedDebtAmount: number;
  debtNote: string;
  lastDebtCheckAt: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LedgerTransaction {
  id: string;
  ownerId: string;
  cycleMonth: string;
  type: TransactionType;
  category: LedgerCategory;
  amount: number;
  currency: SupportedCurrency;
  fxRateToBase: number;
  baseAmount: number;
  description: string;
  occurredAt: string; // YYYY-MM-DD
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CloudBackup {
  id: string;
  ownerId: string;
  snapshotMonth: string;
  baseCurrency: SupportedCurrency;
  statementCount: number;
  transactionCount: number;
  totalTaxReserved: number;
  totalLiquidity: number;
  checksum: string;
  triggerSource: 'auto' | 'manual';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FxRatesMap {
  base: 'USD';
  rates: Record<SupportedCurrency, number>;
  fetchedAt: string;
  source: 'live' | 'fallback';
}

export interface Tier1AllocationRow {
  key: Tier1Category;
  rank: number;
  label: string;
  description: string;
  baselineTarget: number;
  fundedAmount: number;
  spentAmount: number;
  remainingFunded: number;
  shortfall: number;
  coveragePct: number;
  status: 'funded' | 'partial' | 'unfunded';
}

export interface PercentageBucketSummary {
  key: 'essentials' | 'debt' | 'save_invest' | 'guilt_free';
  label: string;
  percentage: number; // 0..1
  formulaLabel: string;
  rawPercentageAmount: number;
  rebalanceDelta: number;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  baselineNeed: number;
  guidance: string;
}

export interface TreasuryAlert {
  id: string;
  severity: 'critical' | 'warning' | 'positive';
  title: string;
  message: string;
  actionLabel?: string;
  actionType?: 'debt_check' | 'advisor' | 'statements';
}

export type BudgetBasisMode = 't2_first' | 'latest_statement' | 'recorded_income';

export interface CycleCalculationResult {
  cycleMonth: string;
  baselineMonth: string;
  hasBaselineStatement: boolean;
  activeStatementMonth?: string;
  allocationTargetMonth: string;
  allocationTargetRelation: 'active' | 'future' | 'past';
  allocationBasisSource: 'transactions' | 'cycle_statement' | 't2_statement' | 'none';
  allocationBasisLabel: string;
  txRevenue: number;
  totalRevenue: number;
  taxReserveRequired: number;
  distributableCash: number;
  essentialsBaseAllocated: number;
  saveInvestBaseAllocated: number;
  guiltFreeBaseAllocated: number;
  essentialsTargetTotal: number;
  effectiveMaterialsTarget: number;
  materialsSqueezedAmount: number;
  borrowedFromSavings: number;
  borrowedFromGuiltFree: number;
  essentialsSurplusToSavings: number;
  essentialsUncoveredGap: number;
  essentialsStatus:
    | 'idle'
    | 'exact'
    | 'borrowed_from_savings'
    | 'squeezed_materials'
    | 'borrowed_from_guilt_free'
    | 'surplus_to_savings'
    | 'insufficient_all_pools';
  essentialsAllocated: number;
  debtAllocated: number;
  saveInvestAllocated: number;
  guiltFreeAllocated: number;
  debtSurplusRedirect: number;
  percentageBuckets: PercentageBucketSummary[];
  tier1TotalRequired: number;
  tier1TotalFunded: number;
  tier1TotalSpent: number;
  tier1TotalShortfall: number;
  tier1CoveragePct: number;
  tier1FullyCovered: boolean;
  tier1Rows: Tier1AllocationRow[];
  surplusAvailable: number;
  surplusLocked: boolean;
  recommendedSavings: number;
  recommendedGrowth: number;
  recommendedDiscretionary: number;
  actualSavingsSpent: number;
  actualGrowthSpent: number;
  actualDiscretionarySpent: number;
  totalExpenses: number;
  netCashOnHand: number;
  projectedEndOfMonthLiquidity: number;
  alerts: TreasuryAlert[];
}

export interface DepositRoutingStep {
  key: 'essentials' | 'debt' | 'save_invest' | 'guilt_free';
  label: string;
  percentage: number;
  formula: string;
  rawAmount: number;
  rebalanceDelta: number;
  allocatedAmount: number;
  guidance: string;
}
