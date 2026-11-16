import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatMoney, formatMonthLabel } from '../lib/budgetEngine';

export const DebtCheckModal: React.FC = () => {
  const {
    showDebtCheckModal,
    setShowDebtCheckModal,
    debtPromptReason,
    activeCycleMonth,
    activeCycle,
    calculation,
    settings,
    confirmDebtCheck,
  } = useFinance();

  const existingDebtRow = calculation.tier1Rows.find(
    (r) => r.key === 'pending_loans_debts'
  );
  const initialAmount = activeCycle?.debtCheckCompleted
    ? activeCycle.confirmedDebtAmount
    : existingDebtRow?.baselineTarget || 0;

  const [hasDebt, setHasDebt] = useState<'yes' | 'no'>(initialAmount > 0 ? 'yes' : 'no');
  const [amountInput, setAmountInput] = useState<string>(String(Math.round(initialAmount)));
  const [noteInput, setNoteInput] = useState<string>(activeCycle?.debtNote || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (showDebtCheckModal) {
      const seed = activeCycle?.debtCheckCompleted
        ? activeCycle.confirmedDebtAmount
        : existingDebtRow?.baselineTarget || 0;
      setHasDebt(seed > 0 ? 'yes' : 'no');
      setAmountInput(String(Math.round(seed)));
      setNoteInput(activeCycle?.debtNote || '');
    }
  }, [showDebtCheckModal, activeCycle, existingDebtRow?.baselineTarget]);

  if (!showDebtCheckModal) return null;

  const parsedAmount = hasDebt === 'no' ? 0 : Math.max(0, Number(amountInput) || 0);
  const currentDebtTarget = existingDebtRow?.baselineTarget || 0;
  const delta = parsedAmount - currentDebtTarget;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await confirmDebtCheck(
        parsedAmount,
        hasDebt === 'no' ? 'Confirmed no pending debt obligations for this cycle.' : noteInput
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debt-check-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">
              {debtPromptReason === 'new_income'
                ? 'New Income Recalibration'
                : 'Cycle Liquidity Safeguard'}
              <span aria-hidden="true"> · </span>
              <span>{formatMonthLabel(activeCycleMonth)}</span>
            </p>
            <h2 id="debt-check-title" className="text-sm sm:text-base font-bold text-slate-950 mt-0.5">
              Are there any pending debts or loans to be paid this month?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowDebtCheckModal(false)}
            aria-label="Close debt check"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setHasDebt('yes')}
              className={`min-h-[44px] px-4 py-3 text-sm font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                hasDebt === 'yes'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Yes, debts due
            </button>
            <button
              type="button"
              onClick={() => {
                setHasDebt('no');
                setAmountInput('0');
              }}
              className={`min-h-[44px] px-4 py-3 text-sm font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                hasDebt === 'no'
                  ? 'border-emerald-800 bg-emerald-800 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              No pending debts (0)
            </button>
          </div>

          {hasDebt === 'yes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirmed Debt / Loan Repayment ({settings.baseCurrency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Creditor / Obligation Note
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="e.g., Supplier credit tranche or working capital loan"
                />
              </div>
            </div>
          )}

          {/* Dynamic Recalculation Preview */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                Debt Allocation Pool ({Math.round((settings.debtPct ?? 0.2) * 100)}% of Income)
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 shrink-0">
                {formatMoney(calculation.debtAllocated, settings.baseCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>Confirmed Monthly Debt Obligation</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                {formatMoney(parsedAmount, settings.baseCurrency)}
                {delta !== 0 && (
                  <span className={delta > 0 ? 'text-amber-700 ml-1.5' : 'text-emerald-700 ml-1.5'}>
                    ({delta > 0 ? '+' : ''}
                    {formatMoney(delta, settings.baseCurrency)})
                  </span>
                )}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">
                {calculation.debtAllocated >= parsedAmount
                  ? 'Unused Debt Pool → Redirect to Save / Invest'
                  : 'Debt Pool Shortfall'}
              </span>
              <span
                className={`font-mono tabular-nums font-bold shrink-0 ${
                  calculation.debtAllocated >= parsedAmount ? 'text-emerald-800' : 'text-red-700'
                }`}
              >
                {formatMoney(Math.abs(calculation.debtAllocated - parsedAmount), settings.baseCurrency)}
              </span>
            </div>
            {calculation.debtAllocated < parsedAmount ? (
              <p className="text-xs text-red-700 flex items-center gap-1.5 pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Confirmed debt exceeds your {Math.round((settings.debtPct ?? 0.2) * 100)}% debt slice—consider pausing Guilt-Free spend.
                </span>
              </p>
            ) : (
              <p className="text-xs text-emerald-800 flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {parsedAmount === 0
                    ? 'Zero pending debts — your entire debt slice can boost Save / Invest.'
                    : 'Your debt slice fully covers this confirmed obligation.'}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowDebtCheckModal(false)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Recalculating...' : 'Confirm & Recalculate Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
