import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  LedgerCategory,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  TIER1_PRIORITY_ORDER,
  TransactionType,
} from '../types/finance';
import { formatMoney } from '../lib/budgetEngine';
import { getConversionRate } from '../lib/fxService';

export interface TransactionDraft {
  type: TransactionType;
  category: LedgerCategory;
  amount?: number;
  description?: string;
}

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: TransactionType;
  initialDraft?: TransactionDraft;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  onClose,
  defaultType = 'income',
  initialDraft,
}) => {
  const { activeCycleMonth, settings, fxRates, calculation, addTransaction } = useFinance();

  const [type, setType] = useState<TransactionType>(defaultType);
  const [category, setCategory] = useState<LedgerCategory>(
    defaultType === 'income' ? 'client_revenue' : 'business_materials'
  );
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>(settings.baseCurrency);
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    return `${activeCycleMonth}-${d}`;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const today = new Date();
      const d = String(today.getDate()).padStart(2, '0');
      setOccurredAt(`${activeCycleMonth}-${d}`);
      setCurrency(settings.baseCurrency);
      setError(null);

      if (initialDraft) {
        setType(initialDraft.type);
        setCategory(initialDraft.category);
        if (typeof initialDraft.amount === 'number' && initialDraft.amount > 0) {
          const rounded =
            settings.baseCurrency === 'KES'
              ? Math.round(initialDraft.amount)
              : Number(initialDraft.amount.toFixed(2));
          setAmount(String(rounded));
        } else {
          setAmount('');
        }
        setDescription(initialDraft.description || '');
      } else {
        setType(defaultType);
        setCategory(defaultType === 'income' ? 'client_revenue' : 'business_materials');
        setAmount('');
        setDescription('');
      }
    }
  }, [open, activeCycleMonth, settings.baseCurrency, initialDraft, defaultType]);

  if (!open) return null;

  const numAmount = Math.max(0, Number(amount) || 0);
  const fxRate = getConversionRate(currency, settings.baseCurrency, fxRates);
  const baseConverted = numAmount * fxRate;

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategory(nextType === 'income' ? 'client_revenue' : 'business_materials');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('Enter a positive monetary amount.');
      return;
    }
    if (!description.trim()) {
      setError('Enter a concise description for the audit ledger.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addTransaction({
        cycleMonth: activeCycleMonth,
        type,
        category,
        amount: numAmount,
        currency,
        description: description.trim(),
        occurredAt,
      });
      setAmount('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const isDiscretionaryWarning =
    type === 'expense' &&
    (category === 'discretionary' || category === 'growth_reinvestment') &&
    calculation.surplusLocked;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">
              Cycle {activeCycleMonth} · Multi-Currency Ledger
            </p>
            <h2 id="tx-modal-title" className="text-sm sm:text-base font-bold text-slate-950">
              Record Treasury Entry
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`min-h-[40px] py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                type === 'income'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Incoming Revenue
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`min-h-[40px] py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                type === 'expense'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Outgoing Expense
            </button>
          </div>

          {type === 'expense' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Allocation Bucket
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LedgerCategory)}
                className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <optgroup label="Tier 1 — Strict Non-Negotiables (Order 1–5)">
                  {TIER1_PRIORITY_ORDER.map((t) => (
                    <option key={t.key} value={t.key}>
                      #{t.rank} · {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tier 2 & 3 — Surplus Buckets">
                  <option value="savings_vault">Savings Vault</option>
                  <option value="growth_reinvestment">Growth Reinvestment</option>
                  <option value="discretionary">Discretionary Spend</option>
                </optgroup>
              </select>
            </div>
          )}

          {isDiscretionaryWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Tier 1 non-negotiables currently carry a shortfall of{' '}
              <span className="font-mono font-semibold">
                {formatMoney(calculation.tier1TotalShortfall, settings.baseCurrency)}
              </span>
              . Non-essential spend is discouraged until Tier 1 reaches 100% coverage.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Amount
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {numAmount > 0 && (
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                Base Equivalent ({currency} → {settings.baseCurrency} @{' '}
                <span className="font-mono tabular-nums">{fxRate.toFixed(4)}</span>)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-950">
                {formatMoney(baseConverted, settings.baseCurrency)}
              </span>
            </div>
          )}

          {type === 'income' && numAmount > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5 text-xs text-emerald-950">
              <p className="font-semibold">Instant Percentage Allocation Preview</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums">
                <span>
                  Essentials ({Math.round((settings.essentialsPct ?? 0.6) * 100)}%):{' '}
                  {formatMoney(baseConverted * (settings.essentialsPct ?? 0.6), settings.baseCurrency)}
                </span>
                <span>
                  Debt ({Math.round((settings.debtPct ?? 0.2) * 100)}%):{' '}
                  {formatMoney(baseConverted * (settings.debtPct ?? 0.2), settings.baseCurrency)}
                </span>
                <span>
                  Save/Invest ({Math.round((settings.saveInvestPct ?? 0.15) * 100)}%):{' '}
                  {formatMoney(baseConverted * (settings.saveInvestPct ?? 0.15), settings.baseCurrency)}
                </span>
                <span>
                  Guilt-Free ({Math.round((settings.guiltFreePct ?? 0.05) * 100)}%):{' '}
                  {formatMoney(baseConverted * (settings.guiltFreePct ?? 0.05), settings.baseCurrency)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Description
              </label>
              <input
                type="text"
                required
                maxLength={240}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  type === 'income'
                    ? 'e.g., Enterprise client milestone payment'
                    : 'e.g., Raw materials supplier invoice'
                }
                className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Date
              </label>
              <input
                type="date"
                required
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-700">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Recording...' : type === 'income' ? 'Record & Check Debts' : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
