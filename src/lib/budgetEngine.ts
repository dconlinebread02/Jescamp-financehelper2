import {
  BudgetBasisMode,
  BudgetCycle,
  CURRENCY_META,
  CycleCalculationResult,
  DepositRoutingStep,
  FxRatesMap,
  LedgerTransaction,
  MonthlyStatement,
  PercentageBucketSummary,
  SupportedCurrency,
  TIER1_PRIORITY_ORDER,
  Tier1AllocationRow,
  Tier1Category,
  TreasuryAlert,
  WorkspaceSettings,
} from '../types/finance';
import { convertAmount } from './fxService';

export function getCurrentMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * T-2 Lagged Baseline Lookup:
 * November (2026-11) -> September (2026-09)
 * February (2026-02) -> December (2025-12)
 * January (2026-01) -> November (2025-11)
 */
export function getTMinusTwoMonth(cycleMonth: string): string {
  const [yearStr, monthStr] = cycleMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return cycleMonth;
  }
  if (month > 2) {
    return `${year}-${String(month - 2).padStart(2, '0')}`;
  }
  return `${year - 1}-${String(month + 10).padStart(2, '0')}`;
}

export function getOffsetMonthKey(monthKey: string, deltaMonths: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const d = new Date(year, month - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getTPlusTwoMonth(statementMonth: string): string {
  return getOffsetMonthKey(statementMonth, 2);
}

export interface StatementAllocationTargetInfo {
  statementMonth: string;
  statementLabel: string;
  targetMonth: string;
  targetLabel: string;
  relation: 'active' | 'future' | 'past';
  headline: string;
  shortLabel: string;
  explanation: string;
}

export function describeStatementAllocationTarget(
  statementMonthKey: string,
  referenceCycleMonth: string
): StatementAllocationTargetInfo {
  const targetMonth = getTPlusTwoMonth(statementMonthKey);
  const statementLabel = formatMonthLabel(statementMonthKey);
  const targetLabel = formatMonthLabel(targetMonth);
  const relation: 'active' | 'future' | 'past' =
    targetMonth === referenceCycleMonth
      ? 'active'
      : targetMonth > referenceCycleMonth
      ? 'future'
      : 'past';

  if (relation === 'active') {
    return {
      statementMonth: statementMonthKey,
      statementLabel,
      targetMonth,
      targetLabel,
      relation,
      headline: `Monthly Allocated Budget for ${targetLabel} (from ${statementLabel} Statement)`,
      shortLabel: `Active · For ${targetLabel}`,
      explanation: `Because this is the ${statementLabel} statement (T-2), it sets the active allocated budget for ${targetLabel}.`,
    };
  }

  if (relation === 'future') {
    return {
      statementMonth: statementMonthKey,
      statementLabel,
      targetMonth,
      targetLabel,
      relation,
      headline: `Future Allocation for ${targetLabel} (from ${statementLabel} Statement)`,
      shortLabel: `Future · For ${targetLabel}`,
      explanation: `Since this is the ${statementLabel} statement, this allocation is for the month of ${targetLabel}.`,
    };
  }

  return {
    statementMonth: statementMonthKey,
    statementLabel,
    targetMonth,
    targetLabel,
    relation,
    headline: `Would Have Been Allocated Budget for ${targetLabel} (from ${statementLabel} Statement)`,
    shortLabel: `Past · Would have been for ${targetLabel}`,
    explanation: `Since this is the ${statementLabel} statement, this would have been the allocated budget for ${targetLabel}.`,
  };
}

export function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatMonthNameOnly(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long' });
}

export function getProjectedAllocationStatusLabel(params: {
  statementMonth?: string;
  cycleMonth: string;
  currentMonth?: string;
}): {
  labelTitle: 'Projected Allocation Month';
  statusText: string;
  targetMonth: string;
  isHistorical: boolean;
  isFuture: boolean;
} {
  const currentMonth = params.currentMonth || getCurrentMonthKey();
  const targetMonth = params.statementMonth
    ? getTPlusTwoMonth(params.statementMonth)
    : params.cycleMonth;

  const currentYear = currentMonth.slice(0, 4);
  const targetYear = targetMonth.slice(0, 4);
  const monthText =
    targetYear === currentYear
      ? formatMonthNameOnly(targetMonth)
      : formatMonthLabel(targetMonth);

  const isHistorical = targetMonth < currentMonth;
  const isFuture = targetMonth > currentMonth;

  return {
    labelTitle: 'Projected Allocation Month',
    statusText: isHistorical
      ? `Historical Allocation for: ${monthText}`
      : `Projected Allocation for: ${monthText}`,
    targetMonth,
    isHistorical,
    isFuture,
  };
}

export function formatShortMonth(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function formatMoney(
  amount: number,
  currency: SupportedCurrency,
  compact = false
): string {
  const meta = CURRENCY_META[currency];
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (compact && Math.abs(safeAmount) >= 1_000_000) {
    return `${meta.symbol} ${(safeAmount / 1_000_000).toFixed(2)}M`;
  }
  if (currency === 'KES') {
    const rounded = Math.round(safeAmount);
    return `KES ${rounded.toLocaleString('en-US')}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(safeAmount);
}

export const DEFAULT_ESSENTIALS_TARGETS = {
  business_materials: 150000,
  transportation: 20000,
  worker_salaries: 40000,
  sisters_school_fees: 20000,
} as const;

export function getNormalizedPercentages(settings: WorkspaceSettings) {
  const e = settings.essentialsPct ?? 0.6;
  const d = settings.debtPct ?? 0.2;
  const s = settings.saveInvestPct ?? 0.15;
  const g = settings.guiltFreePct ?? 0.05;
  const sum = e + d + s + g || 1;
  return {
    essentialsPct: e / sum,
    debtPct: d / sum,
    saveInvestPct: s / sum,
    guiltFreePct: g / sum,
  };
}

export function getEssentialsTargets(settings: WorkspaceSettings) {
  const business_materials = Math.max(
    0,
    settings.essentialsMaterialsTarget ?? DEFAULT_ESSENTIALS_TARGETS.business_materials
  );
  const transportation = Math.max(
    0,
    settings.essentialsTransportFoodTarget ?? DEFAULT_ESSENTIALS_TARGETS.transportation
  );
  const worker_salaries = Math.max(
    0,
    settings.essentialsSalariesTarget ?? DEFAULT_ESSENTIALS_TARGETS.worker_salaries
  );
  const sisters_school_fees = Math.max(
    0,
    settings.essentialsSchoolFeesTarget ?? DEFAULT_ESSENTIALS_TARGETS.sisters_school_fees
  );
  const total =
    business_materials + transportation + worker_salaries + sisters_school_fees;

  return {
    business_materials,
    transportation,
    worker_salaries,
    sisters_school_fees,
    total,
  };
}

export interface EssentialsRebalanceResult {
  pct: ReturnType<typeof getNormalizedPercentages>;
  targets: ReturnType<typeof getEssentialsTargets>;
  materialsFloor: number;
  effectiveMaterialsTarget: number;
  materialsSqueezedAmount: number;
  effectiveEssentialsTotal: number;
  essentialsBaseAllocated: number;
  debtAllocated: number;
  saveInvestBaseAllocated: number;
  guiltFreeBaseAllocated: number;
  essentialsAllocated: number;
  saveInvestAllocated: number;
  guiltFreeAllocated: number;
  borrowedFromSavings: number;
  borrowedFromGuiltFree: number;
  essentialsSurplusToSavings: number;
  essentialsUncoveredGap: number;
  essentialsStatus: CycleCalculationResult['essentialsStatus'];
  itemAllocations: Record<
    'business_materials' | 'transportation' | 'worker_salaries' | 'sisters_school_fees',
    { target: number; funded: number; shortfall: number }
  >;
}

/**
 * Escalation Cascade for Essentials:
 *  1. Start with 60% Essentials vs 230K (150K Materials + 20K Transport/Food + 40K Salaries + 20K Fees).
 *  2. If 60% > 230K -> transfer leftover surplus to Save / Invest.
 *  3. If 60% < 230K -> automatically borrow from 15% Save / Invest.
 *  4. If 60% + 15% < 230K -> squeeze Materials from 150K down toward 100K floor (max 50K squeeze).
 *  5. If even after squeezing Materials to 100K (180K total) it still falls short -> borrow from 5% Guilt-Free.
 */
export function computeEssentialsRebalance(
  totalRevenue: number,
  settings: WorkspaceSettings
): EssentialsRebalanceResult {
  const safeRevenue = Math.max(0, totalRevenue);
  const pct = getNormalizedPercentages(settings);
  const targets = getEssentialsTargets(settings);
  const materialsFloor =
    targets.business_materials === 150000
      ? 100000
      : Math.round(targets.business_materials * (100000 / 150000));
  const maxMaterialsSqueeze = Math.max(0, targets.business_materials - materialsFloor);

  const essentialsBaseAllocated = safeRevenue * pct.essentialsPct;
  const debtAllocated = safeRevenue * pct.debtPct;
  const saveInvestBaseAllocated = safeRevenue * pct.saveInvestPct;
  const guiltFreeBaseAllocated = safeRevenue * pct.guiltFreePct;

  let essentialsAllocated = 0;
  let saveInvestAllocated = 0;
  let guiltFreeAllocated = 0;
  let borrowedFromSavings = 0;
  let borrowedFromGuiltFree = 0;
  let materialsSqueezedAmount = 0;
  let effectiveMaterialsTarget = targets.business_materials;
  let essentialsSurplusToSavings = 0;
  let essentialsUncoveredGap = 0;
  let essentialsStatus: CycleCalculationResult['essentialsStatus'] = 'idle';

  if (safeRevenue > 0) {
    const diff = essentialsBaseAllocated - targets.total;
    if (diff > 0.01) {
      essentialsSurplusToSavings = diff;
      essentialsAllocated = targets.total;
      saveInvestAllocated = saveInvestBaseAllocated + essentialsSurplusToSavings;
      guiltFreeAllocated = guiltFreeBaseAllocated;
      essentialsStatus = 'surplus_to_savings';
    } else if (diff >= -0.01) {
      essentialsAllocated = essentialsBaseAllocated;
      saveInvestAllocated = saveInvestBaseAllocated;
      guiltFreeAllocated = guiltFreeBaseAllocated;
      essentialsStatus = 'exact';
    } else {
      const shortfallNeeded = Math.abs(diff);
      borrowedFromSavings = Math.min(saveInvestBaseAllocated, shortfallNeeded);
      saveInvestAllocated = Math.max(0, saveInvestBaseAllocated - borrowedFromSavings);
      const poolAfterSavings = essentialsBaseAllocated + borrowedFromSavings;
      const gapAfterSavings = Math.max(0, targets.total - poolAfterSavings);

      if (gapAfterSavings <= 0.01) {
        essentialsAllocated = poolAfterSavings;
        guiltFreeAllocated = guiltFreeBaseAllocated;
        essentialsStatus = 'borrowed_from_savings';
      } else {
        // Step 4: Squeeze Materials from 150K toward 100K floor
        materialsSqueezedAmount = Math.min(maxMaterialsSqueeze, gapAfterSavings);
        effectiveMaterialsTarget = targets.business_materials - materialsSqueezedAmount;
        const squeezedTargetTotal = targets.total - materialsSqueezedAmount;
        const gapAfterSqueeze = Math.max(0, squeezedTargetTotal - poolAfterSavings);

        if (gapAfterSqueeze <= 0.01) {
          essentialsAllocated = poolAfterSavings;
          guiltFreeAllocated = guiltFreeBaseAllocated;
          essentialsStatus = 'squeezed_materials';
        } else {
          // Step 5: Borrow remaining shortfall from 5% Guilt-Free
          borrowedFromGuiltFree = Math.min(guiltFreeBaseAllocated, gapAfterSqueeze);
          guiltFreeAllocated = Math.max(0, guiltFreeBaseAllocated - borrowedFromGuiltFree);
          essentialsAllocated = poolAfterSavings + borrowedFromGuiltFree;
          essentialsUncoveredGap = Math.max(0, squeezedTargetTotal - essentialsAllocated);
          essentialsStatus =
            essentialsUncoveredGap > 0.01
              ? 'insufficient_all_pools'
              : 'borrowed_from_guilt_free';
        }
      }
    }
  }

  const effectiveTargets = {
    business_materials: effectiveMaterialsTarget,
    transportation: targets.transportation,
    worker_salaries: targets.worker_salaries,
    sisters_school_fees: targets.sisters_school_fees,
  };
  const effectiveEssentialsTotal =
    effectiveTargets.business_materials +
    effectiveTargets.transportation +
    effectiveTargets.worker_salaries +
    effectiveTargets.sisters_school_fees;

  let pool = essentialsAllocated;
  const order: Array<
    'business_materials' | 'transportation' | 'worker_salaries' | 'sisters_school_fees'
  > = ['business_materials', 'transportation', 'worker_salaries', 'sisters_school_fees'];

  const itemAllocations = {} as EssentialsRebalanceResult['itemAllocations'];
  for (const key of order) {
    const target = effectiveTargets[key];
    const funded = Math.min(pool, target);
    pool = Math.max(0, pool - funded);
    itemAllocations[key] = {
      target,
      funded,
      shortfall: Math.max(0, target - funded),
    };
  }

  return {
    pct,
    targets,
    materialsFloor,
    effectiveMaterialsTarget,
    materialsSqueezedAmount,
    effectiveEssentialsTotal,
    essentialsBaseAllocated,
    debtAllocated,
    saveInvestBaseAllocated,
    guiltFreeBaseAllocated,
    essentialsAllocated,
    saveInvestAllocated,
    guiltFreeAllocated,
    borrowedFromSavings,
    borrowedFromGuiltFree,
    essentialsSurplusToSavings,
    essentialsUncoveredGap,
    essentialsStatus,
    itemAllocations,
  };
}

export interface StatementAutoAllocations {
  businessMaterials: number;
  transportation: number;
  workerSalaries: number;
  sistersSchoolFees: number;
  pendingLoansDebts: number;
  savingsAllocated: number;
  growthAllocated: number;
  discretionarySpent: number;
  taxSegregated: number;
  closingLiquidity: number;
}

export function computeStatementAutoAllocations(params: {
  subtotal: number;
  statementCurrency: SupportedCurrency;
  settings: WorkspaceSettings;
  fx: FxRatesMap;
}): StatementAutoAllocations {
  const { subtotal, statementCurrency, settings, fx } = params;
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const taxSegregated = Number((safeSubtotal * settings.taxReserveRate).toFixed(2));
  if (safeSubtotal <= 0) {
    return {
      businessMaterials: 0,
      transportation: 0,
      workerSalaries: 0,
      sistersSchoolFees: 0,
      pendingLoansDebts: 0,
      savingsAllocated: 0,
      growthAllocated: 0,
      discretionarySpent: 0,
      taxSegregated: 0,
      closingLiquidity: 0,
    };
  }

  const baseCur = settings.baseCurrency;
  const subtotalInBase = convertAmount(safeSubtotal, statementCurrency, baseCur, fx);
  const reb = computeEssentialsRebalance(subtotalInBase, settings);
  const toStmtCur = (baseVal: number) =>
    Math.round(convertAmount(baseVal, baseCur, statementCurrency, fx));

  const businessMaterials = toStmtCur(reb.itemAllocations.business_materials.funded);
  const transportation = toStmtCur(reb.itemAllocations.transportation.funded);
  const workerSalaries = toStmtCur(reb.itemAllocations.worker_salaries.funded);
  const sistersSchoolFees = toStmtCur(reb.itemAllocations.sisters_school_fees.funded);
  const pendingLoansDebts = toStmtCur(reb.debtAllocated);
  const savingsAllocated = toStmtCur(reb.saveInvestAllocated * 0.65);
  const growthAllocated = toStmtCur(reb.saveInvestAllocated * 0.35);
  const discretionarySpent = toStmtCur(reb.guiltFreeAllocated);
  const closingLiquidity =
    safeSubtotal -
    taxSegregated -
    (businessMaterials +
      transportation +
      workerSalaries +
      sistersSchoolFees +
      pendingLoansDebts +
      discretionarySpent);

  return {
    businessMaterials,
    transportation,
    workerSalaries,
    sistersSchoolFees,
    pendingLoansDebts,
    savingsAllocated,
    growthAllocated,
    discretionarySpent,
    taxSegregated,
    closingLiquidity,
  };
}

function getStatementBucketInBase(
  statement: MonthlyStatement | undefined,
  category: Tier1Category,
  baseCurrency: SupportedCurrency,
  fx: FxRatesMap
): number {
  if (!statement) return 0;
  let raw = 0;
  switch (category) {
    case 'business_materials':
      raw = statement.businessMaterials;
      break;
    case 'transportation':
      raw = statement.transportation;
      break;
    case 'worker_salaries':
      raw = statement.workerSalaries;
      break;
    case 'sisters_school_fees':
      raw = statement.sistersSchoolFees;
      break;
    case 'pending_loans_debts':
      raw = statement.pendingLoansDebts;
      break;
  }
  return convertAmount(raw, statement.currency, baseCurrency, fx);
}

export function calculateCycleAllocation(params: {
  cycleMonth: string;
  settings: WorkspaceSettings;
  statements: MonthlyStatement[];
  cycle: BudgetCycle | undefined;
  transactions: LedgerTransaction[];
  fx: FxRatesMap;
  basisMode?: BudgetBasisMode;
  selectedStatementMonth?: string | null;
}): CycleCalculationResult {
  const {
    cycleMonth,
    settings,
    statements,
    cycle,
    transactions,
    fx,
    basisMode = 't2_first',
    selectedStatementMonth = null,
  } = params;
  const baseCurrency = settings.baseCurrency;
  const baselineMonth = getTMinusTwoMonth(cycleMonth);
  const baselineStatement = statements.find((s) => s.monthKey === baselineMonth);
  const explicitlySelectedStatement = selectedStatementMonth
    ? statements.find((s) => s.monthKey === selectedStatementMonth)
    : undefined;

  const cycleTx = transactions.filter((t) => t.cycleMonth === cycleMonth);

  const txInBase = (t: LedgerTransaction) =>
    convertAmount(t.amount, t.currency, baseCurrency, fx);

  const txRevenue = cycleTx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + txInBase(t), 0);

  const currentCycleStatement = statements.find((s) => s.monthKey === cycleMonth);
  const statementsByRecency = [...statements].sort((a, b) => {
    const tA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
    const tB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
    if (tB !== tA) return tB - tA;
    return b.monthKey.localeCompare(a.monthKey);
  });
  const latestStatement =
    statementsByRecency.find((s) => s.totalRevenue > 0) || statements[0];

  let totalRevenue = 0;
  let activeStatementMonth: string | undefined = undefined;
  let allocationBasisSource: CycleCalculationResult['allocationBasisSource'] = 'none';
  let allocationBasisLabel = 'No income or statement yet';

  const applyBaseline = () => {
    if (baselineStatement && baselineStatement.totalRevenue > 0) {
      totalRevenue = convertAmount(
        baselineStatement.totalRevenue,
        baselineStatement.currency,
        baseCurrency,
        fx
      );
      activeStatementMonth = baselineStatement.monthKey;
      allocationBasisSource = 't2_statement';
      allocationBasisLabel = `T-2 Statement Subtotal (${baselineStatement.monthKey})`;
      return true;
    }
    return false;
  };

  const applyLatestStatement = () => {
    if (latestStatement && latestStatement.totalRevenue > 0) {
      totalRevenue = convertAmount(
        latestStatement.totalRevenue,
        latestStatement.currency,
        baseCurrency,
        fx
      );
      activeStatementMonth = latestStatement.monthKey;
      allocationBasisSource =
        latestStatement.monthKey === baselineMonth
          ? 't2_statement'
          : latestStatement.monthKey === cycleMonth
          ? 'cycle_statement'
          : 't2_statement';
      allocationBasisLabel =
        latestStatement.monthKey === baselineMonth
          ? `T-2 Statement Subtotal (${latestStatement.monthKey})`
          : `Statement Subtotal (${latestStatement.monthKey})`;
      return true;
    }
    return false;
  };

  const applyCycleStatement = () => {
    if (currentCycleStatement && currentCycleStatement.totalRevenue > 0) {
      totalRevenue = convertAmount(
        currentCycleStatement.totalRevenue,
        currentCycleStatement.currency,
        baseCurrency,
        fx
      );
      activeStatementMonth = currentCycleStatement.monthKey;
      allocationBasisSource = 'cycle_statement';
      allocationBasisLabel = `Cycle Statement Subtotal (${currentCycleStatement.monthKey})`;
      return true;
    }
    return false;
  };

  const applyTransactions = () => {
    if (txRevenue > 0) {
      totalRevenue = txRevenue;
      activeStatementMonth = undefined;
      allocationBasisSource = 'transactions';
      allocationBasisLabel = `Recorded Income (${cycleMonth})`;
      return true;
    }
    return false;
  };

  const applySelectedStatement = () => {
    if (explicitlySelectedStatement && explicitlySelectedStatement.totalRevenue > 0) {
      totalRevenue = convertAmount(
        explicitlySelectedStatement.totalRevenue,
        explicitlySelectedStatement.currency,
        baseCurrency,
        fx
      );
      activeStatementMonth = explicitlySelectedStatement.monthKey;
      allocationBasisSource =
        explicitlySelectedStatement.monthKey === baselineMonth
          ? 't2_statement'
          : explicitlySelectedStatement.monthKey === cycleMonth
          ? 'cycle_statement'
          : 't2_statement';
      allocationBasisLabel =
        explicitlySelectedStatement.monthKey === baselineMonth
          ? `T-2 Statement Subtotal (${explicitlySelectedStatement.monthKey})`
          : `Selected Statement (${explicitlySelectedStatement.monthKey})`;
      return true;
    }
    return false;
  };

  if (basisMode === 'recorded_income') {
    if (!applyTransactions() && !applyBaseline() && !applyCycleStatement()) {
      applyLatestStatement();
    }
  } else if (basisMode === 'latest_statement') {
    if (
      !applySelectedStatement() &&
      !applyLatestStatement() &&
      !applyBaseline() &&
      !applyCycleStatement()
    ) {
      applyTransactions();
    }
  } else {
    // t2_first (default): Always honor the active T-2 statement first!
    if (
      !applySelectedStatement() &&
      !applyBaseline() &&
      !applyLatestStatement() &&
      !applyCycleStatement()
    ) {
      applyTransactions();
    }
  }

  const allocationTargetMonth = activeStatementMonth
    ? getTPlusTwoMonth(activeStatementMonth)
    : cycleMonth;
  const allocationTargetRelation: 'active' | 'future' | 'past' =
    allocationTargetMonth === cycleMonth
      ? 'active'
      : allocationTargetMonth > cycleMonth
      ? 'future'
      : 'past';

  const spentByCategory: Record<string, number> = {};
  for (const t of cycleTx) {
    if (t.type === 'expense') {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + txInBase(t);
    }
  }

  const reb = computeEssentialsRebalance(totalRevenue, settings);
  const {
    pct,
    targets,
    effectiveMaterialsTarget,
    materialsSqueezedAmount,
    effectiveEssentialsTotal,
    essentialsBaseAllocated,
    debtAllocated,
    saveInvestBaseAllocated,
    guiltFreeBaseAllocated,
    essentialsAllocated,
    saveInvestAllocated,
    guiltFreeAllocated,
    borrowedFromSavings,
    borrowedFromGuiltFree,
    essentialsSurplusToSavings,
    essentialsUncoveredGap,
    essentialsStatus,
    itemAllocations,
  } = reb;

  const taxReserveRequired = totalRevenue * settings.taxReserveRate;
  const distributableCash = Math.max(0, totalRevenue - taxReserveRequired);

  const tier1Rows: Tier1AllocationRow[] = TIER1_PRIORITY_ORDER.map((def) => {
    let baselineTarget = 0;
    let fundedAmount = 0;
    let shortfall = 0;

    if (def.key === 'pending_loans_debts') {
      baselineTarget =
        cycle && cycle.debtCheckCompleted
          ? convertAmount(cycle.confirmedDebtAmount, cycle.currency, baseCurrency, fx)
          : getStatementBucketInBase(baselineStatement, def.key, baseCurrency, fx);
      fundedAmount = Math.min(debtAllocated, baselineTarget);
      shortfall = Math.max(0, baselineTarget - fundedAmount);
    } else {
      const alloc = itemAllocations[def.key];
      baselineTarget = alloc.target;
      fundedAmount = alloc.funded;
      shortfall = alloc.shortfall;
    }

    const spentAmount = spentByCategory[def.key] || 0;
    const remainingFunded = Math.max(0, fundedAmount - spentAmount);
    const coveragePct =
      baselineTarget > 0 ? Math.min(100, (fundedAmount / baselineTarget) * 100) : 100;

    let status: Tier1AllocationRow['status'] = 'funded';
    if (baselineTarget > 0 && fundedAmount === 0) {
      status = 'unfunded';
    } else if (shortfall > 0.01) {
      status = 'partial';
    }

    return {
      key: def.key,
      rank: def.rank,
      label: def.label,
      description: def.description,
      baselineTarget,
      fundedAmount,
      spentAmount,
      remainingFunded,
      shortfall,
      coveragePct,
      status,
    };
  });

  const essentialsTargetTotal = targets.total;
  const essentialsSpentTotal = tier1Rows
    .filter((r) => r.key !== 'pending_loans_debts')
    .reduce((s, r) => s + r.spentAmount, 0);

  const debtRow = tier1Rows.find((r) => r.key === 'pending_loans_debts');
  const confirmedDebtTarget = debtRow?.baselineTarget || 0;
  const debtSpentTotal = debtRow?.spentAmount || 0;
  const debtSurplusRedirect = Math.max(0, debtAllocated - confirmedDebtTarget);

  const actualSavingsSpent = spentByCategory['savings_vault'] || 0;
  const actualGrowthSpent = spentByCategory['growth_reinvestment'] || 0;
  const actualDiscretionarySpent = spentByCategory['discretionary'] || 0;

  const saveInvestSpentTotal = actualSavingsSpent + actualGrowthSpent;

  const essentialsRebalanceDelta =
    borrowedFromSavings + borrowedFromGuiltFree > 0
      ? borrowedFromSavings + borrowedFromGuiltFree
      : essentialsSurplusToSavings > 0
      ? -essentialsSurplusToSavings
      : 0;

  const saveInvestRebalanceDelta =
    essentialsSurplusToSavings > 0
      ? essentialsSurplusToSavings
      : borrowedFromSavings > 0
      ? -borrowedFromSavings
      : 0;

  const guiltFreeRebalanceDelta = borrowedFromGuiltFree > 0 ? -borrowedFromGuiltFree : 0;

  const percentageBuckets: PercentageBucketSummary[] = [
    {
      key: 'essentials',
      label: 'Essentials (Materials, Transport & Food, Salaries, Fees)',
      percentage: pct.essentialsPct,
      formulaLabel: `${Math.round(pct.essentialsPct * 100)}% Base (${formatMoney(essentialsBaseAllocated, baseCurrency)})`,
      rawPercentageAmount: essentialsBaseAllocated,
      rebalanceDelta: essentialsRebalanceDelta,
      allocatedAmount: essentialsAllocated,
      spentAmount: essentialsSpentTotal,
      remainingAmount: essentialsAllocated - essentialsSpentTotal,
      baselineNeed: effectiveEssentialsTotal,
      guidance:
        essentialsStatus === 'borrowed_from_savings'
          ? `Borrowed ${formatMoney(borrowedFromSavings, baseCurrency)} from Save/Invest to cover ${formatMoney(essentialsTargetTotal, baseCurrency)}.`
          : essentialsStatus === 'squeezed_materials'
          ? `Borrowed ${formatMoney(borrowedFromSavings, baseCurrency)} from Save/Invest + squeezed Materials to ${formatMoney(effectiveMaterialsTarget, baseCurrency)}.`
          : essentialsStatus === 'borrowed_from_guilt_free'
          ? `Squeezed Materials to ${formatMoney(effectiveMaterialsTarget, baseCurrency)} + borrowed ${formatMoney(borrowedFromSavings, baseCurrency)} Save/Invest & ${formatMoney(borrowedFromGuiltFree, baseCurrency)} Guilt-Free.`
          : essentialsStatus === 'insufficient_all_pools'
          ? `Materials squeezed to ${formatMoney(effectiveMaterialsTarget, baseCurrency)} + used all Save/Invest & Guilt-Free; still short ${formatMoney(essentialsUncoveredGap, baseCurrency)}.`
          : essentialsStatus === 'surplus_to_savings'
          ? `Full ${formatMoney(essentialsTargetTotal, baseCurrency)} covered; transferred ${formatMoney(essentialsSurplusToSavings, baseCurrency)} extra to Save/Invest.`
          : essentialsStatus === 'exact'
          ? `Exact match for ${formatMoney(essentialsTargetTotal, baseCurrency)} Essentials baseline.`
          : `Fixed monthly plan: ${formatMoney(essentialsTargetTotal, baseCurrency)}.`,
    },
    {
      key: 'debt',
      label: 'Debt Repayment',
      percentage: pct.debtPct,
      formulaLabel: `Income × ${pct.debtPct.toFixed(2)}`,
      rawPercentageAmount: debtAllocated,
      rebalanceDelta: 0,
      allocatedAmount: debtAllocated,
      spentAmount: debtSpentTotal,
      remainingAmount: debtAllocated - debtSpentTotal,
      baselineNeed: confirmedDebtTarget,
      guidance:
        debtSurplusRedirect > 0.01
          ? `${formatMoney(debtSurplusRedirect, baseCurrency)} unused — redirect straight to Save / Invest.`
          : confirmedDebtTarget > debtAllocated
          ? `Confirmed debt exceeds ${Math.round(pct.debtPct * 100)}% slice by ${formatMoney(confirmedDebtTarget - debtAllocated, baseCurrency)}.`
          : 'Matches confirmed cycle debt obligation.',
    },
    {
      key: 'save_invest',
      label: 'Aim to Save / Invest',
      percentage: pct.saveInvestPct,
      formulaLabel: `${Math.round(pct.saveInvestPct * 100)}% Base (${formatMoney(saveInvestBaseAllocated, baseCurrency)})`,
      rawPercentageAmount: saveInvestBaseAllocated,
      rebalanceDelta: saveInvestRebalanceDelta,
      allocatedAmount: saveInvestAllocated,
      spentAmount: saveInvestSpentTotal,
      remainingAmount: saveInvestAllocated - saveInvestSpentTotal,
      baselineNeed: settings.savingsMilestoneTarget,
      guidance:
        essentialsSurplusToSavings > 0.01
          ? `Boosted by +${formatMoney(essentialsSurplusToSavings, baseCurrency)} leftover from 60% Essentials.`
          : borrowedFromSavings > 0.01
          ? `Lent ${formatMoney(borrowedFromSavings, baseCurrency)} to cover Essentials shortfall.`
          : 'Ring-fenced for emergency vault & startup growth.',
    },
    {
      key: 'guilt_free',
      label: 'Guilt-Free Spend',
      percentage: pct.guiltFreePct,
      formulaLabel: `${Math.round(pct.guiltFreePct * 100)}% Base (${formatMoney(guiltFreeBaseAllocated, baseCurrency)})`,
      rawPercentageAmount: guiltFreeBaseAllocated,
      rebalanceDelta: guiltFreeRebalanceDelta,
      allocatedAmount: guiltFreeAllocated,
      spentAmount: actualDiscretionarySpent,
      remainingAmount: guiltFreeAllocated - actualDiscretionarySpent,
      baselineNeed: guiltFreeAllocated,
      guidance:
        borrowedFromGuiltFree > 0.01
          ? `Lent ${formatMoney(borrowedFromGuiltFree, baseCurrency)} to Essentials after Materials squeezed to ${formatMoney(effectiveMaterialsTarget, baseCurrency)}.`
          : 'Stress-free discretionary allowance once essentials & savings are set.',
    },
  ];

  const tier1TotalRequired = tier1Rows.reduce((s, r) => s + r.baselineTarget, 0);
  const tier1TotalFunded = tier1Rows.reduce((s, r) => s + r.fundedAmount, 0);
  const tier1TotalSpent = tier1Rows.reduce((s, r) => s + r.spentAmount, 0);
  const tier1TotalShortfall = tier1Rows.reduce((s, r) => s + r.shortfall, 0);
  const tier1CoveragePct =
    tier1TotalRequired > 0
      ? Math.min(100, (tier1TotalFunded / tier1TotalRequired) * 100)
      : 100;
  const tier1FullyCovered = tier1TotalShortfall <= 0.01;

  const surplusAvailable = saveInvestAllocated + guiltFreeAllocated;
  const surplusLocked = !tier1FullyCovered;

  const recommendedSavings = saveInvestAllocated * 0.65;
  const recommendedGrowth = saveInvestAllocated * 0.35;
  const recommendedDiscretionary = guiltFreeAllocated;

  const totalExpenses = cycleTx
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + txInBase(t), 0);

  const netCashOnHand = totalRevenue - totalExpenses;
  const unpaidTier1Obligations = tier1Rows.reduce(
    (s, r) => s + Math.max(0, r.baselineTarget - r.spentAmount),
    0
  );
  const projectedEndOfMonthLiquidity =
    totalRevenue - totalExpenses - unpaidTier1Obligations;

  const alerts: TreasuryAlert[] = [];

  if (essentialsStatus === 'borrowed_from_savings') {
    alerts.push({
      id: 'essentials-borrowed-savings',
      severity: 'warning',
      title: 'Auto-Borrowed from 15% Save / Invest for Essentials',
      message: `60% Essentials (${formatMoney(essentialsBaseAllocated, baseCurrency)}) was short of ${formatMoney(essentialsTargetTotal, baseCurrency)}, so ${formatMoney(borrowedFromSavings, baseCurrency)} was automatically pulled from Save / Invest.`,
      actionLabel: 'Open Allocation Calculator',
      actionType: 'advisor',
    });
  } else if (essentialsStatus === 'squeezed_materials') {
    alerts.push({
      id: 'essentials-squeezed-materials',
      severity: 'warning',
      title: 'Save / Invest Borrowed + Materials Squeezed to Fit Budget',
      message: `After borrowing ${formatMoney(borrowedFromSavings, baseCurrency)} from 15% Save / Invest, Business Materials was automatically squeezed from ${formatMoney(targets.business_materials, baseCurrency)} down to ${formatMoney(effectiveMaterialsTarget, baseCurrency)} to cover Essentials cleanly.`,
      actionLabel: 'Open Allocation Calculator',
      actionType: 'advisor',
    });
  } else if (essentialsStatus === 'borrowed_from_guilt_free') {
    alerts.push({
      id: 'essentials-borrowed-guilt-free',
      severity: 'warning',
      title: 'Materials Squeezed to Floor + Borrowed from Guilt-Free',
      message: `Borrowed ${formatMoney(borrowedFromSavings, baseCurrency)} from Save / Invest, squeezed Materials from ${formatMoney(targets.business_materials, baseCurrency)} down to ${formatMoney(effectiveMaterialsTarget, baseCurrency)}, and borrowed ${formatMoney(borrowedFromGuiltFree, baseCurrency)} from 5% Guilt-Free to keep all Essentials covered.`,
      actionLabel: 'Open Allocation Calculator',
      actionType: 'advisor',
    });
  } else if (essentialsStatus === 'insufficient_all_pools') {
    alerts.push({
      id: 'essentials-shortfall-critical',
      severity: 'critical',
      title: 'Shortfall Remains Even After Materials Squeeze & Guilt-Free',
      message: `Borrowed all Save / Invest & Guilt-Free and squeezed Materials to ${formatMoney(effectiveMaterialsTarget, baseCurrency)}, leaving ${formatMoney(essentialsUncoveredGap, baseCurrency)} uncovered.`,
      actionLabel: 'Open Allocation Calculator',
      actionType: 'advisor',
    });
  } else if (essentialsStatus === 'surplus_to_savings') {
    alerts.push({
      id: 'essentials-surplus-transferred',
      severity: 'positive',
      title: 'Essentials Covered — Surplus Moved to Save / Invest',
      message: `All ${formatMoney(essentialsTargetTotal, baseCurrency)} in real-life Essentials are covered, and the leftover ${formatMoney(essentialsSurplusToSavings, baseCurrency)} was automatically transferred into Save / Invest.`,
    });
  }

  if (!cycle || !cycle.debtCheckCompleted) {
    alerts.push({
      id: 'pending-debt-check',
      severity: 'warning',
      title: 'Cycle Debt Check Required',
      message: `Confirm pending debts so your ${(pct.debtPct * 100).toFixed(0)}% Debt Repayment bucket knows whether to pay creditors or roll into Save / Invest.`,
      actionLabel: 'Run Debt Check',
      actionType: 'debt_check',
    });
  }

  const underfundedRows = tier1Rows.filter(
    (r) => r.baselineTarget > 0 && r.coveragePct < settings.lowLiquidityThresholdPct
  );
  if (underfundedRows.length > 0 && essentialsStatus !== 'insufficient_all_pools') {
    const names = underfundedRows.map((r) => `#${r.rank} ${r.label}`).join(', ');
    alerts.push({
      id: 'tier1-low-liquidity',
      severity: 'critical',
      title: 'Priority Obligations Below Target',
      message: `${formatMoney(tier1TotalShortfall, baseCurrency)} gap across ${names}.`,
      actionLabel: 'Open Allocation Calculator',
      actionType: 'advisor',
    });
  }

  const totalHistoricalSavings = statements.reduce(
    (s, st) => s + convertAmount(st.savingsAllocated, st.currency, baseCurrency, fx),
    0
  );
  const cumulativeSavings = totalHistoricalSavings + saveInvestAllocated + actualSavingsSpent;
  if (
    settings.savingsMilestoneTarget > 0 &&
    cumulativeSavings >= settings.savingsMilestoneTarget
  ) {
    alerts.push({
      id: 'savings-milestone',
      severity: 'positive',
      title: 'Savings Milestone Reached',
      message: `Cumulative reserves (${formatMoney(cumulativeSavings, baseCurrency)}) reached your ${formatMoney(settings.savingsMilestoneTarget, baseCurrency)} target.`,
    });
  }

  return {
    cycleMonth,
    baselineMonth,
    hasBaselineStatement: Boolean(baselineStatement),
    activeStatementMonth,
    allocationTargetMonth,
    allocationTargetRelation,
    allocationBasisSource,
    allocationBasisLabel,
    txRevenue,
    totalRevenue,
    taxReserveRequired,
    distributableCash,
    essentialsBaseAllocated,
    saveInvestBaseAllocated,
    guiltFreeBaseAllocated,
    essentialsTargetTotal,
    effectiveMaterialsTarget,
    materialsSqueezedAmount,
    borrowedFromSavings,
    borrowedFromGuiltFree,
    essentialsSurplusToSavings,
    essentialsUncoveredGap,
    essentialsStatus,
    essentialsAllocated,
    debtAllocated,
    saveInvestAllocated,
    guiltFreeAllocated,
    debtSurplusRedirect,
    percentageBuckets,
    tier1TotalRequired,
    tier1TotalFunded,
    tier1TotalSpent,
    tier1TotalShortfall,
    tier1CoveragePct,
    tier1FullyCovered,
    tier1Rows,
    surplusAvailable,
    surplusLocked,
    recommendedSavings,
    recommendedGrowth,
    recommendedDiscretionary,
    actualSavingsSpent,
    actualGrowthSpent,
    actualDiscretionarySpent,
    totalExpenses,
    netCashOnHand,
    projectedEndOfMonthLiquidity,
    alerts,
  };
}

/**
 * Percentage-Based Money Allocation Advisory with Full Escalation Cascade:
 *   Essentials (60%) <-> Save/Invest (15%) -> Materials Squeeze (150K->100K) -> Guilt-Free (5%)
 */
export function simulateIncomingDeposit(params: {
  incomingBaseAmount: number;
  currentCalc: CycleCalculationResult;
  settings: WorkspaceSettings;
}): DepositRoutingStep[] {
  const { incomingBaseAmount, currentCalc, settings } = params;
  if (incomingBaseAmount <= 0) return [];

  const cur = settings.baseCurrency;
  const reb = computeEssentialsRebalance(incomingBaseAmount, settings);
  const {
    pct,
    targets,
    effectiveMaterialsTarget,
    essentialsBaseAllocated,
    debtAllocated,
    saveInvestBaseAllocated,
    guiltFreeBaseAllocated,
    essentialsAllocated,
    saveInvestAllocated,
    guiltFreeAllocated,
    borrowedFromSavings,
    borrowedFromGuiltFree,
    essentialsSurplusToSavings,
    essentialsUncoveredGap,
    essentialsStatus,
  } = reb;

  const debtRow = currentCalc.tier1Rows.find((r) => r.key === 'pending_loans_debts');
  const debtShortfall = debtRow?.shortfall || 0;

  const essDelta =
    borrowedFromSavings + borrowedFromGuiltFree > 0
      ? borrowedFromSavings + borrowedFromGuiltFree
      : essentialsSurplusToSavings > 0
      ? -essentialsSurplusToSavings
      : 0;
  const savDelta =
    essentialsSurplusToSavings > 0
      ? essentialsSurplusToSavings
      : borrowedFromSavings > 0
      ? -borrowedFromSavings
      : 0;
  const guiltDelta = borrowedFromGuiltFree > 0 ? -borrowedFromGuiltFree : 0;

  return [
    {
      key: 'essentials',
      label: 'Essentials (Materials, Transport & Food, Salaries, Fees)',
      percentage: pct.essentialsPct,
      formula: `${Math.round(pct.essentialsPct * 100)}% = ${formatMoney(essentialsBaseAllocated, cur)}`,
      rawAmount: essentialsBaseAllocated,
      rebalanceDelta: essDelta,
      allocatedAmount: essentialsAllocated,
      guidance:
        essentialsStatus === 'borrowed_from_savings'
          ? `60% was short — borrowed ${formatMoney(borrowedFromSavings, cur)} from Save / Invest to cover ${formatMoney(targets.total, cur)}.`
          : essentialsStatus === 'squeezed_materials'
          ? `Used all Save / Invest + squeezed Materials down to ${formatMoney(effectiveMaterialsTarget, cur)} to fit.`
          : essentialsStatus === 'borrowed_from_guilt_free'
          ? `Squeezed Materials to ${formatMoney(effectiveMaterialsTarget, cur)} + borrowed ${formatMoney(borrowedFromGuiltFree, cur)} from Guilt-Free.`
          : essentialsStatus === 'insufficient_all_pools'
          ? `Squeezed Materials to ${formatMoney(effectiveMaterialsTarget, cur)} + borrowed Save/Invest & Guilt-Free; still short ${formatMoney(essentialsUncoveredGap, cur)}.`
          : essentialsStatus === 'surplus_to_savings'
          ? `Full ${formatMoney(targets.total, cur)} covered — sent ${formatMoney(essentialsSurplusToSavings, cur)} extra to Save / Invest.`
          : `Covers exact ${formatMoney(targets.total, cur)} monthly essentials plan.`,
    },
    {
      key: 'debt',
      label: 'Debt Repayment',
      percentage: pct.debtPct,
      formula: `Income × ${pct.debtPct.toFixed(2)}`,
      rawAmount: debtAllocated,
      rebalanceDelta: 0,
      allocatedAmount: debtAllocated,
      guidance:
        debtShortfall > 0
          ? `Applies toward ${formatMoney(debtShortfall, cur)} remaining confirmed debt.`
          : 'No remaining cycle debt — you can sweep this slice into Save / Invest.',
    },
    {
      key: 'save_invest',
      label: 'Aim to Save / Invest',
      percentage: pct.saveInvestPct,
      formula: `${Math.round(pct.saveInvestPct * 100)}% = ${formatMoney(saveInvestBaseAllocated, cur)}`,
      rawAmount: saveInvestBaseAllocated,
      rebalanceDelta: savDelta,
      allocatedAmount: saveInvestAllocated,
      guidance:
        essentialsSurplusToSavings > 0.01
          ? `Boosted by +${formatMoney(essentialsSurplusToSavings, cur)} unused from Essentials.`
          : borrowedFromSavings > 0.01
          ? `Reduced by -${formatMoney(borrowedFromSavings, cur)} lent to cover Essentials.`
          : 'Moves straight into emergency reserves and long-term startup/investment capital.',
    },
    {
      key: 'guilt_free',
      label: 'Guilt-Free Spend',
      percentage: pct.guiltFreePct,
      formula: `${Math.round(pct.guiltFreePct * 100)}% = ${formatMoney(guiltFreeBaseAllocated, cur)}`,
      rawAmount: guiltFreeBaseAllocated,
      rebalanceDelta: guiltDelta,
      allocatedAmount: guiltFreeAllocated,
      guidance:
        borrowedFromGuiltFree > 0.01
          ? `Lent ${formatMoney(borrowedFromGuiltFree, cur)} to Essentials after Materials squeezed to ${formatMoney(effectiveMaterialsTarget, cur)}.`
          : 'Dedicated guilt-free spending allowance—enjoy without touching essentials or savings.',
    },
  ];
}
