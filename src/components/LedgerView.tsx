import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { CATEGORY_LABELS, TIER1_PRIORITY_ORDER } from '../types/finance';
import { formatMoney, formatMonthLabel } from '../lib/budgetEngine';
import { convertAmount } from '../lib/fxService';

interface LedgerViewProps {
  onOpenNewTx: () => void;
}

const TIER1_KEYS = new Set<string>(TIER1_PRIORITY_ORDER.map((t) => t.key));

export const LedgerView: React.FC<LedgerViewProps> = ({ onOpenNewTx }) => {
  const {
    activeCycleMonth,
    activeCycle,
    transactions,
    settings,
    fxRates,
    deleteTransaction,
    openDebtCheck,
  } = useFinance();

  const [filter, setFilter] = useState<'all' | 'income' | 'tier1' | 'surplus'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cur = settings.baseCurrency;

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.cycleMonth !== activeCycleMonth) return false;
      if (filter === 'income' && tx.type !== 'income') return false;
      if (filter === 'tier1' && !TIER1_KEYS.has(tx.category)) return false;
      if (
        filter === 'surplus' &&
        (tx.type === 'income' || TIER1_KEYS.has(tx.category))
      ) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const cat = (CATEGORY_LABELS[tx.category] || '').toLowerCase();
        return (
          tx.description.toLowerCase().includes(q) ||
          cat.includes(q) ||
          tx.currency.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, activeCycleMonth, filter, searchTerm]);

  const handleDelete = async (txId: string) => {
    setDeletingId(txId);
    try {
      await deleteTransaction(txId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Debt Check Summary Row */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-950">
            Cycle Debt Check ({formatMonthLabel(activeCycleMonth)})
          </p>
          <p className="text-xs text-stone-600 mt-1">
            {activeCycle?.debtCheckCompleted
              ? `Confirmed ${formatMoney(activeCycle.confirmedDebtAmount, activeCycle.currency)}${activeCycle.debtNote ? ` · ${activeCycle.debtNote}` : ''}`
              : 'No debt check confirmed for this cycle yet.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openDebtCheck('manual')}
          className="w-full sm:w-auto min-h-[42px] sm:min-h-[40px] px-4 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          {activeCycle?.debtCheckCompleted ? 'Update Debt Check' : 'Run Debt Check'}
        </button>
      </section>

      {/* Responsive Ledger */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="overflow-x-auto max-w-full">
            <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-lg min-w-max">
              {(
                [
                  ['all', 'All'],
                  ['income', 'Income'],
                  ['tier1', 'Essentials & Debt'],
                  ['surplus', 'Save & Guilt-Free'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    filter === key
                      ? 'bg-white text-stone-950 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
            <div className="relative flex-1 lg:w-60">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search entries..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-800"
              />
            </div>
            <button
              type="button"
              onClick={onOpenNewTx}
              className="w-full sm:w-auto min-h-[42px] sm:min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Entry</span>
            </button>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-sm font-medium text-stone-700">
              No matching entries in {formatMonthLabel(activeCycleMonth)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Log incoming revenue or operational expenses in KES, USD, EUR, or GBP.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile & Small Tablet Cards (< md) */}
            <div className="md:hidden divide-y divide-stone-100">
              {filteredTransactions.map((tx) => {
                const liveBase = convertAmount(tx.amount, tx.currency, cur, fxRates);
                return (
                  <div
                    key={tx.id}
                    className="p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-900 break-words">
                        {tx.description}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        <span className="font-mono text-stone-400">{tx.occurredAt}</span>
                        {' · '}
                        {CATEGORY_LABELS[tx.category]}
                      </p>
                      {tx.currency !== cur && (
                        <p className="text-[11px] font-mono text-stone-400 mt-0.5">
                          Original: {formatMoney(tx.amount, tx.currency)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-sm font-mono tabular-nums font-semibold whitespace-nowrap ${
                          tx.type === 'income' ? 'text-emerald-800' : 'text-stone-900'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatMoney(liveBase, cur)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(tx.id)}
                        disabled={deletingId === tx.id}
                        aria-label={`Delete ${tx.description}`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-stone-400 hover:text-red-700 rounded-lg cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet & Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-500">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Bucket</th>
                    <th className="py-3 px-4 text-right">Original</th>
                    <th className="py-3 px-4 text-right">Base ({cur})</th>
                    <th className="py-3 px-6 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {filteredTransactions.map((tx) => {
                    const liveBase = convertAmount(tx.amount, tx.currency, cur, fxRates);
                    return (
                      <tr key={tx.id} className="hover:bg-stone-50/60">
                        <td className="py-3.5 px-6 font-mono text-xs text-stone-400 whitespace-nowrap">
                          {tx.occurredAt}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-stone-900">
                          {tx.description}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-stone-500 whitespace-nowrap">
                          {CATEGORY_LABELS[tx.category]}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-stone-500 whitespace-nowrap">
                          {formatMoney(tx.amount, tx.currency)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            tx.type === 'income' ? 'text-emerald-800' : 'text-stone-900'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatMoney(liveBase, cur)}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(tx.id)}
                            disabled={deletingId === tx.id}
                            aria-label={`Delete ${tx.description}`}
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
    </div>
  );
};
