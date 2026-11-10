import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formOptionsApi, tenantsApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { required, str, useForm } from '../../hooks/useForm';
import { Button, Card, Header, Screen, Segmented, SelectField, TextField } from '../../components/ui';
import TenantCredentialsSheet from '../../components/TenantCredentialsSheet';
import type { TenantCredentials } from '../../services/types';
import { useTranslation } from 'react-i18next';
import { font, spacing } from '../../theme';

const DEFAULT_VEHICLES = ['Motorcycle', 'Car', 'Bicycle', 'Tuk-tuk', 'Other'];

export default function TenantFormScreen() {
  const nav = useNavigation<any>();
  const tenant = useRoute<any>().params?.tenant;
  const editing = !!tenant;
  const { t } = useTranslation();
  // Login details are returned once on create — show them before leaving the screen
  const [created, setCreated] = useState<{ name: string; credentials: TenantCredentials } | null>(null);

  const opts = useApi(async () => (await formOptionsApi.get())?.data, [], { refetchOnFocus: false });
  const vehicles: string[] = opts.data?.vehicle_types?.length ? opts.data.vehicle_types : DEFAULT_VEHICLES;

  const f = useForm({
    name: tenant?.name ?? '',
    phoneNumber: tenant?.phoneNumber ?? '',
    gender: (tenant?.gender ?? '') as '' | 'male' | 'female' | 'other',
    idNumber: tenant?.idNumber ?? '',
    emergencyContact: tenant?.emergencyContact ?? '',
    occupation: tenant?.occupation ?? '',
    status: (tenant?.status ?? 'Active') as 'Active' | 'Inactive',
    vehicleType: tenant?.vehicleType ?? '',
    vehicleModel: tenant?.vehicleModel ?? '',
    plateNumber: tenant?.plateNumber ?? '',
  }, {
    name: required('Name'),
    phoneNumber: v => required('Phone number')(v) ?? (/^[0-9+\s-]{6,}$/.test(String(v).trim()) ? null : 'Enter a valid phone number'),
  });

  const save = f.submit(async v => {
    const body = {
      name: v.name.trim(),
      phoneNumber: v.phoneNumber.trim(),
      gender: v.gender || null,
      idNumber: str(v.idNumber),
      emergencyContact: str(v.emergencyContact),
      occupation: str(v.occupation),
      status: v.status,
      vehicleType: str(v.vehicleType),
      vehicleModel: str(v.vehicleModel),
      plateNumber: str(v.plateNumber),
    };
    if (editing) {
      await tenantsApi.update(tenant.id, body);
      return;
    }
    try {
      const res = await tenantsApi.create(body);
      if (res.credentials) setCreated({ name: body.name, credentials: res.credentials });
    } catch (e: any) {
      // 409 "This phone number is already registered." → show it on the phone field
      if (e?.status === 409) f.setErrors({ phoneNumber: e.message });
      throw e;
    }
  }, () => { if (editing) nav.goBack(); });

  return (
    <Screen
      header={<Header title={editing ? 'Edit tenant' : 'New tenant'} subtitle={editing ? tenant.name : 'A tenant app account is created automatically'} />}
      footer={<Button title={editing ? 'Save changes' : 'Create tenant'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <Text style={styles.section}>Personal details</Text>
        <TextField label="Full name" required placeholder="e.g. Sok Dara" autoCapitalize="words" {...f.field('name')} />
        <TextField label="Phone number" required placeholder="012 345 678" keyboardType="phone-pad" {...f.field('phoneNumber')} />
        <SelectField
          label="Gender"
          variant="chips"
          value={f.values.gender || null}
          options={[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }]}
          onChange={v => f.set('gender', v)}
        />
        <TextField label="ID card number" icon="card-outline" placeholder="e.g. 110613676(01)" {...f.field('idNumber')} />
        <TextField label="Emergency contact" placeholder="Phone of a relative" keyboardType="phone-pad" {...f.field('emergencyContact')} />
        <TextField label="Occupation" placeholder="e.g. Designer" {...f.field('occupation')} />
        {editing ? (
          <>
            <Text style={styles.label}>Status</Text>
            <Segmented value={f.values.status} onChange={v => f.set('status', v)} options={[{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }]} />
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={styles.section}>Vehicle</Text>
        <SelectField
          label="Vehicle type"
          value={f.values.vehicleType || null}
          options={[{ label: 'None', value: '' }, ...vehicles.map(v => ({ label: v, value: v }))]}
          onChange={v => f.set('vehicleType', v)}
          placeholder="None"
        />
        {f.values.vehicleType ? (
          <View style={styles.row}>
            <View style={styles.half}><TextField label="Model" placeholder="Honda Dream" {...f.field('vehicleModel')} /></View>
            <View style={styles.half}><TextField label="Plate number" placeholder="1A-2345" autoCapitalize="characters" {...f.field('plateNumber')} /></View>
          </View>
        ) : null}
        <Text style={font.caption}>ID card / passport photos can be uploaded from the web dashboard.</Text>
      </Card>
      <TenantCredentialsSheet
        visible={!!created}
        name={created?.name}
        credentials={created?.credentials ?? null}
        onDone={() => { setCreated(null); nav.goBack(); }}
        doneLabel={t('common.done')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...font.h3, marginBottom: spacing.md },
  label: { ...font.caption, color: '#1E293B', fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
