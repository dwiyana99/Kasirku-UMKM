import React, { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider, useApp } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { KitchenPage } from './pages/KitchenPage';
import { QrOrderPage } from './pages/QrOrderPage';
import { AccountingPage } from './pages/AccountingPage';
import { TaxPage } from './pages/TaxPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { MasterConsolePage } from './pages/MasterConsolePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CatalogInventoryPage } from './pages/CatalogInventoryPage';
import { TablesQrPage } from './pages/TablesQrPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { KostManagementPage } from './pages/KostManagementPage';
import { AgroManagementPage } from './pages/AgroManagementPage';
import { MultiBranchInventoryPage } from './pages/MultiBranchInventoryPage';
import { PromoCrmPage } from './pages/PromoCrmPage';
import { AiAssistantPage } from './pages/AiAssistantPage';
import { SubscriptionPlansPage } from './pages/SubscriptionPlansPage';
import { DemoHubPage } from './pages/DemoHubPage';
import { CustomerDisplayPage } from './pages/CustomerDisplayPage';
import { PaymentSettingsPage } from './pages/PaymentSettingsPage';
import { TransactionHistoryPage } from './pages/TransactionHistoryPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { VerticalOperationsPage } from './pages/VerticalOperationsPage';
import { AppShell } from './components/AppShell';

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        {status === 'loading' ? (
          <>
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Membuka Workspace Demo Khusus...</h1>
            <p className="text-xs text-slate-500">
              Memverifikasi Magic Link terisolasi dan menyiapkan data demo Anda.
            </p>
          </>
        ) : (
          <>
            <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Tautan Demo Tidak Dapat Dibuka</h1>
            <p className="text-xs text-slate-600">{errorMsg}</p>
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

  // Mode 2: Customer QR Table Order Status Callback:
  // /order/:tenantSlug/:qrToken/status/:orderId OR /order/:qrToken/status/:orderId
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
      return <LoginPage initialTab="CUSTOMER" />;
    case '/master/login':
      return <LoginPage initialTab="MASTER" />;
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
    case '/catalog':
    case '/catalog/products':
      return <CatalogInventoryPage activeSection="PRODUCTS" />;
    case '/catalog/taxonomy':
      return <CatalogInventoryPage activeSection="CATEGORIES" />;
    case '/catalog/raw-materials':
      return <CatalogInventoryPage activeSection="STOCK_RAW" />;
    case '/catalog/recipes':
      return <CatalogInventoryPage activeSection="BOM_RECIPES" />;
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
    case '/settings/plans':
      return <SubscriptionPlansPage />;
    case '/staff':
      return <StaffManagementPage />;
    case '/activity-log':
      return <ActivityLogPage />;
    case '/settings/payments':
      return (
        <AppShell
          title="Pembayaran & QRIS Dinamis"
          subtitle="Integrasi Midtrans, Duitku, Tripay, Transfer Manual, Layar Pelanggan & Settlement H+1"
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
        <AppRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
