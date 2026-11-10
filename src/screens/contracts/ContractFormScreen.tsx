import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { contractsApi, pickList, tenantsApi, unitsApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { num, numeric, required, useForm } from '../../hooks/useForm';
import { Button, Card, DateField, Header, Screen, Segmented, SelectField, TextField } from '../../components/ui';
import { font, spacing } from '../../theme';
import { todayYMD } from '../../utils/format';
import { activeContract } from '../units/UnitsScreen';

function addYear(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${Number(y) + 1}-${m}-${d}`;
}
const n = (v: any) => (v == null || v === '' ? '' : String(Number(v)));

export default function ContractFormScreen() {
  const nav = useNavigation<any>();
  const params = useRoute<any>().params ?? {};
  const contract = params.contract;
  const editing = !!contract;

  const tenants = useApi(async () => pickList(await tenantsApi.list({ sort: 'name' }), 'tenants'), [], { refetchOnFocus: false });
  const units = useApi(async () => pickList(await unitsApi.list({ sort: 'unitCode' }), 'units'), [], { refetchOnFocus: false });

  const start = contract?.startDate?.split('T')[0] ?? todayYMD();
  const f = useForm({
    tenantId: contract?.tenantId ?? params.tenantId ?? null,
    unitId: contract?.unitId ?? params.unitId ?? null,
    startDate: start,
    endDate: contract?.endDate?.split('T')[0] ?? addYear(start),
    monthlyRent: n(contract?.monthlyRent ?? params.monthlyRent),
    depositAmount: n(contract?.depositAmount ?? params.depositAmount),
    terms: contract?.terms ?? '',
    billingStrategy: (contract?.billingStrategy ?? 'unified') as 'unified' | 'anniversary',
    rentCycle: (contract?.rentCycle ?? 'month') as 'day' | 'week' | 'month',
  }, {
    tenantId: required('Tenant'),
    unitId: required('Unit'),
    startDate: required('Start date'),
    endDate: (v, all) => required('End date')(v) ?? (v <= all.startDate ? 'End date must be after start date' : null),
    monthlyRent: numeric('Rent', { required: true }),
    depositAmount: numeric('Deposit'),
  });

  const tenantOptions = useMemo(
    () => (tenants.data ?? []).map(t => ({ label: t.name, value: t.id as number, subtitle: t.phoneNumber })),
    [tenants.data],
  );
  const unitOptions = useMemo(() => (units.data ?? [])
    .map(u => {
      const occ = activeContract(u);
      const mine = occ && occ.id === contract?.id;
      return {
        label: `Unit ${u.unitCode}`,
        value: u.id as number,
        subtitle: occ && !mine ? `Occupied by ${occ.tenant?.name ?? 'tenant'}` : `${u.status} · $${Number(u.monthlyRent)}/mo`,
        _sort: occ && !mine ? 1 : 0,
        _unit: u,
      };
    })
    .sort((a, b) => a._sort - b._sort), [units.data, contract?.id]);

  const onUnit = (id: number) => {
    f.set('unitId', id);
    const u = unitOptions.find(o => o.value === id)?._unit;
    if (u && !editing) {
      if (!f.values.monthlyRent) f.set('monthlyRent', n(u.monthlyRent));
      if (!f.values.depositAmount) f.set('depositAmount', n(u.depositAmount));
    }
  };

  const save = f.submit(async v => {
    const body = {
      tenantId: Number(v.tenantId),
      unitId: Number(v.unitId),
      startDate: v.startDate,
      endDate: v.endDate,
      monthlyRent: num(v.monthlyRent)!,
      depositAmount: num(v.depositAmount) ?? 0,
      terms: v.terms,
      billingStrategy: v.billingStrategy,
      rentCycle: v.rentCycle,
    };
    if (editing) await contractsApi.update(contract.id, body);
    else await contractsApi.create(body);
  }, () => nav.goBack());

  return (
    <Screen
      header={<Header title={editing ? `Edit contract #${contract.id}` : 'New contract'} />}
      footer={<Button title={editing ? 'Save changes' : 'Create contract'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <Text style={styles.section}>Who & where</Text>
        <SelectField
          label="Tenant" required searchable value={f.values.tenantId} options={tenantOptions}
          onChange={v => f.set('tenantId', v)} error={f.errors.tenantId}
          placeholder={tenants.loading ? 'Loading tenants…' : 'Select tenant'}
          hint="Need someone new? Add them from the Tenants tab first."
        />
        <SelectField
          label="Unit" required searchable value={f.values.unitId} options={unitOptions}
          onChange={onUnit} error={f.errors.unitId}
          placeholder={units.loading ? 'Loading units…' : 'Select unit'}
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.section}>Period</Text>
        <View style={styles.row}>
          <View style={styles.half}><DateField label="Start date" required value={f.values.startDate} onChange={v => f.set('startDate', v)} error={f.errors.startDate} /></View>
          <View style={styles.half}><DateField label="End date" required value={f.values.endDate} onChange={v => f.set('endDate', v)} error={f.errors.endDate} /></View>
        </View>
        <Text style={styles.label}>Rent cycle</Text>
        <Segmented
          value={f.values.rentCycle}
          onChange={v => f.set('rentCycle', v)}
          options={[{ label: 'Monthly', value: 'month' }, { label: 'Weekly', value: 'week' }, { label: 'Daily', value: 'day' }]}
          style={{ marginBottom: spacing.lg }}
        />
        <Text style={styles.label}>Billing strategy</Text>
        <Segmented
          value={f.values.billingStrategy}
          onChange={v => f.set('billingStrategy', v)}
          options={[{ label: 'Unified', value: 'unified' }, { label: 'Anniversary', value: 'anniversary' }]}
        />
        <Text style={[font.caption, { marginTop: 8 }]}>
          {f.values.billingStrategy === 'unified'
            ? 'Invoice on the property billing day, same as every other unit.'
            : 'Invoice on the same day of the month the contract started.'}
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.section}>Money</Text>
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Rent" required keyboardType="decimal-pad" prefix="$" placeholder="0.00" {...f.field('monthlyRent')} /></View>
          <View style={styles.half}><TextField label="Deposit" keyboardType="decimal-pad" prefix="$" placeholder="0.00" {...f.field('depositAmount')} /></View>
        </View>
        <TextField label="Terms & notes" multiline placeholder="House rules, special conditions…" {...f.field('terms')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...font.h3, marginBottom: spacing.md },
  label: { ...font.caption, color: '#1E293B', fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
