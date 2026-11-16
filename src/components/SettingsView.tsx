import React, { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '../types/finance';
import { DEFAULT_ESSENTIALS_TARGETS, formatMoney } from '../lib/budgetEngine';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, fxRates, refreshFxRates } = useFinance();

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>(settings.baseCurrency);
  const [taxRatePct, setTaxRatePct] = useState(String(Math.round(settings.taxReserveRate * 100)));
  const [essentialsPct, setEssentialsPct] = useState(
    String(Math.round((settings.essentialsPct ?? 0.6) * 100))
  );
  const [debtPct, setDebtPct] = useState(String(Math.round((settings.debtPct ?? 0.2) * 100)));
  const [saveInvestPct, setSaveInvestPct] = useState(
    String(Math.round((settings.saveInvestPct ?? 0.15) * 100))
  );
  const [guiltFreePct, setGuiltFreePct] = useState(
    String(Math.round((settings.guiltFreePct ?? 0.05) * 100))
  );
  const [materialsTarget, setMaterialsTarget] = useState(
    String(settings.essentialsMaterialsTarget ?? DEFAULT_ESSENTIALS_TARGETS.business_materials)
  );
  const [transportFoodTarget, setTransportFoodTarget] = useState(
    String(settings.essentialsTransportFoodTarget ?? DEFAULT_ESSENTIALS_TARGETS.transportation)
  );
  const [salariesTarget, setSalariesTarget] = useState(
    String(settings.essentialsSalariesTarget ?? DEFAULT_ESSENTIALS_TARGETS.worker_salaries)
  );
  const [schoolFeesTarget, setSchoolFeesTarget] = useState(
    String(settings.essentialsSchoolFeesTarget ?? DEFAULT_ESSENTIALS_TARGETS.sisters_school_fees)
  );
  const [lowLiquidityPct, setLowLiquidityPct] = useState(
    String(settings.lowLiquidityThresholdPct)
  );
  const [savingsTarget, setSavingsTarget] = useState(String(settings.savingsMilestoneTarget));
  const [autoBackup, setAutoBackup] = useState(settings.autoBackupEnabled);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshingFx, setRefreshingFx] = useState(false);

  useEffect(() => {
    setCompanyName(settings.companyName);
    setBaseCurrency(settings.baseCurrency);
    setTaxRatePct(String(Math.round(settings.taxReserveRate * 100)));
    setEssentialsPct(String(Math.round((settings.essentialsPct ?? 0.6) * 100)));
    setDebtPct(String(Math.round((settings.debtPct ?? 0.2) * 100)));
    setSaveInvestPct(String(Math.round((settings.saveInvestPct ?? 0.15) * 100)));
    setGuiltFreePct(String(Math.round((settings.guiltFreePct ?? 0.05) * 100)));
    setMaterialsTarget(
      String(settings.essentialsMaterialsTarget ?? DEFAULT_ESSENTIALS_TARGETS.business_materials)
    );
    setTransportFoodTarget(
      String(settings.essentialsTransportFoodTarget ?? DEFAULT_ESSENTIALS_TARGETS.transportation)
    );
    setSalariesTarget(
      String(settings.essentialsSalariesTarget ?? DEFAULT_ESSENTIALS_TARGETS.worker_salaries)
    );
    setSchoolFeesTarget(
      String(settings.essentialsSchoolFeesTarget ?? DEFAULT_ESSENTIALS_TARGETS.sisters_school_fees)
    );
    setLowLiquidityPct(String(settings.lowLiquidityThresholdPct));
    setSavingsTarget(String(settings.savingsMilestoneTarget));
    setAutoBackup(settings.autoBackupEnabled);
  }, [settings]);

  const eVal = Math.max(0, Number(essentialsPct) || 0);
  const dVal = Math.max(0, Number(debtPct) || 0);
  const sVal = Math.max(0, Number(saveInvestPct) || 0);
  const gVal = Math.max(0, Number(guiltFreePct) || 0);
  const pctTotal = eVal + dVal + sVal + gVal;

  const matVal = Math.max(0, Number(materialsTarget) || 0);
  const trnVal = Math.max(0, Number(transportFoodTarget) || 0);
  const salVal = Math.max(0, Number(salariesTarget) || 0);
  const feeVal = Math.max(0, Number(schoolFeesTarget) || 0);
  const essentialsBaselineSum = matVal + trnVal + salVal + feeVal;

  const handleResetRecommended = () => {
    setEssentialsPct('60');
    setDebtPct('20');
    setSaveInvestPct('15');
    setGuiltFreePct('5');
  };

  const handleResetStandardEssentials = () => {
    setMaterialsTarget(String(DEFAULT_ESSENTIALS_TARGETS.business_materials));
    setTransportFoodTarget(String(DEFAULT_ESSENTIALS_TARGETS.transportation));
    setSalariesTarget(String(DEFAULT_ESSENTIALS_TARGETS.worker_salaries));
    setSchoolFeesTarget(String(DEFAULT_ESSENTIALS_TARGETS.sisters_school_fees));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pctTotal <= 0) return;
    setSaving(true);
    setSavedNotice(false);
    try {
      await updateSettings({
        companyName,
        baseCurrency,
        taxReserveRate: Math.min(60, Math.max(0, Number(taxRatePct) || 0)) / 100,
        essentialsPct: eVal / pctTotal,
        debtPct: dVal / pctTotal,
        saveInvestPct: sVal / pctTotal,
        guiltFreePct: gVal / pctTotal,
        essentialsMaterialsTarget: matVal,
        essentialsTransportFoodTarget: trnVal,
        essentialsSalariesTarget: salVal,
        essentialsSchoolFeesTarget: feeVal,
        lowLiquidityThresholdPct: Math.min(100, Math.max(0, Number(lowLiquidityPct) || 75)),
        savingsMilestoneTarget: Math.max(0, Number(savingsTarget) || 0),
        autoBackupEnabled: autoBackup,
      });
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshFx = async () => {
    setRefreshingFx(true);
    try {
      await refreshFxRates();
    } finally {
      setRefreshingFx(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6"
      >
        <div>
          <h2 className="text-base font-bold text-stone-950">
            Allocation Policy &amp; Business Settings
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Configure percentages, base currency, and savings targets for Jescamp Gifts &amp; Deco.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Business Name
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full min-h-[42px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Base Currency
            </label>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as SupportedCurrency)}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-white"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-stone-800">
              Income Allocation Split (%)
            </span>
            <div className="flex items-center gap-3">
              <span
                className={`font-mono tabular-nums font-semibold ${
                  pctTotal === 100 ? 'text-emerald-800' : 'text-amber-700'
                }`}
              >
                Sum: {pctTotal}%
              </span>
              <button
                type="button"
                onClick={handleResetRecommended}
                className="min-h-[36px] inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-950 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset 60/20/15/5</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-stone-600 mb-1">Essentials</label>
              <input
                type="number"
                min="0"
                max="100"
                value={essentialsPct}
                onChange={(e) => setEssentialsPct(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Debt</label>
              <input
                type="number"
                min="0"
                max="100"
                value={debtPct}
                onChange={(e) => setDebtPct(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Save / Invest</label>
              <input
                type="number"
                min="0"
                max="100"
                value={saveInvestPct}
                onChange={(e) => setSaveInvestPct(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Guilt-Free</label>
              <input
                type="number"
                min="0"
                max="100"
                value={guiltFreePct}
                onChange={(e) => setGuiltFreePct(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-stone-800">
              Standard Monthly Essentials Baseline ({baseCurrency})
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums font-semibold text-emerald-900">
                Total: {formatMoney(essentialsBaselineSum, baseCurrency)}
              </span>
              <button
                type="button"
                onClick={handleResetStandardEssentials}
                className="min-h-[36px] inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-950 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset 230K Standard</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-stone-600 mb-1">Materials</label>
              <input
                type="number"
                min="0"
                step="any"
                value={materialsTarget}
                onChange={(e) => setMaterialsTarget(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Transport &amp; Food</label>
              <input
                type="number"
                min="0"
                step="any"
                value={transportFoodTarget}
                onChange={(e) => setTransportFoodTarget(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Worker Salaries</label>
              <input
                type="number"
                min="0"
                step="any"
                value={salariesTarget}
                onChange={(e) => setSalariesTarget(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1">Sister&apos;s Fees</label>
              <input
                type="number"
                min="0"
                step="any"
                value={schoolFeesTarget}
                onChange={(e) => setSchoolFeesTarget(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-stone-100">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Tax Tracking (%)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              step="0.5"
              value={taxRatePct}
              onChange={(e) => setTaxRatePct(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Alert Threshold (%)
            </label>
            <input
              type="number"
              min="10"
              max="100"
              value={lowLiquidityPct}
              onChange={(e) => setLowLiquidityPct(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Savings Target ({baseCurrency})
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={savingsTarget}
              onChange={(e) => setSavingsTarget(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 pt-2 min-h-[40px] cursor-pointer">
          <input
            type="checkbox"
            checked={autoBackup}
            onChange={(e) => setAutoBackup(e.target.checked)}
            className="w-4 h-4 accent-emerald-900 rounded"
          />
          <span className="text-sm text-stone-700">
            Enable automatic cloud backups
          </span>
        </label>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-stone-100">
          <span className="text-xs text-emerald-800 font-medium">
            {savedNotice ? 'Settings saved.' : ''}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* FX Synchronization Card */}
      <section className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-4 sm:p-6 lg:p-8 space-y-5 h-fit">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-stone-950">FX Rates</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {fxRates.source === 'live' ? 'Live feed' : 'Reference rates'} ·{' '}
              {new Date(fxRates.fetchedAt).toLocaleTimeString()}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefreshFx}
            disabled={refreshingFx}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingFx ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-xs font-semibold text-stone-500">
                <th className="py-2 pr-3">Currency</th>
                <th className="py-2 px-3 text-right">Per 1 USD</th>
                <th className="py-2 pl-3 text-right">To {settings.baseCurrency}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {SUPPORTED_CURRENCIES.map((c) => {
                const perUsd = fxRates.rates[c];
                const toBase = (fxRates.rates[settings.baseCurrency] || 1) / (perUsd || 1);
                return (
                  <tr key={c}>
                    <td className="py-3 pr-3 font-mono font-semibold text-stone-900">{c}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-stone-600">
                      {perUsd.toFixed(4)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-medium text-stone-950">
                      {toBase.toFixed(4)}
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
