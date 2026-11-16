import React, { useRef, useState } from 'react';
import {
  CloudUpload,
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  Lock,
  Plus,
  Printer,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthlyStatement, SupportedCurrency } from '../types/finance';
import {
  computeEssentialsRebalance,
  computeStatementAutoAllocations,
  describeStatementAllocationTarget,
  formatMoney,
  formatMonthLabel,
  getTMinusTwoMonth,
} from '../lib/budgetEngine';
import { convertAmount } from '../lib/fxService';
import {
  exportFullArchiveJson,
  exportStatementsAndTaxCsv,
  exportTransactionsCsv,
} from '../lib/exportUtils';
import { StatementReviewModal, parseStatementPdfFile } from './StatementReviewModal';

export const StatementsView: React.FC = () => {
  const {
    activeCycleMonth,
    statements,
    cycles,
    transactions,
    backups,
    calculation,
    fxRates,
    settings,
    setBudgetBasisMode,
    setSelectedStatementMonth,
    sealStatement,
    deleteStatement,
    createCloudBackup,
    populateSampleBaseline,
  } = useFinance();

  const expectedBaselineMonth = getTMinusTwoMonth(activeCycleMonth);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<Partial<MonthlyStatement> | undefined>(
    undefined
  );
  const [modalNotice, setModalNotice] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<{
    monthKey: string;
    subtotal: number;
    currency: SupportedCurrency;
  } | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [confirmDeleteMonth, setConfirmDeleteMonth] = useState<string | null>(null);
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null);

  const cur = settings.baseCurrency;

  const formatTimestamp = (ts?: { toDate?: () => Date }) => {
    if (!ts?.toDate) return 'Just now';
    return ts.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const openEditor = (stmt?: Partial<MonthlyStatement>, notice?: string) => {
    setModalInitial(stmt);
    setModalNotice(notice || null);
    setModalOpen(true);
  };

  const handlePdfUpload = async (file: File) => {
    setParsingPdf(true);
    setPdfError(null);
    try {
      const { statement, notice } = await parseStatementPdfFile(file, settings.baseCurrency);
      openEditor(statement, notice);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Unable to process statement PDF.');
    } finally {
      setParsingPdf(false);
    }
  };

  const resolvedStatements = statements.map((st) => {
    const needsAutoFill =
      st.totalRevenue > 0 &&
      st.businessMaterials === 0 &&
      st.transportation === 0 &&
      st.workerSalaries === 0 &&
      st.sistersSchoolFees === 0 &&
      st.pendingLoansDebts === 0;
    if (!needsAutoFill) return st;
    const auto = computeStatementAutoAllocations({
      subtotal: st.totalRevenue,
      statementCurrency: st.currency,
      settings,
      fx: fxRates,
    });
    return {
      ...st,
      ...auto,
    };
  });

  const historicalTax = resolvedStatements.reduce(
    (s, st) => s + convertAmount(st.taxSegregated, st.currency, cur, fxRates),
    0
  );
  const ytdTaxTotal = historicalTax + calculation.taxReserveRequired;

  const handleManualBackup = async () => {
    setBackingUp(true);
    try {
      await createCloudBackup('manual');
    } finally {
      setBackingUp(false);
    }
  };

  const handleDeleteStatement = async (
    st: MonthlyStatement,
    reenterAfter: boolean
  ) => {
    setDeletingMonth(st.monthKey);
    try {
      await deleteStatement(st.monthKey);
      setConfirmDeleteMonth(null);
      if (savedBanner?.monthKey === st.monthKey) {
        setSavedBanner(null);
      }
      if (reenterAfter) {
        openEditor(
          { monthKey: st.monthKey, currency: st.currency },
          `Deleted previous statement for ${st.monthKey}. Key in the right figures below.`
        );
      }
    } finally {
      setDeletingMonth(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 lg:space-y-10">
      {/* Direct Statement PDF Upload Dropzone */}
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
          if (f) handlePdfUpload(f);
        }}
        className={`bg-white border rounded-xl p-4 sm:p-6 lg:p-8 transition-colors ${
          dragging ? 'border-emerald-800 bg-emerald-50/40' : 'border-stone-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="flex items-start gap-3.5 sm:gap-4 max-w-xl">
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50 text-emerald-900 shrink-0">
              <FileUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-stone-950">
                Upload {formatMonthLabel(expectedBaselineMonth)} Statement PDF (Needed for {formatMonthLabel(activeCycleMonth)})
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed">
                Current cycle is <strong className="text-stone-900">{formatMonthLabel(activeCycleMonth)}</strong>, so the{' '}
                <strong className="font-mono text-stone-900">
                  {formatMonthLabel(expectedBaselineMonth)} ({expectedBaselineMonth})
                </strong>{' '}
                statement is required. Uploading any other month automatically shows whether its budget is a future or past T+2 allocation.
              </p>
              {pdfError && (
                <p className="mt-2.5 text-xs text-red-700 font-medium">{pdfError}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 shrink-0 w-full lg:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePdfUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsingPdf}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              <span>{parsingPdf ? 'Reading PDF...' : 'Select Statement PDF'}</span>
            </button>
            <button
              type="button"
              onClick={() => openEditor()}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enter Manually</span>
            </button>
          </div>
        </div>
      </section>

      {/* Instant Automatic Allocation Result Banner after PDF/Statement Save */}
      {savedBanner && (() => {
        const savedTarget = describeStatementAllocationTarget(
          savedBanner.monthKey,
          activeCycleMonth
        );
        return (
        <section className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-950">
                {savedTarget.headline}
              </p>
              <p className="text-xs text-stone-700 mt-0.5">
                {savedTarget.explanation} · Subtotal:{' '}
                <strong className="font-mono text-stone-950">
                  {formatMoney(savedBanner.subtotal, savedBanner.currency)}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSavedBanner(null)}
              className="min-h-[36px] text-xs text-stone-500 hover:text-stone-900 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
          {(() => {
            const subtotalInBase = convertAmount(
              savedBanner.subtotal,
              savedBanner.currency,
              cur,
              fxRates
            );
            const reb = computeEssentialsRebalance(subtotalInBase, settings);
            const items = [
              ['Essentials', reb.pct.essentialsPct, reb.essentialsAllocated],
              ['Debt Repayment', reb.pct.debtPct, reb.debtAllocated],
              ['Save / Invest', reb.pct.saveInvestPct, reb.saveInvestAllocated],
              ['Guilt-Free', reb.pct.guiltFreePct, reb.guiltFreeAllocated],
            ] as const;
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  {items.map(([label, rate, amount]) => (
                    <div
                      key={label}
                      className="bg-white border border-emerald-200 rounded-lg p-3.5"
                    >
                      <p className="text-xs text-stone-500">
                        {label} ({Math.round(rate * 100)}%)
                      </p>
                      <p className="mt-1 text-base font-bold font-mono tabular-nums text-stone-950">
                        {formatMoney(amount, cur)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  {reb.essentialsStatus === 'borrowed_from_savings' &&
                    `Borrowed ${formatMoney(reb.borrowedFromSavings, cur)} from 15% Save / Invest so Essentials reaches ${formatMoney(reb.essentialsAllocated, cur)}.`}
                  {reb.essentialsStatus === 'squeezed_materials' &&
                    `Borrowed ${formatMoney(reb.borrowedFromSavings, cur)} from Save / Invest + squeezed Materials down to ${formatMoney(reb.effectiveMaterialsTarget, cur)}.`}
                  {reb.essentialsStatus === 'borrowed_from_guilt_free' &&
                    `Squeezed Materials to ${formatMoney(reb.effectiveMaterialsTarget, cur)} + borrowed ${formatMoney(reb.borrowedFromSavings, cur)} Save/Invest & ${formatMoney(reb.borrowedFromGuiltFree, cur)} Guilt-Free.`}
                  {reb.essentialsStatus === 'surplus_to_savings' &&
                    `Covered ${formatMoney(reb.targets.total, cur)} Essentials and moved ${formatMoney(reb.essentialsSurplusToSavings, cur)} leftover to Save / Invest.`}
                  {reb.essentialsStatus === 'insufficient_all_pools' &&
                    `Squeezed Materials to ${formatMoney(reb.effectiveMaterialsTarget, cur)} + used all Save/Invest & Guilt-Free (${formatMoney(reb.essentialsUncoveredGap, cur)} still short).`}
                </p>
              </>
            );
          })()}
        </section>
        );
      })()}

      {/* Historical Statements */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-950">Historical Statements</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Active T-2 baseline: <span className="font-mono">{expectedBaselineMonth}</span>
            </p>
          </div>
          {statements.length === 0 && (
            <button
              type="button"
              onClick={populateSampleBaseline}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Load Sample History</span>
            </button>
          )}
        </div>

        {statements.length === 0 ? (
          <div className="p-8 sm:p-10 text-center text-sm text-stone-500">
            No monthly statements yet. Upload a PDF above or enter a statement manually.
          </div>
        ) : (
          <>
            {/* Mobile & Portrait Tablet Card View (< lg) */}
            <div className="lg:hidden divide-y divide-stone-200">
              {statements.map((st) => {
                const isActiveT2 = st.monthKey === expectedBaselineMonth;
                const targetInfo = describeStatementAllocationTarget(
                  st.monthKey,
                  activeCycleMonth
                );
                const needsAutoFill =
                  st.totalRevenue > 0 &&
                  st.businessMaterials === 0 &&
                  st.transportation === 0 &&
                  st.workerSalaries === 0 &&
                  st.sistersSchoolFees === 0 &&
                  st.pendingLoansDebts === 0;
                const auto = needsAutoFill
                  ? computeStatementAutoAllocations({
                      subtotal: st.totalRevenue,
                      statementCurrency: st.currency,
                      settings,
                      fx: fxRates,
                    })
                  : null;
                const displayMaterials = auto ? auto.businessMaterials : st.businessMaterials;
                const displayTransport = auto ? auto.transportation : st.transportation;
                const displaySalaries = auto ? auto.workerSalaries : st.workerSalaries;
                const displayFees = auto ? auto.sistersSchoolFees : st.sistersSchoolFees;
                const displayDebts = auto ? auto.pendingLoansDebts : st.pendingLoansDebts;
                const isConfirmingDelete = confirmDeleteMonth === st.monthKey;
                const isDeleting = deletingMonth === st.monthKey;

                return (
                  <div
                    key={st.monthKey}
                    className={`p-4 sm:p-5 space-y-3.5 ${
                      isActiveT2 ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-sm font-bold text-stone-950">
                            {st.monthKey}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              targetInfo.relation === 'active'
                                ? 'text-emerald-800'
                                : targetInfo.relation === 'future'
                                ? 'text-sky-800'
                                : 'text-stone-500'
                            }`}
                          >
                            · {targetInfo.shortLabel}
                          </span>
                          {st.isClosed && (
                            <span className="inline-flex items-center gap-1 text-xs text-stone-400">
                              <Lock className="w-3 h-3" />
                              Sealed
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          Updated {formatTimestamp(st.updatedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block text-[11px] text-stone-500">Subtotal</span>
                        <span className="font-mono tabular-nums text-base font-bold text-stone-950">
                          {formatMoney(st.totalRevenue, st.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2.5 border-t border-stone-100 text-xs">
                      <div>
                        <span className="block text-stone-500">Materials</span>
                        <span className="font-mono tabular-nums font-medium text-stone-900">
                          {formatMoney(displayMaterials, st.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-stone-500">Transport</span>
                        <span className="font-mono tabular-nums font-medium text-stone-900">
                          {formatMoney(displayTransport, st.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-stone-500">Salaries</span>
                        <span className="font-mono tabular-nums font-medium text-stone-900">
                          {formatMoney(displaySalaries, st.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-stone-500">Fees</span>
                        <span className="font-mono tabular-nums font-medium text-stone-900">
                          {formatMoney(displayFees, st.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-stone-500">Debts</span>
                        <span className="font-mono tabular-nums font-medium text-stone-900">
                          {formatMoney(displayDebts, st.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-end gap-2">
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteStatement(st, true)}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            {isDeleting ? 'Deleting...' : 'Delete & Re-enter'}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteStatement(st, false)}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteMonth(null)}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 whitespace-nowrap cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {!st.isClosed && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditor(st)}
                                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => sealStatement(st.monthKey)}
                                className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 rounded-lg whitespace-nowrap cursor-pointer"
                              >
                                Seal
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMonth(st.monthKey)}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg whitespace-nowrap cursor-pointer"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Full Table (>= lg) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-500">
                    <th className="py-3 px-6">Month &amp; Last Updated</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Materials</th>
                    <th className="py-3 px-4 text-right">Transport</th>
                    <th className="py-3 px-4 text-right">Salaries</th>
                    <th className="py-3 px-4 text-right">Fees</th>
                    <th className="py-3 px-4 text-right">Debts</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {statements.map((st) => {
                    const isActiveT2 = st.monthKey === expectedBaselineMonth;
                    const targetInfo = describeStatementAllocationTarget(
                      st.monthKey,
                      activeCycleMonth
                    );
                    const needsAutoFill =
                      st.totalRevenue > 0 &&
                      st.businessMaterials === 0 &&
                      st.transportation === 0 &&
                      st.workerSalaries === 0 &&
                      st.sistersSchoolFees === 0 &&
                      st.pendingLoansDebts === 0;
                    const auto = needsAutoFill
                      ? computeStatementAutoAllocations({
                          subtotal: st.totalRevenue,
                          statementCurrency: st.currency,
                          settings,
                          fx: fxRates,
                        })
                      : null;
                    const displayMaterials = auto ? auto.businessMaterials : st.businessMaterials;
                    const displayTransport = auto ? auto.transportation : st.transportation;
                    const displaySalaries = auto ? auto.workerSalaries : st.workerSalaries;
                    const displayFees = auto ? auto.sistersSchoolFees : st.sistersSchoolFees;
                    const displayDebts = auto ? auto.pendingLoansDebts : st.pendingLoansDebts;
                    const isConfirmingDelete = confirmDeleteMonth === st.monthKey;
                    const isDeleting = deletingMonth === st.monthKey;
                    return (
                      <tr
                        key={st.monthKey}
                        className={isActiveT2 ? 'bg-emerald-50/40' : 'hover:bg-stone-50/60'}
                      >
                        <td className="py-3.5 px-6 text-xs whitespace-nowrap">
                          <div>
                            <span className="font-mono font-bold text-stone-950">
                              {st.monthKey}
                            </span>
                            <span
                              className={`ml-2 font-sans font-semibold ${
                                targetInfo.relation === 'active'
                                  ? 'text-emerald-800'
                                  : targetInfo.relation === 'future'
                                  ? 'text-sky-800'
                                  : 'text-stone-500'
                              }`}
                            >
                              · {targetInfo.shortLabel}
                            </span>
                            {st.isClosed && (
                              <span className="ml-2 inline-flex items-center gap-1 text-stone-400">
                                <Lock className="w-3 h-3" />
                                Sealed
                              </span>
                            )}
                          </div>
                          <span className="block text-[11px] text-stone-400 mt-0.5">
                            Updated {formatTimestamp(st.updatedAt)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium">
                          {formatMoney(st.totalRevenue, st.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          {formatMoney(displayMaterials, st.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          {formatMoney(displayTransport, st.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          {formatMoney(displaySalaries, st.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          {formatMoney(displayFees, st.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          {formatMoney(displayDebts, st.currency)}
                        </td>
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-2.5">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDeleteStatement(st, true)}
                                className="text-xs font-semibold text-emerald-900 hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
                              >
                                {isDeleting ? 'Deleting...' : 'Delete & Re-enter'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDeleteStatement(st, false)}
                                className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteMonth(null)}
                                className="text-xs font-medium text-stone-500 hover:text-stone-900 whitespace-nowrap cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-3">
                              {!st.isClosed && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditor(st)}
                                    className="text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => sealStatement(st.monthKey)}
                                    className="text-xs font-medium text-stone-500 hover:text-stone-900 whitespace-nowrap cursor-pointer"
                                  >
                                    Seal
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMonth(st.monthKey)}
                                className="text-xs font-medium text-red-700 hover:underline whitespace-nowrap cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
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

      {/* Tax Compliance & Cloud Exports */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-5 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-stone-950">
              Tax Reserve &amp; Cloud Backups
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              YTD Estimated Tax Reserve:{' '}
              <strong className="font-mono text-stone-900">
                {formatMoney(ytdTaxTotal, cur)}
              </strong>
              {' · '}
              <span className="font-mono">{backups.length}</span> cloud snapshot(s) saved
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => exportStatementsAndTaxCsv(resolvedStatements)}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Statements CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportTransactionsCsv(transactions, cur)}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ledger CSV</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportFullArchiveJson({
                  settings,
                  statements: resolvedStatements,
                  cycles,
                  transactions,
                })
              }
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON Archive</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleManualBackup}
              disabled={backingUp}
              className="col-span-2 sm:col-span-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-stone-900 rounded-lg hover:bg-stone-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>{backingUp ? 'Saving...' : 'Cloud Snapshot'}</span>
            </button>
          </div>
        </div>
      </section>

      <StatementReviewModal
        open={modalOpen}
        initialStatement={modalInitial}
        notice={modalNotice}
        onClose={() => setModalOpen(false)}
        onSaved={(saved) => {
          setSavedBanner(saved);
          if (saved.monthKey === expectedBaselineMonth) {
            setBudgetBasisMode('t2_first');
          } else {
            setSelectedStatementMonth(saved.monthKey);
          }
        }}
      />
    </div>
  );
};
