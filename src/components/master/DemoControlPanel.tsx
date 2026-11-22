import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  MessageCircle,
  Save,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ACTIVE_VERTICAL_DEFINITIONS } from '../../lib/verticals/vertical-registry';
import type {
  BusinessVertical,
  DemoAppointmentRequest,
  SubscriptionPlanCode,
  SystemDemoConfig,
} from '../../types/domain';

const VERTICAL_LIST: Array<{ id: BusinessVertical; label: string; demoName: string }> =
  ACTIVE_VERTICAL_DEFINITIONS.map((v) => ({
    id: v.id,
    label: v.shortLabel,
    demoName: `${v.demoBusinessName} (${v.demoHighlight})`,
  }));

export function DemoControlPanel() {
  const {
    systemDemoConfig,
    demoRequests,
    updateDemoConfig,
    approveDemoRequest,
    rejectDemoRequest,
  } = useApp();

  const [demoMode, setDemoMode] = useState<'PUBLIC_INSTANT' | 'APPOINTMENT_APPROVAL'>(
    systemDemoConfig.globalDemoMode ?? systemDemoConfig.demoMode ?? 'PUBLIC_INSTANT'
  );
  const [requireRegistration, setRequireRegistration] = useState<boolean>(
    Boolean(systemDemoConfig.requireRegistrationForDemo)
  );
  const [defaultDurationDays, setDefaultDurationDays] = useState(
    String(systemDemoConfig.defaultDemoDurationDays ?? systemDemoConfig.defaultDurationDays ?? 7)
  );
  const [allowedPlan, setAllowedPlan] = useState<SubscriptionPlanCode>(
    systemDemoConfig.customEnabledPlan ?? systemDemoConfig.allowedDemoPlan ?? 'EXPERT'
  );
  const [allowAiInDemo, setAllowAiInDemo] = useState<boolean>(
    Boolean(
      systemDemoConfig.allowAiInDemo ??
        systemDemoConfig.customEnabledAddOns?.includes('ADDON_AI_ASSISTANT')
    )
  );
  const [visibility, setVisibility] = useState<Record<BusinessVertical, boolean>>(
    systemDemoConfig.demoVisibility
  );
  const [saving, setSaving] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDemoMode(systemDemoConfig.globalDemoMode ?? systemDemoConfig.demoMode ?? 'PUBLIC_INSTANT');
    setRequireRegistration(Boolean(systemDemoConfig.requireRegistrationForDemo));
    setDefaultDurationDays(
      String(systemDemoConfig.defaultDemoDurationDays ?? systemDemoConfig.defaultDurationDays ?? 7)
    );
    setAllowedPlan(systemDemoConfig.customEnabledPlan ?? systemDemoConfig.allowedDemoPlan ?? 'EXPERT');
    setAllowAiInDemo(
      Boolean(
        systemDemoConfig.allowAiInDemo ??
          systemDemoConfig.customEnabledAddOns?.includes('ADDON_AI_ASSISTANT')
      )
    );
    setVisibility(systemDemoConfig.demoVisibility);
  }, [systemDemoConfig]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const days = Math.max(1, Math.min(30, Number(defaultDurationDays || 7)));
    const visibleVerticals = (Object.keys(visibility) as BusinessVertical[]).filter(
      (k) => visibility[k] !== false
    );
    const res = await updateDemoConfig({
      globalDemoMode: demoMode,
      demoMode,
      requireRegistrationForDemo: requireRegistration,
      defaultDemoDurationDays: days,
      defaultDurationDays: days,
      customEnabledPlan: allowedPlan,
      allowedDemoPlan: allowedPlan,
      customEnabledAddOns: allowAiInDemo
        ? ['ADDON_EXTRA_BRANCH', 'ADDON_RESTO_QR_KDS', 'ADDON_AI_ASSISTANT']
        : ['ADDON_EXTRA_BRANCH', 'ADDON_RESTO_QR_KDS'],
      allowAiInDemo,
      demoVisibility: visibility,
      visibleDemoVerticals: visibleVerticals,
    });
    setSaving(false);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: `Pengaturan Halaman Demo disimpan (${
          demoMode === 'PUBLIC_INSTANT'
            ? requireRegistration
              ? `Demo Terbuka · Wajib Daftar Akun Demo Terlebih Dahulu (${days} hari)`
              : `Mode Demo Instan Publik aktif di /demo`
            : 'Mode Appointment / Jadwal Demo aktif di /demo'
        }).`,
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menyimpan pengaturan demo.' });
    }
  };

  const handleApprove = async (req: DemoAppointmentRequest) => {
    setBusyRequestId(req.id);
    setFeedback(null);
    const res = await approveDemoRequest(req.id, {
      durationDays: Math.max(1, Number(defaultDurationDays || 3)),
      allowedPlan,
    });
    setBusyRequestId(null);
    if (res.ok && res.request) {
      setFeedback({
        type: 'success',
        text: `Permintaan ${req.businessName} disetujui! Workspace demo terisolasi & Magic Link siap dikirim ke WhatsApp.`,
      });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menyetujui permintaan demo.' });
    }
  };

  const handleReject = async (req: DemoAppointmentRequest) => {
    setBusyRequestId(req.id);
    const res = await rejectDemoRequest(req.id);
    setBusyRequestId(null);
    if (res.ok) {
      setFeedback({ type: 'success', text: `Permintaan demo ${req.businessName} ditolak.` });
    } else {
      setFeedback({ type: 'error', text: res.error || 'Gagal menolak permintaan demo.' });
    }
  };

  const buildMagicLink = (token: string) => {
    if (typeof window === 'undefined') return `/demo-access/${token}`;
    return `${window.location.origin}/demo-access/${token}`;
  };

  const buildApprovalWhatsAppUrl = (req: DemoAppointmentRequest) => {
    const digits = (req.whatsappNumber ?? req.phoneWa ?? '').replace(/\D/g, '');
    const waPhone = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
    const link = req.magicAccessToken ? buildMagicLink(req.magicAccessToken) : '';
    const text = [
      `Halo Kak *${req.fullName}*,`,
      `Permintaan Demo KasirAkun UMKM untuk *${req.businessName}* telah kami setujui!`,
      ``,
      `Klik tautan akses demo khusus (terisolasi & siap dicoba):`,
      link,
      ``,
      `Berlaku hingga: ${req.demoExpiresAt ? req.demoExpiresAt.slice(0, 10) : '-'}`,
      `Jika ingin dibantu sesi demo live, silakan balas pesan ini. Terima kasih!`,
    ].join('\n');
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleCopyMagicLink = (req: DemoAppointmentRequest) => {
    if (!req.magicAccessToken) return;
    navigator.clipboard?.writeText(buildMagicLink(req.magicAccessToken)).catch(() => {});
    setCopiedId(req.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div data-testid="master-demo-control-panel" className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2 font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-semibold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Global Demo Config Form */}
      <form
        onSubmit={(e) => void handleSaveConfig(e)}
        className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Kontrol Halaman Demo (/demo) &amp; Akun Uji Coba
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur akses halaman Coba Demo Gratis (/demo): apakah pengunjung langsung memilih 8 demo UMKM, wajib daftar akun trial dahulu, atau melalui jadwal appointment.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            data-testid="save-demo-config-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Demo'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Mode Akses Demo Publik</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="demo-mode-btn-PUBLIC_INSTANT"
                  onClick={() => setDemoMode('PUBLIC_INSTANT')}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${
                    demoMode === 'PUBLIC_INSTANT'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">PUBLIC_INSTANT (Aktif di /demo)</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pengunjung dapat memilih 8 bidang UMKM &amp; simulasi paket/add-on langsung di halaman /demo.
                  </p>
                </button>
                <button
                  type="button"
                  data-testid="demo-mode-btn-APPOINTMENT_APPROVAL"
                  onClick={() => setDemoMode('APPOINTMENT_APPROVAL')}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${
                    demoMode === 'APPOINTMENT_APPROVAL'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">APPOINTMENT_APPROVAL</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Halaman /demo menampilkan Form Jadwal Demo; akses Magic Link dibuat setelah ACC Master Admin.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Durasi Demo Default (Hari)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={defaultDurationDays}
                  onChange={(e) => setDefaultDurationDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paket Default Akun Demo
                </label>
                <select
                  value={allowedPlan}
                  onChange={(e) => setAllowedPlan(e.target.value as SubscriptionPlanCode)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="LITE">LITE (Rp49rb — Kasir Tunai Super Simpel)</option>
                  <option value="BASIC">BASIC (Rp100rb)</option>
                  <option value="PRO">PRO (Rp199rb)</option>
                  <option value="EXPERT">EXPERT (Rp349rb — Semua Fitur)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="toggle-require-demo-registration"
                  checked={requireRegistration}
                  onChange={(e) => setRequireRegistration(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600"
                />
                <div className="text-xs">
                  <p className="font-semibold text-slate-900">
                    Wajib Daftar Akun Demo Terlebih Dahulu (Trial {defaultDurationDays || 7} Hari)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Jika aktif, calon pengguna di halaman <code>/demo</code> wajib mendaftar akun demo gratis terlebih dahulu sebelum memilih jenis UMKM &amp; simulasi paket demo, dengan batas masa aktif sesuai durasi hari di atas.
                  </p>
                </div>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAiInDemo}
                  onChange={(e) => setAllowAiInDemo(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>Izinkan uji coba Add-On Asisten Bisnis AI di akun demo</span>
              </label>
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-700">
              Visibilitas 8 Akun Demo UMKM (di Halaman /demo)
            </p>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
              {VERTICAL_LIST.map((v) => (
                <label
                  key={v.id}
                  className="py-2.5 flex items-center justify-between gap-3 cursor-pointer text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{v.label}</p>
                    <p className="text-[11px] text-slate-500">{v.demoName}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(visibility[v.id])}
                    onChange={(e) =>
                      setVisibility((prev) => ({ ...prev, [v.id]: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-emerald-600"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </form>

      {/* Incoming Demo Appointment Requests */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Permintaan Jadwal Demo (Appointment Approval · {demoRequests.length})
              </h2>
              <p className="text-xs text-slate-500">
                Klik ACC untuk otomatis membuat workspace demo terisolasi beserta Magic Link &amp; pesan WhatsApp.
              </p>
            </div>
          </div>
        </div>

        {demoRequests.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Belum ada permintaan jadwal demo masuk.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="demo-appointments-table" className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="px-5 py-3">Pemohon &amp; Usaha</th>
                  <th className="px-4 py-3">Kategori &amp; Cabang</th>
                  <th className="px-4 py-3">WhatsApp &amp; Jadwal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi Master</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demoRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{req.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        {req.businessName} · {req.email}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800">{req.vertical.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-slate-500">{req.branchCount} cabang</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono text-slate-800">{req.whatsappNumber}</p>
                      <p className="text-[11px] text-slate-500">{req.preferredSchedule}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-semibold ${
                          req.status === 'APPROVED'
                            ? 'text-emerald-700'
                            : req.status === 'REJECTED'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {req.status}
                      </span>
                      {req.demoExpiresAt && (
                        <p className="text-[10px] font-mono text-slate-400">
                          Exp: {req.demoExpiresAt.slice(0, 10)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {req.status === 'PENDING' ? (
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            disabled={busyRequestId === req.id}
                            data-testid={`approve-demo-btn-${req.id}`}
                            onClick={() => void handleApprove(req)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
                          >
                            ACC &amp; Buat Akun Demo Real
                          </button>
                          <button
                            type="button"
                            disabled={busyRequestId === req.id}
                            onClick={() => void handleReject(req)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                        </div>
                      ) : req.status === 'APPROVED' && req.magicAccessToken ? (
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleCopyMagicLink(req)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedId === req.id ? 'Disalin!' : 'Salin Link'}</span>
                          </button>
                          <a
                            href={buildApprovalWhatsAppUrl(req)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Kirim via WA</span>
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
