import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { pickList, unitsApi, utilityApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { num, numeric, str, useForm } from '../../hooks/useForm';
import {
  Button, Card, confirmAction, DateField, Header, IconTile, KeyValue, Screen, SelectField, TextField,
} from '../../components/ui';
import { colors, font, spacing } from '../../theme';
import { errMsg, money, toNum, todayYMD } from '../../utils/format';
import { toast } from '../../components/Toast';

/**
 * Create mode records electricity + water for a unit in one go (bulk endpoint, same as the web).
 * Edit mode (route param `reading`) updates a single reading.
 */
export default function UtilityFormScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const params = useRoute<any>().params ?? {};
  const reading = params.reading;
  const editing = !!reading;
  const { can } = useAuth();

  const [unitId, setUnitId] = useState<number | null>(reading?.unitId ?? params.unitId ?? null);
  const units = useApi(async () => pickList(await unitsApi.list({ sort: 'unitCode' }), 'units'), [], { refetchOnFocus: false });
  const init = useApi(
    async () => (unitId && !editing ? (await utilityApi.lastReading(unitId))?.data : null),
    [unitId],
    { refetchOnFocus: false },
  );

  const prevE = toNum(init.data?.electricity?.previousReading);
  const prevW = toNum(init.data?.water?.previousReading);

  const f = useForm({
    electricity: editing && reading.type === 'electricity' ? String(toNum(reading.currentReading)) : '',
    water: editing && reading.type === 'water' ? String(toNum(reading.currentReading)) : '',
    readingDate: reading?.readingDate ?? todayYMD(),
    note: reading?.note ?? '',
  }, {
    electricity: (v, all) => numeric('Electricity')(v) ?? (!editing && !str(v) && !str(all.water) ? 'Enter at least one reading' : null)
      ?? (!editing && str(v) && Number(v) < prevE ? `Must be ≥ previous (${prevE})` : null),
    water: v => numeric('Water')(v) ?? (!editing && str(v) && Number(v) < prevW ? `Must be ≥ previous (${prevW})` : null),
  });

  useEffect(() => { if (!editing) { f.set('electricity', ''); f.set('water', ''); } /* reset on unit change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const unitOptions = useMemo(
    () => (units.data ?? []).map(u => ({ label: `Unit ${u.unitCode}`, value: u.id as number, subtitle: `Floor ${u.floorNumber || '—'} · ${u.status}` })),
    [units.data],
  );

  const save = f.submit(async v => {
    if (editing) {
      await utilityApi.update(reading.id, {
        currentReading: num(reading.type === 'water' ? v.water : v.electricity),
        readingDate: v.readingDate,
        note: v.note,
      });
      return;
    }
    if (!unitId) throw new Error('Select a unit');
    await utilityApi.bulk({
      unitId,
      electricityReading: num(v.electricity),
      waterReading: num(v.water),
      readingDate: v.readingDate,
      note: str(v.note),
    });
  }, () => nav.goBack());

  const onDelete = () => confirmAction('Delete reading', 'Delete this meter reading?', async () => {
    try { await utilityApi.remove(reading.id); toast.deleted(); nav.goBack(); } catch (e) { toast.error(errMsg(e), { title: 'Delete failed' }); }
  });

  const usageE = str(f.values.electricity) ? Number(f.values.electricity) - prevE : null;
  const usageW = str(f.values.water) ? Number(f.values.water) - prevW : null;
  const priceE = toNum(init.data?.electricity?.pricePerUnit);
  const priceW = toNum(init.data?.water?.pricePerUnit);
  // A reading on a (non-cancelled) invoice is locked by the server — edit/delete return 400
  const billed = editing && reading?.invoiceId != null;

  return (
    <Screen
      header={<Header title={editing ? 'Edit reading' : 'Record meter reading'} subtitle={editing ? `Unit ${reading.unit?.unitCode ?? reading.unitId}` : init.data?.context?.month} />}
      footer={billed ? undefined : <Button title={editing ? 'Save reading' : 'Save readings'} onPress={save} loading={f.submitting} style={{ flex: 1 }} disabled={!editing && !unitId} />}
    >
      {billed ? (
        <Card style={styles.locked}>
          <View style={styles.lockedRow}>
            <Icon name="lock-closed" size={16} color={colors.warning} />
            <Text style={styles.lockedTitle}>{t('reading.billedTitle', { id: reading.invoiceId })}</Text>
          </View>
          <Text style={styles.lockedText}>{t('reading.billedMsg')}</Text>
          <Button
            title={t('reading.openInvoice')}
            variant="secondary"
            small
            icon="receipt-outline"
            onPress={() => nav.navigate('InvoiceDetail', { invoiceId: reading.invoiceId })}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}
      {!editing ? (
        <Card>
          <SelectField label="Unit" required searchable value={unitId} options={unitOptions} onChange={setUnitId} placeholder={units.loading ? 'Loading units…' : 'Select unit'} />
          {init.data?.context ? (
            <>
              <KeyValue label="Tenant" value={init.data.context.tenant} />
              <KeyValue label="Billing month" value={init.data.billingInfo?.displayMonth} />
            </>
          ) : null}
        </Card>
      ) : null}

      {(editing ? reading.type === 'electricity' : true) ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.meterHead}>
            <IconTile icon="flash-outline" tone="warning" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={font.h3}>Electricity</Text>
              <Text style={font.caption}>Previous: {editing ? toNum(reading.previousReading) : prevE} kWh{priceE ? ` · ${money(priceE)}/kWh` : ''}</Text>
            </View>
          </View>
          <TextField label="Current reading (kWh)" keyboardType="decimal-pad" placeholder="e.g. 3700" editable={!billed} {...f.field('electricity')} />
          {usageE != null && usageE >= 0 ? <Text style={styles.usage}>Usage {usageE} kWh{priceE ? ` ≈ ${money(usageE * priceE, { decimals: 2 })}` : ''}</Text> : null}
        </Card>
      ) : null}

      {(editing ? reading.type === 'water' : true) ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.meterHead}>
            <IconTile icon="water-outline" tone="info" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={font.h3}>Water</Text>
              <Text style={font.caption}>Previous: {editing ? toNum(reading.previousReading) : prevW} m³{priceW ? ` · ${money(priceW)}/m³` : ''}</Text>
            </View>
          </View>
          <TextField label="Current reading (m³)" keyboardType="decimal-pad" placeholder="e.g. 65" editable={!billed} {...f.field('water')} />
          {usageW != null && usageW >= 0 ? <Text style={styles.usage}>Usage {usageW} m³{priceW ? ` ≈ ${money(usageW * priceW, { decimals: 2 })}` : ''}</Text> : null}
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <DateField label="Reading date" value={f.values.readingDate} onChange={v => f.set('readingDate', v)} />
        <TextField label="Note" multiline placeholder="Optional" {...f.field('note')} />
      </Card>

      {editing && !billed && can('delete', 'utility reading') ? (
        <Button title="Delete reading" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meterHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  usage: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: -6 },
  locked: { backgroundColor: colors.warningSoft, borderColor: '#FDE68A', marginBottom: spacing.lg },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, flex: 1 },
  lockedText: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
});
