import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  BookOpen,
  FileCheck2,
  SlidersHorizontal,
  QrCode,
  LogOut,
  X,
  ArrowLeft,
  ChevronDown,
  ShieldCheck,
  Package,
  Receipt,
  Lock,
  UserCog,
  Users,
  BedDouble,
  Sprout,
  Truck,
  Sparkles,
  CreditCard,
  Wallet,
  History,
  Activity,
  Bell,
  ClipboardList,
  RotateCcw,
  FileSignature,
  Globe,
  Menu,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AccountModal } from './AccountModal';
import { AiAssistantDrawer } from './ai/AiAssistantDrawer';
import { Navbar } from './Navbar';
import { PWAInstallButton } from './PWAInstallButton';
import { getVerticalCapabilities } from '../lib/catalog/recipe-bom-utils';
import { evaluateStockAlerts } from '../lib/inventory/stock-monitoring';
import { computeDueReminders } from '../lib/analytics/owner-insights-engine';
import {
  buildSidebarNavGroups,
  type SidebarIconKey,
} from '../lib/navigation/sidebar-config';
import {
  buildMobileBottomNavItems,
  type QuickActionIconKey,
} from '../lib/navigation/quick-actions';
import {
  canAccessRouteWithStaffPermissions,
  getDefaultHomeRouteForSession,
} from '../lib/rbac/staff-rbac';
import { isCashierKioskFocusSession } from '../lib/messaging/whatsapp-policy';
import { VERTICAL_LABELS_MAP } from '../lib/verticals/vertical-registry';
import type { SubscriptionPlanCode } from '../types/domain';

const VERTICAL_LABELS = VERTICAL_LABELS_MAP;

const SIDEBAR_ICON_MAP: Record<
  SidebarIconKey,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  dashboard: LayoutDashboard,
  bell: Bell,
  pos: ShoppingBag,
  history: History,
  users: Users,
  kost: BedDouble,
  agro: Sprout,
  operations: ClipboardList,
  qr: QrCode,
  kitchen: ChefHat,
  catalog: Package,
  warehouse: Truck,
  expenses: Receipt,
  accounting: BookOpen,
  tax: FileCheck2,
  ai: Sparkles,
  payment: Wallet,
  billing: CreditCard,
  staff: Users,
  activity: Activity,
  settings: SlidersHorizontal,
  master: ShieldCheck,
  returns: RotateCcw,
  contracts: FileSignature,
  globe: Globe,
};

const MOBILE_BOTTOM_ICON_MAP: Record<
  QuickActionIconKey,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  dashboard: LayoutDashboard,
  pos: ShoppingBag,
  catalog: Package,
  accounting: BookOpen,
  kost: BedDouble,
  agro: Sprout,
  operations: ClipboardList,
  history: History,
  contracts: FileSignature,
};

export function AppShell({
  title,
  subtitle,
  primaryAction,
  children,
}: {
  title: string;
  subtitle?: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const {
    route,
    navigate,
    visibleWorkspaces,
    activeWorkspace,
    switchTenant,
    session,
    exitImpersonation,
    logoutSession,
    hasAddOn,
    switchHybridPlan,
    activateAddOn,
    deactivateAddOn,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  const vertical = activeWorkspace.tenant.vertical;
  const verticalCaps = useMemo(() => getVerticalCapabilities(vertical), [vertical]);
  const isMaster = session.role === 'MASTER_ADMIN';
  const isDemoWorkspace = activeWorkspace.tenant.accountScope === 'DEMO';
  const currentPlan: SubscriptionPlanCode =
    activeWorkspace.tenant.subscriptionPlan ?? 'BASIC';
  const hasAiActive = hasAddOn('ADDON_AI_ASSISTANT');

  const notifBadgeCount = useMemo(() => {
    const stockCount = evaluateStockAlerts(activeWorkspace.products).counts.total;
    const dueCount = computeDueReminders(activeWorkspace).length;
    return stockCount + dueCount;
  }, [activeWorkspace]);

  // Clean, vertical-adaptive & plan-aware sidebar navigation built via pure helper
  const navGroups = useMemo(
    () =>
      buildSidebarNavGroups({
        vertical,
        plan: currentPlan,
        hasAddOn,
        session,
        notifBadgeCount,
      }),
    [vertical, currentPlan, hasAddOn, session, notifBadgeCount]
  );

  const mobileBottomItems = useMemo(
    () =>
      buildMobileBottomNavItems({
        vertical,
        plan: currentPlan,
        hasAddOn,
        session,
      }),
    [vertical, currentPlan, hasAddOn, session]
  );

  const mobileBottomColsClass =
    mobileBottomItems.length + 1 === 2
      ? 'grid-cols-2'
      : mobileBottomItems.length + 1 === 3
        ? 'grid-cols-3'
        : mobileBottomItems.length + 1 === 4
          ? 'grid-cols-4'
          : 'grid-cols-5';

  // Strict Auth Guard: Guests cannot enter any workspace without signing in or picking demo
  if (session.role === 'GUEST') {
    return (
      <div
        data-testid="auth-required-gate"
        className="min-h-screen bg-[#FAFAF9] text-stone-900 flex items-center justify-center p-6"
      >
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-xl p-8 text-center space-y-5">
          <div className="w-12 h-12 mx-auto rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Lock className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-stone-900">
              Silakan Login untuk Membuka Workspace
            </h1>
            <p className="text-sm text-stone-500 leading-relaxed">
              Demi privasi dan isolasi data setiap usaha, akses workspace UMKM maupun akun demo
              hanya tersedia setelah Anda masuk ke akun Anda.
            </p>
          </div>
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Masuk Akun Terdaftar &amp; Pelanggan
            </button>
            <button
              type="button"
              onClick={() => navigate('/demo')}
              className="w-full py-2.5 px-4 text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              Coba Demo Gratis (22 Bidang UMKM)
            </button>
            <button
              type="button"
              onClick={() => navigate('/master/login')}
              className="w-full py-2.5 px-4 text-sm font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              Masuk Portal Master Admin
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2 px-4 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canSwitchMultipleTenants = visibleWorkspaces.length > 1;
  const firstTable =
    verticalCaps.supportsQrTablesAndKitchen &&
    hasAddOn('ADDON_RESTO_QR_KDS') &&
    canAccessRouteWithStaffPermissions('/tables', session)
      ? activeWorkspace.tables[0]
      : null;
  const routeAllowedForStaff = canAccessRouteWithStaffPermissions(route, session);
  const isKioskFocus = isCashierKioskFocusSession(session, route);

  const handleLogout = async () => {
    const dest = isMaster ? '/master/login' : '/login';
    await logoutSession();
    navigate(dest);
  };

  const isSubRouteActive = (subPath: string): boolean => {
    if (route === subPath) return true;
    if (subPath === '/catalog/products' && route === '/catalog') return true;
    if (subPath === '/purchasing/po' && (route === '/purchasing' || route === '/procurement')) {
      return true;
    }
    if (subPath === '/branches/matrix' && route === '/branches') return true;
    return false;
  };

  const renderSidebarNav = (onSelect?: () => void) => (
    <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto" aria-label="Navigasi Workspace">
      {navGroups.map((group) => (
        <div key={group.id} data-testid={`sidebar-group-${group.id}`} className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            {group.title}
          </p>
          {group.items.map((item) => {
            const Icon = SIDEBAR_ICON_MAP[item.iconKey];

            if (item.children && item.children.length > 0) {
              const hasActiveChild = item.children.some((c) => isSubRouteActive(c.path));
              const isExpanded = openDropdowns[item.path] ?? hasActiveChild;

              return (
                <div key={item.path} className="space-y-0.5">
                  <button
                    type="button"
                    data-testid={`sidebar-dropdown-${item.path}`}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setOpenDropdowns((prev) => ({
                        ...prev,
                        [item.path]: !isExpanded,
                      }))
                    }
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                      hasActiveChild
                        ? 'text-emerald-900 bg-emerald-50/70 font-semibold'
                        : 'text-stone-700 hover:bg-stone-100/80 hover:text-stone-950'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          hasActiveChild ? 'text-emerald-700' : 'text-stone-400'
                        }`}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-stone-400 shrink-0 transition-transform duration-150 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      strokeWidth={1.75}
                    />
                  </button>

                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l border-stone-200 space-y-0.5 py-0.5">
                      {item.children.map((sub) => {
                        const subActive = isSubRouteActive(sub.path);
                        return (
                          <button
                            key={sub.path}
                            type="button"
                            data-testid={`sidebar-sub-${sub.path.replace(/\//g, '-').slice(1)}`}
                            onClick={() => {
                              navigate(sub.path);
                              onSelect?.();
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                              subActive
                                ? 'bg-emerald-50 text-emerald-900 font-semibold'
                                : 'text-stone-600 hover:bg-stone-100/80 hover:text-stone-950'
                            }`}
                          >
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active =
              route === item.path ||
              (item.path === '/master-admin' && route === '/master');
            return (
              <button
                key={item.path}
                type="button"
                data-testid={`sidebar-item-${item.path.replace(/\//g, '-').slice(1)}`}
                onClick={() => {
                  navigate(item.path);
                  onSelect?.();
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-stone-700 hover:bg-stone-100/80 hover:text-stone-950'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-emerald-700' : 'text-stone-400'
                    }`}
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                  <span
                    data-testid="sidebar-notif-badge"
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-mono font-bold tabular-nums rounded-md bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
                  >
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {firstTable && (
        <div className="pt-3 border-t border-stone-200 space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Simulasi Pelanggan
          </p>
          <button
            type="button"
            onClick={() => {
              navigate(`/order/${activeWorkspace.tenant.slug}/${firstTable.qrToken}`);
              onSelect?.();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-stone-700 hover:bg-stone-100/80 hover:text-stone-950 transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 text-stone-400 shrink-0" strokeWidth={1.75} />
            <span className="truncate">Menu QR Meja {firstTable.tableNumber}</span>
          </button>
        </div>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 flex overflow-x-hidden">
      {/* Desktop Sidebar (Hidden in Cashier Kiosk Focus Mode so cashier gets full POS screen) */}
      {!isKioskFocus && (
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-stone-200 z-30">
        <div className="h-16 px-6 flex items-center justify-between border-b border-stone-200">
          <button
            type="button"
            onClick={() => navigate(isMaster ? '/master-admin' : '/dashboard')}
            className="text-lg font-bold tracking-tight text-stone-900 hover:text-emerald-700 transition-colors whitespace-nowrap"
          >
            KasirAkun
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Kembali ke Beranda Publik"
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-md transition-colors"
            title="Beranda Publik"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Isolated Active Tenant Card */}
        <div className="p-4 border-b border-stone-100 relative">
          <p className="text-xs text-stone-500 mb-1.5">
            {isMaster ? 'Workspace Diperiksa' : 'Usaha Aktif Anda'}
          </p>
          {canSwitchMultipleTenants ? (
            <>
              <button
                type="button"
                onClick={() => setSwitcherOpen((o) => !o)}
                aria-expanded={switcherOpen}
                aria-label="Ganti Usaha UMKM"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate">
                    {activeWorkspace.tenant.name}
                  </p>
                  <p className="text-xs text-stone-500 truncate">
                    {VERTICAL_LABELS[activeWorkspace.tenant.vertical]} · {currentPlan}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" strokeWidth={1.75} />
              </button>

              {switcherOpen && (
                <div
                  role="menu"
                  className="absolute left-4 right-4 top-[88px] bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50 max-h-72 overflow-y-auto"
                >
                  {visibleWorkspaces.map((ws) => {
                    const isSelected = ws.tenant.id === activeWorkspace.tenant.id;
                    return (
                      <button
                        key={ws.tenant.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          switchTenant(ws.tenant.id);
                          setSwitcherOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left transition-colors flex items-start justify-between gap-2 ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-900'
                            : 'hover:bg-stone-50 text-stone-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ws.tenant.name}</p>
                          <p className="text-xs text-stone-500">
                            {VERTICAL_LABELS[ws.tenant.vertical]} · {ws.tenant.taxEntity}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="text-xs font-medium text-emerald-700 shrink-0 mt-0.5">
                            Aktif
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-sm font-semibold text-stone-900 truncate">
                {activeWorkspace.tenant.name}
              </p>
              <p className="text-xs text-stone-500 truncate">
                {VERTICAL_LABELS[activeWorkspace.tenant.vertical]} · Paket {currentPlan}
              </p>
            </div>
          )}
        </div>

        {/* 5-Group Vertical-Adaptive Navigation */}
        {renderSidebarNav()}

        {/* Account Management & Logout Footer */}
        <div className="p-4 border-t border-stone-200 space-y-2">
          <PWAInstallButton compact />
          {isMaster && (
            <button
              type="button"
              onClick={exitImpersonation}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
              <span>Kembali ke Konsol Master</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAccountModalOpen(true)}
            className="w-full flex items-center gap-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-left transition-colors"
          >
            <UserCog className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-900 truncate">{session.fullName}</p>
              <p className="text-[11px] text-stone-500 truncate">Kelola Akun · {session.email}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Keluar (Logout)</span>
          </button>
        </div>
      </aside>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 ${isKioskFocus ? '' : 'lg:pl-64'} flex flex-col min-w-0`}>
        {/* Cashier Kiosk Focus Top Bar (Compact distraction-free header for cashier-only staff on /pos) */}
        {isKioskFocus && (
          <div
            data-testid="cashier-kiosk-header"
            className="bg-white border-b border-stone-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                KA
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-900 truncate">
                  {activeWorkspace.tenant.name}
                </p>
                <p className="text-[11px] text-stone-500 truncate">
                  Mode Fokus Kasir · {session.fullName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {primaryAction}
              <button
                type="button"
                onClick={() => navigate('/transactions')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg whitespace-nowrap"
              >
                <History className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Riwayat</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg whitespace-nowrap"
              >
                <Menu className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Menu</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>
        )}
        {/* Demo Mode Top Simulator Banner (Compact dropdown on mobile, full quick-switch on md+) */}
        {isDemoWorkspace && (
          <div
            data-testid="demo-mode-plan-banner"
            className="bg-emerald-950 text-white px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-emerald-300 whitespace-nowrap">
                Mode Demo
              </span>
              <span className="text-stone-300 hidden lg:inline truncate">
                Simulasikan paket langganan secara langsung:
              </span>
            </div>

            {/* Mobile compact selector */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <select
                aria-label="Pilih Simulasi Paket"
                data-testid="demo-sim-plan-select-mobile"
                value={currentPlan}
                onChange={(e) => switchHybridPlan(e.target.value as SubscriptionPlanCode, [])}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-900 text-white border border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="LITE">LITE (49rb)</option>
                <option value="BASIC">BASIC (95rb)</option>
                <option value="PRO">PRO (175rb)</option>
                <option value="EXPERT">EXPERT (279rb)</option>
              </select>
              <button
                type="button"
                data-testid="demo-banner-subscribe-btn-mobile"
                onClick={() => {
                  const params = new URLSearchParams({
                    mode: 'real',
                    from: 'demo',
                    plan: currentPlan,
                    vertical: activeWorkspace.tenant.vertical,
                  });
                  const extras = (activeWorkspace.tenant.activeAddOns ?? []).filter(Boolean);
                  if (extras.length > 0) params.set('addons', extras.join(','));
                  navigate(`/onboarding?${params.toString()}`);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-stone-950 transition-colors whitespace-nowrap"
              >
                Langganan
              </button>
            </div>

            {/* Desktop / Tablet quick switch pills */}
            <div className="hidden md:flex flex-wrap items-center gap-1.5">
              {(['LITE', 'BASIC', 'PRO', 'EXPERT'] as SubscriptionPlanCode[]).map((planCode) => {
                const isSelected = currentPlan === planCode;
                const priceShort =
                  planCode === 'LITE'
                    ? '49rb'
                    : planCode === 'BASIC'
                      ? '95rb'
                      : planCode === 'PRO'
                        ? '175rb'
                        : '279rb';
                return (
                  <button
                    key={planCode}
                    type="button"
                    data-testid={`demo-sim-plan-${planCode}`}
                    onClick={() => switchHybridPlan(planCode, [])}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-emerald-500 text-stone-950'
                        : 'bg-white/10 text-stone-200 hover:bg-white/20'
                    }`}
                  >
                    {planCode} ({priceShort})
                  </button>
                );
              })}
              <button
                type="button"
                data-testid="demo-banner-subscribe-btn"
                onClick={() => {
                  const params = new URLSearchParams({
                    mode: 'real',
                    from: 'demo',
                    plan: currentPlan,
                    vertical: activeWorkspace.tenant.vertical,
                  });
                  const extras = (activeWorkspace.tenant.activeAddOns ?? []).filter(Boolean);
                  if (extras.length > 0) params.set('addons', extras.join(','));
                  navigate(`/onboarding?${params.toString()}`);
                }}
                className="ml-1 px-3 py-1 rounded-md text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-stone-950 transition-colors whitespace-nowrap"
              >
                Berlangganan Akun Asli →
              </button>
            </div>
          </div>
        )}

        {/* Unified Dashboard Navbar (Replaced by compact Kiosk Bar when cashier is in Focus Mode) */}
        {!isKioskFocus && (
          <Navbar
            title={title}
            subtitle={subtitle}
            primaryAction={primaryAction}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenAccountModal={() => setAccountModalOpen(true)}
            onOpenAiDrawer={hasAiActive ? () => setAiDrawerOpen(true) : undefined}
            onLogout={handleLogout}
          />
        )}

        <main
          className={`flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 w-full mx-auto ${
            isKioskFocus ? 'max-w-[1440px]' : 'max-w-[1320px]'
          }`}
        >
          {routeAllowedForStaff ? (
            children
          ) : (
            <div
              data-testid="staff-permission-denied"
              className="max-w-lg mx-auto my-12 bg-white border border-stone-200 rounded-xl p-8 text-center space-y-4"
            >
              <div className="w-12 h-12 mx-auto rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                <Lock className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-stone-900">
                  Akses Menu Dibatasi untuk Akun Pegawai
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  Akun Anda ({session.staffRoleTitle || 'Pegawai'}) belum diberikan wewenang untuk
                  membuka halaman ini. Hubungi Pemilik Usaha jika memerlukan akses tambahan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(getDefaultHomeRouteForSession(session))}
                className="inline-flex items-center justify-center px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Kembali ke Menu Utama Saya
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Consistent Mobile Bottom Navigation Bar (1-Tap Primary Actions: Ringkasan, Kasir, Stok, Laporan, Menu) */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Navigasi Utama Mobile"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white border-t border-stone-200 grid ${mobileBottomColsClass}`}
      >
        {mobileBottomItems.map((item) => {
          const Icon = MOBILE_BOTTOM_ICON_MAP[item.iconKey];
          const isActive =
            route === item.path ||
            (item.path === '/catalog/products' && route.startsWith('/catalog')) ||
            (item.path === '/accounting' && route.startsWith('/accounting'));
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`mobile-nav-${item.id}`}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                isActive
                  ? 'text-emerald-700 font-semibold'
                  : 'text-stone-500 hover:text-stone-900 font-medium'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive ? 'text-emerald-700' : 'text-stone-400'
                }`}
                strokeWidth={1.75}
              />
              <span className="truncate max-w-full">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          data-testid="mobile-nav-menu"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-tight text-stone-500 hover:text-stone-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <Menu className="w-5 h-5 text-stone-400 shrink-0" strokeWidth={1.75} />
          <span className="truncate">Menu</span>
        </button>
      </nav>

      {/* Mobile Drawer (Also available from Kiosk Focus Mode "Menu" button) */}
      {mobileMenuOpen && (
        <div className={`fixed inset-0 z-50 flex ${isKioskFocus ? '' : 'lg:hidden'}`}>
          <div
            className="fixed inset-0 bg-stone-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            data-testid="mobile-sidebar-drawer"
            className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-xl"
          >
            <div className="h-16 px-5 flex items-center justify-between border-b border-stone-200 shrink-0">
              <span className="text-lg font-bold tracking-tight text-stone-900">KasirAkun</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup Menu"
                className="p-2 text-stone-500 hover:text-stone-900"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            {/* Active Business Info / Switcher inside Mobile Left Sidebar */}
            <div className="px-4 py-3 border-b border-stone-100 bg-stone-50/70 shrink-0">
              <p className="text-[11px] text-stone-500 mb-1">
                {isMaster ? 'Workspace Diperiksa' : 'Usaha Aktif Anda'}
              </p>
              {canSwitchMultipleTenants ? (
                <select
                  aria-label="Ganti Usaha UMKM"
                  value={activeWorkspace.tenant.id}
                  onChange={(e) => {
                    switchTenant(e.target.value);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  {visibleWorkspaces.map((ws) => (
                    <option key={ws.tenant.id} value={ws.tenant.id}>
                      {ws.tenant.name} ({VERTICAL_LABELS[ws.tenant.vertical]})
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-stone-900 truncate">
                    {activeWorkspace.tenant.name}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate">
                    {VERTICAL_LABELS[activeWorkspace.tenant.vertical]} · Paket {currentPlan}
                  </p>
                </div>
              )}
            </div>
            {renderSidebarNav(() => setMobileMenuOpen(false))}
            <div className="p-4 border-t border-stone-200 space-y-2 shrink-0">
              <PWAInstallButton compact />
              {isMaster && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    exitImpersonation();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-stone-900 rounded-lg"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                  <span>Kembali ke Konsol Master</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAccountModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg"
              >
                <UserCog className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Kelola Akun ({session.fullName})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Keluar (Logout)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Management & Logout Modal */}
      <AccountModal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} />

      {/* Non-intrusive Slide-Over AI Assistant Drawer */}
      <AiAssistantDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
