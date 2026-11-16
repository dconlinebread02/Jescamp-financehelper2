import React, { Component, ErrorInfo, ReactNode, useState } from 'react';
import { LogOut, Menu, Plus, X } from 'lucide-react';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from './types/finance';
import { formatMonthLabel, getTMinusTwoMonth } from './lib/budgetEngine';
import { SignInScreen } from './components/SignInScreen';
import { OverviewView } from './components/OverviewView';
import { AdvisorView } from './components/AdvisorView';
import { LedgerView } from './components/LedgerView';
import { StatementsView } from './components/StatementsView';
import { SettingsView } from './components/SettingsView';
import { DebtCheckModal } from './components/DebtCheckModal';
import { TransactionDraft, TransactionModal } from './components/TransactionModal';

export type NavTab = 'overview' | 'allocate' | 'ledger' | 'statements' | 'settings';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Treasury Workspace Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-stone-200 rounded-xl p-6 space-y-3">
            <h1 className="text-base font-bold text-stone-950">
              Treasury Session Interrupted
            </h1>
            <p className="text-xs text-stone-600 break-words font-mono bg-stone-50 p-3 rounded-lg border border-stone-200">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold text-white bg-stone-900 rounded-lg cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS: Array<{ key: NavTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'statements', label: 'Upload & Statements' },
  { key: 'allocate', label: 'Allocate' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'settings', label: 'Settings' },
];

const WorkspaceShell: React.FC = () => {
  const {
    user,
    authReady,
    connectionError,
    activeCycleMonth,
    setActiveCycleMonth,
    settings,
    updateSettings,
    signOut,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDraft, setTxDraft] = useState<TransactionDraft | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openTxModal = (draft?: TransactionDraft) => {
    setTxDraft(draft);
    setTxModalOpen(true);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-sm font-medium text-stone-500">Loading Jescamp Gifts &amp; Deco...</p>
      </div>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  const baselineMonth = getTMinusTwoMonth(activeCycleMonth);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      {/* Minimalist 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-sm sm:text-base font-bold tracking-tight text-stone-950 whitespace-nowrap truncate max-w-[175px] sm:max-w-none shrink-0 cursor-pointer"
          >
            Jescamp Gifts &amp; Deco
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-7">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`py-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-emerald-900 text-stone-950'
                      : 'border-transparent text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary CTA (+ Mobile Menu Toggle) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openTxModal()}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[40px] text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Entry</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-600 hover:text-stone-950 rounded-lg border border-stone-200 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-stone-200 bg-white px-4 py-2.5 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveTab(item.key);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 min-h-[44px] flex items-center text-sm font-medium rounded-lg ${
                  activeTab === item.key
                    ? 'bg-emerald-50 text-emerald-950 font-semibold'
                    : 'text-stone-700 hover:bg-stone-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Spacious Centered Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-8 min-w-0">
        {connectionError && (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900"
          >
            <strong className="font-semibold">Firebase Notice: </strong>
            {connectionError}
          </div>
        )}

        {/* Quiet Context Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-5 sm:pb-6 border-b border-stone-200">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="cycle-month-picker" className="text-xs font-medium text-stone-500">
                Cycle
              </label>
              <input
                id="cycle-month-picker"
                type="month"
                value={activeCycleMonth}
                onChange={(e) => {
                  if (e.target.value) setActiveCycleMonth(e.target.value);
                }}
                className="px-2.5 min-h-[38px] text-xs font-mono bg-white text-stone-900 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-800"
              />
            </div>
            <span className="text-xs text-stone-500">
              {formatMonthLabel(activeCycleMonth)} · T-2 Baseline:{' '}
              <span className="font-mono font-medium text-stone-800">{baselineMonth}</span>
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
            <select
              aria-label="Base reporting currency"
              value={settings.baseCurrency}
              onChange={(e) =>
                updateSettings({ baseCurrency: e.target.value as SupportedCurrency })
              }
              className="px-2.5 min-h-[38px] text-xs font-mono font-semibold text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-800 cursor-pointer"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <span className="hidden lg:inline text-xs text-stone-500 truncate max-w-[180px]">
              {user.displayName || user.email}
            </span>

            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-2 text-xs font-medium text-stone-500 hover:text-stone-900 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Active View */}
        {activeTab === 'overview' && (
          <OverviewView
            onNavigate={setActiveTab}
            onOpenNewTx={openTxModal}
          />
        )}
        {activeTab === 'allocate' && <AdvisorView />}
        {activeTab === 'ledger' && (
          <LedgerView onOpenNewTx={() => openTxModal()} />
        )}
        {activeTab === 'statements' && <StatementsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      <TransactionModal
        open={txModalOpen}
        initialDraft={txDraft}
        onClose={() => {
          setTxModalOpen(false);
          setTxDraft(undefined);
        }}
      />
      <DebtCheckModal />
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <FinanceProvider>
        <WorkspaceShell />
      </FinanceProvider>
    </AppErrorBoundary>
  );
}
