import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  LogOut,
  MessageCircle,
  Plus,
  Receipt,
  Trash2,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModalShell } from '../components/ui/ModalShell';
import { OwnerWaReminderModal } from '../components/whatsapp/OwnerWaReminderModal';
import { UnifiedWaActionButton } from '../components/whatsapp/UnifiedWaActionButton';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import { calculateBoardingInvoice } from '../lib/verticals/kost-agro-engine';
import {
  DEFAULT_KOST_ADDON_CATALOG,
  DEFAULT_KOST_INCLUDED_FACILITIES,
  classifyKostInvoiceBucket,
  classifyKostTenantBucket,
  computeFacilityAddOnsTotal,
  computePerDayLateFee,
  computePrepaidDueDate,
  computePrepaidRentAmount,
  formatAddOnsSummary,
  inferDefaultIncludedFacilitiesFromRoom,
  matchesKostTenantFilter,
  resolveAddOnEffectiveMonths,
  type KostDueAlertFilter,
  type KostInvoiceStatusFilter,
  type KostTenantStatusFilter,
} from '../lib/verticals/kost-facilities';
import { resolveEffectiveRegionalTax } from '../lib/tax/regional-tax-indonesia';
import { evaluateWhatsappSendingPolicy } from '../lib/messaging/whatsapp-policy';
import { canAccessRouteWithStaffPermissions } from '../lib/rbac/staff-rbac';
import {
  computeDueCountdown,
  formatDateIndo,
  formatMonthIndo,
  getTodayIsoDate,
  resolveBoardingDueDate,
} from '../lib/date/indonesia-date';
import type {
  BoardingAddOnDurationMode,
  BoardingBillingCycle,
  BoardingFacilityAddOn,
  BoardingInvoice,
  BoardingRoom,
  BoardingRoomStatus,
  BoardingTenant,
} from '../types/domain';

type KostTab = 'ROOMS' | 'TENANTS' | 'INVOICES';

function buildKostReminderMessage(params: {
  businessName: string;
  tenantName: string;
  roomNumber: string;
  billingCycle: BoardingBillingCycle;
  dueDateIso?: string | null;
  periodLabel: string;
  totalAmount: string;
  countdownLabel: string;
}): string {
  const cycleText = params.billingCycle === 'TAHUNAN' ? 'Sewa Tahunan' : 'Sewa Bulanan';
  const dueText = params.dueDateIso ? formatDateIndo(params.dueDateIso) : 'Bulan ini';
  return [
    `Halo Kak ${params.tenantName},`,
    `Pengingat pembayaran *${cycleText}* Kamar ${params.roomNumber} di *${params.businessName}*.`,
    ``,
    `Periode: ${params.periodLabel}`,
    `Jatuh Tempo: ${dueText} (${params.countdownLabel})`,
    `Total Tagihan: *${formatRupiah(params.totalAmount)}*`,
    ``,
    `Mohon konfirmasi jika sudah melakukan pembayaran. Terima kasih banyak!`,
  ].join('\n');
}

export function KostManagementPage() {
  const {
    activeWorkspace,
    addBoardingRoom,
    updateBoardingRoomStatus,
    checkInBoardingTenant,
    checkOutBoardingTenant,
    createBoardingInvoice,
    payBoardingInvoice,
    hasAddOn,
    navigate,
    session,
    regionalTaxRegistry,
  } = useApp();

  const rooms = activeWorkspace.boardingRooms ?? [];
  const tenants = activeWorkspace.boardingTenants ?? [];
  const invoices = activeWorkspace.boardingInvoices ?? [];

  const hasAccountingOrTax =
    hasAddOn('ADDON_ACCOUNTING_PRO') || hasAddOn('ADDON_TAX_CORETAX');
  const canOpenSettings = canAccessRouteWithStaffPermissions(
    '/settings/custom-fields',
    session
  );

  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: activeWorkspace.tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [activeWorkspace.tenant.settings?.businessWhatsappNumber, hasAddOn]
  );

  const [activeTab, setActiveTab] = useState<KostTab>('ROOMS');
  const [roomFilter, setRoomFilter] = useState<'ALL' | BoardingRoomStatus>('ALL');
  const [dueAlertFilter, setDueAlertFilter] = useState<KostDueAlertFilter>('ALL');
  const [tenantFilter, setTenantFilter] = useState<KostTenantStatusFilter>('ALL');
  const [invoiceFilter, setInvoiceFilter] = useState<KostInvoiceStatusFilter>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [waReminderModalOpen, setWaReminderModalOpen] = useState(false);

  // Modal: Add Room
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomType, setRoomType] = useState('Standar AC');
  const [monthlyRate, setMonthlyRate] = useState('1500000');
  const [yearlyRate, setYearlyRate] = useState('16500000');
  const [roomIncludedFacilities, setRoomIncludedFacilities] = useState<string[]>([
    ...DEFAULT_KOST_INCLUDED_FACILITIES,
  ]);
  const [roomNotes, setRoomNotes] = useState('');

  // Modal: Check-In Tenant
  const todayIso = getTodayIsoDate();
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [nikKtp, setNikKtp] = useState('');
  const [phoneWa, setPhoneWa] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [checkInDate, setCheckInDate] = useState(todayIso);
  const [billingCycle, setBillingCycle] = useState<BoardingBillingCycle>('BULANAN');
  const [checkInMonthsPaid, setCheckInMonthsPaid] = useState<number>(1);
  const [collectOpeningRentNow, setCollectOpeningRentNow] = useState<boolean>(true);
  const [nextDueDate, setNextDueDate] = useState(
    computePrepaidDueDate(todayIso, 1)
  );
  const [depositAmount, setDepositAmount] = useState('1000000');
  const [depositPayAcc, setDepositPayAcc] = useState<'1101' | '1102'>('1102');
  const [checkInIncludedFacilities, setCheckInIncludedFacilities] = useState<string[]>([
    ...DEFAULT_KOST_INCLUDED_FACILITIES,
  ]);
  const [checkInAddOns, setCheckInAddOns] = useState<BoardingFacilityAddOn[]>([]);
  const [newCheckInAddOnName, setNewCheckInAddOnName] = useState('');
  const [newCheckInAddOnFee, setNewCheckInAddOnFee] = useState('');

  // Modal: Create Invoice / Renewal (Fleksibel 1-24 Bulan + Denda Per Hari Opsional)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invTenantId, setInvTenantId] = useState('');
  const [invCycle, setInvCycle] = useState<BoardingBillingCycle>('BULANAN');
  const [invMonthsCount, setInvMonthsCount] = useState<number>(1);
  const [invPeriod, setInvPeriod] = useState(todayIso.slice(0, 7));
  const [invDueDate, setInvDueDate] = useState(todayIso);
  const [invRentAmount, setInvRentAmount] = useState('1500000');
  const [invAddOns, setInvAddOns] = useState<BoardingFacilityAddOn[]>([]);
  const [persistRenewalAddOns, setPersistRenewalAddOns] = useState(true);
  const [newInvAddOnName, setNewInvAddOnName] = useState('');
  const [newInvAddOnFee, setNewInvAddOnFee] = useState('');
  const [invApplyLateFee, setInvApplyLateFee] = useState(false);
  const [invLateFeePerDay, setInvLateFeePerDay] = useState('25000');
  const [invLateFee, setInvLateFee] = useState('0');

  // Modal: Confirm Pay Invoice
  const [payModalInv, setPayModalInv] = useState<BoardingInvoice | null>(null);
  const [payAccountCode, setPayAccountCode] = useState<'1101' | '1102'>('1102');

  // Modal: Confirm Check-Out
  const [checkOutTarget, setCheckOutTarget] = useState<BoardingTenant | null>(null);

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const activeTenants = useMemo(
    () => tenants.filter((t) => t.isActive),
    [tenants]
  );

  const roomById = useMemo(
    () => new Map(rooms.map((r) => [r.id, r])),
    [rooms]
  );

  const activeTenantByRoomId = useMemo(() => {
    const map = new Map<string, BoardingTenant>();
    for (const t of activeTenants) {
      if (t.roomId) map.set(t.roomId, t);
    }
    return map;
  }, [activeTenants]);

  const unpaidInvoiceByTenantId = useMemo(() => {
    const map = new Map<string, BoardingInvoice>();
    for (const inv of invoices) {
      if (inv.paymentStatus !== 'PAID' && !map.has(inv.boardingTenantId)) {
        map.set(inv.boardingTenantId, inv);
      }
    }
    return map;
  }, [invoices]);

  const dueAlertItems = useMemo(() => {
    const list: Array<{
      tenant: BoardingTenant;
      room: BoardingRoom | undefined;
      unpaidInvoice: BoardingInvoice | undefined;
      dueDateIso: string | undefined;
      countdown: ReturnType<typeof computeDueCountdown>;
      billingCycle: BoardingBillingCycle;
      amountEstimate: string;
    }> = [];

    for (const t of activeTenants) {
      const room = t.roomId ? roomById.get(t.roomId) : undefined;
      const unpaidInv = unpaidInvoiceByTenantId.get(t.id);
      const cycle: BoardingBillingCycle =
        unpaidInv?.billingCycle ?? t.billingCycle ?? 'BULANAN';
      const dueDateIso = resolveBoardingDueDate({
        explicitDueDate: unpaidInv?.dueDate ?? t.nextDueDate,
        checkInDate: t.checkInDate,
        billingCycle: cycle,
        periodMonth: unpaidInv?.periodMonth,
      });
      const countdown = computeDueCountdown(dueDateIso);

      if (
        unpaidInv ||
        countdown.status === 'OVERDUE' ||
        countdown.status === 'DUE_TODAY' ||
        countdown.status === 'DUE_SOON'
      ) {
        const monthly = room?.monthlyRate ?? room?.monthlyPrice ?? '0';
        const yearly =
          room?.yearlyRate ??
          room?.annualPrice ??
          new Decimal(monthly).times(11).toFixed(4);
        const amountEstimate =
          unpaidInv?.totalAmount ?? (cycle === 'TAHUNAN' ? yearly : monthly);

        list.push({
          tenant: t,
          room,
          unpaidInvoice: unpaidInv,
          dueDateIso,
          countdown,
          billingCycle: cycle,
          amountEstimate,
        });
      }
    }

    return list.sort((a, b) => {
      const da = a.countdown.daysRemaining ?? 999;
      const db = b.countdown.daysRemaining ?? 999;
      return da - db;
    });
  }, [activeTenants, roomById, unpaidInvoiceByTenantId]);

  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter((r) => r.status === 'OCCUPIED').length;
    const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE').length;
    const occupancyPct =
      totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const totalDeposits = activeTenants.reduce(
      (sum, t) => sum.plus(new Decimal(t.depositAmount || '0')),
      new Decimal(0)
    );
    const unpaidInvoices = invoices.filter((i) => i.paymentStatus !== 'PAID');
    const unpaidAmount = unpaidInvoices.reduce(
      (sum, i) => sum.plus(new Decimal(i.totalAmount || '0')),
      new Decimal(0)
    );
    const totalPph42 = invoices
      .filter((i) => i.paymentStatus === 'PAID')
      .reduce((sum, i) => sum.plus(new Decimal(i.pph42Amount || '0')), new Decimal(0));

    return {
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancyPct,
      totalDeposits: totalDeposits.toFixed(4),
      unpaidCount: unpaidInvoices.length,
      unpaidAmount: unpaidAmount.toFixed(4),
      totalPph42: totalPph42.toFixed(4),
      dueAlertCount: dueAlertItems.length,
    };
  }, [rooms, activeTenants, invoices, dueAlertItems.length]);

  const availableRoomsList = useMemo(
    () => rooms.filter((r) => r.status === 'AVAILABLE'),
    [rooms]
  );

  const filteredRooms = useMemo(
    () =>
      roomFilter === 'ALL'
        ? rooms
        : rooms.filter((r) => r.status === roomFilter),
    [rooms, roomFilter]
  );

  const effectiveRegionalTax = useMemo(
    () =>
      resolveEffectiveRegionalTax(
        'KOST_KONTRAKAN',
        activeWorkspace.tenant.settings?.regionalTax,
        regionalTaxRegistry
      ),
    [activeWorkspace.tenant.settings?.regionalTax, regionalTaxRegistry]
  );

  const openCheckInForRoom = (roomId?: string) => {
    const targetRoomId = roomId || availableRoomsList[0]?.id || '';
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    const today = getTodayIsoDate();
    setSelectedRoomId(targetRoomId);
    setCheckInDate(today);
    setBillingCycle('BULANAN');
    setCheckInMonthsPaid(1);
    setCollectOpeningRentNow(true);
    setNextDueDate(computePrepaidDueDate(today, 1));
    setCheckInIncludedFacilities(inferDefaultIncludedFacilitiesFromRoom(targetRoom));
    setCheckInAddOns([]);
    setNewCheckInAddOnName('');
    setNewCheckInAddOnFee('');
    setShowCheckInModal(true);
  };

  const handleSelectCheckInRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    const rm = rooms.find((r) => r.id === roomId);
    setCheckInIncludedFacilities(inferDefaultIncludedFacilitiesFromRoom(rm));
  };

  const toggleFacilityItem = (
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    item: string
  ) => {
    setter(list.includes(item) ? list.filter((f) => f !== item) : [...list, item]);
  };

  const handleCheckInDateOrCycleChange = (
    nextDate: string,
    nextCycle: BoardingBillingCycle
  ) => {
    const defaultMonths = nextCycle === 'TAHUNAN' ? 12 : 1;
    setCheckInDate(nextDate);
    setBillingCycle(nextCycle);
    setCheckInMonthsPaid(defaultMonths);
    setNextDueDate(computePrepaidDueDate(nextDate, defaultMonths));
  };

  const handleCheckInMonthsChange = (rawMonths: number) => {
    const safeMonths = Math.max(1, Math.min(24, Math.floor(rawMonths || 1)));
    setCheckInMonthsPaid(safeMonths);
    setBillingCycle(safeMonths >= 12 ? 'TAHUNAN' : 'BULANAN');
    setNextDueDate(computePrepaidDueDate(checkInDate, safeMonths));
  };

  const buildPeriodLabelForMonths = (monthsCount: number, baseDueIso?: string): string => {
    const refIso = baseDueIso && /^\d{4}-\d{2}/.test(baseDueIso) ? baseDueIso : getTodayIsoDate();
    const year = Number(refIso.slice(0, 4)) || new Date().getFullYear();
    if (monthsCount === 12) {
      return `TAHUNAN-${year}-${year + 1}`;
    }
    if (monthsCount > 1) {
      return `${refIso.slice(0, 7)} (${monthsCount} Bln)`;
    }
    return refIso.slice(0, 7);
  };

  const openCreateInvoiceForTenant = (tenantId?: string) => {
    const bt =
      activeTenants.find((t) => t.id === tenantId) ?? activeTenants[0] ?? null;
    if (!bt) {
      showNotice('Belum ada penghuni aktif. Lakukan Check-In penghuni terlebih dahulu.');
      return;
    }
    const rm = bt.roomId ? roomById.get(bt.roomId) : undefined;
    const cycle: BoardingBillingCycle = bt.billingCycle ?? 'BULANAN';
    const defaultMonths = cycle === 'TAHUNAN' ? 12 : 1;
    const mRate = rm?.monthlyRate ?? rm?.monthlyPrice ?? '1500000';
    const yRate = rm?.yearlyRate ?? rm?.annualPrice;
    const dueIso = bt.nextDueDate || getTodayIsoDate();

    setInvTenantId(bt.id);
    setInvCycle(cycle);
    setInvMonthsCount(defaultMonths);
    setInvPeriod(buildPeriodLabelForMonths(defaultMonths, dueIso));
    setInvDueDate(dueIso);
    setInvRentAmount(
      new Decimal(
        computePrepaidRentAmount({
          monthlyRate: mRate,
          yearlyRate: yRate,
          monthsCount: defaultMonths,
        })
      ).toFixed(0)
    );
    setInvAddOns((bt.facilityAddOns ?? []).map((a) => ({ ...a })));
    setPersistRenewalAddOns(true);
    setNewInvAddOnName('');
    setNewInvAddOnFee('');
    setInvApplyLateFee(false);
    setInvLateFeePerDay('25000');
    setInvLateFee('0');
    setShowInvoiceModal(true);
  };

  const handleInvoiceTenantChange = (tenantId: string) => {
    setInvTenantId(tenantId);
    const bt = activeTenants.find((t) => t.id === tenantId);
    if (!bt) return;
    const rm = bt.roomId ? roomById.get(bt.roomId) : undefined;
    const cycle: BoardingBillingCycle = bt.billingCycle ?? 'BULANAN';
    const defaultMonths = cycle === 'TAHUNAN' ? 12 : 1;
    const mRate = rm?.monthlyRate ?? rm?.monthlyPrice ?? '1500000';
    const yRate = rm?.yearlyRate ?? rm?.annualPrice;
    const dueIso = bt.nextDueDate || getTodayIsoDate();

    setInvCycle(cycle);
    setInvMonthsCount(defaultMonths);
    setInvPeriod(buildPeriodLabelForMonths(defaultMonths, dueIso));
    setInvDueDate(dueIso);
    setInvRentAmount(
      new Decimal(
        computePrepaidRentAmount({
          monthlyRate: mRate,
          yearlyRate: yRate,
          monthsCount: defaultMonths,
        })
      ).toFixed(0)
    );
    setInvAddOns((bt.facilityAddOns ?? []).map((a) => ({ ...a })));
    setInvApplyLateFee(false);
    setInvLateFee('0');
  };

  const handleInvoiceMonthsChange = (rawMonths: number) => {
    const safeMonths = Math.max(1, Math.min(24, Math.floor(rawMonths || 1)));
    const nextCycle: BoardingBillingCycle = safeMonths >= 12 ? 'TAHUNAN' : 'BULANAN';
    const bt = activeTenants.find((t) => t.id === invTenantId);
    const rm = bt?.roomId ? roomById.get(bt.roomId) : undefined;
    const mRate = rm?.monthlyRate ?? rm?.monthlyPrice ?? '1500000';
    const yRate = rm?.yearlyRate ?? rm?.annualPrice;

    setInvMonthsCount(safeMonths);
    setInvCycle(nextCycle);
    setInvPeriod(buildPeriodLabelForMonths(safeMonths, invDueDate));
    setInvRentAmount(
      new Decimal(
        computePrepaidRentAmount({
          monthlyRate: mRate,
          yearlyRate: yRate,
          monthsCount: safeMonths,
        })
      ).toFixed(0)
    );
  };

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim()) return;
    addBoardingRoom({
      roomNumber,
      roomType,
      monthlyRate,
      yearlyRate: yearlyRate || undefined,
      includedFacilities: roomIncludedFacilities,
      notes: roomNotes || undefined,
    });
    setRoomNumber('');
    setRoomNotes('');
    setRoomIncludedFacilities([...DEFAULT_KOST_INCLUDED_FACILITIES]);
    setShowRoomModal(false);
    showNotice(`Kamar ${roomNumber} berhasil ditambahkan ke peta kamar.`);
  };

  const selectedCheckInRoom = rooms.find((r) => r.id === selectedRoomId);
  const checkInRentTotal = useMemo(() => {
    const mRate = selectedCheckInRoom?.monthlyRate ?? selectedCheckInRoom?.monthlyPrice ?? '0';
    const yRate = selectedCheckInRoom?.yearlyRate ?? selectedCheckInRoom?.annualPrice;
    return computePrepaidRentAmount({
      monthlyRate: mRate,
      yearlyRate: yRate,
      monthsCount: checkInMonthsPaid,
    });
  }, [selectedCheckInRoom, checkInMonthsPaid]);

  const checkInAddOnsTotal = useMemo(
    () => computeFacilityAddOnsTotal(checkInAddOns, checkInMonthsPaid),
    [checkInAddOns, checkInMonthsPaid]
  );

  const checkInRegionalTaxAmount = useMemo(() => {
    if (!effectiveRegionalTax.applies || Number(effectiveRegionalTax.rateDecimal) <= 0) {
      return '0.0000';
    }
    return new Decimal(checkInRentTotal)
      .plus(checkInAddOnsTotal)
      .times(effectiveRegionalTax.rateDecimal)
      .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      .toFixed(4);
  }, [effectiveRegionalTax, checkInRentTotal, checkInAddOnsTotal]);

  const checkInUpfrontGrandTotal = useMemo(() => {
    const dep = new Decimal(depositAmount || '0');
    if (!collectOpeningRentNow) return dep.toFixed(4);
    return dep
      .plus(checkInRentTotal)
      .plus(checkInAddOnsTotal)
      .plus(checkInRegionalTaxAmount)
      .toFixed(4);
  }, [depositAmount, collectOpeningRentNow, checkInRentTotal, checkInAddOnsTotal, checkInRegionalTaxAmount]);

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !tenantName.trim()) return;
    checkInBoardingTenant({
      roomId: selectedRoomId,
      fullName: tenantName,
      nikKtp,
      phoneWa,
      emergencyContact,
      checkInDate,
      billingCycle,
      monthsPaid: checkInMonthsPaid,
      collectOpeningRentNow,
      openingRentAmount: checkInRentTotal,
      nextDueDate,
      depositAmount,
      paymentAccountCode: depositPayAcc,
      includedFacilities: checkInIncludedFacilities,
      facilityAddOns: checkInAddOns,
    });
    setTenantName('');
    setNikKtp('');
    setPhoneWa('');
    setEmergencyContact('');
    setCheckInAddOns([]);
    setShowCheckInModal(false);
    showNotice(
      `Check-In ${tenantName} (${checkInMonthsPaid} bulan di muka${collectOpeningRentNow ? ', sewa awal tercatat lunas' : ''}) berhasil. Jatuh tempo berikutnya: ${formatDateIndo(nextDueDate)}.`
    );
  };

  const invAddOnsTotal = useMemo(
    () => computeFacilityAddOnsTotal(invAddOns, invMonthsCount),
    [invAddOns, invMonthsCount]
  );

  const invOverdueDays = useMemo(() => {
    const cd = computeDueCountdown(invDueDate);
    if (cd.status === 'OVERDUE' && cd.daysRemaining !== null) {
      return Math.abs(cd.daysRemaining);
    }
    return 0;
  }, [invDueDate]);

  const invEffectiveLateFee = useMemo(() => {
    if (!invApplyLateFee) return '0';
    if (invOverdueDays > 0) {
      return new Decimal(
        computePerDayLateFee({
          daysOverdue: invOverdueDays,
          dailyFee: invLateFeePerDay || '0',
          enabled: true,
        })
      ).toFixed(0);
    }
    return invLateFee || '0';
  }, [invApplyLateFee, invOverdueDays, invLateFeePerDay, invLateFee]);

  const invRegionalTaxAmount = useMemo(() => {
    if (!effectiveRegionalTax.applies || Number(effectiveRegionalTax.rateDecimal) <= 0) {
      return '0.0000';
    }
    return new Decimal(invRentAmount || '0')
      .plus(invAddOnsTotal || '0')
      .plus(invEffectiveLateFee || '0')
      .times(effectiveRegionalTax.rateDecimal)
      .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      .toFixed(4);
  }, [effectiveRegionalTax, invRentAmount, invAddOnsTotal, invEffectiveLateFee]);

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const bt = activeTenants.find((t) => t.id === invTenantId);
    if (!bt || !bt.roomId) return;
    createBoardingInvoice({
      roomId: bt.roomId,
      boardingTenantId: bt.id,
      periodMonth: invPeriod,
      billingCycle: invCycle,
      monthsCount: invMonthsCount,
      dueDate: invDueDate,
      rentAmount: invRentAmount,
      utilityFee: invAddOnsTotal,
      facilityAddOns: invAddOns,
      persistAddOnsToTenant: persistRenewalAddOns,
      lateFee: invEffectiveLateFee,
      lateFeePerDay: invApplyLateFee && invOverdueDays > 0 ? invLateFeePerDay : undefined,
      daysOverdue: invApplyLateFee && invOverdueDays > 0 ? invOverdueDays : undefined,
    });
    setShowInvoiceModal(false);
    setActiveTab('INVOICES');
    showNotice(
      `Tagihan perpanjangan ${invMonthsCount} bulan untuk ${bt.fullName} (jatuh tempo ${formatDateIndo(invDueDate)}) berhasil diterbitkan.`
    );
  };

  const handleConfirmPay = () => {
    if (!payModalInv) return;
    payBoardingInvoice(payModalInv.id, payAccountCode);
    setPayModalInv(null);
    showNotice(
      'Pembayaran sewa berhasil dicatat lunas dan tanggal jatuh tempo berikutnya sudah maju otomatis.'
    );
  };

  const handleConfirmCheckOut = () => {
    if (!checkOutTarget) return;
    const name = checkOutTarget.fullName;
    checkOutBoardingTenant(checkOutTarget.id);
    setCheckOutTarget(null);
    showNotice(`Penghuni ${name} sudah Check-Out. Kamar kini berstatus Kosong & siap disewakan.`);
  };

  const invPreview = useMemo(
    () =>
      calculateBoardingInvoice({
        rentAmount: invRentAmount || '0',
        utilityFee: invAddOnsTotal || '0',
        lateFee: invEffectiveLateFee || '0',
        regionalTaxRate: effectiveRegionalTax.applies ? effectiveRegionalTax.rateDecimal : '0',
      }),
    [invRentAmount, invAddOnsTotal, invEffectiveLateFee, effectiveRegionalTax]
  );

  const selectedInvTenant = activeTenants.find((t) => t.id === invTenantId);
  const selectedInvRoom = selectedInvTenant?.roomId
    ? roomById.get(selectedInvTenant.roomId)
    : undefined;
  const selectedInvIncludedFacilities = useMemo(
    () =>
      selectedInvTenant?.includedFacilities && selectedInvTenant.includedFacilities.length > 0
        ? selectedInvTenant.includedFacilities
        : inferDefaultIncludedFacilitiesFromRoom(selectedInvRoom),
    [selectedInvRoom, selectedInvTenant]
  );

  // Mutually exclusive status classification (no overlap between Telat Bayar and Belum Bayar)
  const dueAlertCounts = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let soon = 0;
    for (const item of dueAlertItems) {
      const b = classifyKostTenantBucket({
        countdownStatus: item.countdown.status,
        unpaidInvoice: item.unpaidInvoice,
      });
      if (b === 'OVERDUE') overdue++;
      else if (b === 'DUE_TODAY') today++;
      else if (b === 'DUE_SOON') soon++;
    }
    return { all: dueAlertItems.length, overdue, today, soon };
  }, [dueAlertItems]);

  const filteredDueAlertItems = useMemo(() => {
    if (dueAlertFilter === 'ALL') return dueAlertItems;
    return dueAlertItems.filter((item) => {
      const b = classifyKostTenantBucket({
        countdownStatus: item.countdown.status,
        unpaidInvoice: item.unpaidInvoice,
      });
      return b === dueAlertFilter;
    });
  }, [dueAlertItems, dueAlertFilter]);

  const tenantRows = useMemo(() => {
    return activeTenants.map((t) => {
      const rm = t.roomId ? roomById.get(t.roomId) : undefined;
      const cycle: BoardingBillingCycle = t.billingCycle ?? 'BULANAN';
      const unpaidInv = unpaidInvoiceByTenantId.get(t.id);
      const dueIso = resolveBoardingDueDate({
        explicitDueDate: unpaidInv?.dueDate ?? t.nextDueDate,
        checkInDate: t.checkInDate,
        billingCycle: cycle,
        periodMonth: unpaidInv?.periodMonth,
      });
      const countdown = computeDueCountdown(dueIso);
      const bucket = classifyKostTenantBucket({
        countdownStatus: countdown.status,
        unpaidInvoice: unpaidInv,
      });
      const includedFacilities =
        t.includedFacilities && t.includedFacilities.length > 0
          ? t.includedFacilities
          : inferDefaultIncludedFacilitiesFromRoom(rm);
      return {
        tenant: t,
        room: rm,
        cycle,
        unpaidInv,
        dueIso,
        countdown,
        bucket,
        includedFacilities,
      };
    });
  }, [activeTenants, roomById, unpaidInvoiceByTenantId]);

  const tenantFilterCounts = useMemo(() => {
    const counts = {
      ALL: tenantRows.length,
      OVERDUE: 0,
      DUE_TODAY: 0,
      DUE_SOON: 0,
      SAFE: 0,
      BULANAN: 0,
      TAHUNAN: 0,
    };
    for (const row of tenantRows) {
      if (row.bucket === 'OVERDUE') counts.OVERDUE++;
      else if (row.bucket === 'DUE_TODAY') counts.DUE_TODAY++;
      else if (row.bucket === 'DUE_SOON') counts.DUE_SOON++;
      else if (row.bucket === 'SAFE') counts.SAFE++;
      if (row.cycle === 'BULANAN') counts.BULANAN++;
      if (row.cycle === 'TAHUNAN') counts.TAHUNAN++;
    }
    return counts;
  }, [tenantRows]);

  const filteredTenantRows = useMemo(
    () =>
      tenantRows.filter((row) =>
        matchesKostTenantFilter({
          filter: tenantFilter,
          bucket: row.bucket,
          billingCycle: row.cycle,
        })
      ),
    [tenantRows, tenantFilter]
  );

  const invoiceRows = useMemo(() => {
    return invoices.map((inv) => {
      const rm = roomById.get(inv.roomId);
      const bt = tenants.find((t) => t.id === inv.boardingTenantId);
      const cycle: BoardingBillingCycle =
        inv.billingCycle ?? bt?.billingCycle ?? 'BULANAN';
      const periodReadable = formatMonthIndo(inv.periodMonth);
      const dueIso = resolveBoardingDueDate({
        explicitDueDate: inv.dueDate ?? bt?.nextDueDate,
        checkInDate: bt?.checkInDate,
        billingCycle: cycle,
        periodMonth: inv.periodMonth,
      });
      const countdown = computeDueCountdown(dueIso);
      const bucket = classifyKostInvoiceBucket({
        paymentStatus: inv.paymentStatus,
        countdownStatus: countdown.status,
      });
      return { inv, rm, bt, cycle, periodReadable, dueIso, countdown, bucket };
    });
  }, [invoices, roomById, tenants]);

  const invoiceFilterCounts = useMemo(() => {
    const counts = { ALL: invoiceRows.length, OVERDUE: 0, UNPAID: 0, PAID: 0 };
    for (const row of invoiceRows) {
      counts[row.bucket]++;
    }
    return counts;
  }, [invoiceRows]);

  const filteredInvoiceRows = useMemo(
    () =>
      invoiceFilter === 'ALL'
        ? invoiceRows
        : invoiceRows.filter((row) => row.bucket === invoiceFilter),
    [invoiceRows, invoiceFilter]
  );

  const addPresetAddOn = (
    list: BoardingFacilityAddOn[],
    setter: React.Dispatch<React.SetStateAction<BoardingFacilityAddOn[]>>,
    preset: { code: string; name: string; defaultMonthlyFee: string }
  ) => {
    if (list.some((a) => a.name.toLowerCase() === preset.name.toLowerCase())) return;
    setter([
      ...list,
      {
        id: `addon-${preset.code.toLowerCase()}-${Date.now().toString(36)}`,
        name: preset.name,
        monthlyFee: preset.defaultMonthlyFee,
        durationMode: 'FOLLOW_RENT',
      },
    ]);
  };

  const addCustomAddOn = (
    name: string,
    fee: string,
    list: BoardingFacilityAddOn[],
    setter: React.Dispatch<React.SetStateAction<BoardingFacilityAddOn[]>>,
    clearName: () => void,
    clearFee: () => void
  ) => {
    const trimmed = name.trim();
    const numericFee = Number(fee || '0');
    if (!trimmed || Number.isNaN(numericFee) || numericFee <= 0) return;
    setter([
      ...list,
      {
        id: `addon-custom-${Date.now().toString(36)}`,
        name: trimmed,
        monthlyFee: String(Math.round(numericFee)),
        durationMode: 'FOLLOW_RENT',
      },
    ]);
    clearName();
    clearFee();
  };

  const updateAddOnDuration = (
    id: string,
    mode: BoardingAddOnDurationMode,
    customMonths: number | undefined,
    list: BoardingFacilityAddOn[],
    setter: React.Dispatch<React.SetStateAction<BoardingFacilityAddOn[]>>
  ) => {
    setter(
      list.map((item) =>
        item.id === id
          ? {
              ...item,
              durationMode: mode,
              durationMonths:
                mode === 'CUSTOM'
                  ? Math.max(1, Math.min(24, Math.floor(customMonths || 1)))
                  : undefined,
            }
          : item
      )
    );
  };

  return (
    <AppShell
      title="Kamar & Tagihan Kost"
      subtitle="Pantau kamar kosong, paket bulanan atau tahunan, jatuh tempo penghuni, dan kirim pengingat WhatsApp"
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="kost-btn-add-room"
            onClick={() => setShowRoomModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Tambah Kamar</span>
          </button>
          <button
            type="button"
            data-testid="kost-btn-create-invoice"
            onClick={() => openCreateInvoiceForTenant()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <Receipt className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Buat Tagihan</span>
          </button>
          <button
            type="button"
            data-testid="kost-btn-checkin"
            onClick={() => openCheckInForRoom()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Check-In Penghuni</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {feedback && (
          <div
            role="status"
            data-testid="kost-feedback"
            className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              <span>{feedback}</span>
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Owner WA Reminder Banner (Shown ONLY when Owner WA is unset & Fonnte inactive) */}
        {waPolicy.needsOwnerWaReminder && (
          <section
            data-testid="kost-owner-wa-reminder"
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <MessageCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-800"
                strokeWidth={1.75}
              />
              <div className="text-xs leading-relaxed text-stone-700">
                <p className="font-semibold text-stone-900">
                  Isi Nomor WhatsApp Pemilik untuk Mengaktifkan Pengingat Sewa
                </p>
                <p className="mt-0.5 max-w-[65ch]">
                  Tombol Kirim Pengingat WA ke penghuni disembunyikan sementara sampai Anda menambahkan nomor WhatsApp pemilik di Pengaturan.
                </p>
              </div>
            </div>
            {canOpenSettings && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="kost-wa-quick-setup-btn"
                  onClick={() => setWaReminderModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <span>Isi Nomor WA Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/settings/custom-fields?tab=payments_wa')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                >
                  <span>Pengaturan</span>
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Unified 4-Column Hairline KPI Strip (Warm Stone, Clickable Shortcuts) */}
        <section
          aria-label="Ringkasan Kost"
          className="grid grid-cols-1 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4"
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('ROOMS');
              setRoomFilter('ALL');
            }}
            className="p-4 text-left transition-colors hover:bg-stone-50/70 sm:p-5"
          >
            <p className="text-xs font-medium text-stone-500">Kamar Terisi</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-stone-900">
              {stats.occupiedRooms} / {stats.totalRooms}
            </p>
            <p className="mt-1.5 text-xs text-stone-500">
              {stats.occupancyPct}% terisi · {stats.availableRooms} kamar kosong
            </p>
          </button>

          <button
            type="button"
            data-testid="kost-kpi-due"
            onClick={() => {
              setActiveTab('TENANTS');
              setTenantFilter(
                dueAlertCounts.overdue > 0
                  ? 'OVERDUE'
                  : dueAlertCounts.today > 0
                  ? 'DUE_TODAY'
                  : dueAlertCounts.soon > 0
                  ? 'DUE_SOON'
                  : 'ALL'
              );
            }}
            className="p-4 text-left transition-colors hover:bg-stone-50/70 sm:p-5"
          >
            <p className="text-xs font-medium text-stone-500">Jatuh Tempo &amp; Tagihan</p>
            <p
              className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                stats.dueAlertCount > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {stats.dueAlertCount} Penghuni
            </p>
            <p className="mt-1.5 text-xs text-stone-500">
              {dueAlertCounts.overdue} telat · {dueAlertCounts.today + dueAlertCounts.soon} segera jatuh tempo ({formatRupiah(stats.unpaidAmount)})
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('TENANTS');
              setTenantFilter('ALL');
            }}
            className="p-4 text-left transition-colors hover:bg-stone-50/70 sm:p-5"
          >
            <p className="text-xs font-medium text-stone-500">
              Uang Jaminan (Deposit) Penghuni
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-stone-900">
              {formatRupiah(stats.totalDeposits)}
            </p>
            <p className="mt-1.5 text-xs text-stone-500">
              {hasAccountingOrTax
                ? 'Tercatat sebagai titipan deposit (Akun 2106), bukan omzet'
                : 'Dana titipan penghuni yang dikembalikan saat check-out'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('INVOICES');
              setInvoiceFilter('PAID');
            }}
            className="p-4 text-left transition-colors hover:bg-stone-50/70 sm:p-5"
          >
            <p className="text-xs font-medium text-stone-500">
              {hasAccountingOrTax ? 'PPh Final Sewa (Pasal 4(2) 10%)' : 'Sisihan Pajak Sewa (10%)'}
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {formatRupiah(stats.totalPph42)}
            </p>
            <p className="mt-1.5 text-xs text-stone-500">
              Dihitung otomatis dari tagihan sewa yang sudah lunas
            </p>
          </button>
        </section>

        {/* Pengingat Jatuh Tempo Sewa (Terlambat, Hari Ini, & <= 7 Hari Lagi) */}
        {dueAlertItems.length > 0 && (
          <section
            data-testid="kost-due-alerts-banner"
            aria-label="Pengingat Jatuh Tempo Sewa"
            className="rounded-xl border border-amber-200 bg-white overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-800 shrink-0" strokeWidth={1.75} />
                <div>
                  <h2 className="text-sm font-bold text-stone-900">
                    Pengingat Jatuh Tempo Sewa ({dueAlertItems.length} Penghuni Perlu Perhatian)
                  </h2>
                  <p className="text-xs text-stone-600">
                    Saring cepat penghuni yang telat bayar, jatuh tempo hari ini, atau segera jatuh tempo dalam 7 hari.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('INVOICES');
                  setInvoiceFilter('OVERDUE');
                }}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Kelola Tagihan Terlambat
              </button>
            </div>

            <div
              data-testid="kost-due-filter-bar"
              className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5"
            >
              {(
                [
                  { id: 'ALL', label: 'Semua Perlu Tindakan', count: dueAlertCounts.all },
                  { id: 'OVERDUE', label: 'Telat Bayar', count: dueAlertCounts.overdue },
                  { id: 'DUE_TODAY', label: 'Jatuh Tempo Hari Ini', count: dueAlertCounts.today },
                  { id: 'DUE_SOON', label: 'Segera (<=7 Hari)', count: dueAlertCounts.soon },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`kost-due-filter-${f.id.toLowerCase()}`}
                  onClick={() => setDueAlertFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    dueAlertFilter === f.id
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`rounded px-1 py-0.5 font-mono text-[10px] tabular-nums ${
                      dueAlertFilter === f.id
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="divide-y divide-stone-100">
              {filteredDueAlertItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-stone-500">
                  Tidak ada penghuni pada kategori filter ini.
                </div>
              ) : (
                filteredDueAlertItems.map((item) => {
                const roomNo = item.room?.roomNumber ?? '-';
                const periodLabel = item.unpaidInvoice
                  ? formatMonthIndo(item.unpaidInvoice.periodMonth)
                  : item.billingCycle === 'TAHUNAN'
                  ? 'Periode Tahunan Berikutnya'
                  : 'Periode Bulanan Berikutnya';
                const reminderMessage = buildKostReminderMessage({
                  businessName: activeWorkspace.tenant.name,
                  tenantName: item.tenant.fullName,
                  roomNumber: roomNo,
                  billingCycle: item.billingCycle,
                  dueDateIso: item.dueDateIso,
                  periodLabel,
                  totalAmount: item.amountEstimate,
                  countdownLabel: item.countdown.label,
                });

                return (
                  <div
                    key={item.tenant.id}
                    data-testid={`kost-due-item-${roomNo}`}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          Kamar {roomNo}
                        </span>
                        <span className="text-sm font-semibold text-stone-900">
                          {item.tenant.fullName}
                        </span>
                        <span className="rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
                          {item.billingCycle === 'TAHUNAN' ? 'Tahunan' : 'Bulanan'}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            item.countdown.tone === 'rose'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {item.countdown.label}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600">
                        Jatuh tempo:{' '}
                        <strong className="text-stone-800">
                          {formatDateIndo(item.dueDateIso)}
                        </strong>{' '}
                        · Tagihan:{' '}
                        <span className="font-mono font-semibold tabular-nums text-stone-900">
                          {formatRupiah(item.amountEstimate)}
                        </span>
                        {item.unpaidInvoice
                          ? ` (${formatMonthIndo(item.unpaidInvoice.periodMonth)})`
                          : ' (Belum dibuatkan nota tagihan)'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <UnifiedWaActionButton
                        customerPhone={item.tenant.phoneWa}
                        customerName={item.tenant.fullName}
                        message={reminderMessage}
                        modalTitle={`Kirim Pengingat Sewa — Kamar ${roomNo}`}
                        documentType="INVOICE"
                        referenceNo={`KMR-${roomNo}`}
                        label="Ingatkan WA"
                        variant="amber"
                        testId={`kost-due-wa-${roomNo}`}
                      />
                      {item.unpaidInvoice ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayModalInv(item.unpaidInvoice!);
                            setPayAccountCode('1102');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>Catat Bayar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCreateInvoiceForTenant(item.tenant.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          <Receipt className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>Buat Tagihan</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </section>
        )}

        {/* Clear Tab Bar */}
        <div
          role="tablist"
          aria-label="Bagian Pengelolaan Kost"
          className="flex flex-wrap items-center gap-1 border-b border-stone-200"
        >
          {[
            { id: 'ROOMS' as const, label: 'Peta Kamar', count: rooms.length, icon: Building2 },
            {
              id: 'TENANTS' as const,
              label: 'Penghuni & Jatuh Tempo',
              count: activeTenants.length,
              icon: Users,
            },
            {
              id: 'INVOICES' as const,
              label: 'Tagihan & Pembayaran',
              count: invoices.length,
              icon: Receipt,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`kost-tab-${tab.id.toLowerCase()}`}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{tab.label}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: PETA KAMAR */}
        {activeTab === 'ROOMS' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: `Semua (${rooms.length})` },
                    {
                      id: 'AVAILABLE',
                      label: `Kosong (${rooms.filter((r) => r.status === 'AVAILABLE').length})`,
                    },
                    {
                      id: 'OCCUPIED',
                      label: `Terisi (${rooms.filter((r) => r.status === 'OCCUPIED').length})`,
                    },
                    {
                      id: 'MAINTENANCE',
                      label: `Perbaikan (${rooms.filter((r) => r.status === 'MAINTENANCE').length})`,
                    },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRoomFilter(f.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      roomFilter === f.id
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-stone-500">
                Klik aksi langsung di setiap kartu kamar untuk check-in, buat tagihan, atau kirim WA.
              </p>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-white p-10 text-center space-y-2">
                <BedDouble className="mx-auto h-8 w-8 text-stone-400" strokeWidth={1.75} />
                <p className="text-sm font-semibold text-stone-900">
                  Belum ada kamar pada filter ini
                </p>
                <p className="text-xs text-stone-500">
                  Tambahkan kamar baru atau ubah filter status di atas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRooms.map((rm) => {
                  const occupant = activeTenantByRoomId.get(rm.id);
                  const unpaidInv = occupant
                    ? unpaidInvoiceByTenantId.get(occupant.id)
                    : undefined;
                  const cycle: BoardingBillingCycle =
                    unpaidInv?.billingCycle ?? occupant?.billingCycle ?? 'BULANAN';
                  const dueIso = occupant
                    ? resolveBoardingDueDate({
                        explicitDueDate: unpaidInv?.dueDate ?? occupant.nextDueDate,
                        checkInDate: occupant.checkInDate,
                        billingCycle: cycle,
                        periodMonth: unpaidInv?.periodMonth,
                      })
                    : undefined;
                  const countdown = occupant ? computeDueCountdown(dueIso) : null;
                  const monthly = rm.monthlyRate ?? rm.monthlyPrice ?? '0';
                  const yearly =
                    rm.yearlyRate ??
                    rm.annualPrice ??
                    new Decimal(monthly).times(11).toFixed(4);

                  const waMsg = occupant
                    ? buildKostReminderMessage({
                        businessName: activeWorkspace.tenant.name,
                        tenantName: occupant.fullName,
                        roomNumber: rm.roomNumber,
                        billingCycle: cycle,
                        dueDateIso: dueIso,
                        periodLabel: unpaidInv
                          ? formatMonthIndo(unpaidInv.periodMonth)
                          : cycle === 'TAHUNAN'
                          ? 'Sewa Tahunan'
                          : 'Sewa Bulanan',
                        totalAmount:
                          unpaidInv?.totalAmount ??
                          (cycle === 'TAHUNAN' ? yearly : monthly),
                        countdownLabel: countdown?.label ?? 'Bulan ini',
                      })
                    : '';

                  return (
                    <div
                      key={rm.id}
                      data-testid={`kost-room-card-${rm.roomNumber}`}
                      className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base font-bold text-stone-900">
                                Kamar {rm.roomNumber}
                              </span>
                              {occupant && (
                                <span className="rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
                                  {cycle === 'TAHUNAN' ? 'Tahunan' : 'Bulanan'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500">{rm.roomType}</p>
                          </div>

                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              rm.status === 'AVAILABLE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : rm.status === 'OCCUPIED'
                                ? 'bg-stone-100 text-stone-800'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {rm.status === 'AVAILABLE'
                              ? 'Kosong'
                              : rm.status === 'OCCUPIED'
                              ? 'Terisi'
                              : 'Perbaikan'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-y border-stone-100 py-2">
                          <div>
                            <span className="font-mono text-sm font-bold tabular-nums text-stone-900">
                              {formatRupiah(monthly)}
                            </span>
                            <span className="text-xs text-stone-500"> /bln</span>
                          </div>
                          <div className="text-xs text-stone-500">
                            Tahunan:{' '}
                            <span className="font-mono font-semibold tabular-nums text-stone-700">
                              {formatRupiah(yearly)}
                            </span>
                          </div>
                        </div>

                        {occupant ? (
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-stone-900 truncate">
                                {occupant.fullName}
                              </span>
                              <span className="font-mono text-[11px] text-stone-500 shrink-0">
                                {occupant.phoneWa}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-stone-600">
                              <span>Tanggal Masuk</span>
                              <span className="font-medium text-stone-800">
                                {formatDateIndo(occupant.checkInDate)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-stone-600">Jatuh Tempo</span>
                              <span className="font-medium text-stone-900">
                                {formatDateIndo(dueIso)}
                              </span>
                            </div>
                            {countdown && countdown.status !== 'UNKNOWN' && (
                              <div
                                className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                                  countdown.tone === 'rose'
                                    ? 'bg-rose-50 text-rose-700'
                                    : countdown.tone === 'amber'
                                    ? 'bg-amber-50 text-amber-800'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                <CalendarClock className="h-3 w-3" strokeWidth={1.75} />
                                <span>{countdown.label}</span>
                              </div>
                            )}
                          </div>
                        ) : rm.notes ? (
                          <p className="text-xs text-amber-800 bg-amber-50/70 rounded-lg px-2.5 py-2">
                            Catatan: {rm.notes}
                          </p>
                        ) : (
                          <p className="text-xs text-stone-500">
                            Kamar bersih dan siap ditempati penghuni baru.
                          </p>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-3">
                        {rm.status === 'AVAILABLE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openCheckInForRoom(rm.id)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                              <span>Check-In</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateBoardingRoomStatus(rm.id, 'MAINTENANCE')}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                            >
                              <Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />
                              <span>Perbaikan</span>
                            </button>
                          </>
                        )}

                        {rm.status === 'MAINTENANCE' && (
                          <button
                            type="button"
                            onClick={() => updateBoardingRoomStatus(rm.id, 'AVAILABLE')}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            <span>Selesai Perbaikan (Siap Sewa)</span>
                          </button>
                        )}

                        {rm.status === 'OCCUPIED' && occupant && (
                          <>
                            <button
                              type="button"
                              onClick={() => openCreateInvoiceForTenant(occupant.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                            >
                              <Receipt className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
                              <span>Tagihan</span>
                            </button>
                            <UnifiedWaActionButton
                              customerPhone={occupant.phoneWa}
                              customerName={occupant.fullName}
                              message={waMsg}
                              modalTitle={`Kirim Pengingat WA — Kamar ${rm.roomNumber}`}
                              documentType="INVOICE"
                              referenceNo={`KMR-${rm.roomNumber}`}
                              label="WA"
                              variant="emerald"
                            />
                            <button
                              type="button"
                              onClick={() => setCheckOutTarget(occupant)}
                              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-medium text-stone-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                              title="Check-Out penghuni dan kosongkan kamar"
                            >
                              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                              <span>Keluar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DAFTAR PENGHUNI & JATUH TEMPO */}
        {activeTab === 'TENANTS' && (
          <div className="space-y-3">
            <div
              data-testid="kost-tenant-filter-bar"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: 'ALL', label: 'Semua', count: tenantFilterCounts.ALL },
                  { id: 'OVERDUE', label: 'Telat Bayar', count: tenantFilterCounts.OVERDUE },
                  { id: 'DUE_TODAY', label: 'Hari Ini', count: tenantFilterCounts.DUE_TODAY },
                  { id: 'DUE_SOON', label: 'Segera <=7 Hr', count: tenantFilterCounts.DUE_SOON },
                  { id: 'SAFE', label: 'Aktif / Aman', count: tenantFilterCounts.SAFE },
                  { id: 'BULANAN', label: 'Bulanan', count: tenantFilterCounts.BULANAN },
                  { id: 'TAHUNAN', label: 'Tahunan', count: tenantFilterCounts.TAHUNAN },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`kost-tenant-filter-${f.id.toLowerCase()}`}
                  onClick={() => setTenantFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    tenantFilter === f.id
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`rounded px-1 py-0.5 font-mono text-[10px] tabular-nums ${
                      tenantFilter === f.id
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Kamar &amp; Penghuni</th>
                      <th className="px-4 py-3 font-semibold">Paket &amp; Fasilitas Include</th>
                      <th className="px-4 py-3 font-semibold">Tanggal Masuk</th>
                      <th className="px-4 py-3 font-semibold">Jatuh Tempo Berikutnya</th>
                      <th className="px-4 py-3 font-semibold text-right">Uang Deposit</th>
                      <th className="px-4 py-3 font-semibold text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTenantRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                          {activeTenants.length === 0
                            ? 'Belum ada penghuni aktif. Klik Check-In Penghuni di kanan atas untuk mencatat penghuni baru.'
                            : 'Tidak ada penghuni pada filter status ini.'}
                        </td>
                      </tr>
                    ) : (
                      filteredTenantRows.map(
                        ({ tenant: t, room: rm, cycle, unpaidInv, dueIso, countdown, includedFacilities }) => {
                          const monthly = rm?.monthlyRate ?? rm?.monthlyPrice ?? '0';
                          const yearly =
                            rm?.yearlyRate ??
                            rm?.annualPrice ??
                            new Decimal(monthly).times(11).toFixed(4);
                          const waMsg = buildKostReminderMessage({
                            businessName: activeWorkspace.tenant.name,
                            tenantName: t.fullName,
                            roomNumber: rm?.roomNumber ?? '-',
                            billingCycle: cycle,
                            dueDateIso: dueIso,
                            periodLabel: unpaidInv
                              ? formatMonthIndo(unpaidInv.periodMonth)
                              : cycle === 'TAHUNAN'
                              ? 'Sewa Tahunan'
                              : 'Sewa Bulanan',
                            totalAmount:
                              unpaidInv?.totalAmount ??
                              (cycle === 'TAHUNAN' ? yearly : monthly),
                            countdownLabel: countdown.label,
                          });
                          const activeAddOns = t.facilityAddOns ?? [];

                          return (
                            <tr key={t.id} className="hover:bg-stone-50/70">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-900">
                                    {rm?.roomNumber ?? '-'}
                                  </span>
                                  <div>
                                    <p className="font-semibold text-stone-900">{t.fullName}</p>
                                    <p className="font-mono text-[11px] text-stone-500">
                                      {t.phoneWa}
                                      {t.nikKtp ? ` · KTP ${t.nikKtp}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                                    cycle === 'TAHUNAN'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-stone-100 text-stone-700'
                                  }`}
                                >
                                  {cycle === 'TAHUNAN' ? 'Sewa Tahunan' : 'Sewa Bulanan'}
                                </span>
                                <p className="mt-1 max-w-[230px] text-[11px] text-stone-500">
                                  Include: {includedFacilities.slice(0, 4).join(', ')}
                                  {includedFacilities.length > 4
                                    ? ` +${includedFacilities.length - 4}`
                                    : ''}
                                </p>
                                {activeAddOns.length > 0 && (
                                  <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                                    Add-On: {formatAddOnsSummary(activeAddOns)}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-stone-700">
                                {formatDateIndo(t.checkInDate)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-stone-900">
                                  {formatDateIndo(dueIso)}
                                </div>
                                <span
                                  className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                    countdown.tone === 'rose'
                                      ? 'bg-rose-50 text-rose-700'
                                      : countdown.tone === 'amber'
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {countdown.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-stone-900">
                                {formatRupiah(t.depositAmount)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <UnifiedWaActionButton
                                    customerPhone={t.phoneWa}
                                    customerName={t.fullName}
                                    message={waMsg}
                                    modalTitle={`Ingatkan Sewa - ${t.fullName}`}
                                    documentType="INVOICE"
                                    referenceNo={`KMR-${rm?.roomNumber ?? '-'}`}
                                    label="Ingatkan WA"
                                    variant="emerald"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => openCreateInvoiceForTenant(t.id)}
                                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                                  >
                                    Buat Tagihan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCheckOutTarget(t)}
                                    className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                                  >
                                    Check-Out
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TAGIHAN & PEMBAYARAN */}
        {activeTab === 'INVOICES' && (
          <div className="space-y-3">
            <div
              data-testid="kost-invoice-filter-bar"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Semua Tagihan', count: invoiceFilterCounts.ALL },
                    { id: 'OVERDUE', label: 'Telat Bayar', count: invoiceFilterCounts.OVERDUE },
                    { id: 'UNPAID', label: 'Belum Jatuh Tempo', count: invoiceFilterCounts.UNPAID },
                    { id: 'PAID', label: 'Lunas', count: invoiceFilterCounts.PAID },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`kost-invoice-filter-${f.id.toLowerCase()}`}
                    onClick={() => setInvoiceFilter(f.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      invoiceFilter === f.id
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span
                      className={`rounded px-1 py-0.5 font-mono text-[10px] tabular-nums ${
                        invoiceFilter === f.id
                          ? 'bg-white/20 text-white'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => openCreateInvoiceForTenant()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Buat Tagihan / Perpanjangan</span>
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Periode &amp; Paket</th>
                      <th className="px-4 py-3 font-semibold">Kamar &amp; Rincian</th>
                      <th className="px-4 py-3 font-semibold">Jatuh Tempo</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Tagihan</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredInvoiceRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                          {invoices.length === 0
                            ? 'Belum ada tagihan sewa. Klik Buat Tagihan / Perpanjangan untuk menerbitkan tagihan bulanan atau tahunan.'
                            : 'Tidak ada tagihan pada filter status ini.'}
                        </td>
                      </tr>
                    ) : (
                      filteredInvoiceRows.map(
                        ({ inv, rm, bt, cycle, periodReadable, dueIso, countdown }) => {
                          const isPaid = inv.paymentStatus === 'PAID';
                          const addOnLabel = formatAddOnsSummary(inv.facilityAddOns);

                          const waMsg = buildKostReminderMessage({
                            businessName: activeWorkspace.tenant.name,
                            tenantName: bt?.fullName ?? 'Penghuni',
                            roomNumber: rm?.roomNumber ?? '-',
                            billingCycle: cycle,
                            dueDateIso: dueIso,
                            periodLabel: periodReadable,
                            totalAmount: inv.totalAmount,
                            countdownLabel: isPaid ? 'Sudah Lunas' : countdown.label,
                          });

                          return (
                            <tr key={inv.id} className="hover:bg-stone-50/70">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-stone-900">{periodReadable}</p>
                                <span className="mt-0.5 inline-flex rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                                  {cycle === 'TAHUNAN' ? 'Tahunan' : 'Bulanan'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-stone-900">
                                  Kamar {rm?.roomNumber ?? '-'} · {bt?.fullName ?? 'Penghuni'}
                                </p>
                                <p className="text-[11px] text-stone-500">
                                  Sewa {formatRupiah(inv.rentAmount)}
                                  {Number(inv.utilityFee) > 0
                                    ? ` + Add-On${addOnLabel ? ` (${addOnLabel})` : ''} ${formatRupiah(inv.utilityFee)}`
                                    : ' · Sudah termasuk fasilitas include'}
                                  {Number(inv.lateFee) > 0
                                    ? ` + Denda ${formatRupiah(inv.lateFee)}`
                                    : ''}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-stone-900">
                                  {formatDateIndo(dueIso)}
                                </p>
                                {!isPaid && countdown.status !== 'UNKNOWN' && (
                                  <span
                                    className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                      countdown.tone === 'rose'
                                        ? 'bg-rose-50 text-rose-700'
                                        : countdown.tone === 'amber'
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-emerald-50 text-emerald-700'
                                    }`}
                                  >
                                    {countdown.label}
                                  </span>
                                )}
                                {isPaid && inv.paidAt && (
                                  <p className="text-[11px] text-emerald-700">
                                    Dibayar {formatDateIndo(inv.paidAt)}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-stone-900">
                                {formatRupiah(inv.totalAmount)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : inv.paymentStatus === 'OVERDUE' ||
                                        countdown.status === 'OVERDUE'
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {isPaid
                                    ? 'Lunas'
                                    : inv.paymentStatus === 'OVERDUE' ||
                                      countdown.status === 'OVERDUE'
                                    ? 'Telat Bayar'
                                    : 'Belum Jatuh Tempo'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  {bt && (
                                    <UnifiedWaActionButton
                                      customerPhone={bt.phoneWa}
                                      customerName={bt.fullName}
                                      message={waMsg}
                                      modalTitle={`Kirim Tagihan WA - Kamar ${rm?.roomNumber ?? '-'}`}
                                      documentType="INVOICE"
                                      referenceNo={inv.id}
                                      label={isPaid ? 'Kirim Kuitansi WA' : 'Ingatkan WA'}
                                      variant={isPaid ? 'outline' : 'amber'}
                                    />
                                  )}
                                  {!isPaid && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayModalInv(inv);
                                        setPayAccountCode('1102');
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                      <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      <span>Bayar Lunas</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH KAMAR */}
      <ModalShell
        open={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        headerId="kost-modal-add-room"
        title="Tambah Kamar Kost Baru"
        subtitle="Masukkan nomor kamar, tipe, serta tarif sewa bulanan dan tahunan."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddRoom} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Nomor Kamar
              </label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="Contoh: 301"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tipe Kamar
              </label>
              <input
                type="text"
                required
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                placeholder="Standar AC / VIP"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tarif Bulanan (Rp)
              </label>
              <input
                type="number"
                required
                min="0"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tarif Tahunan (Rp)
              </label>
              <input
                type="number"
                min="0"
                value={yearlyRate}
                onChange={(e) => setYearlyRate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Fasilitas Termasuk Harga Sewa (Include)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_KOST_INCLUDED_FACILITIES.map((fac) => {
                const checked = roomIncludedFacilities.includes(fac);
                return (
                  <button
                    key={fac}
                    type="button"
                    onClick={() =>
                      toggleFacilityItem(roomIncludedFacilities, setRoomIncludedFacilities, fac)
                    }
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {checked ? '✓ ' : '+ '}
                    {fac}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">
              Catatan Kamar (Opsional)
            </label>
            <input
              type="text"
              value={roomNotes}
              onChange={(e) => setRoomNotes(e.target.value)}
              placeholder="Contoh: Lantai 2 menghadap taman"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRoomModal(false)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Simpan Kamar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* MODAL: CHECK-IN PENGHUNI (DENGAN PILIHAN BULANAN / TAHUNAN & JATUH TEMPO OTOMATIS) */}
      <ModalShell
        open={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        headerId="kost-modal-checkin"
        title="Check-In Penghuni Baru"
        subtitle="Pilih kamar kosong, tipe sewa bulanan atau tahunan, dan sistem menghitung tanggal jatuh tempo otomatis."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCheckIn} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">
              Pilih Kamar Kosong
            </label>
            <select
              required
              value={selectedRoomId}
              onChange={(e) => handleSelectCheckInRoom(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {availableRoomsList.length === 0 ? (
                <option value="">Tidak ada kamar kosong saat ini</option>
              ) : (
                availableRoomsList.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    Kamar {rm.roomNumber} · {rm.roomType} ({formatRupiah(rm.monthlyRate ?? rm.monthlyPrice ?? '0')}/bln)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Paket Sewa & Bayar di Muka Beberapa Bulan */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-stone-700">
              Tipe Paket &amp; Bayar di Muka (Sekalian Beberapa Bulan)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['BULANAN', 'TAHUNAN'] as const).map((cycleOpt) => {
                const selected = billingCycle === cycleOpt;
                const priceVal =
                  cycleOpt === 'TAHUNAN'
                    ? selectedCheckInRoom?.yearlyRate ??
                      selectedCheckInRoom?.annualPrice ??
                      String(
                        Number(
                          selectedCheckInRoom?.monthlyRate ??
                            selectedCheckInRoom?.monthlyPrice ??
                            '0'
                        ) * 11
                      )
                    : selectedCheckInRoom?.monthlyRate ??
                      selectedCheckInRoom?.monthlyPrice ??
                      '0';

                return (
                  <button
                    key={cycleOpt}
                    type="button"
                    data-testid={`kost-checkin-cycle-${cycleOpt.toLowerCase()}`}
                    onClick={() => handleCheckInDateOrCycleChange(checkInDate, cycleOpt)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50/70'
                        : 'border-stone-200 bg-white hover:bg-stone-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-stone-900">
                      {cycleOpt === 'BULANAN' ? 'Sewa Bulanan' : 'Sewa Tahunan (12 Bln)'}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-emerald-700">
                      {formatRupiah(priceVal)}
                      {cycleOpt === 'BULANAN' ? '/bln' : '/thn'}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-stone-700">
                  Bayar Langsung untuk Berapa Bulan?
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    data-testid="kost-checkin-months-input"
                    value={checkInMonthsPaid}
                    onChange={(e) => handleCheckInMonthsChange(Number(e.target.value))}
                    className="w-16 rounded-md border border-stone-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold tabular-nums text-stone-900"
                  />
                  <span className="text-[11px] font-medium text-stone-600">bulan</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`kost-checkin-months-preset-${m}`}
                    onClick={() => handleCheckInMonthsChange(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      checkInMonthsPaid === m
                        ? 'bg-emerald-600 text-white'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {m === 12 ? '12 Bln (1 Thn)' : `${m} Bulan`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-600">
                Masuk <strong>{formatDateIndo(checkInDate)}</strong> + {checkInMonthsPaid} bulan = Jatuh tempo berikutnya{' '}
                <strong className="text-emerald-800">{formatDateIndo(nextDueDate)}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Nama Lengkap Penghuni
              </label>
              <input
                type="text"
                required
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Nomor WhatsApp Penghuni
              </label>
              <input
                type="text"
                required
                value={phoneWa}
                onChange={(e) => setPhoneWa(e.target.value)}
                placeholder="0812-3456-7890"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tanggal Masuk
              </label>
              <input
                type="date"
                required
                value={checkInDate}
                onChange={(e) => {
                  setCheckInDate(e.target.value);
                  setNextDueDate(computePrepaidDueDate(e.target.value, checkInMonthsPaid));
                }}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                Tampilan: {formatDateIndo(checkInDate)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tanggal Jatuh Tempo Berikutnya
              </label>
              <input
                type="date"
                required
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              <p className="mt-1 text-[11px] font-medium text-emerald-700">
                Otomatis (+{checkInMonthsPaid} bln): {formatDateIndo(nextDueDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Nomor KTP (Opsional)
              </label>
              <input
                type="text"
                value={nikKtp}
                onChange={(e) => setNikKtp(e.target.value)}
                placeholder="16 digit NIK"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Kontak Darurat Keluarga
              </label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Ibu / Kakak (0812-...)"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Uang Jaminan / Deposit (Rp)
              </label>
              <input
                type="number"
                min="0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Uang Diterima Lewat
              </label>
              <select
                value={depositPayAcc}
                onChange={(e) => setDepositPayAcc(e.target.value as '1101' | '1102')}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                <option value="1102">Transfer Bank / QRIS</option>
                <option value="1101">Tunai</option>
              </select>
            </div>
          </div>

          {/* Fasilitas Termasuk (Include) diinisiasi saat Check-In */}
          <div
            data-testid="kost-checkin-facilities-section"
            className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 space-y-2"
          >
            <div>
              <p className="text-xs font-semibold text-stone-800">
                Fasilitas Termasuk Harga Sewa (Include)
              </p>
              <p className="text-[11px] text-stone-500">
                Atur fasilitas standar yang sudah termasuk sewa (air, listrik, Wi-Fi, dll.) agar tidak ditagih ulang di nota bulanan.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_KOST_INCLUDED_FACILITIES.map((fac) => {
                const checked = checkInIncludedFacilities.includes(fac);
                return (
                  <button
                    key={fac}
                    type="button"
                    onClick={() =>
                      toggleFacilityItem(
                        checkInIncludedFacilities,
                        setCheckInIncludedFacilities,
                        fac
                      )
                    }
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {checked ? '✓ ' : '+ '}
                    {fac}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add-On Fasilitas Awal (Opsional) saat Check-In dengan Durasi Fleksibel */}
          <div
            data-testid="kost-checkin-addons-section"
            className="rounded-lg border border-stone-200 bg-white p-3 space-y-2.5"
          >
            <div>
              <p className="text-xs font-semibold text-stone-800">
                Add-On Fasilitas Berbayar Awal (Opsional)
              </p>
              <p className="text-[11px] text-stone-500">
                Hanya pilih jika penghuni menambah layanan di luar harga kamar. Tiap add-on bisa dipilih mengikuti durasi sewa, 1 bulan saja, atau kustom.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_KOST_ADDON_CATALOG.map((preset) => {
                const exists = checkInAddOns.some(
                  (a) => a.name.toLowerCase() === preset.name.toLowerCase()
                );
                return (
                  <button
                    key={preset.code}
                    type="button"
                    disabled={exists}
                    data-testid={`kost-checkin-addon-${preset.code.toLowerCase()}`}
                    onClick={() => addPresetAddOn(checkInAddOns, setCheckInAddOns, preset)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                      exists
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 opacity-75'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    + {preset.name} ({formatRupiah(preset.defaultMonthlyFee)}/bln)
                  </button>
                );
              })}
            </div>

            {checkInAddOns.length > 0 && (
              <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {checkInAddOns.map((item) => {
                  const effMonths = resolveAddOnEffectiveMonths(item, checkInMonthsPaid);
                  const lineTotal = new Decimal(item.monthlyFee || '0').times(effMonths).toFixed(0);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1.5 px-2.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-stone-800">{item.name}</span>
                        <span className="ml-1.5 font-mono text-[11px] text-stone-500">
                          ({formatRupiah(item.monthlyFee)} × {effMonths} bln = {formatRupiah(lineTotal)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Durasi ${item.name}`}
                          value={item.durationMode ?? 'FOLLOW_RENT'}
                          onChange={(e) =>
                            updateAddOnDuration(
                              item.id,
                              e.target.value as BoardingAddOnDurationMode,
                              item.durationMonths ?? 1,
                              checkInAddOns,
                              setCheckInAddOns
                            )
                          }
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-800"
                        >
                          <option value="FOLLOW_RENT">Ikuti Sewa ({checkInMonthsPaid} bln)</option>
                          <option value="ONE_MONTH">1 Bulan Saja</option>
                          <option value="CUSTOM">Kustom Bulan</option>
                        </select>
                        {item.durationMode === 'CUSTOM' && (
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={item.durationMonths ?? 1}
                            onChange={(e) =>
                              updateAddOnDuration(
                                item.id,
                                'CUSTOM',
                                Number(e.target.value),
                                checkInAddOns,
                                setCheckInAddOns
                              )
                            }
                            className="w-12 rounded border border-stone-300 px-1.5 py-1 text-center font-mono text-[11px] tabular-nums"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setCheckInAddOns(checkInAddOns.filter((a) => a.id !== item.id))
                          }
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Hapus ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                type="text"
                value={newCheckInAddOnName}
                onChange={(e) => setNewCheckInAddOnName(e.target.value)}
                placeholder="Nama add-on khusus (mis. Tambah TV)"
                className="sm:col-span-6 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900"
              />
              <input
                type="number"
                min="0"
                value={newCheckInAddOnFee}
                onChange={(e) => setNewCheckInAddOnFee(e.target.value)}
                placeholder="Biaya/bln (Rp)"
                className="sm:col-span-4 rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-xs tabular-nums text-stone-900"
              />
              <button
                type="button"
                onClick={() =>
                  addCustomAddOn(
                    newCheckInAddOnName,
                    newCheckInAddOnFee,
                    checkInAddOns,
                    setCheckInAddOns,
                    () => setNewCheckInAddOnName(''),
                    () => setNewCheckInAddOnFee('')
                  )
                }
                className="sm:col-span-2 rounded-lg border border-stone-300 bg-stone-50 px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                Tambah
              </button>
            </div>
          </div>

          {/* Ringkasan Pembayaran Check-In (Bayar di Muka) */}
          <div
            data-testid="kost-checkin-summary"
            className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2"
          >
            <label className="flex items-start gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                data-testid="kost-checkin-collect-now"
                checked={collectOpeningRentNow}
                onChange={(e) => setCollectOpeningRentNow(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-emerald-600"
              />
              <span>
                Catat sewa awal ({checkInMonthsPaid} bulan) langsung lunas saat Check-In (otomatis buat kuitansi &amp; masuk jurnal)
              </span>
            </label>
            <div className="space-y-1 border-t border-emerald-200/70 pt-2 text-xs text-stone-700">
              {collectOpeningRentNow && (
                <>
                  <div className="flex justify-between">
                    <span>Sewa Kamar ({checkInMonthsPaid} bln)</span>
                    <span className="font-mono tabular-nums">{formatRupiah(checkInRentTotal)}</span>
                  </div>
                  {Number(checkInAddOnsTotal) > 0 && (
                    <div className="flex justify-between">
                      <span>Add-On Fasilitas ({checkInAddOns.length} item)</span>
                      <span className="font-mono tabular-nums">{formatRupiah(checkInAddOnsTotal)}</span>
                    </div>
                  )}
                  {Number(checkInRegionalTaxAmount) > 0 && (
                    <div className="flex justify-between">
                      <span>{effectiveRegionalTax.taxLabel} ({effectiveRegionalTax.ratePercentLabel})</span>
                      <span className="font-mono tabular-nums">{formatRupiah(checkInRegionalTaxAmount)}</span>
                    </div>
                  )}
                </>
              )}
              {Number(depositAmount || '0') > 0 && (
                <div className="flex justify-between">
                  <span>Uang Jaminan / Deposit (Akun 2106)</span>
                  <span className="font-mono tabular-nums">{formatRupiah(depositAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-emerald-200 pt-1.5 font-bold text-stone-900">
                <span>Total Diterima Saat Check-In</span>
                <span className="font-mono text-sm tabular-nums text-emerald-800">
                  {formatRupiah(checkInUpfrontGrandTotal)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCheckInModal(false)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!selectedRoomId}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Simpan Check-In Penghuni
            </button>
          </div>
        </form>
      </ModalShell>

      {/* MODAL: BUAT TAGIHAN / PERPANJANGAN SEWA (FLEKSIBEL BULANAN & TAHUNAN + DENDA PER HARI OPSIONAL) */}
      <ModalShell
        open={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        headerId="kost-modal-invoice"
        title="Buat Tagihan / Perpanjangan Sewa"
        subtitle="Penghuni bulanan maupun tahunan bebas memperpanjang berapa bulan saja. Saat lunas, jatuh tempo otomatis maju dari tanggal jatuh tempo saat ini."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">
              Pilih Penghuni Aktif
            </label>
            <select
              required
              value={invTenantId}
              onChange={(e) => handleInvoiceTenantChange(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {activeTenants.map((t) => {
                const rm = t.roomId ? roomById.get(t.roomId) : undefined;
                return (
                  <option key={t.id} value={t.id}>
                    Kamar {rm?.roomNumber ?? '-'} · {t.fullName} (
                    {(t.billingCycle ?? 'BULANAN') === 'TAHUNAN' ? 'Tahunan' : 'Bulanan'})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Read-only Fasilitas Include yang diinisiasi saat Check-In */}
          <div
            data-testid="kost-invoice-included-facilities"
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 space-y-1.5"
          >
            <p className="text-[11px] font-semibold text-stone-700">
              Fasilitas Sudah Termasuk Sewa (Include sejak Check-In)
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedInvIncludedFacilities.map((fac) => (
                <span
                  key={fac}
                  className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700"
                >
                  {fac}
                </span>
              ))}
            </div>
          </div>

          {/* Durasi Perpanjangan Fleksibel (Berlaku untuk Bulanan & Tahunan) */}
          <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-stone-800">
                Durasi Perpanjangan Sewa (Bulan)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={24}
                  data-testid="kost-inv-months-input"
                  value={invMonthsCount}
                  onChange={(e) => handleInvoiceMonthsChange(Number(e.target.value))}
                  className="w-16 rounded-md border border-stone-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold tabular-nums text-stone-900"
                />
                <span className="text-xs text-stone-600">bulan</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`kost-inv-months-preset-${m}`}
                  onClick={() => handleInvoiceMonthsChange(m)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    invMonthsCount === m
                      ? 'bg-emerald-600 text-white'
                      : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {m === 12 ? '12 Bln (1 Thn)' : `+${m} Bln`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-600">
              Jatuh tempo saat ini: <strong>{formatDateIndo(invDueDate)}</strong>{' '}
              &rarr; Setelah lunas (+{invMonthsCount} bln):{' '}
              <strong className="text-emerald-800">
                {formatDateIndo(computePrepaidDueDate(invDueDate, invMonthsCount))}
              </strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tanggal Jatuh Tempo Tagihan
              </label>
              <input
                type="date"
                required
                value={invDueDate}
                onChange={(e) => setInvDueDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                {formatDateIndo(invDueDate)}
                {invOverdueDays > 0 ? ` (Telat ${invOverdueDays} hari)` : ''}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Sewa Kamar ({invMonthsCount} bln) (Rp)
              </label>
              <input
                type="number"
                required
                min="0"
                value={invRentAmount}
                onChange={(e) => setInvRentAmount(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
              />
            </div>
          </div>

          {/* Add-On Fasilitas saat Perpanjangan Sewa (Durasi Fleksibel per Item) */}
          <div
            data-testid="kost-invoice-addons-section"
            className="rounded-lg border border-stone-200 bg-white p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-stone-800">
                  Add-On Fasilitas (Perpanjangan Sewa)
                </p>
                <p className="text-[11px] text-stone-500">
                  Tiap add-on bisa mengikuti durasi perpanjangan ({invMonthsCount} bln), hanya 1 bulan, atau kustom bulan.
                </p>
              </div>
              <span className="font-mono text-xs font-bold tabular-nums text-emerald-700 shrink-0">
                {formatRupiah(invAddOnsTotal)}
              </span>
            </div>

            {invAddOns.length > 0 ? (
              <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {invAddOns.map((item) => {
                  const effMonths = resolveAddOnEffectiveMonths(item, invMonthsCount);
                  const lineTotal = new Decimal(item.monthlyFee || '0').times(effMonths).toFixed(0);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1.5 px-2.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-stone-800">{item.name}</span>
                        <span className="ml-1.5 font-mono text-[11px] text-stone-500">
                          ({formatRupiah(item.monthlyFee)} × {effMonths} bln = {formatRupiah(lineTotal)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Durasi ${item.name}`}
                          value={item.durationMode ?? 'FOLLOW_RENT'}
                          onChange={(e) =>
                            updateAddOnDuration(
                              item.id,
                              e.target.value as BoardingAddOnDurationMode,
                              item.durationMonths ?? 1,
                              invAddOns,
                              setInvAddOns
                            )
                          }
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-800"
                        >
                          <option value="FOLLOW_RENT">Ikuti Perpanjangan ({invMonthsCount} bln)</option>
                          <option value="ONE_MONTH">1 Bulan Saja</option>
                          <option value="CUSTOM">Kustom Bulan</option>
                        </select>
                        {item.durationMode === 'CUSTOM' && (
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={item.durationMonths ?? 1}
                            onChange={(e) =>
                              updateAddOnDuration(
                                item.id,
                                'CUSTOM',
                                Number(e.target.value),
                                invAddOns,
                                setInvAddOns
                              )
                            }
                            className="w-12 rounded border border-stone-300 px-1.5 py-1 text-center font-mono text-[11px] tabular-nums"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setInvAddOns(invAddOns.filter((a) => a.id !== item.id))
                          }
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Hapus ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-stone-50 px-2.5 py-2 text-[11px] text-stone-500">
                Tidak ada add-on tambahan. Penghuni hanya ditagih harga sewa kamar standar.
              </p>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-stone-600">
                + Tambah Add-On Fasilitas (Perpanjangan)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_KOST_ADDON_CATALOG.map((preset) => {
                  const exists = invAddOns.some(
                    (a) => a.name.toLowerCase() === preset.name.toLowerCase()
                  );
                  return (
                    <button
                      key={preset.code}
                      type="button"
                      disabled={exists}
                      data-testid={`kost-inv-addon-${preset.code.toLowerCase()}`}
                      onClick={() => addPresetAddOn(invAddOns, setInvAddOns, preset)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                        exists
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 opacity-75'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      + {preset.name} ({formatRupiah(preset.defaultMonthlyFee)})
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-12">
                <input
                  type="text"
                  value={newInvAddOnName}
                  onChange={(e) => setNewInvAddOnName(e.target.value)}
                  placeholder="Add-on lain (mis. Sewa Rice Cooker)"
                  className="sm:col-span-6 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900"
                />
                <input
                  type="number"
                  min="0"
                  value={newInvAddOnFee}
                  onChange={(e) => setNewInvAddOnFee(e.target.value)}
                  placeholder="Biaya/bln (Rp)"
                  className="sm:col-span-4 rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-xs tabular-nums text-stone-900"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomAddOn(
                      newInvAddOnName,
                      newInvAddOnFee,
                      invAddOns,
                      setInvAddOns,
                      () => setNewInvAddOnName(''),
                      () => setNewInvAddOnFee('')
                    )
                  }
                  className="sm:col-span-2 rounded-lg border border-stone-300 bg-stone-50 px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Tambah
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-stone-600 pt-1">
              <input
                type="checkbox"
                checked={persistRenewalAddOns}
                onChange={(e) => setPersistRenewalAddOns(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-stone-300 accent-emerald-600"
              />
              <span>Simpan daftar add-on ini untuk periode sewa berikutnya</span>
            </label>
          </div>

          {/* Denda Keterlambatan Opsional (Dihitung Per Hari Keterlambatan) */}
          <div
            data-testid="kost-inv-latefee-section"
            className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
          >
            <label className="flex items-start gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                data-testid="kost-inv-latefee-toggle"
                checked={invApplyLateFee}
                onChange={(e) => setInvApplyLateFee(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-emerald-600"
              />
              <span>
                Kenakan Denda Keterlambatan (Opsional, keputusan pemilik)
                {invOverdueDays > 0 && (
                  <span className="ml-1.5 rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-700">
                    Telat {invOverdueDays} hari
                  </span>
                )}
              </span>
            </label>

            {invApplyLateFee && (
              invOverdueDays > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                      Nominal Denda per Hari (Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      data-testid="kost-inv-latefee-perday"
                      value={invLateFeePerDay}
                      onChange={(e) => setInvLateFeePerDay(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-sm tabular-nums text-stone-900"
                    />
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 flex flex-col justify-center">
                    <span className="text-[11px] text-rose-800">
                      {invOverdueDays} hari telat × {formatRupiah(invLateFeePerDay || '0')}/hari
                    </span>
                    <span
                      data-testid="kost-inv-latefee-computed"
                      className="font-mono text-sm font-bold tabular-nums text-rose-900"
                    >
                      = {formatRupiah(invEffectiveLateFee)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                    Belum lewat jatuh tempo. Isi nominal denda manual jika perlu (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={invLateFee}
                    onChange={(e) => setInvLateFee(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-1.5 font-mono text-sm tabular-nums text-stone-900"
                  />
                </div>
              )
            )}
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span>Sewa Kamar ({invMonthsCount} bln)</span>
              <span className="font-mono tabular-nums">{formatRupiah(invRentAmount || '0')}</span>
            </div>
            {Number(invAddOnsTotal) > 0 && (
              <div className="flex items-center justify-between text-xs text-stone-600">
                <span>Total Add-On Fasilitas ({invAddOns.length} item)</span>
                <span className="font-mono tabular-nums">{formatRupiah(invAddOnsTotal)}</span>
              </div>
            )}
            {Number(invEffectiveLateFee) > 0 && (
              <div className="flex items-center justify-between text-xs text-rose-700">
                <span>
                  Denda Keterlambatan
                  {invOverdueDays > 0 ? ` (${invOverdueDays} hr)` : ''}
                </span>
                <span className="font-mono tabular-nums">{formatRupiah(invEffectiveLateFee)}</span>
              </div>
            )}
            {Number(invRegionalTaxAmount) > 0 && (
              <div className="flex items-center justify-between text-xs text-stone-600">
                <span>
                  {effectiveRegionalTax.taxLabel} ({effectiveRegionalTax.ratePercentLabel})
                </span>
                <span className="font-mono tabular-nums">{formatRupiah(invRegionalTaxAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-stone-200 pt-1.5">
              <span className="text-xs font-semibold text-stone-700">Total Tagihan</span>
              <span className="font-mono text-base font-bold tabular-nums text-stone-900">
                {formatRupiah(invPreview.totalAmount)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowInvoiceModal(false)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Terbitkan Tagihan
            </button>
          </div>
        </form>
      </ModalShell>

      {/* MODAL: KONFIRMASI PEMBAYARAN SEWA */}
      <ModalShell
        open={Boolean(payModalInv)}
        onClose={() => setPayModalInv(null)}
        headerId="kost-modal-pay"
        title="Catat Pembayaran Sewa Lunas"
        subtitle="Uang sewa akan masuk ke laporan keuangan dan jatuh tempo penghuni otomatis diperbarui."
        maxWidthClass="max-w-md"
      >
        {payModalInv && (
          <div className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Periode</span>
                <span className="font-semibold text-stone-900">
                  {formatMonthIndo(payModalInv.periodMonth)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Jatuh Tempo</span>
                <span className="font-semibold text-stone-900">
                  {formatDateIndo(payModalInv.dueDate)}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-1.5">
                <span className="font-semibold text-stone-700">Total Dibayar</span>
                <span className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                  {formatRupiah(payModalInv.totalAmount)}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Uang Diterima Lewat
              </label>
              <select
                value={payAccountCode}
                onChange={(e) => setPayAccountCode(e.target.value as '1101' | '1102')}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                <option value="1102">Transfer Bank / QRIS</option>
                <option value="1101">Tunai</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModalInv(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPay}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Konfirmasi Lunas
              </button>
            </div>
          </div>
        )}
      </ModalShell>

      {/* MODAL: KONFIRMASI CHECK-OUT PENGHUNI */}
      <ModalShell
        open={Boolean(checkOutTarget)}
        onClose={() => setCheckOutTarget(null)}
        headerId="kost-modal-checkout"
        title="Konfirmasi Check-Out Penghuni"
        subtitle="Status kamar akan kembali menjadi Kosong dan siap disewakan ke penghuni baru."
        maxWidthClass="max-w-md"
      >
        {checkOutTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">
                  Check-Out {checkOutTarget.fullName} (Kamar{' '}
                  {checkOutTarget.roomId ? roomById.get(checkOutTarget.roomId)?.roomNumber : '-'})?
                </p>
                <p className="mt-1 text-amber-900">
                  Pastikan uang deposit sebesar{' '}
                  <strong className="font-mono">
                    {formatRupiah(checkOutTarget.depositAmount)}
                  </strong>{' '}
                  sudah diselesaikan atau dikembalikan sesuai kesepakatan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckOutTarget(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckOut}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Ya, Proses Check-Out
              </button>
            </div>
          </div>
        )}
      </ModalShell>

      <OwnerWaReminderModal
        open={waReminderModalOpen}
        onClose={() => setWaReminderModalOpen(false)}
        contextLabel="Kirim pengingat jatuh tempo dan tagihan sewa kamar ke penghuni kost"
      />
    </AppShell>
  );
}
