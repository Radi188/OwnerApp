import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { unitsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { num, numeric, required, str, useForm } from '../../hooks/useForm';
import { Button, Card, Header, Screen, SelectField, TextField } from '../../components/ui';
import { font, spacing } from '../../theme';

const STATUSES = [
  { label: 'Available', value: 'Available' },
  { label: 'Reserved', value: 'Reserved' },
  { label: 'Under maintenance', value: 'Maintenance' },
];

const s = (v: any) => (v == null ? '' : String(v));
const n = (v: any) => (v == null || Number(v) === 0 ? '' : String(Number(v)));

export default function UnitFormScreen() {
  const nav = useNavigation<any>();
  const unit = useRoute<any>().params?.unit;
  const { propertyId } = useAuth();
  const editing = !!unit;

  const f = useForm({
    unitCode: s(unit?.unitCode),
    floorNumber: s(unit?.floorNumber),
    roomType: s(unit?.roomType),
    size: s(unit?.size),
    status: unit?.status && unit.status !== 'Occupied' ? unit.status : 'Available',
    monthlyRent: n(unit?.monthlyRent),
    depositAmount: n(unit?.depositAmount),
    parkingFee: n(unit?.parkingFee),
    internetFee: n(unit?.internetFee),
    garbageFee: n(unit?.garbageFee),
    managementFee: n(unit?.managementFee),
    additionalFee: n(unit?.additionalFee),
    startElectricityReading: n(unit?.startElectricityReading),
    startWaterReading: n(unit?.startWaterReading),
    notes: s(unit?.notes),
  }, {
    unitCode: required('Unit code'),
    monthlyRent: numeric('Monthly rent', { required: true }),
    depositAmount: numeric('Deposit'),
    parkingFee: numeric('Parking fee'),
    internetFee: numeric('Internet fee'),
    garbageFee: numeric('Garbage fee'),
    managementFee: numeric('Management fee'),
    additionalFee: numeric('Additional fee'),
    startElectricityReading: numeric('Electricity reading'),
    startWaterReading: numeric('Water reading'),
  });

  const save = f.submit(async v => {
    const body = {
      unitCode: v.unitCode.trim(),
      floorNumber: str(v.floorNumber),
      roomType: str(v.roomType) ?? '',
      size: str(v.size) ?? '',
      status: unit?.status === 'Occupied' ? undefined : v.status,
      monthlyRent: num(v.monthlyRent),
      depositAmount: num(v.depositAmount) ?? 0,
      parkingFee: num(v.parkingFee) ?? 0,
      internetFee: num(v.internetFee) ?? 0,
      garbageFee: num(v.garbageFee) ?? 0,
      managementFee: num(v.managementFee) ?? 0,
      additionalFee: num(v.additionalFee) ?? 0,
      startElectricityReading: num(v.startElectricityReading) ?? 0,
      startWaterReading: num(v.startWaterReading) ?? 0,
      notes: v.notes,
      propertyId: unit?.propertyId ?? propertyId ?? undefined,
    };
    if (editing) await unitsApi.update(unit.id, body);
    else await unitsApi.create(body);
  }, () => nav.goBack());

  const money = (key: keyof typeof f.values, label: string) => (
    <View style={styles.half}>
      <TextField label={label} keyboardType="decimal-pad" prefix="$" placeholder="0.00" {...f.field(key)} />
    </View>
  );

  return (
    <Screen
      header={<Header title={editing ? `Edit unit ${unit.unitCode}` : 'New unit'} />}
      footer={<Button title={editing ? 'Save changes' : 'Create unit'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <Text style={styles.section}>Basics</Text>
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Unit code" required placeholder="e.g. 101" autoCapitalize="characters" {...f.field('unitCode')} /></View>
          <View style={styles.half}><TextField label="Floor" placeholder="1" keyboardType="number-pad" {...f.field('floorNumber')} /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Room type" placeholder="Studio" {...f.field('roomType')} /></View>
          <View style={styles.half}><TextField label="Size" placeholder="24 m²" {...f.field('size')} /></View>
        </View>
        {unit?.status === 'Occupied' ? (
          <Text style={[font.caption, { marginBottom: spacing.lg }]}>Status is managed by the active contract (Occupied).</Text>
        ) : (
          <SelectField label="Status" value={f.values.status} options={STATUSES} onChange={v => f.set('status', v)} />
        )}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.section}>Rent & fees</Text>
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Monthly rent" required keyboardType="decimal-pad" prefix="$" placeholder="0.00" {...f.field('monthlyRent')} /></View>
          {money('depositAmount', 'Deposit')}
        </View>
        <View style={styles.row}>{money('parkingFee', 'Parking')}{money('internetFee', 'Internet')}</View>
        <View style={styles.row}>{money('garbageFee', 'Garbage')}{money('managementFee', 'Management')}</View>
        <View style={styles.row}>{money('additionalFee', 'Additional')}<View style={styles.half} /></View>
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.section}>Starting meter readings</Text>
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Electricity (kWh)" keyboardType="decimal-pad" placeholder="0" {...f.field('startElectricityReading')} /></View>
          <View style={styles.half}><TextField label="Water (m³)" keyboardType="decimal-pad" placeholder="0" {...f.field('startWaterReading')} /></View>
        </View>
        <TextField label="Notes" multiline placeholder="Anything worth remembering about this unit" {...f.field('notes')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...font.h3, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
