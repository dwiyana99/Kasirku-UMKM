import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IdleTimeoutGuard } from './components/IdleTimeoutGuard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AppProvider, useApp } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { AppShell } from './components/AppShell';

// Route-level code splitting for faster initial page load without changing any workflow
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const PosPage = lazy(() => import('./pages/PosPage').then((m) => ({ default: m.PosPage })));
const KitchenPage = lazy(() => import('./pages/KitchenPage').then((m) => ({ default: m.KitchenPage })));
const QrOrderPage = lazy(() => import('./pages/QrOrderPage').then((m) => ({ default: m.QrOrderPage })));
const AccountingPage = lazy(() => import('./pages/AccountingPage').then((m) => ({ default: m.AccountingPage })));
const TaxPage = lazy(() => import('./pages/TaxPage').then((m) => ({ default: m.TaxPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const MasterConsolePage = lazy(() => import('./pages/MasterConsolePage').then((m) => ({ default: m.MasterConsolePage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const CatalogInventoryPage = lazy(() => import('./pages/CatalogInventoryPage').then((m) => ({ default: m.CatalogInventoryPage })));
const RestockMonitorPage = lazy(() => import('./pages/RestockMonitorPage').then((m) => ({ default: m.RestockMonitorPage })));
const SalesReturnPage = lazy(() => import('./pages/SalesReturnPage').then((m) => ({ default: m.SalesReturnPage })));
const DigitalContractsPage = lazy(() => import('./pages/DigitalContractsPage').then((m) => ({ default: m.DigitalContractsPage })));
const TablesQrPage = lazy(() => import('./pages/TablesQrPage').then((m) => ({ default: m.TablesQrPage })));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const StaffManagementPage = lazy(() => import('./pages/StaffManagementPage').then((m) => ({ default: m.StaffManagementPage })));
const KostManagementPage = lazy(() => import('./pages/KostManagementPage').then((m) => ({ default: m.KostManagementPage })));
const AgroManagementPage = lazy(() => import('./pages/AgroManagementPage').then((m) => ({ default: m.AgroManagementPage })));
const MultiBranchInventoryPage = lazy(() => import('./pages/MultiBranchInventoryPage').then((m) => ({ default: m.MultiBranchInventoryPage })));
const PromoCrmPage = lazy(() => import('./pages/PromoCrmPage').then((m) => ({ default: m.PromoCrmPage })));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage })));
const SubscriptionPlansPage = lazy(() => import('./pages/SubscriptionPlansPage').then((m) => ({ default: m.SubscriptionPlansPage })));
const DemoHubPage = lazy(() => import('./pages/DemoHubPage').then((m) => ({ default: m.DemoHubPage })));
const CustomerDisplayPage = lazy(() => import('./pages/CustomerDisplayPage').then((m) => ({ default: m.CustomerDisplayPage })));
const PaymentSettingsPage = lazy(() => import('./pages/PaymentSettingsPage').then((m) => ({ default: m.PaymentSettingsPage })));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage').then((m) => ({ default: m.TransactionHistoryPage })));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const VerticalOperationsPage = lazy(() => import('./pages/VerticalOperationsPage').then((m) => ({ default: m.VerticalOperationsPage })));
const PublicTenantLandingPage = lazy(() => import('./pages/PublicTenantLandingPage').then((m) => ({ default: m.PublicTenantLandingPage })));
const TenantLandingEditorPage = lazy(() => import('./pages/TenantLandingEditorPage').then((m) => ({ default: m.TenantLandingEditorPage })));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
      <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" strokeWidth={1.75} />
        <span>Memuat halaman...</span>
      </div>
    </div>
  );
}

function MagicDemoAccessView({ magicToken }: { magicToken: string }) {
  const { enterMagicDemo, navigate } = useApp();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    enterMagicDemo(magicToken).then((res) => {
      if (!active) return;
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(res.error || 'Tautan demo tidak valid atau sudah kedaluwarsa.');
      }
    });
    return () => {
      active = false;
    };
  }, [magicToken, enterMagicDemo]);

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-4">
        {status === 'loading' ? (
          <>
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <h1 className="text-lg font-bold text-stone-900">Membuka Workspace Demo Khusus...</h1>
            <p className="text-xs text-stone-500">
              Memverifikasi tautan demo terisolasi dan menyiapkan data usaha Anda.
            </p>
          </>
        ) : (
          <>
            <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
            <h1 className="text-lg font-bold text-stone-900">Tautan Demo Tidak Dapat Dibuka</h1>
            <p className="text-xs text-stone-600">{errorMsg}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Kembali ke Beranda
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AppRouter() {
  const { route } = useApp();

  // Mode 1: Real-time Customer Facing Display: /customer-display/:branchId
  const customerDisplayMatch = route.match(/^\/customer-display\/([^/]+)\/?$/);
  if (customerDisplayMatch) {
    return <CustomerDisplayPage branchId={decodeURIComponent(customerDisplayMatch[1])} />;
  }

  // Mode 2: Customer QR Table Order Status Callback
  const qrStatusFullMatch = route.match(/^\/order\/([^/]+)\/([^/]+)\/status\/([^/]+)\/?$/);
  if (qrStatusFullMatch) {
    return (
      <QrOrderPage
        tenantSlug={decodeURIComponent(qrStatusFullMatch[1])}
        qrToken={decodeURIComponent(qrStatusFullMatch[2])}
        initialStatusOrderId={decodeURIComponent(qrStatusFullMatch[3])}
      />
    );
  }
  const qrStatusShortMatch = route.match(/^\/order\/([^/]+)\/status\/([^/]+)\/?$/);
  if (qrStatusShortMatch) {
    return (
      <QrOrderPage
        tenantSlug={decodeURIComponent(qrStatusShortMatch[1])}
        qrToken={decodeURIComponent(qrStatusShortMatch[1])}
        initialStatusOrderId={decodeURIComponent(qrStatusShortMatch[2])}
      />
    );
  }

  // Dynamic Customer QR Table Self-Order Route: /order/:tenantSlug/:qrToken
  const qrMatch = route.match(/^\/order\/([^/]+)\/([^/]+)\/?$/);
  if (qrMatch) {
    return (
      <QrOrderPage
        tenantSlug={decodeURIComponent(qrMatch[1])}
        qrToken={decodeURIComponent(qrMatch[2])}
      />
    );
  }

  // Dynamic Public UMKM Landing Page Route: /toko/:slug (Subpath now, subdomain-ready)
  const tokoMatch = route.match(/^\/toko\/([^/]+)\/?$/);
  if (tokoMatch) {
    return <PublicTenantLandingPage slug={decodeURIComponent(tokoMatch[1])} />;
  }

  // Dynamic Magic Demo Access Route: /demo-access/:token
  const demoAccessMatch = route.match(/^\/demo-access\/([^/]+)\/?$/);
  if (demoAccessMatch) {
    return <MagicDemoAccessView magicToken={decodeURIComponent(demoAccessMatch[1])} />;
  }

  switch (route) {
    case '/':
      return <LandingPage />;
    case '/demo':
      return <DemoHubPage />;
    case '/login':
      return <LoginPage initialTab="CUSTOMER" initialMode="LOGIN" />;
    case '/register':
      return <LoginPage initialTab="CUSTOMER" initialMode="REGISTER" />;
    case '/master/login':
      return <LoginPage initialTab="MASTER" initialMode="LOGIN" />;
    case '/master':
    case '/master-admin':
      return <MasterConsolePage />;
    case '/onboarding':
      return <OnboardingPage />;
    case '/dashboard':
      return <DashboardPage />;
    case '/notifications':
      return <NotificationsPage />;
    case '/pos':
      return <PosPage />;
    case '/transactions':
      return <TransactionHistoryPage />;
    case '/returns':
      return <SalesReturnPage />;
    case '/contracts':
      return <DigitalContractsPage />;
    case '/catalog':
    case '/catalog/products':
      return <CatalogInventoryPage activeSection="PRODUCTS" />;
    case '/catalog/taxonomy':
      return <CatalogInventoryPage activeSection="CATEGORIES" />;
    case '/catalog/raw-materials':
      return <CatalogInventoryPage activeSection="STOCK_RAW" />;
    case '/catalog/recipes':
      return <CatalogInventoryPage activeSection="BOM_RECIPES" />;
    case '/inventory/restock-monitor':
      return <RestockMonitorPage />;
    case '/purchasing/restock':
      return <CatalogInventoryPage activeSection="RESTOCK_FAST" />;
    case '/tables':
      return <TablesQrPage />;
    case '/kitchen':
      return <KitchenPage />;
    case '/kost':
      return <KostManagementPage />;
    case '/agro':
      return <AgroManagementPage />;
    case '/operations':
      return (
        <AppShell
          title="Operasional Usaha"
          subtitle="Kelola antrean, kontrak, jadwal booking, produksi & kirim WhatsApp langsung"
        >
          <VerticalOperationsPage />
        </AppShell>
      );
    case '/branches':
    case '/branches/matrix':
      return <MultiBranchInventoryPage activeSection="MATRIX" />;
    case '/branches/transfers':
      return <MultiBranchInventoryPage activeSection="TRANSFERS" />;
    case '/purchasing':
    case '/procurement':
    case '/purchasing/po':
      return <MultiBranchInventoryPage activeSection="PURCHASING" />;
    case '/opname':
      return <MultiBranchInventoryPage activeSection="OPNAME" />;
    case '/promo-crm':
      return <PromoCrmPage initialTab="PROMOS" />;
    case '/crm':
      return <PromoCrmPage initialTab="CRM" />;
    case '/expenses':
      return <ExpensesPage />;
    case '/accounting':
      return <AccountingPage />;
    case '/tax':
      return <TaxPage />;
    case '/ai-assistant':
      return <AiAssistantPage />;
    case '/billing':
    case '/subscription':
    case '/settings/billing':
    case '/settings/plans':
      return <SubscriptionPlansPage />;
    case '/staff':
      return <StaffManagementPage />;
    case '/activity-log':
      return <ActivityLogPage />;
    case '/settings/landing-page':
      return <TenantLandingEditorPage />;
    case '/settings/payments':
      return (
        <AppShell
          title="Pembayaran & QRIS Dinamis"
          subtitle="Terima QRIS, E-Wallet, Transfer Manual, Layar Pelanggan, dan pencairan dana otomatis H+1 ke rekening usaha"
        >
          <PaymentSettingsPage />
        </AppShell>
      );
    case '/settings':
    case '/settings/custom-fields':
      return <SettingsPage />;
    default:
      return <LandingPage />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <AppRouter />
        </Suspense>
        <IdleTimeoutGuard />
        <OfflineIndicator />
      </AppProvider>
    </ErrorBoundary>
  );
}
