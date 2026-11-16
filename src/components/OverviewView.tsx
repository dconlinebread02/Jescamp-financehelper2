import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Database,
  FileUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  CATEGORY_LABELS,
  LedgerCategory,
  MonthlyStatement,
} from '../types/finance';
import {
  describeStatementAllocationTarget,
  formatMoney,
  formatMonthLabel,
  getProjectedAllocationStatusLabel,
  getTMinusTwoMonth,
} from '../lib/budgetEngine';
import { convertAmount } from '../lib/fxService';
import { StatementReviewModal, parseStatementPdfFile } from './StatementReviewModal';
import type { TransactionDraft } from './TransactionModal';
import type { NavTab } from '../App';

interface OverviewViewProps {
  onNavigate: (tab: NavTab) => void;
  onOpenNewTx: (draft?: TransactionDraft) => void;
}

function formatStatementTimestamp(ts?: { toDate?: () => Date }): string {
  if (!ts?.toDate) return 'Just now';
  return ts.toDate().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onNavigate,
  onOpenNewTx,
}) => {
  const {
    activeCycleMonth,
    activeCycle,
    budgetBasisMode,
    setBudgetBasisMode,
    selectedStatementMonth,
    setSelectedStatementMonth,
    calculation,
    settings,
    statements,
    transactions,
    fxRates,
    dataLoading,
    openDebtCheck,
    confirmDebtCheck,
    deleteTransaction,
    deleteStatement,
    populateSampleBaseline,
  } = useFinance();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatement, setReviewStatement] = useState<
    Partial<MonthlyStatement> | undefined
  >(undefined);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const [confirmDeleteRecent, setConfirmDeleteRecent] = useState(false);
  const [deletingStatement, setDeletingStatement] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const cur = settings.baseCurrency;
  const expectedBaselineMonth = getTMinusTwoMonth(activeCycleMonth);

  const cycleTransactions = useMemo(
    () => transactions.filter((t) => t.cycleMonth === activeCycleMonth),
    [transactions, activeCycleMonth]
  );

  const recentTx = useMemo(() => {
    const copy = [...cycleTransactions];
    copy.sort((a, b) => {
      const tA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const tB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      if (tB !== tA) return tB - tA;
      return b.occurredAt.localeCompare(a.occurredAt);
    });
    return copy.slice(0, 6);
  }, [cycleTransactions]);

  const latestUpdatedStatement = useMemo(() => {
    if (statements.length === 0) return undefined;
    const copy = [...statements];
    copy.sort((a, b) => {
      const tA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const tB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      if (tB !== tA) return tB - tA;
      return b.monthKey.localeCompare(a.monthKey);
    });
    return copy[0];
  }, [statements]);

  const latestOverallTx = useMemo(() => {
    if (transactions.length === 0) return undefined;
    const copy = [...transactions];
    copy.sort((a, b) => {
      const tA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const tB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      if (tB !== tA) return tB - tA;
      return b.occurredAt.localeCompare(a.occurredAt);
    });
    return copy[0];
  }, [transactions]);

  const openManualStatement = (stmt?: Partial<MonthlyStatement>, notice?: string) => {
    setReviewStatement(stmt || { monthKey: expectedBaselineMonth, currency: cur });
    setReviewNotice(notice || null);
    setReviewOpen(true);
  };

  const handleQuickPdfUpload = async (file: File) => {
    setParsingPdf(true);
    setPdfError(null);
    try {
      const { statement, notice } = await parseStatementPdfFile(
        file,
        settings.baseCurrency
      );
      setReviewStatement(statement);
      setReviewNotice(notice);
      setReviewOpen(true);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'Unable to read statement PDF.'
      );
    } finally {
      setParsingPdf(false);
    }
  };

  const statementInView = useMemo(() => {
    if (calculation.activeStatementMonth) {
      return (
        statements.find((s) => s.monthKey === calculation.activeStatementMonth) ||
        latestUpdatedStatement
      );
    }
    return latestUpdatedStatement;
  }, [calculation.activeStatementMonth, statements, latestUpdatedStatement]);

  const handleDeleteRecentStatement = async (reenterAfter: boolean) => {
    if (!statementInView) return;
    const targetMonth = statementInView.monthKey;
    const targetCurrency = statementInView.currency;
    setDeletingStatement(true);
    try {
      await deleteStatement(targetMonth);
      setConfirmDeleteRecent(false);
      if (reenterAfter) {
        openManualStatement(
          { monthKey: targetMonth, currency: targetCurrency },
          `Deleted statement ${targetMonth}. Enter the right figures below.`
        );
      } else {
        setActionBanner(
          `Deleted statement ${targetMonth}. Monthly budget recalculated.`
        );
      }
    } finally {
      setDeletingStatement(false);
    }
  };

  const payoutScheduleRows = useMemo(() => {
    const tier1 = calculation.tier1Rows.map((row) => ({
      key: row.key as LedgerCategory,
      code: `0${row.rank}`,
      label: row.label,
      group: 'Essentials & Debt',
      target: row.baselineTarget,
      allocated: row.fundedAmount,
      paid: row.spentAmount,
      remaining: Math.max(0, row.fundedAmount - row.spentAmount),
      coveragePct: row.coveragePct,
      status: row.status,
      isMaterialsSqueezed:
        row.key === 'business_materials' && calculation.materialsSqueezedAmount > 0,
    }));

    const savingsAllocated = calculation.recommendedSavings;
    const savingsPaid = calculation.actualSavingsSpent;
    const growthAllocated = calculation.recommendedGrowth;
    const growthPaid = calculation.actualGrowthSpent;
    const guiltAllocated = calculation.recommendedDiscretionary;
    const guiltPaid = calculation.actualDiscretionarySpent;

    const surplus: typeof tier1 = [
      {
        key: 'savings_vault',
        code: '06',
        label: 'Savings Vault',
        group: 'Save / Invest (65%)',
        target: savingsAllocated,
        allocated: savingsAllocated,
        paid: savingsPaid,
        remaining: Math.max(0, savingsAllocated - savingsPaid),
        coveragePct: savingsAllocated > 0 ? 100 : 0,
        status: savingsAllocated > 0 ? 'funded' : 'unfunded',
        isMaterialsSqueezed: false,
      },
      {
        key: 'growth_reinvestment',
        code: '07',
        label: 'Growth Reinvestment',
        group: 'Save / Invest (35%)',
        target: growthAllocated,
        allocated: growthAllocated,
        paid: growthPaid,
        remaining: Math.max(0, growthAllocated - growthPaid),
        coveragePct: growthAllocated > 0 ? 100 : 0,
        status: growthAllocated > 0 ? 'funded' : 'unfunded',
        isMaterialsSqueezed: false,
      },
      {
        key: 'discretionary',
        code: '08',
        label: 'Guilt-Free Spend',
        group: 'Discretionary Allowance',
        target: guiltAllocated,
        allocated: guiltAllocated,
        paid: guiltPaid,
        remaining: Math.max(0, guiltAllocated - guiltPaid),
        coveragePct: guiltAllocated > 0 ? 100 : 0,
        status: guiltAllocated > 0 ? 'funded' : 'unfunded',
        isMaterialsSqueezed: false,
      },
    ];

    return [...tier1, ...surplus];
  }, [calculation]);

  const totalBudgetAllocated = payoutScheduleRows.reduce(
    (s, r) => s + r.allocated,
    0
  );
  const totalBudgetPaid = payoutScheduleRows.reduce((s, r) => s + r.paid, 0);
  const totalBudgetRemaining = payoutScheduleRows.reduce(
    (s, r) => s + r.remaining,
    0
  );

  if (dataLoading) {
    return (
      <div className="space-y-8">
        <div className="h-24 bg-white border border-stone-200 rounded-xl animate-pulse" />
        <div className="h-96 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const hasRequiredT2 = statements.some(
    (s) => s.monthKey === expectedBaselineMonth && s.totalRevenue > 0
  );
  const activeTargetInfo = calculation.activeStatementMonth
    ? describeStatementAllocationTarget(
        calculation.activeStatementMonth,
        activeCycleMonth
      )
    : null;
  const projectedStatus = getProjectedAllocationStatusLabel({
    statementMonth: calculation.activeStatementMonth,
    cycleMonth: activeCycleMonth,
  });

  return (
    <div className="space-y-8">
      {/* #1 Front-and-Center Quick Statement PDF Upload & Manual Key-In Bar */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleQuickPdfUpload(f);
        }}
        className={`bg-white border rounded-xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 transition-colors ${
          dragging
            ? 'border-emerald-800 bg-emerald-50/40'
            : 'border-stone-200'
        }`}
      >
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-900 shrink-0">
            <FileUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-950 leading-snug">
              {hasRequiredT2
                ? `Upload Statement PDF (${formatMonthLabel(expectedBaselineMonth)} Active for ${formatMonthLabel(activeCycleMonth)})`
                : `Upload ${formatMonthLabel(expectedBaselineMonth)} Statement (${expectedBaselineMonth}) — Needed for ${formatMonthLabel(activeCycleMonth)}`}
            </h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Current cycle is <strong className="text-stone-900">{formatMonthLabel(activeCycleMonth)}</strong>, so the{' '}
              <strong className="text-stone-900">
                {formatMonthLabel(expectedBaselineMonth)} ({expectedBaselineMonth})
              </strong>{' '}
              statement sets this month&apos;s budget. You can also upload any past or future month to see its T+2 allocation.
            </p>
            {pdfError && (
              <p className="text-xs text-red-700 mt-1.5 font-medium">
                {pdfError}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 shrink-0 w-full lg:w-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleQuickPdfUpload(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsingPdf}
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] sm:min-h-[40px] text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            <span>{parsingPdf ? 'Reading PDF...' : 'Upload Statement PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => openManualStatement()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[40px] text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Enter Manually</span>
          </button>
          {statements.length === 0 && transactions.length === 0 && (
            <button
              type="button"
              onClick={populateSampleBaseline}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[40px] text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Load Sample</span>
            </button>
          )}
        </div>
      </section>

      {actionBanner && (
        <section className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-5 py-3 flex items-center justify-between gap-4">
          <p className="text-xs font-medium text-emerald-950">{actionBanner}</p>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-xs text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </section>
      )}

      {/* #2 Focal Centerpiece: Monthly Allocated Budget + Recent Update + Quick Delete/Re-enter + Payout Schedule */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {/* Top Prominent Budget Header (Right where the main amount is displayed) */}
        <div className="p-4 sm:p-6 border-b border-stone-200 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
            <div className="space-y-2.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <span
                  className={`font-semibold ${
                    activeTargetInfo?.relation === 'future'
                      ? 'text-sky-900'
                      : activeTargetInfo?.relation === 'past'
                      ? 'text-amber-800'
                      : 'text-stone-700'
                  }`}
                >
                  {activeTargetInfo
                    ? activeTargetInfo.headline
                    : `Monthly Allocated Budget — ${formatMonthLabel(activeCycleMonth)}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>{calculation.allocationBasisLabel}</span>
              </div>

              {activeTargetInfo && activeTargetInfo.relation !== 'active' && (
                <p
                  className={`text-xs font-medium ${
                    activeTargetInfo.relation === 'future'
                      ? 'text-sky-900'
                      : 'text-amber-800'
                  }`}
                >
                  {activeTargetInfo.explanation}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold font-mono tabular-nums text-stone-950 tracking-tight">
                  {formatMoney(calculation.totalRevenue, cur)}
                </p>

                <div className="space-y-0.5 min-w-0">
                  <span className="block text-[11px] font-semibold text-stone-500">
                    {projectedStatus.labelTitle}
                  </span>
                  <p
                    className={`text-sm font-bold ${
                      projectedStatus.isHistorical
                        ? 'text-amber-800'
                        : projectedStatus.isFuture
                        ? 'text-sky-900'
                        : 'text-emerald-900'
                    }`}
                  >
                    {projectedStatus.statusText}
                  </p>
                </div>
              </div>

              {(statements.length > 0 || calculation.txRevenue > 0) && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-0.5">
                  <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setBudgetBasisMode('t2_first')}
                      className={`px-2.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        budgetBasisMode === 't2_first'
                          ? 'bg-white text-stone-950 shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      T-2 Baseline
                    </button>
                    {statements.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatementMonth(null);
                          setBudgetBasisMode('latest_statement');
                        }}
                        className={`px-2.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          budgetBasisMode === 'latest_statement' && !selectedStatementMonth
                            ? 'bg-white text-stone-950 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Latest Statement
                      </button>
                    )}
                    {calculation.txRevenue > 0 && (
                      <button
                        type="button"
                        onClick={() => setBudgetBasisMode('recorded_income')}
                        className={`px-2.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          budgetBasisMode === 'recorded_income'
                            ? 'bg-white text-stone-950 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Recorded Income ({formatMoney(calculation.txRevenue, cur)})
                      </button>
                    )}
                  </div>

                  {statements.length > 0 && (
                    <select
                      aria-label="Select statement month for budget allocation"
                      value={calculation.activeStatementMonth || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === expectedBaselineMonth) {
                          setBudgetBasisMode('t2_first');
                        } else if (val) {
                          setSelectedStatementMonth(val);
                        }
                      }}
                      className="w-full sm:w-auto px-2.5 min-h-[38px] text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer"
                    >
                      {!calculation.activeStatementMonth && (
                        <option value="">Select statement...</option>
                      )}
                      {statements.map((st) => (
                        <option key={st.monthKey} value={st.monthKey}>
                          Statement: {formatMonthLabel(st.monthKey)} ({st.monthKey})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Recent Update & Statement Source visible right beneath the prominent budget total */}
              {(latestUpdatedStatement || latestOverallTx) && (
                <div className="pt-1 space-y-1 text-xs text-stone-600">
                  {latestUpdatedStatement && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-900 shrink-0" />
                      <span>
                        <strong className="text-stone-900">Recent Update:</strong>{' '}
                        Statement{' '}
                        <span className="font-mono font-semibold text-stone-900">
                          {latestUpdatedStatement.monthKey}
                        </span>{' '}
                        ({formatMoney(
                          latestUpdatedStatement.totalRevenue,
                          latestUpdatedStatement.currency
                        )}
                        ) updated{' '}
                        <span className="font-medium text-stone-900">
                          {formatStatementTimestamp(latestUpdatedStatement.updatedAt)}
                        </span>
                      </span>
                      {latestUpdatedStatement.monthKey === expectedBaselineMonth && (
                        <span className="font-semibold text-emerald-800">
                          · Active T-2 Baseline
                        </span>
                      )}
                      {latestUpdatedStatement.isClosed && (
                        <span className="text-stone-500">· Sealed</span>
                      )}
                    </div>
                  )}
                  {latestOverallTx && (
                    <p className="text-stone-500 sm:pl-5 break-words">
                      Latest Entry ({latestOverallTx.occurredAt}):{' '}
                      <span className="text-stone-800 font-medium">
                        {latestOverallTx.description}
                      </span>{' '}
                      ({CATEGORY_LABELS[latestOverallTx.category]}) ·{' '}
                      <span className="font-mono tabular-nums font-semibold text-stone-900">
                        {latestOverallTx.type === 'income' ? '+' : '-'}
                        {formatMoney(
                          convertAmount(
                            latestOverallTx.amount,
                            latestOverallTx.currency,
                            cur,
                            fxRates
                          ),
                          cur
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Summary Totals & Direct Edit / Delete Wrong Statement Actions */}
            <div className="flex flex-col xl:items-end justify-between gap-4 shrink-0">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
                <span>
                  Allocated:{' '}
                  <strong className="font-mono tabular-nums text-stone-900">
                    {formatMoney(totalBudgetAllocated, cur)}
                  </strong>
                </span>
                <span>
                  Paid:{' '}
                  <strong className="font-mono tabular-nums text-stone-900">
                    {formatMoney(totalBudgetPaid, cur)}
                  </strong>
                </span>
                <span>
                  Left to Pay:{' '}
                  <strong className="font-mono tabular-nums text-emerald-900">
                    {formatMoney(totalBudgetRemaining, cur)}
                  </strong>
                </span>
                <span>
                  Tax Reserve:{' '}
                  <strong className="font-mono tabular-nums text-stone-900">
                    {formatMoney(calculation.taxReserveRequired, cur)}
                  </strong>
                </span>
              </div>

              {statementInView && (
                <div className="flex flex-wrap items-center gap-2">
                  {confirmDeleteRecent ? (
                    <>
                      <button
                        type="button"
                        disabled={deletingStatement}
                        onClick={() => handleDeleteRecentStatement(true)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {deletingStatement ? 'Deleting...' : 'Delete & Re-enter'}
                      </button>
                      <button
                        type="button"
                        disabled={deletingStatement}
                        onClick={() => handleDeleteRecentStatement(false)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Delete Only
                      </button>
                      <button
                        type="button"
                        disabled={deletingStatement}
                        onClick={() => setConfirmDeleteRecent(false)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-950 bg-stone-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {!statementInView.isClosed && (
                        <button
                          type="button"
                          onClick={() => openManualStatement(statementInView)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Statement</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRecent(true)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Wrong Statement</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('statements')}
                        className="min-h-[38px] inline-flex items-center gap-1 text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer ml-1"
                      >
                        <span>All Statements</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4 Percentage Slice Summary Strip (Inside the same Monthly Allocated Budget frame) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-stone-200 border-b border-stone-200">
          {calculation.percentageBuckets.map((bucket) => (
            <div
              key={bucket.key}
              className="bg-white p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-stone-600 truncate">
                    {bucket.label.split(' (')[0]}
                  </span>
                  <span className="font-mono font-bold text-emerald-900 shrink-0">
                    {(bucket.percentage * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-stone-950">
                  {formatMoney(bucket.allocatedAmount, cur)}
                </p>
                {Math.abs(bucket.rebalanceDelta) > 0.5 && (
                  <p className="mt-1 text-xs text-stone-500 font-mono tabular-nums">
                    {(bucket.percentage * 100).toFixed(0)}% base{' '}
                    {formatMoney(bucket.rawPercentageAmount, cur)}{' '}
                    <span
                      className={
                        bucket.rebalanceDelta > 0
                          ? bucket.key === 'save_invest'
                            ? 'text-emerald-800 font-semibold'
                            : 'text-amber-700 font-semibold'
                          : bucket.key === 'essentials'
                          ? 'text-emerald-800 font-semibold'
                          : 'text-amber-700 font-semibold'
                      }
                    >
                      {bucket.rebalanceDelta > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(bucket.rebalanceDelta), cur)}
                    </span>
                  </p>
                )}
              </div>
              <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                <span>Paid: {formatMoney(bucket.spentAmount, cur)}</span>
                <span className="font-mono tabular-nums font-medium text-stone-800">
                  Left: {formatMoney(bucket.remainingAmount, cur)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Auto-Rebalance & Essentials Guidance Bar */}
        <div className="px-4 sm:px-6 py-3 bg-stone-50/70 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="text-stone-600 leading-relaxed">
            <strong className="text-stone-900">Budget Breakdown &amp; Payout Schedule:</strong>{' '}
            Essentials target {formatMoney(calculation.essentialsTargetTotal, cur)}
            {calculation.essentialsStatus === 'borrowed_from_savings' &&
              ` · Borrowed ${formatMoney(calculation.borrowedFromSavings, cur)} from 15% Save / Invest`}
            {calculation.essentialsStatus === 'squeezed_materials' &&
              ` · Borrowed ${formatMoney(calculation.borrowedFromSavings, cur)} from Save / Invest + squeezed Materials to ${formatMoney(calculation.effectiveMaterialsTarget, cur)}`}
            {calculation.essentialsStatus === 'borrowed_from_guilt_free' &&
              ` · Squeezed Materials to ${formatMoney(calculation.effectiveMaterialsTarget, cur)} + borrowed ${formatMoney(calculation.borrowedFromSavings, cur)} Save/Invest & ${formatMoney(calculation.borrowedFromGuiltFree, cur)} Guilt-Free`}
            {calculation.essentialsStatus === 'surplus_to_savings' &&
              ` · +${formatMoney(calculation.essentialsSurplusToSavings, cur)} leftover moved to Save / Invest`}
            {calculation.essentialsStatus === 'insufficient_all_pools' &&
              ` · Squeezed Materials to ${formatMoney(calculation.effectiveMaterialsTarget, cur)} + used Save/Invest & Guilt-Free (${formatMoney(calculation.essentialsUncoveredGap, cur)} short)`}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('allocate')}
            className="font-semibold text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Calculator →
          </button>
        </div>

        {/* Mobile Card View for 8-Row Payout Schedule */}
        <div className="md:hidden divide-y divide-stone-100">
          {payoutScheduleRows.map((row) => {
            const fullyPaid = row.allocated > 0 && row.remaining <= 0.01;
            return (
              <div key={row.key} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs text-stone-400">
                        {row.code}
                      </span>
                      <span className="text-sm font-semibold text-stone-950">
                        {row.label}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {row.group}
                      {row.isMaterialsSqueezed &&
                        ` · Squeezed from ${formatMoney(
                          calculation.effectiveMaterialsTarget +
                            calculation.materialsSqueezedAmount,
                          cur
                        )}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenNewTx({
                        type: 'expense',
                        category: row.key,
                        amount: row.remaining > 0 ? row.remaining : undefined,
                        description: `${formatMonthLabel(activeCycleMonth)} ${row.label}`,
                      })
                    }
                    className="px-3 min-h-[36px] text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {fullyPaid ? 'Add Payment' : 'Record Payment'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="block text-[11px] text-stone-400">Allocated</span>
                    <span className="font-mono tabular-nums font-semibold text-stone-950">
                      {formatMoney(row.allocated, cur)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-stone-400">Paid</span>
                    <span className="font-mono tabular-nums text-stone-600">
                      {formatMoney(row.paid, cur)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] text-stone-400">Left</span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        fullyPaid
                          ? 'text-emerald-800'
                          : row.remaining > 0
                          ? 'text-stone-900'
                          : 'text-stone-400'
                      }`}
                    >
                      {fullyPaid ? 'Paid' : formatMoney(row.remaining, cur)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="p-4 bg-stone-50/70 flex items-center justify-between text-xs font-semibold text-stone-900">
            <span>Total Schedule</span>
            <span className="font-mono tabular-nums text-emerald-900">
              Left: {formatMoney(totalBudgetRemaining, cur)}
            </span>
          </div>
        </div>

        {/* Tablet & Desktop 8-Row Monthly Allocated Budget & Finance Payment Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/40 text-xs font-semibold text-stone-500">
                <th className="py-3 px-6">Budget Line</th>
                <th className="py-3 px-4 text-right">Monthly Target</th>
                <th className="py-3 px-4 text-right">Allocated Budget</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Balance Left</th>
                <th className="py-3 px-6 text-right">Finance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {payoutScheduleRows.map((row) => {
                const fullyPaid = row.allocated > 0 && row.remaining <= 0.01;
                return (
                  <tr key={row.key} className="hover:bg-stone-50/60">
                    <td className="py-3.5 px-6">
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-mono text-xs text-stone-400">
                          {row.code}
                        </span>
                        <div>
                          <span className="font-medium text-stone-900">
                            {row.label}
                          </span>
                          <span className="block text-xs text-stone-500">
                            {row.group}
                            {row.isMaterialsSqueezed &&
                              ` · Squeezed from ${formatMoney(
                                calculation.effectiveMaterialsTarget +
                                  calculation.materialsSqueezedAmount,
                                cur
                              )}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600 whitespace-nowrap">
                      {formatMoney(row.target, cur)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-stone-950 whitespace-nowrap">
                      {formatMoney(row.allocated, cur)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600 whitespace-nowrap">
                      {formatMoney(row.paid, cur)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          fullyPaid
                            ? 'text-emerald-800'
                            : row.remaining > 0
                            ? 'text-stone-900'
                            : 'text-stone-400'
                        }`}
                      >
                        {fullyPaid ? 'Paid' : formatMoney(row.remaining, cur)}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenNewTx({
                            type: 'expense',
                            category: row.key,
                            amount: row.remaining > 0 ? row.remaining : undefined,
                            description: `${formatMonthLabel(activeCycleMonth)} ${row.label}`,
                          })
                        }
                        className="text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        {fullyPaid ? 'Add Payment' : 'Record Payment'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-900">
                <td className="py-3 px-6">Total Monthly Schedule</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-stone-500">
                  —
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatMoney(totalBudgetAllocated, cur)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatMoney(totalBudgetPaid, cur)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-900">
                  {formatMoney(totalBudgetRemaining, cur)}
                </td>
                <td className="py-3 px-6 text-right" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Interactive Debt Check Banner */}
      {(!activeCycle || !activeCycle.debtCheckCompleted) && (
        <section className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-950">
                Are there any pending debts or loans to be paid this month (
                {formatMonthLabel(activeCycleMonth)})?
              </p>
              <p className="text-xs text-stone-600 mt-0.5">
                Confirming lets your Debt slice know whether to pay creditors or
                roll over into Save / Invest.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:flex items-center gap-2.5 shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() =>
                confirmDebtCheck(0, 'Confirmed zero pending debts for cycle.')
              }
              className="w-full sm:w-auto min-h-[42px] sm:min-h-[40px] px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              No Debts (0)
            </button>
            <button
              type="button"
              onClick={() => openDebtCheck('cycle_start')}
              className="w-full sm:w-auto min-h-[42px] sm:min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-stone-900 rounded-lg hover:bg-stone-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enter Debt Amount
            </button>
          </div>
        </section>
      )}

      {/* Primary Notice */}
      {calculation.alerts.length > 0 && (
        <section className="bg-white border border-stone-200 rounded-xl px-4 sm:px-5 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <p className="text-xs text-stone-700 leading-relaxed">
            <strong className="text-stone-950 mr-1.5">
              {calculation.alerts[0].title}:
            </strong>
            {calculation.alerts[0].message}
          </p>
          {calculation.alerts[0].actionLabel && (
            <button
              type="button"
              onClick={() => {
                const t = calculation.alerts[0].actionType;
                if (t === 'debt_check') openDebtCheck('manual');
                else if (t === 'advisor') onNavigate('allocate');
                else if (t === 'statements') onNavigate('statements');
              }}
              className="self-start sm:self-center inline-flex items-center gap-1 min-h-[36px] text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{calculation.alerts[0].actionLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </section>
      )}

      {/* Recent Payments & Ledger Activity */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-stone-950">
            Recent Payments &amp; Entries
          </h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="min-h-[36px] text-xs font-medium text-stone-500 hover:text-stone-950 whitespace-nowrap cursor-pointer"
            >
              View all
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTx()}
              className="min-h-[36px] text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap cursor-pointer"
            >
              + Add entry
            </button>
          </div>
        </div>

        {recentTx.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-sm text-stone-500">
            No transactions recorded for {formatMonthLabel(activeCycleMonth)} yet.
          </div>
        ) : (
          <>
            {/* Mobile Compact Entry Cards */}
            <div className="sm:hidden divide-y divide-stone-100">
              {recentTx.map((tx) => {
                const liveBase = convertAmount(
                  tx.amount,
                  tx.currency,
                  cur,
                  fxRates
                );
                return (
                  <div
                    key={tx.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {tx.description}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5 truncate">
                        <span className="font-mono text-stone-400">{tx.occurredAt}</span>
                        {' · '}
                        {CATEGORY_LABELS[tx.category]}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-sm font-mono tabular-nums font-semibold whitespace-nowrap ${
                          tx.type === 'income'
                            ? 'text-emerald-800'
                            : 'text-stone-900'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatMoney(liveBase, cur)}
                      </span>
                      <button
                        type="button"
                        disabled={deletingTxId === tx.id}
                        aria-label={`Delete ${tx.description}`}
                        onClick={async () => {
                          setDeletingTxId(tx.id);
                          try {
                            await deleteTransaction(tx.id);
                          } finally {
                            setDeletingTxId(null);
                          }
                        }}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-stone-400 hover:text-red-700 rounded-lg cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet & Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <tbody className="divide-y divide-stone-100 text-sm">
                  {recentTx.map((tx) => {
                    const liveBase = convertAmount(
                      tx.amount,
                      tx.currency,
                      cur,
                      fxRates
                    );
                    return (
                      <tr key={tx.id} className="hover:bg-stone-50/60">
                        <td className="py-3.5 px-6 font-mono text-xs text-stone-400 whitespace-nowrap">
                          {tx.occurredAt}
                        </td>
                        <td className="py-3.5 px-6 font-medium text-stone-900">
                          {tx.description}
                        </td>
                        <td className="py-3.5 px-6 text-xs text-stone-500 whitespace-nowrap">
                          {CATEGORY_LABELS[tx.category]}
                        </td>
                        <td
                          className={`py-3.5 px-6 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            tx.type === 'income'
                              ? 'text-emerald-800'
                              : 'text-stone-900'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatMoney(liveBase, cur)}
                        </td>
                        <td className="py-3.5 pr-5 pl-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={deletingTxId === tx.id}
                            aria-label={`Delete ${tx.description}`}
                            onClick={async () => {
                              setDeletingTxId(tx.id);
                              try {
                                await deleteTransaction(tx.id);
                              } finally {
                                setDeletingTxId(null);
                              }
                            }}
                            className="p-2 text-stone-400 hover:text-red-700 rounded cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <StatementReviewModal
        open={reviewOpen}
        initialStatement={reviewStatement}
        notice={reviewNotice}
        onClose={() => setReviewOpen(false)}
        onSaved={(saved) => {
          const info = describeStatementAllocationTarget(
            saved.monthKey,
            activeCycleMonth
          );
          if (saved.monthKey === expectedBaselineMonth) {
            setBudgetBasisMode('t2_first');
          } else {
            setSelectedStatementMonth(saved.monthKey);
          }
          setActionBanner(
            `Saved statement ${saved.monthKey} (${formatMoney(
              saved.subtotal,
              saved.currency
            )}). ${info.explanation}`
          );
        }}
      />
    </div>
  );
};
