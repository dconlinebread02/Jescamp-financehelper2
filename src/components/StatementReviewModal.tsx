import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { MonthlyStatement, SUPPORTED_CURRENCIES, SupportedCurrency } from '../types/finance';
import {
  computeEssentialsRebalance,
  computeStatementAutoAllocations,
  describeStatementAllocationTarget,
  formatMoney,
  formatMonthLabel,
  getTMinusTwoMonth,
} from '../lib/budgetEngine';
import { convertAmount } from '../lib/fxService';

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file.'));
    reader.readAsDataURL(file);
  });
}

export async function parseStatementPdfFile(
  file: File,
  fallbackCurrency: SupportedCurrency
): Promise<{ statement: Partial<MonthlyStatement> & { summaryNotes?: string }; notice: string }> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please select a valid .pdf statement file.');
  }
  const pdfBase64 = await fileToBase64(file);
  const response = await fetch('/api/parse-statement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64,
      fileName: file.name,
      fallbackCurrency,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Could not extract figures from PDF.');
  }
  const extracted = data.statement || {};
  return {
    statement: extracted,
    notice:
      extracted.summaryNotes ||
      `Extracted from "${file.name}". Confirm the Subtotal and click Save & Auto-Allocate.`,
  };
}

interface StatementReviewModalProps {
  open: boolean;
  initialStatement?: Partial<MonthlyStatement>;
  notice?: string | null;
  onClose: () => void;
  onSaved?: (saved: { monthKey: string; subtotal: number; currency: SupportedCurrency }) => void;
}

export const StatementReviewModal: React.FC<StatementReviewModalProps> = ({
  open,
  initialStatement,
  notice,
  onClose,
  onSaved,
}) => {
  const { activeCycleMonth, settings, fxRates, saveStatement } = useFinance();
  const expectedBaselineMonth = getTMinusTwoMonth(activeCycleMonth);

  const [monthKey, setMonthKey] = useState(expectedBaselineMonth);
  const [currency, setCurrency] = useState<SupportedCurrency>(settings.baseCurrency);
  const [totalRevenue, setTotalRevenue] = useState('0');
  const [businessMaterials, setBusinessMaterials] = useState('0');
  const [transportation, setTransportation] = useState('0');
  const [workerSalaries, setWorkerSalaries] = useState('0');
  const [sistersSchoolFees, setSistersSchoolFees] = useState('0');
  const [pendingLoansDebts, setPendingLoansDebts] = useState('0');
  const [savingsAllocated, setSavingsAllocated] = useState('0');
  const [growthAllocated, setGrowthAllocated] = useState('0');
  const [discretionarySpent, setDiscretionarySpent] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualLineOverrides, setManualLineOverrides] = useState(false);

  const applyAutoAllocations = (subtotalVal: number, curVal: SupportedCurrency) => {
    const auto = computeStatementAutoAllocations({
      subtotal: subtotalVal,
      statementCurrency: curVal,
      settings,
      fx: fxRates,
    });
    setBusinessMaterials(String(auto.businessMaterials));
    setTransportation(String(auto.transportation));
    setWorkerSalaries(String(auto.workerSalaries));
    setSistersSchoolFees(String(auto.sistersSchoolFees));
    setPendingLoansDebts(String(auto.pendingLoansDebts));
    setSavingsAllocated(String(auto.savingsAllocated));
    setGrowthAllocated(String(auto.growthAllocated));
    setDiscretionarySpent(String(auto.discretionarySpent));
  };

  useEffect(() => {
    if (!open) return;
    const initMonth =
      initialStatement?.monthKey && /^\d{4}-\d{2}$/.test(initialStatement.monthKey)
        ? initialStatement.monthKey
        : expectedBaselineMonth;
    const initCurrency =
      initialStatement?.currency && SUPPORTED_CURRENCIES.includes(initialStatement.currency)
        ? initialStatement.currency
        : settings.baseCurrency;
    const initRev = Math.max(0, Number(initialStatement?.totalRevenue ?? 0) || 0);

    const hasPopulatedLines =
      (initialStatement?.businessMaterials ?? 0) > 0 ||
      (initialStatement?.transportation ?? 0) > 0 ||
      (initialStatement?.workerSalaries ?? 0) > 0 ||
      (initialStatement?.sistersSchoolFees ?? 0) > 0 ||
      (initialStatement?.pendingLoansDebts ?? 0) > 0;

    setMonthKey(initMonth);
    setCurrency(initCurrency);
    setTotalRevenue(String(initRev));

    if (hasPopulatedLines) {
      setManualLineOverrides(true);
      setBusinessMaterials(String(initialStatement?.businessMaterials ?? 0));
      setTransportation(String(initialStatement?.transportation ?? 0));
      setWorkerSalaries(String(initialStatement?.workerSalaries ?? 0));
      setSistersSchoolFees(String(initialStatement?.sistersSchoolFees ?? 0));
      setPendingLoansDebts(String(initialStatement?.pendingLoansDebts ?? 0));
      setSavingsAllocated(String(initialStatement?.savingsAllocated ?? 0));
      setGrowthAllocated(String(initialStatement?.growthAllocated ?? 0));
      setDiscretionarySpent(String(initialStatement?.discretionarySpent ?? 0));
    } else {
      setManualLineOverrides(false);
      const auto = computeStatementAutoAllocations({
        subtotal: initRev,
        statementCurrency: initCurrency,
        settings,
        fx: fxRates,
      });
      setBusinessMaterials(String(auto.businessMaterials));
      setTransportation(String(auto.transportation));
      setWorkerSalaries(String(auto.workerSalaries));
      setSistersSchoolFees(String(auto.sistersSchoolFees));
      setPendingLoansDebts(String(auto.pendingLoansDebts));
      setSavingsAllocated(String(auto.savingsAllocated));
      setGrowthAllocated(String(auto.growthAllocated));
      setDiscretionarySpent(String(auto.discretionarySpent));
    }
    setError(null);
  }, [open, initialStatement, expectedBaselineMonth, settings, fxRates]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const rev = Math.max(0, Number(totalRevenue) || 0);
      const tax = Number((rev * settings.taxReserveRate).toFixed(2));
      const mat = Math.max(0, Number(businessMaterials) || 0);
      const trn = Math.max(0, Number(transportation) || 0);
      const sal = Math.max(0, Number(workerSalaries) || 0);
      const fee = Math.max(0, Number(sistersSchoolFees) || 0);
      const deb = Math.max(0, Number(pendingLoansDebts) || 0);
      const sav = Math.max(0, Number(savingsAllocated) || 0);
      const grw = Math.max(0, Number(growthAllocated) || 0);
      const dis = Math.max(0, Number(discretionarySpent) || 0);
      const closingLiquidity = rev - tax - (mat + trn + sal + fee + deb + dis);

      await saveStatement({
        monthKey,
        currency,
        totalRevenue: rev,
        taxSegregated: tax,
        businessMaterials: mat,
        transportation: trn,
        workerSalaries: sal,
        sistersSchoolFees: fee,
        pendingLoansDebts: deb,
        savingsAllocated: sav,
        growthAllocated: grw,
        discretionarySpent: dis,
        closingLiquidity,
        isClosed: false,
      });
      onSaved?.({ monthKey, subtotal: rev, currency });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save statement. Please check your entries.'
      );
    } finally {
      setSaving(false);
    }
  };

  const subtotalNum = Math.max(0, Number(totalRevenue) || 0);
  const baseCur = settings.baseCurrency;
  const subtotalInBase = convertAmount(subtotalNum, currency, baseCur, fxRates);
  const reb = computeEssentialsRebalance(subtotalInBase, settings);
  const validMonthKey = /^\d{4}-\d{2}$/.test(monthKey);
  const targetInfo = validMonthKey
    ? describeStatementAllocationTarget(monthKey, activeCycleMonth)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-stone-950">
            Review &amp; Auto-Allocate Statement
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {notice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950">
              {notice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Month (YYYY-MM)
              </label>
              <input
                type="month"
                required
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
              {monthKey !== expectedBaselineMonth && (
                <button
                  type="button"
                  onClick={() => setMonthKey(expectedBaselineMonth)}
                  className="mt-1 min-h-[32px] text-[11px] font-semibold text-emerald-900 hover:underline cursor-pointer"
                >
                  Use active T-2 ({expectedBaselineMonth})
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => {
                  const nextCur = e.target.value as SupportedCurrency;
                  setCurrency(nextCur);
                  if (!manualLineOverrides) {
                    applyAutoAllocations(Number(totalRevenue) || 0, nextCur);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-white"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Statement Subtotal (Basis)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={totalRevenue}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTotalRevenue(raw);
                  if (!manualLineOverrides) {
                    applyAutoAllocations(Number(raw) || 0, currency);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {targetInfo && (
            <div
              className={`p-3.5 border rounded-lg text-xs space-y-1 ${
                targetInfo.relation === 'active'
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : targetInfo.relation === 'future'
                  ? 'bg-sky-50/70 border-sky-200 text-sky-950'
                  : 'bg-stone-50 border-stone-200 text-stone-800'
              }`}
            >
              <p className="font-semibold">{targetInfo.headline}</p>
              <p>{targetInfo.explanation}</p>
              {targetInfo.relation !== 'active' && (
                <p className="text-stone-600 pt-0.5">
                  Required for current cycle ({formatMonthLabel(activeCycleMonth)}):{' '}
                  <strong className="text-stone-900">
                    {formatMonthLabel(expectedBaselineMonth)} ({expectedBaselineMonth})
                  </strong>
                  .
                </p>
              )}
            </div>
          )}

          {subtotalNum > 0 && (
            <div className="p-3.5 sm:p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-800">
                  Automatic Rebalanced Allocation ({formatMoney(subtotalInBase, baseCur)})
                </p>
                <span className="text-xs text-stone-500">
                  Essentials Baseline: {formatMoney(reb.targets.total, baseCur)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-stone-500 block">
                    Essentials ({Math.round(reb.pct.essentialsPct * 100)}%)
                  </span>
                  <span className="font-bold text-stone-950">
                    {formatMoney(reb.essentialsAllocated, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">
                    Debt ({Math.round(reb.pct.debtPct * 100)}%)
                  </span>
                  <span className="font-bold text-stone-950">
                    {formatMoney(reb.debtAllocated, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">
                    Save/Invest ({Math.round(reb.pct.saveInvestPct * 100)}%)
                  </span>
                  <span className="font-bold text-stone-950">
                    {formatMoney(reb.saveInvestAllocated, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">
                    Guilt-Free ({Math.round(reb.pct.guiltFreePct * 100)}%)
                  </span>
                  <span className="font-bold text-stone-950">
                    {formatMoney(reb.guiltFreeAllocated, baseCur)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-stone-600 pt-2 border-t border-stone-200 leading-relaxed">
                {reb.essentialsStatus === 'borrowed_from_savings' &&
                  `60% (${formatMoney(reb.essentialsBaseAllocated, baseCur)}) was below ${formatMoney(reb.targets.total, baseCur)} — automatically borrowed ${formatMoney(reb.borrowedFromSavings, baseCur)} from 15% Save / Invest.`}
                {reb.essentialsStatus === 'squeezed_materials' &&
                  `Borrowed ${formatMoney(reb.borrowedFromSavings, baseCur)} from Save / Invest and squeezed Materials down to ${formatMoney(reb.effectiveMaterialsTarget, baseCur)} to cover Essentials.`}
                {reb.essentialsStatus === 'borrowed_from_guilt_free' &&
                  `Borrowed ${formatMoney(reb.borrowedFromSavings, baseCur)} from Save / Invest, squeezed Materials to ${formatMoney(reb.effectiveMaterialsTarget, baseCur)}, and borrowed ${formatMoney(reb.borrowedFromGuiltFree, baseCur)} from Guilt-Free.`}
                {reb.essentialsStatus === 'surplus_to_savings' &&
                  `60% (${formatMoney(reb.essentialsBaseAllocated, baseCur)}) covered all ${formatMoney(reb.targets.total, baseCur)} — transferred ${formatMoney(reb.essentialsSurplusToSavings, baseCur)} surplus to Save / Invest.`}
                {reb.essentialsStatus === 'insufficient_all_pools' &&
                  `Squeezed Materials to ${formatMoney(reb.effectiveMaterialsTarget, baseCur)} + used all Save / Invest & Guilt-Free; ${formatMoney(reb.essentialsUncoveredGap, baseCur)} still short.`}
                {reb.essentialsStatus === 'exact' &&
                  `60% matches your ${formatMoney(reb.targets.total, baseCur)} Essentials baseline cleanly.`}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs font-mono tabular-nums text-stone-600">
                <div>
                  <span className="block text-stone-400">Materials</span>
                  <span className="font-semibold text-stone-900">
                    {formatMoney(reb.itemAllocations.business_materials.funded, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-400">Transport &amp; Food</span>
                  <span className="font-semibold text-stone-900">
                    {formatMoney(reb.itemAllocations.transportation.funded, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-400">Salaries</span>
                  <span className="font-semibold text-stone-900">
                    {formatMoney(reb.itemAllocations.worker_salaries.funded, baseCur)}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-400">Sister&apos;s Fees</span>
                  <span className="font-semibold text-stone-900">
                    {formatMoney(reb.itemAllocations.sisters_school_fees.funded, baseCur)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-xs font-bold text-stone-900">
                Tier 1 Obligations (Orders 1–5)
              </p>
              <button
                type="button"
                onClick={() => {
                  setManualLineOverrides(false);
                  applyAutoAllocations(Number(totalRevenue) || 0, currency);
                }}
                className="min-h-[32px] text-[11px] font-semibold text-emerald-900 hover:underline cursor-pointer"
              >
                Auto-fill from subtotal
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-stone-600 mb-1">1. Business Materials</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={businessMaterials}
                  onChange={(e) => {
                    setManualLineOverrides(true);
                    setBusinessMaterials(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">2. Transportation &amp; Food</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={transportation}
                  onChange={(e) => {
                    setManualLineOverrides(true);
                    setTransportation(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">3. Worker Salaries</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={workerSalaries}
                  onChange={(e) => {
                    setManualLineOverrides(true);
                    setWorkerSalaries(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">4. Sister&apos;s School Fees</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={sistersSchoolFees}
                  onChange={(e) => {
                    setManualLineOverrides(true);
                    setSistersSchoolFees(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">5. Pending Loans / Debts</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pendingLoansDebts}
                  onChange={(e) => {
                    setManualLineOverrides(true);
                    setPendingLoansDebts(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-stone-600 mb-1">Savings Allocated</label>
              <input
                type="number"
                min="0"
                step="any"
                value={savingsAllocated}
                onChange={(e) => {
                  setManualLineOverrides(true);
                  setSavingsAllocated(e.target.value);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Growth Allocated</label>
              <input
                type="number"
                min="0"
                step="any"
                value={growthAllocated}
                onChange={(e) => {
                  setManualLineOverrides(true);
                  setGrowthAllocated(e.target.value);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Guilt-Free Spent</label>
              <input
                type="number"
                min="0"
                step="any"
                value={discretionarySpent}
                onChange={(e) => {
                  setManualLineOverrides(true);
                  setDiscretionarySpent(e.target.value);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save & Auto-Allocate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
