import React, { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  TIER1_PRIORITY_ORDER,
} from '../types/finance';
import {
  computeEssentialsRebalance,
  formatMoney,
  getNormalizedPercentages,
  simulateIncomingDeposit,
} from '../lib/budgetEngine';
import { convertAmount } from '../lib/fxService';

export const AdvisorView: React.FC = () => {
  const {
    activeCycleMonth,
    settings,
    calculation,
    statements,
    fxRates,
    addTransaction,
  } = useFinance();

  const cur = settings.baseCurrency;
  const pct = getNormalizedPercentages(settings);
  const latestStatement = [...statements].sort((a, b) => {
    const tA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
    const tB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
    if (tB !== tA) return tB - tA;
    return b.monthKey.localeCompare(a.monthKey);
  })[0];
  const latestSubtotalInBase = latestStatement
    ? convertAmount(latestStatement.totalRevenue, latestStatement.currency, cur, fxRates)
    : calculation.totalRevenue;

  const [incomingAmount, setIncomingAmount] = useState<string>(() => {
    if (latestSubtotalInBase > 0) return String(Math.round(latestSubtotalInBase));
    return cur === 'KES' ? '350000' : '3000';
  });
  const [incomingCurrency, setIncomingCurrency] = useState<SupportedCurrency>(cur);
  const [depositDesc, setDepositDesc] = useState<string>('Client Payment');
  const [committing, setCommitting] = useState(false);

  const rawAmount = Math.max(0, Number(incomingAmount) || 0);
  const baseDeposit = convertAmount(rawAmount, incomingCurrency, cur, fxRates);

  const routingSteps = simulateIncomingDeposit({
    incomingBaseAmount: baseDeposit,
    currentCalc: calculation,
    settings,
  });

  const rebalance = computeEssentialsRebalance(baseDeposit, settings);
  const essentialDefs = TIER1_PRIORITY_ORDER.filter(
    (d) => d.key !== 'pending_loans_debts'
  ) as Array<
    (typeof TIER1_PRIORITY_ORDER)[number] & {
      key: 'business_materials' | 'transportation' | 'worker_salaries' | 'sisters_school_fees';
    }
  >;

  const handleCommitDeposit = async () => {
    if (rawAmount <= 0) return;
    setCommitting(true);
    try {
      const today = new Date();
      const d = String(today.getDate()).padStart(2, '0');
      await addTransaction({
        cycleMonth: activeCycleMonth,
        type: 'income',
        category: 'client_revenue',
        amount: rawAmount,
        currency: incomingCurrency,
        description: depositDesc.trim() || 'Client Payment',
        occurredAt: `${activeCycleMonth}-${d}`,
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-stone-950">
            Percentage Allocation Calculator
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Splits income {(pct.essentialsPct * 100).toFixed(0)}% Essentials,{' '}
            {(pct.debtPct * 100).toFixed(0)}% Debt, {(pct.saveInvestPct * 100).toFixed(0)}% Save/Invest, and{' '}
            {(pct.guiltFreePct * 100).toFixed(0)}% Guilt-Free — auto-rebalancing with your{' '}
            {formatMoney(rebalance.targets.total, cur)} Essentials baseline.
          </p>
        </div>
        {latestStatement && latestStatement.totalRevenue > 0 && (
          <button
            type="button"
            onClick={() => {
              setIncomingAmount(String(Math.round(latestStatement.totalRevenue)));
              setIncomingCurrency(latestStatement.currency);
              setDepositDesc(`Statement ${latestStatement.monthKey} Subtotal`);
            }}
            className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Use {latestStatement.monthKey} Subtotal (
            {formatMoney(latestStatement.totalRevenue, latestStatement.currency)})
          </button>
        )}
      </div>

      {/* Calculator Input Bar */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 sm:gap-4 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Income Received
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={incomingAmount}
              onChange={(e) => setIncomingAmount(e.target.value)}
              className="w-full min-h-[42px] px-3.5 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Currency
            </label>
            <select
              value={incomingCurrency}
              onChange={(e) => setIncomingCurrency(e.target.value as SupportedCurrency)}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Note
            </label>
            <input
              type="text"
              maxLength={240}
              value={depositDesc}
              onChange={(e) => setDepositDesc(e.target.value)}
              className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800"
            />
          </div>
          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={handleCommitDeposit}
              disabled={committing || rawAmount <= 0}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <span>{committing ? 'Saving...' : 'Log Income'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 4 Clean Rebalanced Split Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {routingSteps.map((step) => (
          <div
            key={step.key}
            className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-medium text-emerald-900">{step.formula}</span>
                <span className="font-mono font-bold text-stone-400">
                  {(step.percentage * 100).toFixed(0)}%
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-stone-950">
                {step.label.split(' (')[0]}
              </h3>
              <p className="mt-2.5 sm:mt-3 text-xl sm:text-2xl font-bold font-mono tabular-nums text-stone-950">
                {formatMoney(step.allocatedAmount, cur)}
              </p>
              {Math.abs(step.rebalanceDelta) > 0.5 && (
                <p className="mt-1 text-xs font-mono tabular-nums text-stone-500">
                  {step.rebalanceDelta > 0 ? '+' : '−'}
                  {formatMoney(Math.abs(step.rebalanceDelta), cur)} auto-rebalanced
                </p>
              )}
            </div>
            <p className="text-xs text-stone-500 leading-relaxed pt-3 border-t border-stone-100">
              {step.guidance}
            </p>
          </div>
        ))}
      </section>

      {/* Live Essentials Auto-Allocation Breakdown */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-950">
              Essentials Auto-Allocation Breakdown ({formatMoney(rebalance.essentialsAllocated, cur)})
            </h3>
            <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
              {rebalance.essentialsStatus === 'borrowed_from_savings' &&
                `60% (${formatMoney(rebalance.essentialsBaseAllocated, cur)}) was below ${formatMoney(rebalance.targets.total, cur)} — automatically borrowed ${formatMoney(rebalance.borrowedFromSavings, cur)} from 15% Save / Invest.`}
              {rebalance.essentialsStatus === 'squeezed_materials' &&
                `Borrowed ${formatMoney(rebalance.borrowedFromSavings, cur)} from Save / Invest and squeezed Materials down to ${formatMoney(rebalance.effectiveMaterialsTarget, cur)} to fit cleanly.`}
              {rebalance.essentialsStatus === 'borrowed_from_guilt_free' &&
                `Borrowed ${formatMoney(rebalance.borrowedFromSavings, cur)} Save / Invest, squeezed Materials down to ${formatMoney(rebalance.effectiveMaterialsTarget, cur)}, and borrowed ${formatMoney(rebalance.borrowedFromGuiltFree, cur)} from Guilt-Free.`}
              {rebalance.essentialsStatus === 'surplus_to_savings' &&
                `60% (${formatMoney(rebalance.essentialsBaseAllocated, cur)}) exceeded ${formatMoney(rebalance.targets.total, cur)} — automatically moved ${formatMoney(rebalance.essentialsSurplusToSavings, cur)} extra to Save / Invest.`}
              {rebalance.essentialsStatus === 'insufficient_all_pools' &&
                `Squeezed Materials to ${formatMoney(rebalance.effectiveMaterialsTarget, cur)} + used all Save / Invest & Guilt-Free; ${formatMoney(rebalance.essentialsUncoveredGap, cur)} still uncovered.`}
              {(rebalance.essentialsStatus === 'exact' || rebalance.essentialsStatus === 'idle') &&
                `Real-life monthly essentials baseline (${formatMoney(rebalance.targets.total, cur)} total)`}
            </p>
          </div>
          <span className="text-xs text-stone-500 shrink-0">Order 1 → 4</span>
        </div>

        {/* Mobile Essentials Breakdown Cards */}
        <div className="sm:hidden divide-y divide-stone-100">
          {essentialDefs.map((def) => {
            const alloc = rebalance.itemAllocations[def.key];
            return (
              <div key={def.key} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-stone-400 mr-2">
                      0{def.rank}
                    </span>
                    <span className="text-sm font-medium text-stone-900">
                      {def.label}
                    </span>
                    {def.key === 'business_materials' && rebalance.materialsSqueezedAmount > 0 && (
                      <p className="text-xs text-amber-700 font-medium mt-0.5">
                        Squeezed from {formatMoney(rebalance.targets.business_materials, cur)}
                      </p>
                    )}
                  </div>
                  {alloc.shortfall > 0.01 ? (
                    <span className="font-mono text-xs text-red-700 font-semibold shrink-0">
                      Short {formatMoney(alloc.shortfall, cur)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-800 font-semibold shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Covered
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-stone-500">
                    Need:{' '}
                    <span className="font-mono tabular-nums text-stone-700">
                      {formatMoney(alloc.target, cur)}
                    </span>
                  </span>
                  <span className="text-stone-500">
                    Allocated:{' '}
                    <span className="font-mono tabular-nums font-semibold text-stone-950">
                      {formatMoney(alloc.funded, cur)}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tablet & Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-500">
                <th className="py-3 px-6">Essential Item</th>
                <th className="py-3 px-6 text-right">Target Need</th>
                <th className="py-3 px-6 text-right">Auto-Allocated</th>
                <th className="py-3 px-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {essentialDefs.map((def) => {
                const alloc = rebalance.itemAllocations[def.key];
                return (
                  <tr key={def.key} className="hover:bg-stone-50/60">
                    <td className="py-3.5 px-6">
                      <span className="font-mono text-xs text-stone-400 mr-2.5">
                        0{def.rank}
                      </span>
                      <span className="font-medium text-stone-900">{def.label}</span>
                      {def.key === 'business_materials' && rebalance.materialsSqueezedAmount > 0 && (
                        <span className="ml-2 text-xs text-amber-700 font-medium">
                          (Squeezed from {formatMoney(rebalance.targets.business_materials, cur)})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums text-stone-600">
                      {formatMoney(alloc.target, cur)}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold text-stone-950">
                      {formatMoney(alloc.funded, cur)}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums text-xs">
                      {alloc.shortfall > 0.01 ? (
                        <span className="text-red-700 font-semibold">
                          Short {formatMoney(alloc.shortfall, cur)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Covered
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
