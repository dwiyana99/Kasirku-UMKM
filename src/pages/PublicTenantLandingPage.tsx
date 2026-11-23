/**
 * KasirAkun UMKM — Public UMKM Landing Page (`/toko/:slug`)
 * Loads safe public storefront payload from `/api/public/toko/:slug`,
 * sets dynamic document title & meta description, and handles Loading, 404/Unpublished, Error & Success states.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Store } from 'lucide-react';
import { PublicStorefrontView } from '../components/landing/PublicStorefrontView';
import { useApp } from '../context/AppContext';
import type { PublicTenantLandingPayload } from '../types/domain';

interface PublicTenantLandingPageProps {
  slug: string;
}

export function PublicTenantLandingPage({ slug }: PublicTenantLandingPageProps) {
  const { session, navigate } = useApp();
  const [state, setState] = useState<'loading' | 'success' | 'not_found' | 'error'>('loading');
  const [payload, setPayload] = useState<PublicTenantLandingPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadStorefront = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const isPreview = searchParams.get('preview') === '1' || searchParams.get('preview') === 'true';
      const url = `/api/public/toko/${encodeURIComponent(slug)}${isPreview ? '?preview=1' : ''}`;
      const res = await fetch(url, {
        headers: isPreview && session.token ? { Authorization: `Bearer ${session.token}` } : {},
      });
      if (res.status === 404) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(
          body.error || 'Halaman usaha tidak ditemukan atau belum dipublikasikan oleh pemiliknya.'
        );
        setState('not_found');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error || 'Terjadi gangguan saat memuat halaman usaha.');
        setState('error');
        return;
      }
      const data = (await res.json()) as PublicTenantLandingPayload;
      setPayload(data);
      setState('success');
    } catch {
      setErrorMessage('Koneksi terputus saat memuat halaman usaha. Silakan coba lagi.');
      setState('error');
    }
  }, [slug, session.token]);

  useEffect(() => {
    void loadStorefront();
  }, [loadStorefront]);

  // Dynamic SEO title & meta description per UMKM storefront
  useEffect(() => {
    if (!payload) return;
    const prevTitle = document.title;
    const seoTitle =
      payload.landingPage.seoTitle ||
      `${payload.landingPage.heroTitle || payload.tenant.name} | KasirAkun UMKM`;
    const seoDesc =
      payload.landingPage.seoDescription ||
      payload.landingPage.heroSubtitle ||
      `Profil dan katalog resmi ${payload.tenant.name}.`;

    document.title = seoTitle;
    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', seoDesc);

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) {
        metaDesc.setAttribute('content', prevDesc);
      }
    };
  }, [payload]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAFAF9]">
        <div className="border-b border-stone-200 bg-white h-16 px-6 flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-stone-200 animate-pulse" />
            <div className="space-y-1.5">
              <div className="w-36 h-3.5 bg-stone-200 rounded animate-pulse" />
              <div className="w-24 h-2.5 bg-stone-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="w-24 h-8 rounded-lg bg-stone-200 animate-pulse" />
        </div>
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-4">
            <div className="w-28 h-3 bg-stone-200 rounded animate-pulse" />
            <div className="w-3/4 h-10 bg-stone-200 rounded animate-pulse" />
            <div className="w-full h-16 bg-stone-100 rounded animate-pulse" />
            <div className="w-44 h-11 bg-stone-200 rounded-lg animate-pulse" />
          </div>
          <div className="lg:col-span-5 aspect-[4/3] rounded-xl bg-stone-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (state === 'not_found') {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center">
            <Store className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-stone-900">Halaman Usaha Tidak Tersedia</h1>
            <p className="text-xs text-stone-600 leading-relaxed">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Kembali ke KasirAkun UMKM</span>
          </button>
        </div>
      </div>
    );
  }

  if (state === 'error' || !payload) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-xl p-8 text-center space-y-4">
          <h1 className="text-lg font-bold text-stone-900">Gagal Memuat Halaman</h1>
          <p className="text-xs text-stone-600 leading-relaxed">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void loadStorefront()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Coba Lagi</span>
          </button>
        </div>
      </div>
    );
  }

  return <PublicStorefrontView payload={payload} />;
}
