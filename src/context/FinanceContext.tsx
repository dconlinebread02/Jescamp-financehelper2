import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BudgetBasisMode,
  BudgetCycle,
  CloudBackup,
  CycleCalculationResult,
  FxRatesMap,
  LedgerCategory,
  LedgerTransaction,
  MonthlyStatement,
  SupportedCurrency,
  TransactionType,
  WorkspaceSettings,
} from '../types/finance';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  calculateCycleAllocation,
  computeStatementAutoAllocations,
  getCurrentMonthKey,
  getOffsetMonthKey,
  getTMinusTwoMonth,
} from '../lib/budgetEngine';
import { FALLBACK_USD_RATES, fetchLiveFxRates, getConversionRate } from '../lib/fxService';
import { computeChecksum } from '../lib/exportUtils';

interface NewTransactionInput {
  cycleMonth: string;
  type: TransactionType;
  category: LedgerCategory;
  amount: number;
  currency: SupportedCurrency;
  description: string;
  occurredAt: string;
}

interface NewStatementInput {
  monthKey: string;
  currency: SupportedCurrency;
  totalRevenue: number;
  taxSegregated: number;
  businessMaterials: number;
  transportation: number;
  workerSalaries: number;
  sistersSchoolFees: number;
  pendingLoansDebts: number;
  savingsAllocated: number;
  growthAllocated: number;
  discretionarySpent: number;
  closingLiquidity: number;
  isClosed: boolean;
}

interface FinanceContextValue {
  user: User | null;
  authReady: boolean;
  dataLoading: boolean;
  connectionError: string | null;
  activeCycleMonth: string;
  setActiveCycleMonth: (monthKey: string) => void;
  settings: WorkspaceSettings;
  statements: MonthlyStatement[];
  cycles: BudgetCycle[];
  transactions: LedgerTransaction[];
  backups: CloudBackup[];
  activeCycle: BudgetCycle | undefined;
  budgetBasisMode: BudgetBasisMode;
  setBudgetBasisMode: (mode: BudgetBasisMode) => void;
  selectedStatementMonth: string | null;
  setSelectedStatementMonth: (monthKey: string | null) => void;
  calculation: CycleCalculationResult;
  fxRates: FxRatesMap;
  refreshFxRates: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  showDebtCheckModal: boolean;
  setShowDebtCheckModal: (open: boolean) => void;
  debtPromptReason: 'cycle_start' | 'new_income' | 'manual';
  openDebtCheck: (reason: 'cycle_start' | 'new_income' | 'manual') => void;
  confirmDebtCheck: (amount: number, note: string) => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<void>;
  deleteTransaction: (txId: string) => Promise<void>;
  saveStatement: (input: NewStatementInput) => Promise<void>;
  sealStatement: (monthKey: string) => Promise<void>;
  deleteStatement: (monthKey: string) => Promise<void>;
  updateSettings: (patch: Partial<WorkspaceSettings>) => Promise<void>;
  createCloudBackup: (source: 'auto' | 'manual') => Promise<void>;
  populateSampleBaseline: () => Promise<void>;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  ownerId: '',
  companyName: 'Jescamp Gifts & Deco',
  baseCurrency: 'KES',
  taxReserveRate: 0.16,
  essentialsPct: 0.6,
  debtPct: 0.2,
  saveInvestPct: 0.15,
  guiltFreePct: 0.05,
  essentialsMaterialsTarget: 150000,
  essentialsTransportFoodTarget: 20000,
  essentialsSalariesTarget: 40000,
  essentialsSchoolFeesTarget: 20000,
  savingsWeight: 0.45,
  growthWeight: 0.35,
  discretionaryWeight: 0.2,
  lowLiquidityThresholdPct: 75,
  savingsMilestoneTarget: 500000,
  autoBackupEnabled: true,
};

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

function sanitizeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [parentReady, setParentReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [activeCycleMonth, setActiveCycleMonthState] = useState<string>(() => getCurrentMonthKey());
  const [budgetBasisMode, setBudgetBasisModeState] = useState<BudgetBasisMode>('t2_first');
  const [selectedStatementMonth, setSelectedStatementMonthState] = useState<string | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);

  const setActiveCycleMonth = useCallback((monthKey: string) => {
    setActiveCycleMonthState(monthKey);
    setSelectedStatementMonthState(null);
  }, []);

  const setBudgetBasisMode = useCallback((mode: BudgetBasisMode) => {
    setBudgetBasisModeState(mode);
    if (mode !== 'latest_statement') {
      setSelectedStatementMonthState(null);
    }
  }, []);

  const setSelectedStatementMonth = useCallback((monthKey: string | null) => {
    setSelectedStatementMonthState(monthKey);
    if (monthKey) {
      setBudgetBasisModeState('latest_statement');
    }
  }, []);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [cycles, setCycles] = useState<BudgetCycle[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [backups, setBackups] = useState<CloudBackup[]>([]);

  const [fxRates, setFxRates] = useState<FxRatesMap>({
    base: 'USD',
    rates: { ...FALLBACK_USD_RATES },
    fetchedAt: new Date().toISOString(),
    source: 'fallback',
  });

  const [showDebtCheckModal, setShowDebtCheckModal] = useState(false);
  const [debtPromptReason, setDebtPromptReason] = useState<'cycle_start' | 'new_income' | 'manual'>('manual');
  const lastAutoBackupRef = useRef<number>(0);
  const cleanedSampleTxIdsRef = useRef<Set<string>>(new Set());
  const backfilledStatementKeysRef = useRef<Set<string>>(new Set());

  // Initial Firestore connection probe & live FX sync
  useEffect(() => {
    testFirestoreConnection().then((res) => {
      if (!res.ok && res.message) {
        setConnectionError(res.message);
      }
    });
    fetchLiveFxRates(false).then(setFxRates);
  }, []);

  const refreshFxRates = useCallback(async () => {
    const fresh = await fetchLiveFxRates(true);
    setFxRates(fresh);
  }, []);

  // Auth listener & user root document bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setParentReady(false);

      if (!nextUser) {
        setSettings(DEFAULT_SETTINGS);
        setStatements([]);
        setCycles([]);
        setTransactions([]);
        setBackups([]);
        setDataLoading(false);
        return;
      }

      setDataLoading(true);
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            displayName: (nextUser.displayName || 'Executive Owner').slice(0, 120),
            email: (nextUser.email || 'owner@example.com').slice(0, 180),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const settingsRef = doc(db, 'users', nextUser.uid, 'settings', 'default');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, {
            ownerId: nextUser.uid,
            companyName: DEFAULT_SETTINGS.companyName,
            baseCurrency: DEFAULT_SETTINGS.baseCurrency,
            taxReserveRate: DEFAULT_SETTINGS.taxReserveRate,
            essentialsPct: DEFAULT_SETTINGS.essentialsPct,
            debtPct: DEFAULT_SETTINGS.debtPct,
            saveInvestPct: DEFAULT_SETTINGS.saveInvestPct,
            guiltFreePct: DEFAULT_SETTINGS.guiltFreePct,
            essentialsMaterialsTarget: DEFAULT_SETTINGS.essentialsMaterialsTarget,
            essentialsTransportFoodTarget: DEFAULT_SETTINGS.essentialsTransportFoodTarget,
            essentialsSalariesTarget: DEFAULT_SETTINGS.essentialsSalariesTarget,
            essentialsSchoolFeesTarget: DEFAULT_SETTINGS.essentialsSchoolFeesTarget,
            savingsWeight: DEFAULT_SETTINGS.savingsWeight,
            growthWeight: DEFAULT_SETTINGS.growthWeight,
            discretionaryWeight: DEFAULT_SETTINGS.discretionaryWeight,
            lowLiquidityThresholdPct: DEFAULT_SETTINGS.lowLiquidityThresholdPct,
            savingsMilestoneTarget: DEFAULT_SETTINGS.savingsMilestoneTarget,
            autoBackupEnabled: DEFAULT_SETTINGS.autoBackupEnabled,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const existingData = settingsSnap.data();
          if (
            typeof existingData.essentialsPct !== 'number' ||
            typeof existingData.essentialsMaterialsTarget !== 'number'
          ) {
            await updateDoc(settingsRef, {
              essentialsPct:
                typeof existingData.essentialsPct === 'number'
                  ? existingData.essentialsPct
                  : DEFAULT_SETTINGS.essentialsPct,
              debtPct:
                typeof existingData.debtPct === 'number'
                  ? existingData.debtPct
                  : DEFAULT_SETTINGS.debtPct,
              saveInvestPct:
                typeof existingData.saveInvestPct === 'number'
                  ? existingData.saveInvestPct
                  : DEFAULT_SETTINGS.saveInvestPct,
              guiltFreePct:
                typeof existingData.guiltFreePct === 'number'
                  ? existingData.guiltFreePct
                  : DEFAULT_SETTINGS.guiltFreePct,
              essentialsMaterialsTarget:
                typeof existingData.essentialsMaterialsTarget === 'number'
                  ? existingData.essentialsMaterialsTarget
                  : DEFAULT_SETTINGS.essentialsMaterialsTarget,
              essentialsTransportFoodTarget:
                typeof existingData.essentialsTransportFoodTarget === 'number'
                  ? existingData.essentialsTransportFoodTarget
                  : DEFAULT_SETTINGS.essentialsTransportFoodTarget,
              essentialsSalariesTarget:
                typeof existingData.essentialsSalariesTarget === 'number'
                  ? existingData.essentialsSalariesTarget
                  : DEFAULT_SETTINGS.essentialsSalariesTarget,
              essentialsSchoolFeesTarget:
                typeof existingData.essentialsSchoolFeesTarget === 'number'
                  ? existingData.essentialsSchoolFeesTarget
                  : DEFAULT_SETTINGS.essentialsSchoolFeesTarget,
              updatedAt: serverTimestamp(),
            });
          }
        }
        setParentReady(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectionError(
          msg.includes('permission') || msg.includes('PERMISSION_DENIED')
            ? 'Firestore permission denied. Ensure firestore.rules are published to your Firebase project.'
            : `Unable to load Firestore workspace: ${msg}`
        );
        setDataLoading(false);
        handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
      }
    });

    return () => unsub();
  }, []);

  // Real-time Firestore listeners (strictly gated on auth + parent doc readiness)
  useEffect(() => {
    if (!authReady || !user || !parentReady) return;

    const uid = user.uid;
    const settingsDocRef = doc(db, 'users', uid, 'settings', 'default');
    const statementsQuery = query(
      collection(db, 'users', uid, 'statements'),
      where('ownerId', '==', uid)
    );
    const cyclesQuery = query(
      collection(db, 'users', uid, 'cycles'),
      where('ownerId', '==', uid)
    );
    const txQuery = query(
      collection(db, 'users', uid, 'transactions'),
      where('ownerId', '==', uid)
    );
    const backupsQuery = query(
      collection(db, 'users', uid, 'backups'),
      where('ownerId', '==', uid)
    );

    const unsubSettings = onSnapshot(
      settingsDocRef,
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as Partial<WorkspaceSettings>;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...raw,
            essentialsPct: raw.essentialsPct ?? DEFAULT_SETTINGS.essentialsPct,
            debtPct: raw.debtPct ?? DEFAULT_SETTINGS.debtPct,
            saveInvestPct: raw.saveInvestPct ?? DEFAULT_SETTINGS.saveInvestPct,
            guiltFreePct: raw.guiltFreePct ?? DEFAULT_SETTINGS.guiltFreePct,
            essentialsMaterialsTarget:
              raw.essentialsMaterialsTarget ?? DEFAULT_SETTINGS.essentialsMaterialsTarget,
            essentialsTransportFoodTarget:
              raw.essentialsTransportFoodTarget ??
              DEFAULT_SETTINGS.essentialsTransportFoodTarget,
            essentialsSalariesTarget:
              raw.essentialsSalariesTarget ?? DEFAULT_SETTINGS.essentialsSalariesTarget,
            essentialsSchoolFeesTarget:
              raw.essentialsSchoolFeesTarget ?? DEFAULT_SETTINGS.essentialsSchoolFeesTarget,
          });
        }
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/settings/default`)
    );

    const unsubStatements = onSnapshot(
      statementsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MonthlyStatement);
        list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        setStatements(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/statements`)
    );

    const unsubCycles = onSnapshot(
      cyclesQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BudgetCycle);
        setCycles(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/cycles`)
    );

    const unsubTx = onSnapshot(
      txQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<LedgerTransaction, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/transactions`)
    );

    const unsubBackups = onSnapshot(
      backupsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<CloudBackup, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() || 0;
          const tB = b.createdAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setBackups(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/backups`)
    );

    return () => {
      unsubSettings();
      unsubStatements();
      unsubCycles();
      unsubTx();
      unsubBackups();
    };
  }, [authReady, user, parentReady]);

  // Remove the initial 100k sample income entry created before this cleanup cutoff
  useEffect(() => {
    if (!authReady || !user || !parentReady || dataLoading) return;
    const cutoffMs = Date.parse('2026-11-16T01:58:00Z');
    const uid = user.uid;

    for (const tx of transactions) {
      if (cleanedSampleTxIdsRef.current.has(tx.id)) continue;
      const createdMs = tx.createdAt?.toMillis?.();
      if (typeof createdMs !== 'number' || createdMs >= cutoffMs) continue;
      if (
        tx.type === 'income' &&
        (Math.round(tx.amount) === 100000 || Math.round(tx.baseAmount) === 100000)
      ) {
        cleanedSampleTxIdsRef.current.add(tx.id);
        const path = `users/${uid}/transactions/${tx.id}`;
        deleteDoc(doc(db, 'users', uid, 'transactions', tx.id)).catch((err) => {
          handleFirestoreError(err, OperationType.DELETE, path);
        });
      }
    }
  }, [authReady, user, parentReady, dataLoading, transactions]);

  // Backfill unsealed historical statements that have a subtotal but 0 in Tier 1 buckets
  useEffect(() => {
    if (!authReady || !user || !parentReady || dataLoading) return;
    const uid = user.uid;

    for (const st of statements) {
      if (backfilledStatementKeysRef.current.has(st.monthKey)) continue;
      const needsAutoFill =
        !st.isClosed &&
        st.totalRevenue > 0 &&
        st.businessMaterials === 0 &&
        st.transportation === 0 &&
        st.workerSalaries === 0 &&
        st.sistersSchoolFees === 0 &&
        st.pendingLoansDebts === 0;

      if (!needsAutoFill) continue;

      backfilledStatementKeysRef.current.add(st.monthKey);
      const auto = computeStatementAutoAllocations({
        subtotal: st.totalRevenue,
        statementCurrency: st.currency,
        settings,
        fx: fxRates,
      });
      const path = `users/${uid}/statements/${st.monthKey}`;
      updateDoc(doc(db, 'users', uid, 'statements', st.monthKey), {
        taxSegregated: auto.taxSegregated,
        businessMaterials: auto.businessMaterials,
        transportation: auto.transportation,
        workerSalaries: auto.workerSalaries,
        sistersSchoolFees: auto.sistersSchoolFees,
        pendingLoansDebts: auto.pendingLoansDebts,
        savingsAllocated: auto.savingsAllocated,
        growthAllocated: auto.growthAllocated,
        discretionarySpent: auto.discretionarySpent,
        closingLiquidity: auto.closingLiquidity,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
      });
    }
  }, [authReady, user, parentReady, dataLoading, statements, settings, fxRates]);

  const activeCycle = useMemo(
    () => cycles.find((c) => c.cycleMonth === activeCycleMonth),
    [cycles, activeCycleMonth]
  );

  const calculation = useMemo(
    () =>
      calculateCycleAllocation({
        cycleMonth: activeCycleMonth,
        settings,
        statements,
        cycle: activeCycle,
        transactions,
        fx: fxRates,
        basisMode: budgetBasisMode,
        selectedStatementMonth,
      }),
    [
      activeCycleMonth,
      settings,
      statements,
      activeCycle,
      transactions,
      fxRates,
      budgetBasisMode,
      selectedStatementMonth,
    ]
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const openDebtCheck = useCallback((reason: 'cycle_start' | 'new_income' | 'manual') => {
    setDebtPromptReason(reason);
    setShowDebtCheckModal(true);
  }, []);

  const createCloudBackup = useCallback(
    async (source: 'auto' | 'manual') => {
      if (!user) return;
      const uid = user.uid;
      const backupId = sanitizeId('bkp');
      const totalTaxReserved =
        statements.reduce((s, st) => s + st.taxSegregated, 0) + calculation.taxReserveRequired;
      const payloadSummary = JSON.stringify({
        month: activeCycleMonth,
        statements: statements.length,
        tx: transactions.length,
        tax: Math.round(totalTaxReserved),
        liq: Math.round(calculation.netCashOnHand),
      });

      const path = `users/${uid}/backups/${backupId}`;
      try {
        await setDoc(doc(db, 'users', uid, 'backups', backupId), {
          ownerId: uid,
          snapshotMonth: activeCycleMonth,
          baseCurrency: settings.baseCurrency,
          statementCount: statements.length,
          transactionCount: transactions.length,
          totalTaxReserved: Number(totalTaxReserved.toFixed(2)),
          totalLiquidity: Number(calculation.netCashOnHand.toFixed(2)),
          checksum: computeChecksum(payloadSummary),
          triggerSource: source,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, statements, transactions.length, calculation, activeCycleMonth, settings.baseCurrency]
  );

  const confirmDebtCheck = useCallback(
    async (amount: number, note: string) => {
      if (!user) return;
      const uid = user.uid;
      const cleanAmount = Math.max(0, Number(amount) || 0);
      const cleanNote = note.trim().slice(0, 240);
      const baselineMonth = getTMinusTwoMonth(activeCycleMonth);
      const cycleRef = doc(db, 'users', uid, 'cycles', activeCycleMonth);
      const path = `users/${uid}/cycles/${activeCycleMonth}`;

      try {
        if (activeCycle) {
          await updateDoc(cycleRef, {
            baselineMonth,
            currency: settings.baseCurrency,
            debtCheckCompleted: true,
            confirmedDebtAmount: cleanAmount,
            debtNote: cleanNote,
            lastDebtCheckAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(cycleRef, {
            ownerId: uid,
            cycleMonth: activeCycleMonth,
            baselineMonth,
            currency: settings.baseCurrency,
            debtCheckCompleted: true,
            confirmedDebtAmount: cleanAmount,
            debtNote: cleanNote,
            lastDebtCheckAt: new Date().toISOString(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        setShowDebtCheckModal(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user, activeCycleMonth, activeCycle, settings.baseCurrency]
  );

  const addTransaction = useCallback(
    async (input: NewTransactionInput) => {
      if (!user) return;
      const uid = user.uid;
      const txId = sanitizeId('tx');
      const fxRateToBase = getConversionRate(input.currency, settings.baseCurrency, fxRates);
      const baseAmount = Number((input.amount * fxRateToBase).toFixed(2));
      const cleanDesc = input.description.trim().slice(0, 240) || 'Treasury Entry';
      const path = `users/${uid}/transactions/${txId}`;

      try {
        await setDoc(doc(db, 'users', uid, 'transactions', txId), {
          ownerId: uid,
          cycleMonth: input.cycleMonth,
          type: input.type,
          category: input.category,
          amount: Number(input.amount.toFixed(2)),
          currency: input.currency,
          fxRateToBase,
          baseAmount,
          description: cleanDesc,
          occurredAt: input.occurredAt.slice(0, 32),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Interactive Debt Check requirement: prompt upon new income entry
        if (input.type === 'income') {
          setDebtPromptReason('new_income');
          setShowDebtCheckModal(true);
        }

        // Automated Cloud Backup (throttled every 60s)
        if (settings.autoBackupEnabled && Date.now() - lastAutoBackupRef.current > 60_000) {
          lastAutoBackupRef.current = Date.now();
          await createCloudBackup('auto');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, settings.baseCurrency, settings.autoBackupEnabled, fxRates, createCloudBackup]
  );

  const deleteTransaction = useCallback(
    async (txId: string) => {
      if (!user) return;
      const uid = user.uid;
      const path = `users/${uid}/transactions/${txId}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'transactions', txId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const saveStatement = useCallback(
    async (input: NewStatementInput) => {
      if (!user) return;
      const uid = user.uid;
      const existingStatement = statements.find((s) => s.monthKey === input.monthKey);
      const stmtRef = doc(db, 'users', uid, 'statements', input.monthKey);
      const path = `users/${uid}/statements/${input.monthKey}`;

      try {
        if (existingStatement && !existingStatement.isClosed) {
          await updateDoc(stmtRef, {
            currency: input.currency,
            totalRevenue: Number(input.totalRevenue),
            taxSegregated: Number(input.taxSegregated),
            businessMaterials: Number(input.businessMaterials),
            transportation: Number(input.transportation),
            workerSalaries: Number(input.workerSalaries),
            sistersSchoolFees: Number(input.sistersSchoolFees),
            pendingLoansDebts: Number(input.pendingLoansDebts),
            savingsAllocated: Number(input.savingsAllocated),
            growthAllocated: Number(input.growthAllocated),
            discretionarySpent: Number(input.discretionarySpent),
            closingLiquidity: Number(input.closingLiquidity),
            isClosed: input.isClosed,
            updatedAt: serverTimestamp(),
          });
        } else {
          if (existingStatement?.isClosed) {
            await deleteDoc(stmtRef);
          }
          await setDoc(stmtRef, {
            ownerId: uid,
            monthKey: input.monthKey,
            currency: input.currency,
            totalRevenue: Number(input.totalRevenue),
            taxSegregated: Number(input.taxSegregated),
            businessMaterials: Number(input.businessMaterials),
            transportation: Number(input.transportation),
            workerSalaries: Number(input.workerSalaries),
            sistersSchoolFees: Number(input.sistersSchoolFees),
            pendingLoansDebts: Number(input.pendingLoansDebts),
            savingsAllocated: Number(input.savingsAllocated),
            growthAllocated: Number(input.growthAllocated),
            discretionarySpent: Number(input.discretionarySpent),
            closingLiquidity: Number(input.closingLiquidity),
            isClosed: input.isClosed,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user, statements]
  );

  const sealStatement = useCallback(
    async (monthKey: string) => {
      if (!user) return;
      const uid = user.uid;
      const stmtRef = doc(db, 'users', uid, 'statements', monthKey);
      const path = `users/${uid}/statements/${monthKey}`;
      try {
        await updateDoc(stmtRef, {
          isClosed: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteStatement = useCallback(
    async (monthKey: string) => {
      if (!user) return;
      const uid = user.uid;
      const path = `users/${uid}/statements/${monthKey}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'statements', monthKey));
        setSelectedStatementMonthState((prev) => (prev === monthKey ? null : prev));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const updateSettings = useCallback(
    async (patch: Partial<WorkspaceSettings>) => {
      if (!user) return;
      const uid = user.uid;
      const settingsRef = doc(db, 'users', uid, 'settings', 'default');
      const path = `users/${uid}/settings/default`;
      const merged = { ...settings, ...patch };
      try {
        await updateDoc(settingsRef, {
          companyName: merged.companyName.trim().slice(0, 100) || 'Jescamp Gifts & Deco',
          baseCurrency: merged.baseCurrency,
          taxReserveRate: Math.min(0.6, Math.max(0, Number(merged.taxReserveRate))),
          essentialsPct: Math.min(1, Math.max(0, Number(merged.essentialsPct ?? 0.6))),
          debtPct: Math.min(1, Math.max(0, Number(merged.debtPct ?? 0.2))),
          saveInvestPct: Math.min(1, Math.max(0, Number(merged.saveInvestPct ?? 0.15))),
          guiltFreePct: Math.min(1, Math.max(0, Number(merged.guiltFreePct ?? 0.05))),
          essentialsMaterialsTarget: Math.max(
            0,
            Number(merged.essentialsMaterialsTarget ?? DEFAULT_SETTINGS.essentialsMaterialsTarget)
          ),
          essentialsTransportFoodTarget: Math.max(
            0,
            Number(
              merged.essentialsTransportFoodTarget ??
                DEFAULT_SETTINGS.essentialsTransportFoodTarget
            )
          ),
          essentialsSalariesTarget: Math.max(
            0,
            Number(merged.essentialsSalariesTarget ?? DEFAULT_SETTINGS.essentialsSalariesTarget)
          ),
          essentialsSchoolFeesTarget: Math.max(
            0,
            Number(
              merged.essentialsSchoolFeesTarget ?? DEFAULT_SETTINGS.essentialsSchoolFeesTarget
            )
          ),
          savingsWeight: Math.min(1, Math.max(0, Number(merged.savingsWeight))),
          growthWeight: Math.min(1, Math.max(0, Number(merged.growthWeight))),
          discretionaryWeight: Math.min(1, Math.max(0, Number(merged.discretionaryWeight))),
          lowLiquidityThresholdPct: Math.min(
            100,
            Math.max(0, Number(merged.lowLiquidityThresholdPct))
          ),
          savingsMilestoneTarget: Math.max(0, Number(merged.savingsMilestoneTarget)),
          autoBackupEnabled: Boolean(merged.autoBackupEnabled),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, settings]
  );

  const populateSampleBaseline = useCallback(async () => {
    if (!user) return;
    const uid = user.uid;
    const tMinus3 = getOffsetMonthKey(activeCycleMonth, -3);
    const tMinus2 = getTMinusTwoMonth(activeCycleMonth);
    const tMinus1 = getOffsetMonthKey(activeCycleMonth, -1);

    const batch = writeBatch(db);

    const sampleStatements: NewStatementInput[] = [
      {
        monthKey: tMinus3,
        currency: 'KES',
        totalRevenue: 360000,
        taxSegregated: 57600,
        businessMaterials: 150000,
        transportation: 20000,
        workerSalaries: 40000,
        sistersSchoolFees: 20000,
        pendingLoansDebts: 25000,
        savingsAllocated: 40000,
        growthAllocated: 15000,
        discretionarySpent: 18000,
        closingLiquidity: 95000,
        isClosed: true,
      },
      {
        monthKey: tMinus2,
        currency: 'KES',
        totalRevenue: 410000,
        taxSegregated: 65600,
        businessMaterials: 150000,
        transportation: 20000,
        workerSalaries: 40000,
        sistersSchoolFees: 20000,
        pendingLoansDebts: 20000,
        savingsAllocated: 52000,
        growthAllocated: 25500,
        discretionarySpent: 20500,
        closingLiquidity: 132000,
        isClosed: false,
      },
      {
        monthKey: tMinus1,
        currency: 'KES',
        totalRevenue: 350000,
        taxSegregated: 56000,
        businessMaterials: 150000,
        transportation: 20000,
        workerSalaries: 40000,
        sistersSchoolFees: 20000,
        pendingLoansDebts: 15000,
        savingsAllocated: 22500,
        growthAllocated: 10000,
        discretionarySpent: 17500,
        closingLiquidity: 148000,
        isClosed: false,
      },
    ];

    for (const stmt of sampleStatements) {
      const ref = doc(db, 'users', uid, 'statements', stmt.monthKey);
      batch.set(ref, {
        ownerId: uid,
        ...stmt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const cycleRef = doc(db, 'users', uid, 'cycles', activeCycleMonth);
    batch.set(cycleRef, {
      ownerId: uid,
      cycleMonth: activeCycleMonth,
      baselineMonth: tMinus2,
      currency: 'KES',
      debtCheckCompleted: false,
      confirmedDebtAmount: 20000,
      debtNote: 'Carried from T-2 statement — awaiting monthly confirmation',
      lastDebtCheckAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const sampleTxs: Array<Omit<NewTransactionInput, 'cycleMonth'>> = [
      {
        type: 'income',
        category: 'client_revenue',
        amount: 245000,
        currency: 'KES',
        description: 'Nairobi Wholesale Retainer Settlement',
        occurredAt: `${activeCycleMonth}-03`,
      },
      {
        type: 'income',
        category: 'client_revenue',
        amount: 1150,
        currency: 'USD',
        description: 'Cross-Border SaaS Export Invoice #408',
        occurredAt: `${activeCycleMonth}-08`,
      },
      {
        type: 'expense',
        category: 'business_materials',
        amount: 112000,
        currency: 'KES',
        description: 'Packaging & Raw Stock Restock Batch',
        occurredAt: `${activeCycleMonth}-05`,
      },
      {
        type: 'expense',
        category: 'transportation',
        amount: 24500,
        currency: 'KES',
        description: 'Fleet Fuel & Regional Courier Dispatch',
        occurredAt: `${activeCycleMonth}-09`,
      },
      {
        type: 'expense',
        category: 'worker_salaries',
        amount: 85000,
        currency: 'KES',
        description: 'Mid-Month Operations Payroll Tranche',
        occurredAt: `${activeCycleMonth}-11`,
      },
    ];

    for (const tx of sampleTxs) {
      const txId = sanitizeId('tx');
      const rate = getConversionRate(tx.currency, settings.baseCurrency, fxRates);
      const txRef = doc(db, 'users', uid, 'transactions', txId);
      batch.set(txRef, {
        ownerId: uid,
        cycleMonth: activeCycleMonth,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        currency: tx.currency,
        fxRateToBase: rate,
        baseAmount: Number((tx.amount * rate).toFixed(2)),
        description: tx.description,
        occurredAt: tx.occurredAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      await createCloudBackup('manual');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/batch_seed`);
    }
  }, [user, activeCycleMonth, settings.baseCurrency, fxRates, createCloudBackup]);

  const value: FinanceContextValue = {
    user,
    authReady,
    dataLoading,
    connectionError,
    activeCycleMonth,
    setActiveCycleMonth,
    settings,
    statements,
    cycles,
    transactions,
    backups,
    activeCycle,
    budgetBasisMode,
    setBudgetBasisMode,
    selectedStatementMonth,
    setSelectedStatementMonth,
    calculation,
    fxRates,
    refreshFxRates,
    signInWithGoogle,
    signOut,
    showDebtCheckModal,
    setShowDebtCheckModal,
    debtPromptReason,
    openDebtCheck,
    confirmDebtCheck,
    addTransaction,
    deleteTransaction,
    saveStatement,
    sealStatement,
    deleteStatement,
    updateSettings,
    createCloudBackup,
    populateSampleBaseline,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance must be used within FinanceProvider');
  }
  return ctx;
}
