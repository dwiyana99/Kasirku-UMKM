/**
 * KasirAkun UMKM — Master Admin Full Control Panel for UMKM Landing Pages
 * Sub-tab 1: "Permintaan Kustomisasi Gratis" (Ticket Queue, Asset Preview, WA Contact, Status Update & 1-Click Open Editor)
 * Sub-tab 2: "Semua Landing Page UMKM" (Search & Filter ALL UMKM, Proactive Master Admin Editor + Direct Publish + Audit Log)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Headphones,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import {
  LandingConfigFormFields,
  type CatalogVisibilityItem,
  type RoomVisibilityItem,
} from '../landing/LandingConfigFormFields';
import { PublicStorefrontView } from '../landing/PublicStorefrontView';
import { useApp } from '../../context/AppContext';
import { buildWhatsappDirectUrl, sanitizeExternalUrl } from '../../lib/landing/url-helper';
import type {
  LandingAssistanceStatus,
  LandingPageAssistanceRequest,
  PublicTenantLandingPayload,
  TenantLandingPageConfig,
} from '../../types/domain';

interface MasterLandingRow {
  tenantId: string;
  tenantName: string;
  vertical: string;
  verticalLabel: string;
  accountScope: 'DEMO' | 'REAL';
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  hasAddon: boolean;
  slug: string;
  publicUrl: string;
  isPublished: boolean;
  themePreset: string;
  updatedByAdminId?: string | null;
  lastCustomizedAt?: string | null;
  updatedAt: string;
  pendingTickets: number;
}

interface MasterTenantLandingDetail {
  hasAddon: boolean;
  landingPage: TenantLandingPageConfig;
  publicUrl: string;
  tenantSummary: {
    id: string;
    name: string;
    vertical: string;
    verticalLabel: string;
    accountScope: string;
  };
  catalogItems: CatalogVisibilityItem[];
  rooms: RoomVisibilityItem[];
  previewPayload: PublicTenantLandingPayload;
}

const TICKET_STATUS_META: Record<LandingAssistanceStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  IN_PROGRESS: { label: 'Diproses', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  NEEDS_INFO: { label: 'Butuh Info', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  COMPLETED: { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

export function MasterLandingPagesPanel({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  const { session } = useApp();
  const [subTab, setSubTab] = useState<'ASSISTANCE' | 'ALL_UMKM'>('ASSISTANCE');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [tickets, setTickets] = useState<LandingPageAssistanceRequest[]>([]);
  const [allRows, setAllRows] = useState<MasterLandingRow[]>([]);

  // Filters for ALL_UMKM
  const [searchTerm, setSearchTerm] = useState('');
  const [addonFilter, setAddonFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [publishFilter, setPublishFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');

  // Ticket Detail Drawer State
  const [selectedTicket, setSelectedTicket] = useState<LandingPageAssistanceRequest | null>(null);
  const [ticketStatusEdit, setTicketStatusEdit] = useState<LandingAssistanceStatus>('PENDING');
  const [ticketAdminNotes, setTicketAdminNotes] = useState('');
  const [ticketRevisionCount, setTicketRevisionCount] = useState(0);
  const [savingTicket, setSavingTicket] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState('');

  // Proactive Master Admin Editor Modal/Drawer State
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorDetail, setEditorDetail] = useState<MasterTenantLandingDetail | null>(null);
  const [editorDraft, setEditorDraft] = useState<TenantLandingPageConfig | null>(null);
  const [editorProductVis, setEditorProductVis] = useState<Record<string, boolean>>({});
  const [editorRoomVis, setEditorRoomVis] = useState<Record<string, boolean>>({});
  const [activateAddonIfMissing, setActivateAddonIfMissing] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [editorSuccess, setEditorSuccess] = useState('');

  const fetchAllMasterData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const headers: HeadersInit = session.token
        ? { Authorization: `Bearer ${session.token}` }
        : {};
      const [assistRes, pagesRes] = await Promise.all([
        fetch('/api/master-admin/landing-assistance', { headers }),
        fetch('/api/master-admin/landing-pages', { headers }),
      ]);
      if (!assistRes.ok || !pagesRes.ok) {
        throw new Error('Gagal memuat data Landing Page UMKM dari server.');
      }
      const assistData = (await assistRes.json()) as {
        requests?: LandingPageAssistanceRequest[];
        pendingCount?: number;
      };
      const pagesData = (await pagesRes.json()) as {
        items?: MasterLandingRow[];
        pendingAssistanceCount?: number;
      };
      setTickets(assistData.requests ?? []);
      setAllRows(pagesData.items ?? []);
      onPendingCountChange?.(assistData.pendingCount ?? pagesData.pendingAssistanceCount ?? 0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [session.token, onPendingCountChange]);

  useEffect(() => {
    void fetchAllMasterData();
  }, [fetchAllMasterData]);

  const pendingCount = useMemo(
    () => tickets.filter((t) => t.status === 'PENDING').length,
    [tickets]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allRows.filter((row) => {
      if (addonFilter === 'ACTIVE' && !row.hasAddon) return false;
      if (addonFilter === 'INACTIVE' && row.hasAddon) return false;
      if (publishFilter === 'PUBLISHED' && !row.isPublished) return false;
      if (publishFilter === 'DRAFT' && row.isPublished) return false;
      if (
        q &&
        !row.tenantName.toLowerCase().includes(q) &&
        !row.slug.toLowerCase().includes(q) &&
        !row.ownerName.toLowerCase().includes(q) &&
        !row.verticalLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allRows, searchTerm, addonFilter, publishFilter]);

  const openTicketInspector = (ticket: LandingPageAssistanceRequest) => {
    setSelectedTicket(ticket);
    setTicketStatusEdit(ticket.status);
    setTicketAdminNotes(ticket.adminNotes || '');
    setTicketRevisionCount(ticket.freeRevisionQuotaUsed || 0);
    setTicketFeedback('');
  };

  const handleSaveTicket = async () => {
    if (!selectedTicket) return;
    setSavingTicket(true);
    setTicketFeedback('');
    try {
      const res = await fetch(`/api/master-admin/landing-assistance/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          status: ticketStatusEdit,
          adminNotes: ticketAdminNotes,
          freeRevisionQuotaUsed: Number(ticketRevisionCount) || 0,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        request?: LandingPageAssistanceRequest;
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error || 'Gagal memperbarui tiket bantuan.');
      }
      setSelectedTicket(data.request);
      setTicketFeedback('Status tiket & catatan admin berhasil disimpan ke AuditLog.');
      await fetchAllMasterData();
    } catch (err) {
      setTicketFeedback(err instanceof Error ? err.message : 'Gagal memperbarui tiket.');
    } finally {
      setSavingTicket(false);
    }
  };

  const openMasterEditorForTenant = async (tenantId: string) => {
    setEditorLoading(true);
    setEditorError('');
    setEditorSuccess('');
    setActivateAddonIfMissing(false);
    try {
      const res = await fetch(
        `/api/master-admin/tenants/${encodeURIComponent(tenantId)}/landing-page`,
        {
          headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
        }
      );
      const data = (await res.json()) as MasterTenantLandingDetail & { error?: string };
      if (!res.ok || !data.landingPage) {
        throw new Error(data.error || 'Gagal memuat konfigurasi Landing Page UMKM.');
      }
      setEditorDetail(data);
      setEditorDraft(data.landingPage);
      const pMap: Record<string, boolean> = {};
      for (const item of data.catalogItems) pMap[item.id] = item.showOnLanding;
      setEditorProductVis(pMap);
      const rMap: Record<string, boolean> = {};
      for (const rm of data.rooms) rMap[rm.id] = rm.showOnLanding;
      setEditorRoomVis(rMap);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Gagal memuat editor.');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleMasterSaveLanding = async (forcePublish?: boolean) => {
    if (!editorDetail || !editorDraft) return;
    setEditorSaving(true);
    setEditorError('');
    setEditorSuccess('');

    const nextPublish = forcePublish !== undefined ? forcePublish : editorDraft.isPublished;
    try {
      const res = await fetch(
        `/api/master-admin/tenants/${encodeURIComponent(editorDetail.tenantSummary.id)}/landing-page`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: JSON.stringify({
            tenantId: editorDetail.tenantSummary.id,
            slug: editorDraft.slug,
            customDomain: editorDraft.customDomain ?? null,
            isPublished: nextPublish,
            themePreset: editorDraft.themePreset,
            logoUrl: editorDraft.logoUrl ?? null,
            heroTitle: editorDraft.heroTitle,
            heroSubtitle: editorDraft.heroSubtitle ?? null,
            heroImageUrl: editorDraft.heroImageUrl ?? null,
            aboutText: editorDraft.aboutText ?? null,
            whatsappNumber: editorDraft.whatsappNumber ?? null,
            address: editorDraft.address ?? null,
            googleMapsUrl: editorDraft.googleMapsUrl ?? null,
            openingHoursJson: editorDraft.openingHoursJson,
            socialLinksJson: editorDraft.socialLinksJson,
            highlightsJson: editorDraft.highlightsJson.filter((h) => h.trim().length > 0),
            sectionsVisibilityJson: editorDraft.sectionsVisibilityJson,
            seoTitle: editorDraft.seoTitle ?? null,
            seoDescription: editorDraft.seoDescription ?? null,
            productVisibilityMap: editorProductVis,
            roomVisibilityMap: editorRoomVis,
            activateAddonIfMissing,
          }),
        }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        landingPage?: TenantLandingPageConfig;
        previewPayload?: PublicTenantLandingPayload;
      };
      if (!res.ok || !data.landingPage) {
        throw new Error(data.error || 'Gagal menyimpan konfigurasi Landing Page.');
      }
      setEditorDraft(data.landingPage);
      if (data.previewPayload) {
        setEditorDetail((prev) =>
          prev
            ? {
                ...prev,
                hasAddon: prev.hasAddon || activateAddonIfMissing,
                landingPage: data.landingPage!,
                previewPayload: data.previewPayload!,
              }
            : null
        );
      }
      setEditorSuccess(
        `Perubahan Master Admin tersimpan (AuditLog tercatat) · Status: ${
          data.landingPage.isPublished ? 'TERBIT PUBLIK' : 'DRAFT'
        }.`
      );
      await fetchAllMasterData();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    } finally {
      setEditorSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-stone-100 border border-stone-200">
          <button
            type="button"
            data-testid="master-lp-subtab-assistance"
            onClick={() => setSubTab('ASSISTANCE')}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 ${
              subTab === 'ASSISTANCE'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
            <span>Permintaan Kustomisasi Gratis</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] tabular-nums">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="master-lp-subtab-all"
            onClick={() => setSubTab('ALL_UMKM')}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 ${
              subTab === 'ALL_UMKM'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
            <span>Semua Landing Page UMKM</span>
            <span className="text-[11px] font-mono tabular-nums text-stone-500">
              ({allRows.length})
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void fetchAllMasterData()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-xl bg-white border border-stone-200 animate-pulse" />
      ) : subTab === 'ASSISTANCE' ? (
        /* SUB-TAB 1: PERMINTAAN KUSTOMISASI GRATIS */
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {tickets.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Headphones className="w-8 h-8 text-stone-300 mx-auto" strokeWidth={1.75} />
              <p className="text-sm font-bold text-stone-900">Belum ada permintaan kustomisasi gratis</p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Anda tetap dapat membantu menyetel Landing Page UMKM mana pun secara proaktif melalui tab &quot;Semua Landing Page UMKM&quot;.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <th className="py-3 px-4">UMKM &amp; Pemilik</th>
                    <th className="py-3 px-4">WhatsApp</th>
                    <th className="py-3 px-4">Tema &amp; Ringkasan Brief</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi Master</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {tickets.map((t) => {
                    const st = TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.PENDING;
                    return (
                      <tr key={t.id} className="hover:bg-stone-50/60">
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-stone-900">{t.tenantName || t.tenantId}</p>
                          <p className="text-[11px] text-stone-500">
                            {t.ownerName} · <span className="font-mono">/toko/{t.tenantSlug}</span>
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-stone-700">
                          {t.contactWhatsapp}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="text-stone-800 line-clamp-2">{t.customBrief}</p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            Tema: {t.preferredTheme || 'Default'} · Revisi: {t.freeRevisionQuotaUsed}/2
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openTicketInspector(t)}
                              className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-800 whitespace-nowrap"
                            >
                              Detail Tiket
                            </button>
                            <button
                              type="button"
                              onClick={() => void openMasterEditorForTenant(t.tenantId)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                            >
                              Edit Landing Page
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* SUB-TAB 2: SEMUA LANDING PAGE UMKM (PROACTIVE MASTER CONTROL) */
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama UMKM, slug, pemilik, atau bidang..."
                aria-label="Cari UMKM Landing Page"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
              />
            </div>

            <select
              aria-label="Filter status Add-On"
              value={addonFilter}
              onChange={(e) => setAddonFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-800"
            >
              <option value="ALL">Semua Add-On</option>
              <option value="ACTIVE">Add-On Aktif</option>
              <option value="INACTIVE">Belum Aktif</option>
            </select>

            <select
              aria-label="Filter status publikasi"
              value={publishFilter}
              onChange={(e) => setPublishFilter(e.target.value as 'ALL' | 'PUBLISHED' | 'DRAFT')}
              className="px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-800"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Terbit Publik</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <th className="py-3 px-4">UMKM &amp; Bidang</th>
                    <th className="py-3 px-4">Slug Publik</th>
                    <th className="py-3 px-4">Add-On</th>
                    <th className="py-3 px-4">Publikasi</th>
                    <th className="py-3 px-4">Kustomisasi Terakhir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {filteredRows.map((row) => (
                    <tr key={row.tenantId} className="hover:bg-stone-50/60">
                      <td className="py-3 px-4">
                        <p className="font-bold text-stone-900">{row.tenantName}</p>
                        <p className="text-[11px] text-stone-500">
                          {row.verticalLabel} · {row.accountScope}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={`/toko/${row.slug}${row.isPublished ? '' : '?preview=1'}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-emerald-700 hover:underline"
                        >
                          <span>/toko/{row.slug}</span>
                          <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                        </a>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${
                            row.hasAddon
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                          }`}
                        >
                          {row.hasAddon ? 'Aktif' : 'Belum Aktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${
                            row.isPublished
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {row.isPublished ? 'Terbit' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-stone-600">
                        {row.updatedByAdminId ? (
                          <span>Oleh Admin ({row.updatedByAdminId})</span>
                        ) : (
                          <span>Mandiri / Default</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          data-testid={`master-edit-lp-${row.tenantId}`}
                          onClick={() => void openMasterEditorForTenant(row.tenantId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Setting / Edit Landing Page</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TICKET INSPECTOR MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Detail Permintaan Kustomisasi · {selectedTicket.tenantName}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Pemilik: {selectedTicket.ownerName} · Slug: <span className="font-mono">/toko/{selectedTicket.tenantSlug}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                aria-label="Tutup detail tiket"
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {/* Asset Previews */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-stone-700">Banner Hero (Wajib)</p>
                {sanitizeExternalUrl(selectedTicket.heroBannerUrl, { allowDataImage: true }) ? (
                  <img
                    src={sanitizeExternalUrl(selectedTicket.heroBannerUrl, { allowDataImage: true })!}
                    alt="Banner Hero UMKM"
                    className="w-full aspect-[16/10] object-cover rounded-lg border border-stone-200"
                  />
                ) : (
                  <div className="w-full aspect-[16/10] rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center text-xs text-stone-400">
                    Tidak ada foto
                  </div>
                )}
              </div>
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-stone-700">Brief &amp; Produk Unggulan</p>
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-stone-800 leading-relaxed">
                  {selectedTicket.customBrief}
                </div>
                {selectedTicket.featuredItemsNotes && (
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-stone-700">
                    <span className="font-semibold text-stone-900">Item Unggulan: </span>
                    {selectedTicket.featuredItemsNotes}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Contact WA + Open Editor */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-stone-200">
              {buildWhatsappDirectUrl(
                selectedTicket.contactWhatsapp,
                `Halo ${selectedTicket.ownerName || 'Pemilik Usaha'}, saya dari Tim Master Admin KasirAkun UMKM terkait permintaan kustomisasi gratis Landing Page untuk ${selectedTicket.tenantName}. Kami mulai mengerjakan penataan halaman Anda hari ini.`
              ) && (
                <a
                  href={
                    buildWhatsappDirectUrl(
                      selectedTicket.contactWhatsapp,
                      `Halo ${selectedTicket.ownerName || 'Pemilik Usaha'}, saya dari Tim Master Admin KasirAkun UMKM terkait permintaan kustomisasi gratis Landing Page untuk ${selectedTicket.tenantName}. Kami mulai mengerjakan penataan halaman Anda hari ini.`
                    )!
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Hubungi User via WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  const tid = selectedTicket.tenantId;
                  setSelectedTicket(null);
                  void openMasterEditorForTenant(tid);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Buka Editor &amp; Kustomisasi UMKM Ini</span>
              </button>
            </div>

            {/* Update Status & Admin Notes */}
            <div className="space-y-3 pt-3 border-t border-stone-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="master-ticket-status" className="block text-xs font-semibold text-stone-800">
                    Status Tiket
                  </label>
                  <select
                    id="master-ticket-status"
                    value={ticketStatusEdit}
                    onChange={(e) => setTicketStatusEdit(e.target.value as LandingAssistanceStatus)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900"
                  >
                    <option value="PENDING">PENDING (Menunggu)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS (Sedang Dikerjakan)</option>
                    <option value="NEEDS_INFO">NEEDS_INFO (Butuh Info Tambahan)</option>
                    <option value="COMPLETED">COMPLETED (Selesai)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="master-ticket-rev" className="block text-xs font-semibold text-stone-800">
                    Kuota Revisi Gratis Terpakai (0–2)
                  </label>
                  <input
                    id="master-ticket-rev"
                    type="number"
                    min={0}
                    max={5}
                    value={ticketRevisionCount}
                    onChange={(e) => setTicketRevisionCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-stone-300 text-stone-900"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="master-ticket-notes" className="block text-xs font-semibold text-stone-800">
                  Catatan Balasan untuk User (Tampil di Dashboard User)
                </label>
                <textarea
                  id="master-ticket-notes"
                  rows={3}
                  value={ticketAdminNotes}
                  onChange={(e) => setTicketAdminNotes(e.target.value)}
                  placeholder="Contoh: Halaman sudah kami rapikan, katalog aktif, dan siap diakses di /toko/..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
                />
              </div>

              {ticketFeedback && (
                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                  <span>{ticketFeedback}</span>
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={savingTicket}
                  onClick={() => void handleSaveTicket()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  {savingTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" strokeWidth={1.75} />}
                  <span>Simpan Status Tiket</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROACTIVE MASTER ADMIN FULL EDITOR MODAL */}
      {(editorLoading || editorDetail) && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-[#FAFAF9] border border-stone-200 rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-white border-b border-stone-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Editor Master Admin · {editorDetail?.tenantSummary.name || 'Memuat...'}
                </h3>
                {editorDetail && (
                  <p className="text-[11px] text-stone-500">
                    {editorDetail.tenantSummary.verticalLabel} · {editorDetail.tenantSummary.accountScope} · Semua perubahan otomatis tercatat di AuditLog
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editorDraft && (
                  <>
                    <button
                      type="button"
                      disabled={editorSaving}
                      onClick={() => void handleMasterSaveLanding(!editorDraft.isPublished)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                        editorDraft.isPublished
                          ? 'bg-white border-stone-300 text-stone-700'
                          : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {editorDraft.isPublished ? 'Jadikan Draft' : 'Terbitkan Langsung'}
                    </button>
                    <button
                      type="button"
                      disabled={editorSaving}
                      onClick={() => void handleMasterSaveLanding()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                    >
                      {editorSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                      )}
                      <span>Simpan Master</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditorDetail(null);
                    setEditorDraft(null);
                  }}
                  aria-label="Tutup editor master"
                  className="p-1.5 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-5 h-5" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {editorLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                </div>
              ) : editorDetail && editorDraft ? (
                <>
                  {!editorDetail.hasAddon && (
                    <label className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activateAddonIfMissing}
                        onChange={(e) => setActivateAddonIfMissing(e.target.checked)}
                        className="rounded border-amber-400 text-emerald-600"
                      />
                      <span>
                        <strong>UMKM ini belum mengaktifkan Add-On Landing Page.</strong> Centang kotak ini untuk sekaligus mengaktifkan Add-On saat Master Admin menyimpan.
                      </span>
                    </label>
                  )}

                  {editorError && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      {editorError}
                    </div>
                  )}
                  {editorSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
                      <span>{editorSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-7">
                      <LandingConfigFormFields
                        tenantId={editorDetail.tenantSummary.id}
                        authToken={session.token}
                        draft={editorDraft}
                        onChange={setEditorDraft}
                        catalogItems={editorDetail.catalogItems}
                        productVisibilityMap={editorProductVis}
                        onToggleProductVisibility={(id, v) =>
                          setEditorProductVis((prev) => ({ ...prev, [id]: v }))
                        }
                        rooms={editorDetail.rooms}
                        roomVisibilityMap={editorRoomVis}
                        onToggleRoomVisibility={(id, v) =>
                          setEditorRoomVis((prev) => ({ ...prev, [id]: v }))
                        }
                      />
                    </div>
                    <div className="lg:col-span-5 lg:sticky lg:top-0">
                      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs">
                          <span className="font-bold text-stone-900">Live Preview</span>
                          <a
                            href={`/toko/${editorDraft.slug}${editorDraft.isPublished ? '' : '?preview=1'}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-emerald-700 hover:underline"
                          >
                            <span>/toko/{editorDraft.slug}</span>
                            <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                          </a>
                        </div>
                        <div className="max-h-[600px] overflow-y-auto">
                          <PublicStorefrontView
                            compactMobilePreview
                            payload={{
                              ...editorDetail.previewPayload,
                              isPreview: !editorDraft.isPublished,
                              landingPage: editorDraft,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
