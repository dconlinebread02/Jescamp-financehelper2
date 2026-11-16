import React, { useState } from 'react';
import { ArrowRight, Landmark, ShieldCheck } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

export const SignInScreen: React.FC = () => {
  const { signInWithGoogle, connectionError } = useFinance();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-between">
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-6 flex items-center justify-between gap-4 sm:gap-8 border-b border-stone-200">
        <span className="text-base sm:text-lg font-bold tracking-tight text-stone-950 whitespace-nowrap truncate max-w-[190px] sm:max-w-none shrink-0">
          Jescamp Gifts &amp; Deco
        </span>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
          <a href="#methodology" className="hover:text-stone-950 transition-colors whitespace-nowrap shrink-0">
            T-2 Baseline
          </a>
          <a href="#split" className="hover:text-stone-950 transition-colors whitespace-nowrap shrink-0">
            60/20/15/5 Split
          </a>
          <a href="#statements" className="hover:text-stone-950 transition-colors whitespace-nowrap shrink-0">
            PDF Statements
          </a>
        </nav>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {signingIn ? 'Connecting...' : 'Sign In'}
        </button>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-14 lg:py-20 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-1 sm:py-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-emerald-900 mb-3">
                Jescamp Gifts &amp; Deco · Financial Workspace
              </p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-stone-950 leading-[1.14] [text-wrap:balance]">
                Calm, clear cash-flow planning for every shilling earned.
              </h1>
              <p className="mt-4 sm:mt-5 text-sm sm:text-base text-stone-600 leading-relaxed max-w-lg">
                Split incoming revenue into clear percentages, upload monthly statement PDFs directly for your T-2 baseline, and protect non-negotiable obligations without the clutter.
              </p>

              {(authError || connectionError) && (
                <div
                  role="alert"
                  className="mt-6 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                >
                  <strong className="font-semibold">Authentication notice: </strong>
                  {authError || connectionError}
                </div>
              )}

              <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-stone-500 text-center sm:text-left">
                  Private cloud-backed ledger
                </span>
              </div>
            </div>

            <div
              id="split"
              className="mt-10 sm:mt-14 pt-6 sm:pt-8 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6"
            >
              <div id="methodology">
                <p className="text-xs font-semibold text-stone-900">01. Simple Split</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  60% Essentials, 20% Debt, 15% Save &amp; Invest, 5% Guilt-Free.
                </p>
              </div>
              <div id="statements">
                <p className="text-xs font-semibold text-stone-900">02. PDF Upload</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Drop a monthly statement PDF to populate your T-2 baseline automatically.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-900">03. Protected Priorities</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Materials, transport, salaries, school fees, and debts always come first.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full rounded-xl overflow-hidden border border-stone-200 bg-stone-900 flex flex-col justify-between min-h-[240px] sm:min-h-[340px]">
              {!imgFailed ? (
                <img
                  src="/src/assets/images/signin_treasury_visual_1794784888221.jpg"
                  alt="Jescamp Gifts and Deco minimalist treasury desk"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-60 sm:h-80 lg:h-full object-cover"
                />
              ) : (
                <div className="w-full h-full min-h-[240px] sm:min-h-[340px] bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-950 flex flex-col items-center justify-center p-8 sm:p-10 text-stone-200">
                  <Landmark className="w-10 h-10 text-emerald-400 mb-3" />
                  <p className="text-sm font-semibold">Jescamp Gifts &amp; Deco</p>
                  <p className="text-xs text-stone-400 mt-1">Treasury &amp; Dynamic Budgeting</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0" />
          <span>Owner-isolated Cloud Firestore · Jescamp Gifts &amp; Deco</span>
        </div>
        <span className="font-mono tabular-nums">KES · USD · EUR · GBP</span>
      </footer>
    </div>
  );
};
