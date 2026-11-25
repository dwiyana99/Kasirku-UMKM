import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdaptiveQuickStartSteps,
  buildDashboardQuickActions,
  buildMobileBottomNavItems,
} from './quick-actions.ts';
import type {
  AddOnModuleCode,
  StaffPermission,
  SubscriptionPlanCode,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  getVerticalMeta,
} from '../verticals/vertical-registry.ts';

const ownerSession = { role: 'CUSTOMER' as const, staffPermissions: undefined };
const cashierOnlySession = {
  role: 'STAFF' as const,
  staffPermissions: ['POS_CASHIER'] as StaffPermission[],
};

describe('Vertical-Adaptive & Plan-Aware Quick Actions Engine', () => {
  it('tailors Dashboard primary actions for Warung Sembako LITE vs Restoran PRO vs Kost', () => {
    const warungLite = buildDashboardQuickActions({
      vertical: 'WARUNG_SEMBAKO',
      plan: 'LITE',
      hasAddOn: () => false,
      session: ownerSession,
    });
    assert.equal(warungLite.length, 3);
    assert.equal(warungLite[0].path, '/pos');
    assert.equal(warungLite[1].path, '/catalog/products');
    assert.equal(warungLite[2].path, '/accounting');
    assert.equal(warungLite[2].label, 'Laporan Laba & Kas');

    const restoPro = buildDashboardQuickActions({
      vertical: 'RESTORAN',
      plan: 'PRO',
      hasAddOn: (code: AddOnModuleCode) =>
        code === 'ADDON_ACCOUNTING_PRO' || code === 'ADDON_RESTO_QR_KDS',
      session: ownerSession,
    });
    assert.equal(restoPro[1].shortLabel, 'Menu');
    assert.equal(restoPro[2].label, 'Laporan Keuangan');

    const kost = buildDashboardQuickActions({
      vertical: 'KOST_KONTRAKAN',
      plan: 'BASIC',
      hasAddOn: () => false,
      session: ownerSession,
    });
    assert.equal(kost[0].path, '/kost');
    assert.equal(kost[1].path, '/transactions');
    assert.equal(kost[2].path, '/accounting');
  });

  it('enforces staff RBAC permissions on Mobile Bottom Nav without exposing Accounting to cashiers', () => {
    const cashierNav = buildMobileBottomNavItems({
      vertical: 'WARUNG_SEMBAKO',
      plan: 'PRO',
      hasAddOn: () => true,
      session: {
        role: cashierOnlySession.role,
        staffPermissions: [...cashierOnlySession.staffPermissions],
      },
    });
    assert.equal(
      cashierNav.some((item) => item.path === '/accounting'),
      false,
    );
    assert.equal(
      cashierNav.some((item) => item.path === '/pos'),
      true,
    );
    assert.equal(
      cashierNav.some((item) => item.path === '/transactions'),
      true,
    );
  });

  it('builds accurate adaptive 3-step quick-start checklist for Kost and Resto', () => {
    const kostWs = {
      tenant: {
        id: 't-kost',
        vertical: 'KOST_KONTRAKAN',
        settings: { businessWhatsappNumber: '628123456789' },
      },
      products: [],
      boardingRooms: [{ id: 'r1' }],
      boardingTenants: [],
    } as unknown as TenantWorkspaceData;

    const kostSteps = buildAdaptiveQuickStartSteps({
      workspace: kostWs,
      plan: 'BASIC',
      hasAddOn: () => false,
      orderCount: 0,
    });
    assert.equal(kostSteps.length, 3);
    assert.equal(kostSteps[0].done, true);
    assert.equal(kostSteps[1].done, false);
    assert.equal(kostSteps[2].done, true);
  });

  it('audits all 22 active UMKM verticals across LITE/BASIC/PRO/EXPERT for route & onboarding relevance', () => {
    const plans: SubscriptionPlanCode[] = ['LITE', 'BASIC', 'PRO', 'EXPERT'];
    assert.equal(ACTIVE_VERTICAL_DEFINITIONS.length, 22);

    for (const meta of ACTIVE_VERTICAL_DEFINITIONS) {
      for (const plan of plans) {
        const actions = buildDashboardQuickActions({
          vertical: meta.id,
          plan,
          hasAddOn: () => plan === 'PRO' || plan === 'EXPERT',
          session: ownerSession,
        });
        assert.equal(actions.length, 3, `${meta.id} (${plan}) should have 3 primary actions`);

        if (!meta.supportsPos) {
          assert.equal(
            actions.some((a) => a.path === '/pos'),
            false,
            `Non-POS vertical ${meta.id} (${plan}) must not route primary actions to /pos`,
          );
        }

        const dummyWs = {
          tenant: {
            id: `t-${meta.id}`,
            vertical: meta.id,
            settings: { businessWhatsappNumber: '' },
          },
          products: [],
          boardingRooms: [],
          boardingTenants: [],
          agroBatches: [],
          verticalOps: {},
        } as unknown as TenantWorkspaceData;

        const steps = buildAdaptiveQuickStartSteps({
          workspace: dummyWs,
          plan,
          hasAddOn: () => false,
          orderCount: 0,
        });
        assert.equal(steps.length, 3, `${meta.id} (${plan}) should have 3 onboarding steps`);

        if (!getVerticalMeta(meta.id).supportsCatalog) {
          const joined = steps.map((s) => `${s.title} ${s.description}`).join(' ');
          assert.equal(
            joined.includes('CSV'),
            false,
            `Non-catalog vertical ${meta.id} must not show CSV import prompt`,
          );
        }
      }
    }
  });
});
