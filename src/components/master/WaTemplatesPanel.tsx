/**
 * Master Admin Panel — Custom WhatsApp Message Templates Manager
 * Features:
 * - Full CRUD (Create / Edit / Toggle Active / Delete)
 * - "+ Tambah Template Custom Baru"
 * - Clickable Dynamic Variable Insertion Chips ({{nama_pemilik}}, {{nama_umkm}}, etc.)
 * - Real-time WhatsApp Bubble Live Preview
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  WA_TEMPLATE_VARIABLES,
  renderWaTemplate,
} from '../../lib/payments/wa-templates';
import type { WaMessageTemplate, WaTemplateCategory } from '../../types/domain';

interface WaTemplatesPanelProps {
  authToken?: string;
}

export const WaTemplatesPanel: React.FC<WaTemplatesPanelProps> = ({ authToken }) => {
  const [templates, setTemplates] = useState<WaMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedId, setSelectedId] = useState<string | 'NEW'>('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WaTemplateCategory>('PAYMENT_ASSIST');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    }),
    [authToken]
  );

  const sampleVarMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of WA_TEMPLATE_VARIABLES) {
      map[v.key] = v.sampleValue;
    }
    return map;
  }, []);

  const selectTemplateForEdit = (tpl: WaMessageTemplate) => {
    setSelectedId(tpl.id);
    setCode(tpl.code);
    setTitle(tpl.title);
    setCategory(tpl.category);
    setBodyTemplate(tpl.bodyTemplate);
    setIsActive(tpl.isActive);
    setFeedback(null);
  };

  const startNewTemplate = () => {
    setSelectedId('NEW');
    setCode('CUSTOM_FOLLOWUP_WA');
    setTitle('Template Custom Baru');
    setCategory('PAYMENT_ASSIST');
    setBodyTemplate(
      'Halo {{nama_pemilik}}, pemilik *{{nama_umkm}}*!\n\nKami siap membantu aktivasi pembayaran {{provider}} ke rekening {{nama_bank}} a.n. {{nama_rekening}}.\n\n⚠️ Demi keamanan, mohon jangan pernah membagikan Password, PIN, atau Kode OTP kepada siapa pun.'
    );
    setIsActive(true);
    setFeedback(null);
  };

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/master/wa-templates', { headers });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Gagal memuat template WhatsApp.');
      }
      const json = (await res.json()) as { templates: WaMessageTemplate[] };
      setTemplates(json.templates || []);
      if (json.templates?.length > 0 && !selectedId) {
        selectTemplateForEdit(json.templates[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat template WA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertVariableChip = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBodyTemplate((prev) => `${prev}${prev ? ' ' : ''}${token}`);
      return;
    }
    const start = el.selectionStart ?? bodyTemplate.length;
    const end = el.selectionEnd ?? bodyTemplate.length;
    const next = bodyTemplate.slice(0, start) + token + bodyTemplate.slice(end);
    setBodyTemplate(next);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const isCreate = selectedId === 'NEW' || !selectedId;
      const url = isCreate
        ? '/api/master/wa-templates'
        : `/api/master/wa-templates/${encodeURIComponent(selectedId)}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify({
          code: code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          title: title.trim(),
          category,
          bodyTemplate,
          isActive,
        }),
      });
      const json = (await res.json()) as { template?: WaMessageTemplate; error?: string };
      if (!res.ok || !json.template) {
        throw new Error(json.error || 'Gagal menyimpan template WA.');
      }
      setFeedback({
        type: 'success',
        text: isCreate
          ? `Template custom "${json.template.title}" berhasil dibuat!`
          : `Perubahan template "${json.template.title}" berhasil disimpan.`,
      });
      await loadTemplates();
      selectTemplateForEdit(json.template);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan template.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/master/wa-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Gagal menghapus template.');
      setFeedback({ type: 'success', text: 'Template WA berhasil dihapus.' });
      setSelectedId('');
      await loadTemplates();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus template.',
      });
    }
  };

  const renderedPreview = renderWaTemplate(bodyTemplate, sampleVarMap, true);

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
        Memuat Template Pesan WhatsApp...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2">
        <p className="text-sm font-semibold text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void loadTemplates()}
          className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  return (
    <div data-testid="wa-templates-panel" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-emerald-600" />
            Template Pesan WhatsApp Custom
          </h2>
          <p className="text-xs text-slate-600">
            Atur isi pesan WA profesional untuk panduan aktivasi Midtrans &amp; persetujuan Demo.
            Klik chip variabel agar otomatis terisi data UMKM saat kirim WA!
          </p>
        </div>

        <button
          type="button"
          data-testid="btn-new-wa-template"
          onClick={startNewTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-bold hover:bg-emerald-700 shadow-sm"
        >
          <Plus className="w-4 h-4" />+ Tambah Template Custom Baru
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Template List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-2 pt-1">
            Daftar Template ({templates.length})
          </p>
          {templates.map((tpl) => {
            const active = selectedId === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  active
                    ? 'border-emerald-500 bg-emerald-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => selectTemplateForEdit(tpl)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{tpl.title}</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{tpl.code}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                      tpl.category === 'PAYMENT_ASSIST'
                        ? 'bg-indigo-100 text-indigo-700'
                        : tpl.category === 'DEMO'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tpl.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Editor + Live WhatsApp Preview */}
        <div className="lg:col-span-8 space-y-4">
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kode Unik</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PAYMENT_ASSIST_GREETING"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Template</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Judul mudah dikenali"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as WaTemplateCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                >
                  <option value="PAYMENT_ASSIST">Bantuan Pembayaran</option>
                  <option value="DEMO">Akses Demo</option>
                  <option value="GENERAL">Umum / Follow-Up</option>
                </select>
              </div>
            </div>

            {/* Clickable Variable Insertion Chips */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Klik Variabel untuk Menyisipkan ke Pesan:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WA_TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariableChip(v.token)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-semibold hover:bg-emerald-100 transition-colors"
                    title={`Contoh: ${v.sampleValue}`}
                  >
                    {v.token}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Isi Pesan Template WhatsApp
              </label>
              <textarea
                ref={textareaRef}
                rows={7}
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                Aktif digunakan di antrean tiket
              </label>

              <div className="flex items-center gap-2">
                {selectedId && selectedId !== 'NEW' && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(selectedId)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Menyimpan...' : 'Simpan Template'}
                </button>
              </div>
            </div>
          </form>

          {/* Live WhatsApp Preview Card */}
          <div
            data-testid="wa-live-preview"
            className="bg-[#e5ddd5] border border-slate-300 rounded-2xl p-4 sm:p-5 space-y-2"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span>Live Preview Pesan WhatsApp (Data Simulasi UMKM)</span>
              <span className="text-emerald-700">Siap Kirim 1-Klik</span>
            </div>
            <div className="bg-[#dcf8c6] text-slate-900 rounded-2xl rounded-tr-none p-4 shadow-sm max-w-2xl ml-auto text-xs whitespace-pre-wrap leading-relaxed border border-emerald-200/70">
              {renderedPreview}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
