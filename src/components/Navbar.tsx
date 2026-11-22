import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { evaluateStockAlerts } from '../lib/inventory/stock-monitoring';
import { computeDueReminders } from '../lib/analytics/owner-insights-engine';
import { ModalShell } from './ui/ModalShell';
import { VERTICAL_LABELS_MAP } from '../lib/verticals/vertical-registry';

const VERTICAL_LABELS = VERTICAL_LABELS_MAP;

export interface NavbarProps {
  title: string;
  subtitle?: string;
  primaryAction?: React.ReactNode;
  onOpenMobileMenu?: () => void;
  onOpenAccountModal: () => void;
  onOpenAiDrawer?: () => void;
  onLogout: () => Promise<void> | void;
}

/**
 * Unified top navigation bar rendered across all authenticated dashboard pages.
 * Mobile-safe (< lg): keeps only menu toggle, page title, and notification bell in top bar;
 * tenant switcher, account, and logout live neatly in the Left Sidebar / Mobile Drawer
 * so zero horizontal overflow occurs on narrow mobile viewports.
 */
export function Navbar({
  title,
  subtitle,
  primaryAction,
  onOpenMobileMenu,
  onOpenAccountModal,
  onOpenAiDrawer,
  onLogout,
}: NavbarProps) {
  const {
    visibleWorkspaces,
    activeWorkspace,
    switchTenant,
    activeBranchId,
    setActiveBranchId,
    navigate,
    session,
    exitImpersonation,
    hasAddOn,
  } = useApp();

  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const branchRef = useRef<HTMLDivElement | null>(null);

  const isMaster = session.role === 'MASTER_ADMIN';
  const branches = activeWorkspace.branches ?? [];
  const hasMultiBranchAccess = hasAddOn('ADDON_EXTRA_BRANCH');
  const hasMultipleBranches = hasMultiBranchAccess && branches.length > 1;
  const selectedBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const showAiTrigger = Boolean(onOpenAiDrawer) && hasAddOn('ADDON_AI_ASSISTANT');

  const stockEvaluation = useMemo(
    () => evaluateStockAlerts(activeWorkspace.products),
    [activeWorkspace.products]
  );

  const dueReminders = useMemo(
    () => computeDueReminders(activeWorkspace),
    [activeWorkspace]
  );

  const totalNotifCount = stockEvaluation.counts.total + dueReminders.length;
  const showNotifBell = stockEvaluation.totalTrackedCount > 0 || dueReminders.length > 0;

  // Close desktop dropdowns on outside click or Escape key
  useEffect(() => {
    if (!tenantMenuOpen && !branchMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTenantMenuOpen(false);
      }
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTenantMenuOpen(false);
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [tenantMenuOpen, branchMenuOpen]);

  return (
    <div className="sticky top-0 z-30 w-full max-w-full">
      {/* Dedicated Master Admin Banner when inspecting a customer workspace */}
      {isMaster && (
        <div
          data-testid="master-inspection-banner"
          className="bg-stone-900 text-white px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 text-xs min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              <strong>Mode Master Admin</strong>
              {session.impersonatingCustomerName
                ? ` · Memeriksa akun: ${session.impersonatingCustomerName}`
                : ` · Memeriksa usaha: ${activeWorkspace.tenant.name}`}
            </span>
          </div>
          <button
            type="button"
            onClick={exitImpersonation}
            data-testid="master-return-console-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-stone-950 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Kembali ke Konsol Master</span>
          </button>
        </div>
      )}

      {/* Unified Dashboard Navbar */}
      <header
        data-testid="unified-dashboard-navbar"
        className="h-14 sm:h-16 bg-white border-b border-stone-200 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 w-full max-w-full"
      >
        {/* Left Zone: Mobile Toggle + Breadcrumb Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Buka Menu Navigasi"
              data-testid="mobile-menu-open-btn"
              className="lg:hidden p-2 -ml-1 text-stone-700 hover:text-stone-950 hover:bg-stone-100 rounded-lg shrink-0"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-bold text-stone-900 truncate leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-stone-500 hidden md:block truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right Zone: Primary Action (sm+) + Optional AI (md+, active add-on only) + Notification Bell + Desktop Controls (lg+) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {primaryAction && (
            <div className="hidden sm:flex items-center gap-2">{primaryAction}</div>
          )}

          {showAiTrigger && (
            <button
              type="button"
              onClick={onOpenAiDrawer}
              data-testid="navbar-ai-assistant-btn"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
              <span>Asisten AI</span>
            </button>
          )}

          {/* Persistent Notification Bell (opens responsive centered ModalShell on mobile & desktop) */}
          {showNotifBell && (
            <button
              type="button"
              onClick={() => {
                setTenantMenuOpen(false);
                setBranchMenuOpen(false);
                setNotifModalOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={notifModalOpen}
              aria-label={`Notifikasi usaha (${totalNotifCount})`}
              data-testid="navbar-stock-notifications-btn"
              className={`relative inline-flex items-center justify-center px-2.5 py-2 rounded-lg border transition-colors shrink-0 ${
                totalNotifCount > 0
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                  : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              {totalNotifCount > 0 && (
                <span
                  data-testid="navbar-stock-alert-count"
                  className="ml-1 text-[11px] font-mono font-bold tabular-nums text-rose-700"
                >
                  {totalNotifCount}
                </span>
              )}
            </button>
          )}

          {/* Multi-Branch Switcher (Desktop lg+ only; mobile uses sidebar) */}
          {hasMultipleBranches && (
            <div className="relative hidden lg:block" ref={branchRef}>
              <button
                type="button"
                onClick={() => {
                  setTenantMenuOpen(false);
                  setBranchMenuOpen((o) => !o);
                }}
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
                aria-label="Pilih Cabang atau Konsolidasi"
                data-testid="navbar-branch-selector"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap max-w-[180px]"
              >
                <GitBranch className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                <span className="truncate">
                  {selectedBranch ? selectedBranch.name : 'Semua Cabang'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
              </button>

              {branchMenuOpen && (
                <div
                  role="menu"
                  aria-label="Filter Cabang & Gudang"
                  data-testid="navbar-branch-dropdown-menu"
                  className="absolute right-0 mt-1.5 w-72 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50"
                >
                  <div className="px-3 py-1.5 border-b border-stone-100">
                    <p className="text-[11px] font-semibold text-stone-500">
                      Filter Cabang / Gudang ({branches.length} lokasi)
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveBranchId('ALL');
                        setBranchMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left transition-colors flex items-start justify-between gap-2 ${
                        activeBranchId === 'ALL'
                          ? 'bg-emerald-50 text-emerald-950'
                          : 'hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">Semua Cabang (Konsolidasi)</p>
                        <p className="text-[11px] text-stone-500">
                          Gabungan omzet, stok &amp; laporan seluruh outlet
                        </p>
                      </div>
                      {activeBranchId === 'ALL' && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                      )}
                    </button>
                    {branches.map((br) => {
                      const isSelected = activeBranchId === br.id;
                      return (
                        <button
                          key={br.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setActiveBranchId(br.id);
                            setBranchMenuOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left transition-colors flex items-start justify-between gap-2 ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-950'
                              : 'hover:bg-stone-50 text-stone-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{br.name}</p>
                            <p className="text-[11px] text-stone-500 truncate">
                              {br.code} ·{' '}
                              {br.branchType === 'CENTRAL_WAREHOUSE' ? 'Gudang Pusat' : 'Outlet'}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tenant / Business Selector Dropdown (Desktop lg+ only; mobile uses sidebar drawer) */}
          <div className="relative hidden lg:block" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setBranchMenuOpen(false);
                setTenantMenuOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={tenantMenuOpen}
              aria-label="Pilih Usaha / Tenant"
              data-testid="navbar-tenant-selector"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap max-w-[220px]"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{activeWorkspace.tenant.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" strokeWidth={1.75} />
            </button>

            {tenantMenuOpen && (
              <div
                role="menu"
                aria-label="Daftar Usaha Anda"
                data-testid="navbar-tenant-dropdown-menu"
                className="absolute right-0 mt-1.5 w-72 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50"
              >
                <div className="px-3 py-1.5 border-b border-stone-100">
                  <p className="text-[11px] font-semibold text-stone-500">
                    {isMaster ? 'Workspace Terbuka (Mode Master)' : 'Usaha / Bisnis Anda'}
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {visibleWorkspaces.map((ws) => {
                    const isSelected = ws.tenant.id === activeWorkspace.tenant.id;
                    return (
                      <button
                        key={ws.tenant.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          switchTenant(ws.tenant.id);
                          setTenantMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left transition-colors flex items-start justify-between gap-2 ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-950'
                            : 'hover:bg-stone-50 text-stone-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{ws.tenant.name}</p>
                          <p className="text-[11px] text-stone-500 truncate">
                            {VERTICAL_LABELS[ws.tenant.vertical]} · {ws.tenant.taxEntity}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {!isMaster && visibleWorkspaces.length === 1 && (
                  <div className="px-3 py-1.5 border-t border-stone-100">
                    <p className="text-[11px] text-stone-400">
                      Data usaha Anda terisolasi penuh demi privasi akun.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dedicated Back to Master link — Desktop lg+ only */}
          {isMaster && (
            <button
              type="button"
              onClick={exitImpersonation}
              data-testid="navbar-back-to-master"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={1.75} />
              <span>Kembali ke Master</span>
            </button>
          )}

          {/* Account Management Trigger — Desktop lg+ only (mobile lives in Left Sidebar Drawer) */}
          <button
            type="button"
            onClick={onOpenAccountModal}
            data-testid="topbar-account-btn"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <UserCog className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span className="hidden xl:inline max-w-[120px] truncate">{session.fullName}</span>
            <span className="xl:hidden">Akun</span>
          </button>

          {/* Persistent Logout Button — Desktop lg+ only (mobile lives in Left Sidebar Drawer) */}
          <button
            type="button"
            onClick={() => void onLogout()}
            data-testid="topbar-logout-btn"
            aria-label="Keluar dari akun"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Mobile Secondary Action Strip (so primaryAction like Buka Kasir / Tutup Kasir never overflows header on narrow phones) */}
      {primaryAction && (
        <div className="sm:hidden bg-white border-b border-stone-200 px-3 py-2 flex flex-wrap items-center gap-2">
          {primaryAction}
        </div>
      )}

      {/* Responsive Centered Notifications Modal (100% readable on 320px-1920px viewports, zero clipping) */}
      <ModalShell
        open={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        headerId="navbar-notifications-modal-header"
        testId="navbar-notifications-modal"
        maxWidthClass="max-w-lg"
        title="Notifikasi & Pengingat Usaha"
        subtitle={
          totalNotifCount > 0
            ? `${totalNotifCount} pemberitahuan aktif untuk ${activeWorkspace.tenant.name}`
            : `Semua stok dan pengingat ${activeWorkspace.tenant.name} dalam kondisi aman.`
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              data-testid="navbar-notif-open-page-btn"
              onClick={() => {
                setNotifModalOpen(false);
                navigate('/notifications');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>Buka Halaman Notifikasi</span>
            </button>
            {stockEvaluation.alerts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setNotifModalOpen(false);
                  navigate('/purchasing/restock');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <span>Kulakan Cepat</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        }
      >
        <div className="p-4 sm:p-5 space-y-4">
          {totalNotifCount === 0 ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-stone-900">Semua Aman Terkendali</p>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Tidak ada barang yang menipis dan tidak ada pengingat jatuh tempo saat ini.
              </p>
            </div>
          ) : (
            <>
              {stockEvaluation.alerts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-stone-900">
                      Peringatan Stok Minimum ({stockEvaluation.alerts.length})
                    </p>
                    <span className="text-[11px] font-mono font-semibold text-rose-700 tabular-nums">
                      {stockEvaluation.counts.outOfStock + stockEvaluation.counts.critical} kritis
                    </span>
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                    {stockEvaluation.alerts.slice(0, 6).map((item) => {
                      const isUrgent =
                        item.severity === 'OUT_OF_STOCK' || item.severity === 'CRITICAL';
                      const severityText =
                        item.severity === 'OUT_OF_STOCK'
                          ? 'Habis'
                          : item.severity === 'CRITICAL'
                          ? 'Di Bawah Min'
                          : 'Hampir Habis';
                      return (
                        <div
                          key={item.product.id}
                          className="px-3.5 py-2.5 flex items-start justify-between gap-3 bg-white"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-stone-900 break-words">
                              {item.product.name}
                            </p>
                            <p className="text-[11px] text-stone-500 font-mono tabular-nums mt-0.5">
                              Sisa {Number(item.currentStock)} / Min {Number(item.minStockAlert)}{' '}
                              {item.product.unit} · Saran +{Number(item.suggestedRestockQty)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 mt-0.5 ${
                              isUrgent ? 'text-rose-700' : 'text-amber-700'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                            <span>{severityText}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {dueReminders.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-stone-900">
                    Pengingat Jadwal &amp; Tagihan ({dueReminders.length})
                  </p>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                    {dueReminders.slice(0, 5).map((rem) => (
                      <button
                        key={rem.id}
                        type="button"
                        onClick={() => {
                          setNotifModalOpen(false);
                          navigate(rem.route);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-start justify-between gap-3 bg-white hover:bg-stone-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{rem.title}</span>
                          </p>
                          <p className="text-[11px] text-stone-500 mt-0.5">{rem.detail}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-1" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ModalShell>
    </div>
  );
}
