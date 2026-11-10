import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { dayLabel, monthLabel, statusLabel } from '../../i18n';
import { BarChart, EmptyState, ProgressBar } from '../../components/ui';
import DonutChart from '../../components/DonutChart';
import Segments from '../../components/Segments';
import { colors, radius, spacing, statusTone, toneColors } from '../../theme';
import { capitalize, money, toNum } from '../../utils/format';
import { num } from '../../services/api';
import type { ReportKind } from './ReportsHubScreen';

const PALETTE = [colors.primary, colors.info, colors.accent, colors.violet, colors.orange, colors.success, colors.danger];

// ─── Building blocks ─────────────────────────────────────────────────────────

function Panel({ children, flush, style }: { children: React.ReactNode; flush?: boolean; style?: any }) {
  return <View style={[styles.panel, flush && styles.flush, style]}>{children}</View>;
}

/** Two big numbers side by side in one card. */
function Pair({ a, b }: {
  a: { label: string; value: string; color?: string };
  b: { label: string; value: string; color?: string };
}) {
  return (
    <Panel>
      <View style={styles.pair}>
        {[a, b].map((x, i) => (
          <View key={i} style={[styles.col, i === 1 && { alignItems: 'flex-end' }]}>
            <Text style={styles.label}>{x.label}</Text>
            <Text style={[styles.big, x.color ? { color: x.color } : null]} numberOfLines={1} adjustsFontSizeToFit>{x.value}</Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

/** Single headline number. */
function Headline({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Panel>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.hero, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </Panel>
  );
}

function Heading({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingText}>{title}</Text>
      {meta ? <Text style={styles.headingMeta}>{meta}</Text> : null}
    </View>
  );
}

/** List row: title / subtitle on the left, value (+ optional caption) on the right. */
function Row({ title, subtitle, value, valueColor, caption, captionColor, first, onPress }: {
  title: string; subtitle?: string; value?: string; valueColor?: string;
  caption?: string; captionColor?: string; first?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !first && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {value != null || caption ? (
        <View style={styles.rowRight}>
          {value != null ? <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text> : null}
          {caption ? <Text style={[styles.rowCaption, captionColor ? { color: captionColor } : null]}>{caption}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

/** Label + value line with a thin bar underneath. */
function BarRow({ label, value, pct, color, first }: { label: string; value: string; pct: number; color: string; first?: boolean }) {
  return (
    <View style={[styles.barRow, first && { marginTop: 0 }]}>
      <View style={styles.between}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <ProgressBar value={pct} color={color} height={6} />
    </View>
  );
}

/** Donut + legend for a set of labelled amounts. */
function DonutPanel({ title, total, items }: {
  title: string; total: string; items: { key: string; label: string; value: number; display: string; color: string }[];
}) {
  return (
    <Panel>
      <View style={styles.donutRow}>
        <DonutChart
          data={items.map(i => ({ key: i.key, value: i.value, color: i.color }))}
          size={120}
          thickness={16}
          center={
            <>
              <Text style={styles.donutLabel}>{title}</Text>
              <Text style={styles.donutValue} numberOfLines={1} adjustsFontSizeToFit>{total}</Text>
            </>
          }
        />
        <View style={styles.legend}>
          {items.map(i => (
            <View key={i.key} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: i.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>{i.label}</Text>
              <Text style={styles.legendValue} numberOfLines={1}>{i.display}</Text>
            </View>
          ))}
        </View>
      </View>
    </Panel>
  );
}

function Empty({ title, message, icon = 'bar-chart-outline' }: { title?: string; message?: string; icon?: string }) {
  const { t } = useTranslation();
  return (
    <Panel flush>
      <EmptyState icon={icon} title={title ?? t('reports.noData')} message={message ?? (title ? undefined : t('reports.noDataHint'))} />
    </Panel>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function ReportBody({ kind, data }: { kind: ReportKind; data: any }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const rowsOf = (): any[] => (Array.isArray(data) ? data : []);

  switch (kind) {
    case 'payment-status':
      return <PaymentStatusBody data={data} />;

    case 'room-tenants':
      return <RoomTenantsBody data={data} />;

    case 'expense-matrix':
      return <ExpenseMatrixBody data={data} />;

    case 'dashboard': {
      const ms: any[] = data?.months ?? [];
      const tot = data?.totals ?? {};
      if (!ms.length) return <Empty />;
      const net = num(tot.netIncome);
      return (
        <>
          <Panel>
            <View style={styles.pair}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('reports.income')}</Text>
                <Text style={[styles.big, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{money(tot.totalIncome)}</Text>
              </View>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                <Text style={styles.label}>{t('reports.expenses')}</Text>
                <Text style={[styles.big, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{money(tot.expenses)}</Text>
              </View>
            </View>
            <View style={styles.hr} />
            <View style={styles.pair}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('reports.net')}</Text>
                <Text style={[styles.mid, { color: net < 0 ? colors.danger : colors.ink }]}>{money(net)}</Text>
              </View>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                <Text style={styles.label}>{t('reports.avgOccupancy')}</Text>
                <Text style={styles.mid}>{num(tot.averageOccupancyRate).toFixed(1)}%</Text>
              </View>
            </View>
            {num(tot.outstanding) > 0 ? (
              <Text style={styles.sub}>{t('reports.stillOwed', { amount: money(tot.outstanding, { decimals: 2 }) })}</Text>
            ) : null}
          </Panel>

          <Heading title={t('reports.byMonth')} />
          <Panel flush>
            {[...ms].reverse().map((m, i) => (
              <View key={m.month} style={[styles.dashRow, i > 0 && styles.sep]}>
                <View style={styles.between}>
                  <Text style={styles.rowTitle}>{monthLabel(m.month)}</Text>
                  <Text style={[styles.rowValue, { color: num(m.netIncome) < 0 ? colors.danger : colors.ink }]}>{money(m.netIncome)}</Text>
                </View>
                <View style={styles.dashStats}>
                  <Text style={styles.dashStat}><Text style={{ color: colors.success }}>▲ </Text>{money(m.totalIncome)}</Text>
                  <Text style={styles.dashStat}><Text style={{ color: colors.danger }}>▼ </Text>{money(m.expenses)}</Text>
                  <Text style={styles.dashStat}>{t('reports.owed')} {money(m.outstanding)}</Text>
                  <Text style={styles.dashStat}>{m.occupiedUnits}/{m.totalUnits} · {num(m.occupancyRate).toFixed(0)}%</Text>
                </View>
              </View>
            ))}
          </Panel>
        </>
      );
    }

    case 'monthly-summary': {
      const fin = data?.finance ?? {};
      const occ = data?.occupancy ?? {};
      const profit = toNum(fin.profit);
      return (
        <>
          <Panel>
            <View style={styles.pair}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('reports.collected')}</Text>
                <Text style={[styles.big, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{money(fin.totalRevenue)}</Text>
              </View>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                <Text style={styles.label}>{t('reports.invoiced')}</Text>
                <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{money(fin.totalInvoiced)}</Text>
              </View>
            </View>
            <View style={styles.hr} />
            <View style={styles.pair}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('reports.expenses')}</Text>
                <Text style={styles.mid}>{money(fin.totalExpenses)}</Text>
              </View>
              <View style={[styles.col, { alignItems: 'flex-end' }]}>
                <Text style={styles.label}>{t('reports.profit')}</Text>
                <Text style={[styles.mid, { color: profit < 0 ? colors.danger : profit > 0 ? colors.success : colors.ink }]}>{money(profit)}</Text>
              </View>
            </View>
          </Panel>

          <Heading title={t('reports.collectionRate')} meta={fin.collectionRate ?? '0%'} />
          <Panel>
            <ProgressBar value={toNum(fin.collectionRate) / 100} color={colors.success} height={6} />
            <View style={{ marginTop: 12 }}>
              <KV label={t('reports.invoiceIncome')} value={money(fin.invoiceIncome, { decimals: 2 })} />
              <KV label={t('reports.manualIncome')} value={money(fin.manualIncome, { decimals: 2 })} />
              <KV label={t('reports.periodLabel')} value={`${dayLabel(data?.period?.start, true)} – ${dayLabel(data?.period?.end, true)}`} />
            </View>
          </Panel>

          <Heading title={t('reports.occupancy')} meta={occ.rate ?? '0%'} />
          <Panel>
            <ProgressBar value={toNum(occ.rate) / 100} height={6} />
            <Text style={styles.sub}>{t('reports.unitsOf', { occupied: occ.occupied ?? 0, total: occ.total ?? 0 })}</Text>
          </Panel>
        </>
      );
    }

    case 'category-breakdown': {
      const rows = rowsOf();
      if (!rows.length) return <Empty />;
      const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
      return (
        <>
          <DonutPanel
            title={t('reports.total')}
            total={money(total)}
            items={rows.map((r, i) => ({
              key: String(r.category ?? i),
              label: r.category === 'unknown' ? t('reports.uncategorized') : capitalize(r.category),
              value: toNum(r.amount),
              display: `${toNum(r.percentage).toFixed(0)}%`,
              color: PALETTE[i % PALETTE.length],
            }))}
          />
          <Panel flush style={{ marginTop: spacing.lg }}>
            {rows.map((r, i) => (
              <Row
                key={String(r.category ?? i)}
                first={i === 0}
                title={r.category === 'unknown' ? t('reports.uncategorized') : capitalize(r.category)}
                subtitle={`${toNum(r.percentage).toFixed(1)}%`}
                value={money(r.amount, { decimals: 2 })}
              />
            ))}
          </Panel>
        </>
      );
    }

    case 'expenses': {
      const rows = rowsOf();
      if (!rows.length) return <Empty />;
      const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
      return (
        <>
          <Headline label={t('reports.expenseCount', { count: rows.length })} value={money(total, { decimals: 2 })} color={colors.danger} />
          <Panel flush style={{ marginTop: spacing.lg }}>
            {rows.map((r, i) => (
              <Row
                key={r.id ?? i}
                first={i === 0}
                title={r.description || capitalize(r.category)}
                subtitle={[capitalize(r.category), r.unitCode ? t('reports.unit', { code: r.unitCode }) : null, dayLabel(r.date)].filter(Boolean).join(' · ')}
                value={`−${money(r.amount, { decimals: 2 })}`}
                valueColor={colors.danger}
              />
            ))}
          </Panel>
        </>
      );
    }

    case 'payment-methods': {
      const rows = rowsOf();
      if (!rows.length) return <Empty />;
      const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
      return (
        <>
          <Headline label={t('reports.collected')} value={money(total, { decimals: 2 })} color={colors.success} />
          <Panel style={{ marginTop: spacing.lg }}>
            {rows.map((r, i) => {
              const label = capitalize(r.method ?? r.paymentMethod ?? r.label ?? t('reports.other'));
              return (
                <BarRow
                  key={label + i}
                  first={i === 0}
                  label={r.count != null ? `${label} · ${t('reports.payments', { count: r.count })}` : label}
                  value={money(r.amount, { decimals: 2 })}
                  pct={total ? toNum(r.amount) / total : 0}
                  color={PALETTE[i % PALETTE.length]}
                />
              );
            })}
          </Panel>
        </>
      );
    }

    case 'unpaid-invoices': {
      const buckets: any[] = data?.buckets ?? [];
      const details: any[] = data?.details ?? [];
      const max = Math.max(1, ...buckets.map(b => toNum(b.amount)));
      return (
        <>
          <Pair
            a={{ label: t('reports.totalUnpaid'), value: money(data?.total), color: toNum(data?.total) > 0 ? colors.danger : undefined }}
            b={{ label: t('reports.avgDaysOverdue'), value: String(data?.averageOverdueDays ?? 0) }}
          />
          {buckets.length ? (
            <>
              <Heading title={t('reports.aging')} />
              <Panel>
                {buckets.map((b, i) => (
                  <BarRow
                    key={b.range}
                    first={i === 0}
                    label={`${b.range} (${b.count})`}
                    value={money(b.amount, { decimals: 2 })}
                    pct={toNum(b.amount) / max}
                    color={i === 0 ? colors.warning : i < 2 ? colors.orange : colors.danger}
                  />
                ))}
              </Panel>
            </>
          ) : null}
          {details.length ? (
            <>
              <Heading title={t('reports.invoices')} meta={String(details.length)} />
              <Panel flush>
                {details.map((d, i) => (
                  <Row
                    key={d.id}
                    first={i === 0}
                    title={d.tenant}
                    subtitle={`${t('reports.unit', { code: d.unit })} · ${t('reports.due', { date: dayLabel(d.dueDate) })}`}
                    value={money(d.amount, { decimals: 2 })}
                    caption={d.invoiceNumber}
                    onPress={() => nav.navigate('InvoiceDetail', { invoiceId: d.id })}
                  />
                ))}
              </Panel>
            </>
          ) : null}
        </>
      );
    }

    case 'delinquency': {
      const rows = [...rowsOf()].sort((a, b) => b.daysOverdue - a.daysOverdue);
      if (!rows.length) return <Empty icon="happy-outline" title={t('reports.nobodyOverdue')} />;
      const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
      return (
        <>
          <Headline label={t('reports.overdueSummary', { count: rows.length })} value={money(total, { decimals: 2 })} color={colors.danger} />
          <Panel flush style={{ marginTop: spacing.lg }}>
            {rows.map((r, i) => (
              <Row
                key={r.invoiceId}
                first={i === 0}
                title={r.tenantName}
                subtitle={`${t('reports.unit', { code: r.unitCode })} · ${t('reports.due', { date: dayLabel(r.dueDate) })}`}
                value={money(r.amount, { decimals: 2 })}
                caption={t('reports.daysLate', { count: r.daysOverdue })}
                captionColor={r.daysOverdue > 60 ? colors.danger : colors.warning}
                onPress={() => nav.navigate('InvoiceDetail', { invoiceId: r.invoiceId })}
              />
            ))}
          </Panel>
        </>
      );
    }

    case 'tenant-balances': {
      const rows = [...rowsOf()].sort((a, b) => toNum(b.balance) - toNum(a.balance));
      if (!rows.length) return <Empty icon="happy-outline" title={t('reports.noBalances')} />;
      const total = rows.reduce((s, r) => s + toNum(r.balance), 0);
      return (
        <>
          <Headline label={t('reports.owedBy', { count: rows.length })} value={money(total, { decimals: 2 })} color={colors.orange} />
          <Panel flush style={{ marginTop: spacing.lg }}>
            {rows.map((r, i) => (
              <Row
                key={r.tenantId}
                first={i === 0}
                title={r.name}
                subtitle={r.units}
                value={money(r.balance, { decimals: 2 })}
                onPress={() => nav.navigate('TenantDetail', { tenantId: r.tenantId })}
              />
            ))}
          </Panel>
        </>
      );
    }

    case 'occupancy-summary': {
      const all = rowsOf();
      const rows = all.filter(r => r.label !== 'Total');
      const total = all.find(r => r.label === 'Total')?.value ?? rows.reduce((s, r) => s + toNum(r.value), 0);
      if (!rows.length) return <Empty />;
      return (
        <DonutPanel
          title={t('reports.totalUnits')}
          total={String(total)}
          items={rows.map(r => ({
            key: r.label,
            label: statusLabel(r.label),
            value: toNum(r.value),
            display: `${r.value} · ${r.percentage}`,
            color: toneColors[statusTone(r.label)].fg,
          }))}
        />
      );
    }

    case 'occupancy-trend': {
      const rows = rowsOf();
      if (!rows.length) return <Empty />;
      const avg = rows.reduce((s, r) => s + toNum(r.occupancyRate), 0) / rows.length;
      const last = rows[rows.length - 1];
      return (
        <>
          <Pair
            a={{ label: t('reports.average'), value: `${avg.toFixed(1)}%` }}
            b={{ label: t('reports.latest', { month: monthLabel(last.month) }), value: `${toNum(last.occupancyRate).toFixed(1)}%`, color: colors.success }}
          />
          <Panel style={{ marginTop: spacing.lg }}>
            <BarChart
              data={rows.map(r => ({ label: monthLabel(r.month).split(' ')[0].slice(0, 3), value: toNum(r.occupancyRate) }))}
              format={n => `${n.toFixed(0)}%`}
            />
          </Panel>
          <Panel flush style={{ marginTop: spacing.lg }}>
            {[...rows].reverse().map((r, i) => (
              <Row
                key={r.month}
                first={i === 0}
                title={monthLabel(r.month)}
                subtitle={t('reports.activeContracts', { count: r.activeContracts ?? 0 })}
                value={`${toNum(r.occupancyRate).toFixed(1)}%`}
              />
            ))}
          </Panel>
        </>
      );
    }

    case 'rent-roll':
      return <RentRoll rows={rowsOf()} />;

    case 'maintenance-summary': {
      const counts: any[] = data?.statusCounts ?? [];
      const details: any[] = data?.details ?? [];
      const totalCount = counts.reduce((s, c) => s + toNum(c.count), 0);
      return (
        <>
          <Pair
            a={{ label: t('reports.totalCost'), value: money(data?.totalCost), color: colors.orange }}
            b={{ label: t('reports.billable'), value: money(data?.billableCost), color: colors.success }}
          />
          {counts.length ? (
            <>
              <Heading title={t('reports.byStatus')} meta={String(totalCount)} />
              <Panel>
                {counts.map((c, i) => (
                  <BarRow
                    key={c.status}
                    first={i === 0}
                    label={statusLabel(c.status)}
                    value={String(c.count)}
                    pct={totalCount ? toNum(c.count) / totalCount : 0}
                    color={toneColors[statusTone(c.status)].fg}
                  />
                ))}
              </Panel>
            </>
          ) : null}
          {details.length ? (
            <>
              <Heading title={t('reports.requests')} meta={String(details.length)} />
              <Panel flush>
                {details.map((d, i) => (
                  <Row
                    key={d.id}
                    first={i === 0}
                    title={capitalize(d.type)}
                    subtitle={[d.description, dayLabel(d.date)].filter(Boolean).join(' · ')}
                    value={money(d.cost)}
                    caption={statusLabel(d.status)}
                    captionColor={toneColors[statusTone(d.status)].fg}
                    onPress={() => nav.navigate('RequestDetail', { requestId: d.id })}
                  />
                ))}
              </Panel>
            </>
          ) : null}
        </>
      );
    }
  }
  return null;
}

type PsFilter = 'all' | 'unpaid' | 'partial' | 'paid' | 'overdue';
const PS_TONE: Record<string, { fg: string; bg: string }> = { paid: toneColors.success, partial: toneColors.warning, unpaid: toneColors.danger };

/** Who paid / partly paid / didn't pay this month, and how much is left (REPORTS_API §16). */
function PaymentStatusBody({ data }: { data: any }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [filter, setFilter] = useState<PsFilter>('all');
  const sum = data?.summary ?? {};
  const rows: any[] = data?.rows ?? [];
  const list = rows.filter(r => filter === 'all' || (filter === 'overdue' ? r.isOverdue : r.paymentStatus === filter));

  if (!rows.length) return <Empty />;

  const counters: { key: PsFilter; value: number; tone: { fg: string; bg: string } }[] = [
    { key: 'paid', value: num(sum.paid), tone: toneColors.success },
    { key: 'partial', value: num(sum.partial), tone: toneColors.warning },
    { key: 'unpaid', value: num(sum.unpaid), tone: toneColors.danger },
    { key: 'overdue', value: num(sum.overdue), tone: toneColors.orange },
  ];

  return (
    <>
      <Panel>
        <View style={styles.pair}>
          <View style={styles.col}>
            <Text style={styles.label}>{t('reports.collected')}</Text>
            <Text style={[styles.big, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{money(sum.collected, { decimals: 2 })}</Text>
          </View>
          <View style={[styles.col, { alignItems: 'flex-end' }]}>
            <Text style={styles.label}>{t('reports.remaining')}</Text>
            <Text style={[styles.big, num(sum.remaining) > 0 && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{money(sum.remaining, { decimals: 2 })}</Text>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <ProgressBar value={num(sum.collectionRate) / 100} color={colors.success} height={6} />
        </View>
        <Text style={styles.sub}>
          {t('reports.collectionOf', { pct: num(sum.collectionRate).toFixed(1), amount: money(sum.invoiced, { decimals: 2 }) })}
          {num(sum.pending) > 0 ? `  ·  ${t('reports.waitingVerify', { amount: money(sum.pending, { decimals: 2 }) })}` : ''}
        </Text>
      </Panel>

      {/* Counters double as filters */}
      <View style={styles.counters}>
        {counters.map(c => {
          const on = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(on ? 'all' : c.key)}
              style={[styles.counter, on && { borderColor: c.tone.fg, backgroundColor: c.tone.bg }]}
            >
              <Text style={[styles.counterValue, { color: c.tone.fg }]}>{c.value}</Text>
              <Text style={styles.counterLabel} numberOfLines={1} adjustsFontSizeToFit>{t(`reports.ps.${c.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      {num(sum.overdueAmount) > 0 ? (
        <Text style={styles.overdueNote}>{t('reports.overdueAmount', { amount: money(sum.overdueAmount, { decimals: 2 }) })}</Text>
      ) : null}

      <Panel flush style={{ marginTop: spacing.md }}>
        {list.length === 0 ? <Text style={styles.emptyLine}>{t('reports.noData')}</Text> : list.map((r, i) => {
          const tone = r.isOverdue ? toneColors.danger : PS_TONE[r.paymentStatus] ?? toneColors.neutral;
          return (
            <Pressable
              key={r.invoiceId}
              onPress={() => nav.navigate('InvoiceDetail', { invoiceId: r.invoiceId })}
              style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={[styles.codeTile, { backgroundColor: tone.bg }]}>
                <Text style={[styles.codeText, { color: tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>{r.unitCode}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{r.tenant?.name ?? '—'}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {money(r.paid, { decimals: 2 })} / {money(r.invoiced, { decimals: 2 })}
                  {num(r.pending) > 0 ? ` · ${t('reports.pendingShort', { amount: money(r.pending, { decimals: 2 }) })}` : ''}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowValue, num(r.remaining) > 0 && { color: colors.danger }]}>{money(r.remaining, { decimals: 2 })}</Text>
                <Text style={[styles.rowCaption, { color: tone.fg }]}>
                  {r.isOverdue ? t('reports.daysLate', { count: r.daysOverdue }) : t(`reports.ps.${r.paymentStatus}`)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Panel>
    </>
  );
}

/** Every room with its tenant and this month's usage / invoiced / paid / owed (REPORTS_API §13). */
function RoomTenantsBody({ data }: { data: any }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const rows: any[] = data?.rows ?? [];
  const sum = data?.summary ?? {};
  const totals = data?.totals?.months?.[0] ?? {};
  if (!rows.length) return <Empty />;

  return (
    <>
      <Panel>
        <View style={styles.pair}>
          <View style={styles.col}>
            <Text style={styles.label}>{t('reports.collected')}</Text>
            <Text style={[styles.big, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{money(totals.paid, { decimals: 2 })}</Text>
          </View>
          <View style={[styles.col, { alignItems: 'flex-end' }]}>
            <Text style={styles.label}>{t('reports.owed')}</Text>
            <Text style={[styles.big, num(totals.outstanding) > 0 && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{money(totals.outstanding, { decimals: 2 })}</Text>
          </View>
        </View>
        <View style={styles.chipsRow}>
          {(['occupied', 'available', 'reserved', 'maintenance'] as const).map(k => (
            <View key={k} style={styles.statChip}>
              <View style={[styles.dot, { backgroundColor: toneColors[statusTone(k)].fg }]} />
              <Text style={styles.statChipText}>{statusLabel(k)} {num(sum[k])}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.sub}>
          {t('reports.rentTotal', { amount: money(data?.totals?.monthlyRent), deposit: money(data?.totals?.deposit) })}
        </Text>
      </Panel>

      <Panel flush style={{ marginTop: spacing.lg }}>
        {rows.map((r, i) => {
          const m = r.months?.[0] ?? {};
          const tone = toneColors[statusTone(r.status)];
          const owed = num(m.outstanding);
          return (
            <Pressable
              key={r.unitId}
              onPress={() => (m.invoiceIds?.[0] ? nav.navigate('InvoiceDetail', { invoiceId: m.invoiceIds[0] }) : nav.navigate('UnitDetail', { unitId: r.unitId }))}
              style={({ pressed }) => [styles.rtRow, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={styles.rtTop}>
                <View style={[styles.codeTile, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.codeText, { color: tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>{r.unitCode}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, !r.tenant && { color: colors.muted }]} numberOfLines={1}>{r.tenant?.name ?? t('reports.vacant')}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[money(r.monthlyRent) + t('units.perMonth'), r.tenancyKind === 'simple' ? t('reports.noContract') : null, r.tenant?.phoneNumber].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowValue, owed > 0 && { color: colors.danger }]}>{owed > 0 ? money(owed, { decimals: 2 }) : num(m.invoiced) > 0 ? '✓' : '—'}</Text>
                  <Text style={styles.rowCaption}>{owed > 0 ? t('reports.owed') : num(m.invoiced) > 0 ? t('reports.ps.paid') : ''}</Text>
                </View>
              </View>
              {r.tenant || num(m.invoiced) > 0 ? (
                <View style={styles.rtStats}>
                  <Text style={styles.dashStat}>⚡ {num(m.electricityUsage).toLocaleString()} kWh</Text>
                  <Text style={styles.dashStat}>💧 {num(m.waterUsage).toLocaleString()} m³</Text>
                  <Text style={styles.dashStat}>{money(m.paid, { decimals: 2 })} / {money(m.invoiced, { decimals: 2 })}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Panel>
    </>
  );
}

/** Expense categories × months (REPORTS_API §14): ranked categories, tap to see month by month. */
function ExpenseMatrixBody({ data }: { data: any }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const months: string[] = data?.period?.months ?? [];
  const rows: any[] = [...(data?.rows ?? [])].sort((a, b) => num(b.total) - num(a.total));
  const details: any[] = data?.details ?? [];
  const total = num(data?.totals?.total);
  if (!rows.length) return <Empty />;

  return (
    <>
      <Headline label={t('reports.expensesTotal', { count: months.length })} value={money(total, { decimals: 2 })} color={colors.danger} />

      {/* Monthly totals strip */}
      <Panel style={{ marginTop: spacing.lg }}>
        {months.map((m, i) => {
          const v = num(data?.totals?.amounts?.[m]);
          const max = Math.max(1, ...months.map(x => num(data?.totals?.amounts?.[x])));
          return (
            <BarRow key={m} first={i === 0} label={monthLabel(m)} value={money(v)} pct={v / max} color={colors.danger} />
          );
        })}
      </Panel>

      <Heading title={t('reports.byCategory')} meta={String(rows.length)} />
      <Panel flush>
        {rows.map((r, i) => {
          const isOpen = open === r.categoryId;
          return (
            <View key={r.categoryId ?? r.category} style={i > 0 ? styles.sep : undefined}>
              <Pressable onPress={() => setOpen(isOpen ? null : r.categoryId)} style={({ pressed }) => [styles.matRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <View style={styles.between}>
                  <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{capitalize(r.category)}</Text>
                  <Text style={styles.rowValue}>{money(r.total, { decimals: 2 })}</Text>
                </View>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={total ? num(r.total) / total : 0} color={PALETTE[i % PALETTE.length]} height={5} />
                </View>
              </Pressable>
              {isOpen ? (
                <View style={styles.matDetail}>
                  {months.map(m => (
                    <View key={m} style={styles.kv}>
                      <Text style={styles.kvLabel}>{monthLabel(m)}</Text>
                      <Text style={[styles.kvValue, !num(r.amounts?.[m]) && { color: colors.muted }]}>{money(r.amounts?.[m] ?? 0, { decimals: 2 })}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>

      {details.length ? (
        <>
          <Heading title={t('reports.recentExpenses')} meta={String(details.length)} />
          <Panel flush>
            {[...details].reverse().slice(0, 30).map((d, i) => (
              <Row
                key={d.id ?? i}
                first={i === 0}
                title={d.description || capitalize(d.category)}
                subtitle={[capitalize(d.category), d.vendor, d.unitCode ? t('reports.unit', { code: d.unitCode }) : null, dayLabel(d.date)].filter(Boolean).join(' · ')}
                value={`−${money(d.amount, { decimals: 2 })}`}
                valueColor={colors.danger}
              />
            ))}
          </Panel>
        </>
      ) : null}
    </>
  );
}

function RentRoll({ rows }: { rows: any[] }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | 'occupied' | 'vacant'>('all');
  const isVacant = (r: any) => r.tenant === 'Vacant';
  const list = useMemo(
    () => rows.filter(r => filter === 'all' || (filter === 'occupied' ? !isVacant(r) : isVacant(r))),
    [rows, filter],
  );
  const rent = rows.filter(r => !isVacant(r)).reduce((s, r) => s + toNum(r.monthlyRent), 0);
  const occupied = rows.filter(r => !isVacant(r)).length;

  return (
    <>
      <Headline label={t('reports.rentFromOccupied')} value={money(rent, { decimals: 2 })} />
      <Segments
        style={{ marginTop: spacing.lg }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('reports.all'), count: rows.length },
          { value: 'occupied', label: t('reports.occupied'), count: occupied },
          { value: 'vacant', label: t('reports.vacant'), count: rows.length - occupied },
        ]}
      />
      {list.length === 0 ? <View style={{ marginTop: spacing.lg }}><Empty /></View> : (
        <Panel flush style={{ marginTop: spacing.lg }}>
          {list.map((r, i) => (
            <Row
              key={r.unitId}
              first={i === 0}
              title={t('reports.unit', { code: r.unitCode })}
              subtitle={isVacant(r) ? t('reports.vacant') : [r.tenant, `${dayLabel(r.startDate)} → ${dayLabel(r.endDate)}`].join(' · ')}
              value={money(r.monthlyRent)}
              caption={isVacant(r) ? statusLabel(r.status) : t('reports.occupied')}
              captionColor={toneColors[statusTone(isVacant(r) ? r.status : 'occupied')].fg}
              onPress={() => nav.navigate('UnitDetail', { unitId: r.unitId })}
            />
          ))}
        </Panel>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.divider,
  },
  flush: { padding: 0, overflow: 'hidden' },
  pair: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  hr: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },

  label: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  hero: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.8, marginTop: 4 },
  big: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 4 },
  mid: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 3 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 10 },

  heading: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: spacing.xl, marginBottom: 10, paddingHorizontal: 4,
  },
  headingText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  headingMeta: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowCaption: { fontSize: 11, fontWeight: '600', color: colors.muted, marginTop: 3 },

  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  kvLabel: { fontSize: 13, color: colors.textSecondary },
  kvValue: { fontSize: 13, fontWeight: '600', color: colors.ink, flexShrink: 1, textAlign: 'right' },

  barRow: { marginTop: 14 },
  barLabel: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  barValue: { fontSize: 13, fontWeight: '600', color: colors.ink },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  donutLabel: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  donutValue: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2, maxWidth: 76 },
  legend: { flex: 1, minWidth: 0, gap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginBottom: 6 },
  legendLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  legendValue: { fontSize: 12, fontWeight: '600', color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },
  emptyLine: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: spacing.lg },

  // Payment status
  counters: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  counter: {
    flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.divider,
  },
  counterValue: { fontSize: 20, fontWeight: '700' },
  counterLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  overdueNote: { fontSize: 12, fontWeight: '600', color: colors.danger, marginTop: 8, paddingHorizontal: 4 },
  codeTile: { width: 48, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  codeText: { fontSize: 12, fontWeight: '700' },

  // Rooms & tenants / expense matrix
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  statChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  rtRow: { paddingVertical: 12, paddingHorizontal: spacing.lg },
  rtTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rtStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 8, marginLeft: 60 },
  matRow: { paddingVertical: 12, paddingHorizontal: spacing.lg },
  matDetail: { paddingHorizontal: spacing.lg, paddingBottom: 10, backgroundColor: colors.surfaceAlt },

  // Monthly dashboard
  dashRow: { paddingVertical: 12, paddingHorizontal: spacing.lg },
  dashStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 6 },
  dashStat: { fontSize: 12, color: colors.textSecondary },
});
