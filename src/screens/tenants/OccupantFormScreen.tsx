import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { occupantsApi, type UploadFile } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { required, str, useForm } from '../../hooks/useForm';
import { Button, Card, confirmAction, FilterChips, Header, ImageUpload, Screen, TextField } from '../../components/ui';
import { font, spacing } from '../../theme';
import { errMsg } from '../../utils/format';
import { toast } from '../../components/Toast';

export const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Relative', 'Friend', 'Roommate', 'Other'];

export default function OccupantFormScreen() {
  const nav = useNavigation<any>();
  const { tenantId, occupant } = useRoute<any>().params;
  const editing = !!occupant;
  const { can } = useAuth();
  const [idPhoto, setIdPhoto] = useState<UploadFile | null>(null);

  const f = useForm({
    name: occupant?.name ?? '',
    relationship: occupant?.relationship ?? 'Relative',
    phoneNumber: occupant?.phoneNumber ?? '',
    vehicleType: occupant?.vehicleType ?? '',
    vehicleModel: occupant?.vehicleModel ?? '',
    plateNumber: occupant?.plateNumber ?? '',
  }, { name: required('Name') });

  const save = f.submit(async v => {
    const body = {
      tenantId,
      name: v.name.trim(),
      relationship: v.relationship,
      phoneNumber: str(v.phoneNumber),
      vehicleType: str(v.vehicleType),
      vehicleModel: str(v.vehicleModel),
      plateNumber: str(v.plateNumber),
      idCardPassport: idPhoto ?? undefined,
    };
    if (editing) await occupantsApi.update(occupant.id, body);
    else await occupantsApi.create(body);
  }, () => nav.goBack(), { success: editing ? 'Occupant updated' : 'Occupant added' });

  const onDelete = () => confirmAction('Remove occupant', `Remove ${occupant?.name}?`, async () => {
    try { await occupantsApi.remove(occupant.id); toast.deleted(); nav.goBack(); } catch (e) { toast.error(errMsg(e), { title: 'Remove failed' }); }
  });

  return (
    <Screen
      header={<Header title={editing ? 'Edit occupant' : 'Add occupant'} subtitle="People living with the tenant" />}
      footer={<Button title={editing ? 'Save' : 'Add occupant'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <TextField label="Full name" required autoCapitalize="words" {...f.field('name')} />
        <Text style={styles.label}>Relationship</Text>
        <FilterChips
          value={f.values.relationship}
          onChange={v => f.set('relationship', v)}
          options={RELATIONSHIPS.map(r => ({ label: r, value: r }))}
          style={{ marginBottom: spacing.lg }}
        />
        <TextField label="Phone number" keyboardType="phone-pad" {...f.field('phoneNumber')} />
        <ImageUpload
          label="ID card / passport"
          placeholder="Upload ID card / passport"
          value={idPhoto ?? occupant?.idCardPassport ?? null}
          onChange={setIdPhoto}
        />
      </Card>
      <Card style={{ marginTop: spacing.lg }}>
        <TextField label="Vehicle type" placeholder="Motorcycle" {...f.field('vehicleType')} />
        <View style={styles.row}>
          <View style={styles.half}><TextField label="Model" {...f.field('vehicleModel')} /></View>
          <View style={styles.half}><TextField label="Plate number" autoCapitalize="characters" {...f.field('plateNumber')} /></View>
        </View>
      </Card>
      {editing && can('delete', 'occupant') ? (
        <Button title="Remove occupant" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...font.caption, color: '#1E293B', fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
