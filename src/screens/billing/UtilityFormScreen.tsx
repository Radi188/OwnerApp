import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import {
  pickList, unitsApi, utilityApi,
  type GroupedReadingRow, type MeterType, type UploadFile,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { num, numeric, str, useForm } from '../../hooks/useForm';
import {
  Button, Card, confirmAction, DateField, Header, IconTile, KeyValue, Screen, SelectField, TextField,
} from '../../components/ui';
import { ImageUpload } from '../../components/form/ImageUpload';
import { dayLabel } from '../../i18n';
import { colors, font, spacing } from '../../theme';
import { errMsg, money, toNum, todayYMD } from '../../utils/format';
import { editableMeters, hasLockedMeter, METER, rowMeters } from '../../utils/readings';
import { toast } from '../../components/Toast';

const TONE: Record<MeterType, 'warning' | 'info'> = { electricity: 'warning', water: 'info' };
const ICON: Record<MeterType, string> = { electricity: 'flash-outline', water: 'water-outline' };

/**
 * Route params:
 * - `{ row }`                              → edit a grouped row: both meters in one `PATCH /bulk`
 * - `{ unitId, addMeter, readingDate }`    → add the row's missing meter (`POST /utility-readings`)
 * - `{ unitId? }`                          → record both meters for a room (`POST /bulk`)
 */
export default function UtilityFormScreen() {
  const params = useRoute<any>().params ?? {};
  if (params.row) return <EditRowForm row={params.row} />;
  return <RecordForm unitId={params.unitId} unitCode={params.unitCode} only={params.addMeter} fixedDate={params.readingDate} />;
}

// ─── Record (both meters, or the one missing meter of a row) ────────────────

function RecordForm({ unitId: initialUnit, unitCode, only, fixedDate }: {
  unitId?: number; unitCode?: string; only?: MeterType; fixedDate?: string;
}) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [unitId, setUnitId] = useState<number | null>(initialUnit ?? null);
  const units = useApi(
    async () => (only ? [] : pickList(await unitsApi.list({ sort: 'unitCode' }), 'units')),
    [],
    { refetchOnFocus: false },
  );
  const init = useApi(async () => (unitId ? (await utilityApi.init(unitId))?.data : null), [unitId], { refetchOnFocus: false });

  const prev: Record<MeterType, number> = {
    electricity: toNum(init.data?.electricity?.previousReading),
    water: toNum(init.data?.water?.previousReading),
  };
  const price: Record<MeterType, number> = {
    electricity: toNum(init.data?.electricity?.pricePerUnit),
    water: toNum(init.data?.water?.pricePerUnit),
  };
  const meters: MeterType[] = only ? [only] : ['electricity', 'water'];

  const meterRule = (k: MeterType) => (v: string, all: { electricity: string; water: string }) =>
    numeric(t(`billing.${k}`), { required: !!only })(v)
    ?? (!only && k === 'electricity' && !str(v) && !str(all.water) ? t('reading.enterOne') : null)
    ?? (str(v) && Number(v) < prev[k] ? t('reading.atLeast', { value: prev[k] }) : null);

  const f = useForm({
    electricity: '',
    water: '',
    readingDate: fixedDate ?? todayYMD(),
    note: '',
  }, { electricity: meterRule('electricity'), water: meterRule('water') });

  // Reset the values when the room changes
  useEffect(() => { f.set('electricity', ''); f.set('water', ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const unitOptions = useMemo(
    () => (units.data ?? []).map(u => ({
      label: t('billing.unit', { code: u.unitCode }),
      value: u.id as number,
      subtitle: `${t('units.floor', { floor: u.floorNumber || '—' })} · ${u.status}`,
    })),
    [units.data, t],
  );

  const save = f.submit(async v => {
    if (!unitId) throw new Error(t('reading.selectUnit'));
    if (only) {
      // Same readingDate as the row → the server puts it in the same row
      await utilityApi.create({ unitId, type: only, currentReading: Number(v[only]), readingDate: v.readingDate, note: str(v.note) });
      return;
    }
    await utilityApi.bulk({
      unitId,
      electricityReading: num(v.electricity),
      waterReading: num(v.water),
      readingDate: v.readingDate,
      note: str(v.note),
    });
  }, () => nav.goBack());

  const title = only ? t(only === 'water' ? 'reading.addWater' : 'reading.addElectricity') : t('reading.recordTitle');
  const subtitle = only ? t('billing.unit', { code: unitCode ?? unitId }) : init.data?.context?.month;

  return (
    <Screen
      header={<Header title={title} subtitle={subtitle} />}
      footer={<Button title={t('reading.save')} onPress={save} loading={f.submitting} style={{ flex: 1 }} disabled={!unitId} />}
    >
      {!only ? (
        <Card>
          <SelectField
            label={t('reading.unit')}
            required
            searchable
            value={unitId}
            options={unitOptions}
            onChange={setUnitId}
            placeholder={units.loading ? t('reading.loadingUnits') : t('reading.selectUnit')}
          />
          {init.data?.context ? (
            <>
              <KeyValue label={t('billing.tenant')} value={init.data.context.tenant} />
              <KeyValue label={t('reading.billingMonth')} value={init.data.billingInfo?.displayMonth} />
            </>
          ) : null}
        </Card>
      ) : null}

      {meters.map((k, i) => {
        const usage = str(f.values[k]) ? Number(f.values[k]) - prev[k] : null;
        return (
          <Card key={k} style={(!only || i > 0) ? { marginTop: spacing.lg } : undefined}>
            <MeterTitle type={k} caption={`${t('reading.previous', { value: prev[k], unit: METER[k].unit })}${price[k] ? ` · ${money(price[k])}/${METER[k].unit}` : ''}`} />
            <TextField label={t('reading.current', { unit: METER[k].unit })} keyboardType="decimal-pad" required={!!only} {...f.field(k)} />
            {usage != null && usage >= 0 ? (
              <Text style={styles.usage}>
                {t('reading.usage', { value: usage, unit: METER[k].unit })}{price[k] ? ` ≈ ${money(usage * price[k], { decimals: 2 })}` : ''}
              </Text>
            ) : null}
          </Card>
        );
      })}

      <Card style={{ marginTop: spacing.lg }}>
        {fixedDate ? (
          <>
            <KeyValue label={t('reading.readingDate')} value={dayLabel(fixedDate, true)} />
            <Text style={styles.hint}>{t('reading.dateFixed')}</Text>
          </>
        ) : (
          <DateField label={t('reading.readingDate')} value={f.values.readingDate} onChange={v => f.set('readingDate', v)} />
        )}
        <TextField label={t('reading.note')} multiline placeholder={t('reading.optional')} {...f.field('note')} />
      </Card>
    </Screen>
  );
}

// ─── Edit a row: both meters in one request (PATCH /utility-readings/bulk) ──

function EditRowForm({ row }: { row: GroupedReadingRow }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { can } = useAuth();
  const present = rowMeters(row);
  const editable = editableMeters(row);
  const isEditable = (k: MeterType) => editable.includes(k);
  // Moving the date of only the unlocked meter would split the row — keep it fixed then
  const dateLocked = hasLockedMeter(row);
  const initialNote = row.electricity?.note ?? row.water?.note ?? '';
  const [photos, setPhotos] = useState<Partial<Record<MeterType, UploadFile | null>>>({});

  const meterRule = (k: MeterType) => (v: string) => {
    if (!isEditable(k)) return null;
    const prev = toNum(row[k]?.previousReading);
    return numeric(t(`billing.${k}`), { required: true })(v) ?? (Number(v) < prev ? t('reading.atLeast', { value: prev }) : null);
  };

  const f = useForm({
    electricity: row.electricity ? String(toNum(row.electricity.currentReading)) : '',
    water: row.water ? String(toNum(row.water.currentReading)) : '',
    readingDate: row.readingDate,
    note: initialNote,
  }, { electricity: meterRule('electricity'), water: meterRule('water') });

  const save = f.submit(async v => {
    const dateChanged = !dateLocked && v.readingDate !== row.readingDate;
    const noteChanged = String(v.note ?? '').trim() !== String(initialNote ?? '').trim();
    // Send only what changed. A meter goes in when its value / photo changed, or when the shared
    // date / note changed (they apply to every meter sent, so the row stays together).
    const part = (k: MeterType) => {
      const m = row[k];
      if (!m || !isEditable(k)) return {};
      const value = Number(v[k]);
      const valueChanged = value !== toNum(m.currentReading);
      const photo = photos[k] ?? undefined;
      if (!valueChanged && !photo && !dateChanged && !noteChanged) return {};
      return { id: m.id, reading: valueChanged ? value : undefined, photo };
    };
    const e = part('electricity');
    const w = part('water');
    if (e.id == null && w.id == null) return; // nothing changed
    await utilityApi.bulkUpdate({
      electricityId: e.id,
      electricityReading: e.reading,
      electricityPhoto: e.photo,
      waterId: w.id,
      waterReading: w.reading,
      waterPhoto: w.photo,
      readingDate: dateChanged ? v.readingDate : undefined,
      note: noteChanged ? String(v.note ?? '').trim() : undefined,
    });
  }, () => nav.goBack());

  const removeMeter = (k: MeterType) => confirmAction(
    t('reading.delete'),
    t('reading.deleteMsg', { meter: t(`billing.${k}`).toLowerCase(), date: dayLabel(row.readingDate) }),
    async () => {
      try {
        await utilityApi.remove(row[k]!.id);
        toast.deleted();
        nav.goBack();
      } catch (e) {
        toast.error(errMsg(e), { title: t('toast.couldNotDelete') });
      }
    },
  );

  return (
    <Screen
      header={<Header title={t('reading.editTitle')} subtitle={`${t('billing.unit', { code: row.unit?.unitCode ?? row.unitId })}${row.tenant?.name ? ` · ${row.tenant.name}` : ''}`} />}
      footer={editable.length ? <Button title={t('reading.save')} onPress={save} loading={f.submitting} style={{ flex: 1 }} /> : undefined}
    >
      {present.map((k, i) => {
        const m = row[k]!;
        const locked = !isEditable(k);
        const value = f.values[k];
        const usage = str(value) ? Number(value) - toNum(m.previousReading) : null;
        return (
          <Card key={k} style={i > 0 ? { marginTop: spacing.lg } : undefined}>
            <MeterTitle type={k} caption={t('reading.previous', { value: toNum(m.previousReading), unit: METER[k].unit })} />
            {locked ? (
              <View style={styles.locked}>
                <View style={styles.lockedRow}>
                  <Icon name="lock-closed" size={15} color={colors.warning} />
                  <Text style={styles.lockedTitle}>
                    {m.invoice ? t('reading.billedOn', { number: m.invoice.invoiceNumber }) : t('reading.locked')}
                  </Text>
                </View>
                <Text style={styles.lockedText}>{t('reading.billedMsg')}</Text>
                {m.invoiceId ? (
                  <Button
                    title={t('reading.openInvoice')}
                    variant="secondary"
                    small
                    icon="receipt-outline"
                    onPress={() => nav.navigate('InvoiceDetail', { invoiceId: m.invoiceId })}
                    style={{ marginTop: 10, alignSelf: 'flex-start' }}
                  />
                ) : null}
              </View>
            ) : null}
            <TextField
              label={t('reading.current', { unit: METER[k].unit })}
              keyboardType="decimal-pad"
              editable={!locked}
              required={!locked}
              {...f.field(k)}
            />
            {usage != null && usage >= 0 ? <Text style={styles.usage}>{t('reading.usage', { value: usage, unit: METER[k].unit })}</Text> : null}
            {/* Photos only change through an upload (§4) — the current one is just a preview */}
            {!locked || m.photo ? (
              <View style={{ marginTop: spacing.md }}>
                <ImageUpload
                  label={t('reading.photo')}
                  value={photos[k] ?? m.photo}
                  onChange={file => setPhotos(p => ({ ...p, [k]: file }))}
                  disabled={locked}
                  icon="camera-outline"
                  aspectRatio={4 / 3}
                  placeholder={t('reading.addPhoto')}
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card style={{ marginTop: spacing.lg }}>
        {dateLocked ? (
          <>
            <KeyValue label={t('reading.readingDate')} value={dayLabel(row.readingDate, true)} />
            {editable.length ? <Text style={styles.hint}>{t('reading.dateLocked')}</Text> : null}
          </>
        ) : (
          <DateField label={t('reading.readingDate')} value={f.values.readingDate} onChange={v => f.set('readingDate', v)} />
        )}
        {editable.length ? (
          <TextField label={t('reading.note')} multiline placeholder={t('reading.optional')} {...f.field('note')} />
        ) : initialNote ? (
          <KeyValue label={t('reading.note')} value={initialNote} />
        ) : null}
      </Card>

      {can('delete', 'utility reading') && editable.length ? (
        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          {editable.map(k => (
            <Button
              key={k}
              title={t(k === 'water' ? 'reading.deleteWater' : 'reading.deleteElectricity')}
              variant="danger"
              icon="trash-outline"
              onPress={() => removeMeter(k)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function MeterTitle({ type, caption }: { type: MeterType; caption: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.meterHead}>
      <IconTile icon={ICON[type]} tone={TONE[type]} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={font.h3}>{t(`billing.${type}`)}</Text>
        <Text style={font.caption}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meterHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  usage: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: -6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4, marginBottom: spacing.md },
  locked: {
    backgroundColor: colors.warningSoft, borderColor: '#FDE68A', borderWidth: 1, borderRadius: 12,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  lockedText: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
});
