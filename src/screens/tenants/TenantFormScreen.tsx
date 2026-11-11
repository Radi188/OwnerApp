import React, { useRef, useState } from 'react';
import { Alert, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ApiError, formOptionsApi, occupantsApi, tenantsApi, type OccupantDraft, type UploadFile } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { required, str, useForm } from '../../hooks/useForm';
import { Button, Card, FilterChips, Header, ImageUpload, Screen, Segmented, SelectField, TextField } from '../../components/ui';
import TenantCredentialsSheet from '../../components/TenantCredentialsSheet';
import { toast } from '../../components/Toast';
import type { TenantCredentials } from '../../services/types';
import { useTranslation } from 'react-i18next';
import { statusLabel } from '../../i18n';
import { colors, font, radius, spacing } from '../../theme';
import { RELATIONSHIPS } from './OccupantFormScreen';

const DEFAULT_VEHICLES = ['Motorcycle', 'Car', 'Bicycle', 'Tuk-tuk', 'Other'];

/** Tenant status values from the API (FRONTEND_GUIDE §8): set by move-in / move-out. */
type TenantStatus = 'Active' | 'Moved Out';

type Draft = OccupantDraft & { key: number; error?: string; photo?: UploadFile | null };
const emptyDraft = (key: number): Draft => ({
  key, name: '', relationship: 'Relative', phoneNumber: '', vehicleType: '', vehicleModel: '', plateNumber: '',
});

// ─── One occupant card (create flow) ─────────────────────────────────────────
function OccupantCard({
  index, draft, vehicles, onChange, onRemove,
}: {
  index: number;
  draft: Draft;
  vehicles: string[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.occCard}>
      <View style={styles.occHead}>
        <View style={styles.occBadge}><Text style={styles.occBadgeText}>{index + 1}</Text></View>
        <Text style={styles.occTitle} numberOfLines={1}>{draft.name.trim() || `Person ${index + 1}`}</Text>
        <Pressable onPress={onRemove} hitSlop={10} style={styles.occRemove} accessibilityLabel={`Remove person ${index + 1}`}>
          <Icon name="trash-outline" size={16} color={colors.danger} />
        </Pressable>
      </View>

      <TextField
        label="Full name"
        required
        placeholder="e.g. Chan Sophea"
        autoCapitalize="words"
        value={draft.name}
        onChangeText={v => onChange({ name: v, error: undefined })}
        error={draft.error}
      />
      <Text style={styles.label}>Relationship</Text>
      <FilterChips
        value={draft.relationship ?? 'Relative'}
        onChange={v => onChange({ relationship: v })}
        options={RELATIONSHIPS.map(r => ({ label: r, value: r }))}
        style={{ marginBottom: spacing.lg }}
      />
      <TextField
        label="Phone number"
        placeholder="012 345 678"
        keyboardType="phone-pad"
        value={draft.phoneNumber}
        onChangeText={v => onChange({ phoneNumber: v })}
      />
      <SelectField
        label="Vehicle type"
        value={draft.vehicleType || null}
        options={[{ label: 'None', value: '' }, ...vehicles.map(v => ({ label: v, value: v }))]}
        onChange={v => onChange({ vehicleType: v })}
        placeholder="None"
      />
      {draft.vehicleType ? (
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Model" placeholder="Honda Dream" value={draft.vehicleModel} onChangeText={v => onChange({ vehicleModel: v })} />
          </View>
          <View style={styles.half}>
            <TextField label="Plate number" placeholder="1A-2345" autoCapitalize="characters" value={draft.plateNumber} onChangeText={v => onChange({ plateNumber: v })} />
          </View>
        </View>
      ) : null}
      <ImageUpload
        label="ID card / passport"
        placeholder="Upload ID card / passport"
        value={draft.photo ?? null}
        onChange={file => onChange({ photo: file })}
      />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function TenantFormScreen() {
  const nav = useNavigation<any>();
  const tenant = useRoute<any>().params?.tenant;
  const editing = !!tenant;
  const { t } = useTranslation();
  const { propertyId } = useAuth();
  // Duplicate phone answer from the server (FRONTEND_UPDATE §1): TENANT_EXISTS / TENANT_DELETED / PHONE_TAKEN
  const [dup, setDup] = useState<{ code: string; message: string; tenant?: any } | null>(null);
  const [restoring, setRestoring] = useState(false);
  // Login details are returned once on create — show them before leaving the screen
  const [created, setCreated] = useState<{ name: string; credentials: TenantCredentials } | null>(null);

  const opts = useApi(async () => (await formOptionsApi.get())?.data, [], { refetchOnFocus: false });
  const vehicles: string[] = opts.data?.vehicle_types?.length ? opts.data.vehicle_types : DEFAULT_VEHICLES;

  // An active tenancy means the tenant still lives in a room — they leave through Move out
  const activeContract = editing
    ? (tenant.contracts ?? []).find((c: any) => String(c.status).toLowerCase() === 'active')
    : null;

  const f = useForm({
    name: tenant?.name ?? '',
    phoneNumber: tenant?.phoneNumber ?? '',
    gender: (tenant?.gender ?? '') as '' | 'male' | 'female' | 'other',
    idNumber: tenant?.idNumber ?? '',
    emergencyContact: tenant?.emergencyContact ?? '',
    occupation: tenant?.occupation ?? '',
    status: (String(tenant?.status ?? 'Active').toLowerCase() === 'active' ? 'Active' : 'Moved Out') as TenantStatus,
    vehicleType: tenant?.vehicleType ?? '',
    vehicleModel: tenant?.vehicleModel ?? '',
    plateNumber: tenant?.plateNumber ?? '',
  }, {
    name: required('Name'),
    phoneNumber: v => required('Phone number')(v) ?? (/^[0-9+\s-]{6,}$/.test(String(v).trim()) ? null : 'Enter a valid phone number'),
  });

  // ID card / passport photo: a newly picked file, otherwise the current server image is previewed
  const [idPhoto, setIdPhoto] = useState<UploadFile | null>(null);

  // ── Occupants (create only; existing tenants manage them from the tenant page) ──
  const [occupants, setOccupants] = useState<Draft[]>([]);
  const nextKey = useRef(1);
  const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const addOccupant = () => {
    animate();
    setOccupants(list => [...list, emptyDraft(nextKey.current++)]);
  };
  const updateOccupant = (key: number, patch: Partial<Draft>) =>
    setOccupants(list => list.map(o => (o.key === key ? { ...o, ...patch } : o)));
  const removeOccupant = (key: number) => {
    animate();
    setOccupants(list => list.filter(o => o.key !== key));
  };

  /** Drops untouched cards, flags cards that have details but no name. */
  const collectOccupants = (): { data: OccupantDraft; photo?: UploadFile | null }[] | null => {
    const filled = occupants.filter(o =>
      !!o.photo || [o.name, o.phoneNumber, o.vehicleType, o.vehicleModel, o.plateNumber].some(x => String(x ?? '').trim()));
    const missing = new Set(filled.filter(o => !o.name.trim()).map(o => o.key));
    if (missing.size) {
      setOccupants(list => list.map(o => (missing.has(o.key) ? { ...o, error: 'Name is required' } : o)));
      toast.warning('Each person needs a name, or remove the empty card.', { title: 'Check occupants' });
      return null;
    }
    return filled.map(o => ({
      data: {
        name: o.name.trim(),
        relationship: o.relationship,
        phoneNumber: str(o.phoneNumber),
        vehicleType: str(o.vehicleType),
        vehicleModel: o.vehicleType ? str(o.vehicleModel) : undefined,
        plateNumber: o.vehicleType ? str(o.plateNumber) : undefined,
      },
      photo: o.photo,
    }));
  };

  /**
   * Occupant photos can't go inside the `occupants` JSON, so after the tenant is created each
   * photo is uploaded to its new occupant (PATCH /occupants/:id, `idCardPassport`).
   */
  const uploadOccupantPhotos = async (createdOccupants: any[], people: { data: OccupantDraft; photo?: UploadFile | null }[]) => {
    const used = new Set<number>();
    const failed: string[] = [];
    await Promise.all(people.map(async (p, i) => {
      if (!p.photo) return;
      const norm = (x: any) => String(x ?? '').trim().toLowerCase();
      const match = createdOccupants.find(o => !used.has(o.id) && norm(o.name) === norm(p.data.name)
        && (!p.data.phoneNumber || norm(o.phoneNumber) === norm(p.data.phoneNumber)))
        ?? (createdOccupants[i] && !used.has(createdOccupants[i].id) ? createdOccupants[i] : null);
      if (!match) { failed.push(p.data.name); return; }
      used.add(match.id);
      try {
        await occupantsApi.update(match.id, { idCardPassport: p.photo });
      } catch {
        failed.push(p.data.name);
      }
    }));
    if (failed.length) {
      toast.warning(`Add the ID photo for ${failed.join(', ')} from the tenant page.`, { title: 'Some photos were not uploaded', duration: 6000 });
    }
  };

  const save = f.submit(async v => {
    const body = {
      name: v.name.trim(),
      phoneNumber: v.phoneNumber.trim(),
      gender: v.gender || null,
      idNumber: str(v.idNumber),
      emergencyContact: str(v.emergencyContact),
      occupation: str(v.occupation),
      // While living in a room the status is managed by move-in / move-out
      status: activeContract ? undefined : v.status,
      vehicleType: str(v.vehicleType),
      vehicleModel: str(v.vehicleModel),
      plateNumber: str(v.plateNumber),
      idCardPassport: idPhoto ?? undefined,
    };
    if (editing) {
      try {
        await tenantsApi.update(tenant.id, body);
      } catch (e) {
        throw handleDuplicate(e);
      }
      return;
    }
    const people = collectOccupants() ?? [];
    try {
      const res = await tenantsApi.create({ ...body, status: undefined, occupants: people.map(p => p.data) });
      if (people.some(p => p.photo)) await uploadOccupantPhotos(res.tenant?.occupants ?? [], people);
      if (res.credentials) setCreated({ name: body.name, credentials: res.credentials });
    } catch (e) {
      throw handleDuplicate(e);
    }
  }, () => { if (editing) nav.goBack(); }, {
    success: editing
      ? t('toast.updated')
      : t('toast.created', { name: f.values.name.trim() || 'Tenant' }),
  });

  /** Turns a duplicate-phone 409 into the inline card; returns the error to re-throw. */
  function handleDuplicate(e: unknown) {
    const err = e as ApiError;
    if (err?.status !== 409) return e;
    const code = err.code ?? 'PHONE_TAKEN';
    f.setErrors({ phoneNumber: code === 'PHONE_TAKEN' ? err.message : ' ' });
    setDup(code === 'PHONE_TAKEN' ? null : { code, message: err.message, tenant: err.data?.tenant });
    return Object.assign(new Error(err.message), { silent: true });
  }

  const openExisting = () => {
    if (dup?.tenant?.id) nav.replace('TenantDetail', { tenantId: dup.tenant.id });
  };

  const restoreDeleted = () => {
    const old = dup?.tenant;
    if (!old?.id) return;
    Alert.alert(t('tenantDup.restoreTitle'), t('tenantDup.restoreMsg', { name: old.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tenantDup.restore'),
        onPress: async () => {
          setRestoring(true);
          try {
            const restored = await tenantsApi.restore(old.id, propertyId ?? undefined);
            toast.success(t('tenantDup.restoredMsg'), { title: t('tenantDup.restored', { name: restored?.name ?? old.name }) });
            nav.replace('TenantDetail', { tenantId: restored?.id ?? old.id });
          } catch (err) {
            const ae = err as ApiError;
            toast.error(ae?.message ?? String(err));
            if (ae?.status === 409) handleDuplicate(ae);
          } finally {
            setRestoring(false);
          }
        },
      },
    ]);
  };

  // Check the occupant cards first so a missing name shows one clear message (not "Could not save")
  const onSave = () => {
    if (!editing && collectOccupants() === null) return;
    save();
  };

  const occupantCount = occupants.length;

  return (
    <Screen
      header={<Header title={editing ? 'Edit tenant' : 'New tenant'} subtitle={editing ? tenant.name : 'A tenant app account is created automatically'} />}
      footer={<Button title={editing ? 'Save changes' : 'Create tenant'} onPress={onSave} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <Text style={styles.section}>Personal details</Text>
        <TextField label="Full name" required placeholder="e.g. Sok Dara" autoCapitalize="words" {...f.field('name')} />
        <TextField
          label="Phone number"
          required
          placeholder="012 345 678"
          keyboardType="phone-pad"
          {...f.field('phoneNumber')}
          onChangeText={v => { f.set('phoneNumber', v); setDup(null); }}
        />
        {dup ? (
          <View style={[styles.dupCard, dup.code === 'TENANT_DELETED' ? styles.dupWarn : styles.dupDanger]}>
            <View style={styles.dupHead}>
              <Icon name={dup.code === 'TENANT_DELETED' ? 'refresh-circle-outline' : 'person-circle-outline'} size={20}
                color={dup.code === 'TENANT_DELETED' ? colors.warning : colors.danger} />
              <Text style={styles.dupText}>{dup.message}</Text>
            </View>
            {dup.tenant ? (
              <Text style={styles.dupMeta}>
                {[dup.tenant.name, dup.tenant.phoneNumber, dup.tenant.propertyName, dup.tenant.unitCode || dup.tenant.lastUnitCode].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {dup.code === 'TENANT_EXISTS' && dup.tenant?.id ? (
              <Button title={t('tenantDup.open')} icon="person-outline" variant="secondary" small onPress={openExisting} style={{ marginTop: spacing.md }} />
            ) : dup.code === 'TENANT_DELETED' && dup.tenant?.id ? (
              <Button title={t('tenantDup.restore')} icon="refresh-outline" small onPress={restoreDeleted} loading={restoring} style={{ marginTop: spacing.md }} />
            ) : null}
          </View>
        ) : null}
        <SelectField
          label="Gender"
          variant="chips"
          value={f.values.gender || null}
          options={[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }]}
          onChange={v => f.set('gender', v)}
        />
        <TextField label="ID card number" icon="card-outline" placeholder="e.g. 110613676(01)" {...f.field('idNumber')} />
        <ImageUpload
          label="ID card / passport"
          placeholder="Upload ID card / passport"
          value={idPhoto ?? tenant?.idCardPassport ?? null}
          onChange={setIdPhoto}
        />
        <TextField label="Emergency contact" placeholder="Phone of a relative" keyboardType="phone-pad" {...f.field('emergencyContact')} />
        <TextField label="Occupation" placeholder="e.g. Designer" {...f.field('occupation')} />

        {editing ? (
          <>
            <Text style={styles.label}>Status</Text>
            {activeContract ? (
              <View style={styles.statusBox}>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: colors.success }]} />
                  <Text style={styles.statusText}>
                    {statusLabel('Active')}
                    {activeContract.unit?.unitCode ? ` · ${t('billing.unit', { code: activeContract.unit.unitCode })}` : ''}
                  </Text>
                </View>
                <Text style={styles.hint}>
                  To mark this tenant as moved out, use Move out. It ends the tenancy, creates the final bill and handles the deposit.
                </Text>
                <Button
                  title={t('tenantView.moveOut')}
                  icon="exit-outline"
                  variant="secondary"
                  onPress={() => nav.navigate('MoveOut', { unitId: activeContract.unitId ?? activeContract.unit?.id })}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ) : (
              <Segmented
                value={f.values.status}
                onChange={v => f.set('status', v)}
                options={[
                  { label: statusLabel('Active'), value: 'Active' },
                  { label: statusLabel('Moved Out'), value: 'Moved Out' },
                ]}
              />
            )}
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
      </Card>

      {!editing ? (
        <Card style={{ marginTop: spacing.lg }}>
          {/* Same layout as the web dashboard: title + "Add Occupant" in the header */}
          <View style={styles.occHeader}>
            <View style={styles.flex}>
              <Text style={[styles.section, { marginBottom: 2 }]}>
                Occupants Information{occupantCount ? ` (${occupantCount})` : ''}
              </Text>
              <Text style={font.caption}>Family members or roommates living with the tenant.</Text>
            </View>
            <Pressable
              onPress={addOccupant}
              style={({ pressed }) => [styles.addHeaderBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Icon name="add" size={16} color={colors.ink} />
              <Text style={styles.addHeaderText}>Add Occupant</Text>
            </Pressable>
          </View>

          {occupantCount === 0 ? (
            <Pressable onPress={addOccupant} style={({ pressed }) => [styles.emptyBox, pressed && { opacity: 0.7 }]}>
              <Text style={styles.emptyText}>No Occupants Added</Text>
            </Pressable>
          ) : (
            <>
              {occupants.map((o, i) => (
                <OccupantCard
                  key={o.key}
                  index={i}
                  draft={o}
                  vehicles={vehicles}
                  onChange={patch => updateOccupant(o.key, patch)}
                  onRemove={() => removeOccupant(o.key)}
                />
              ))}
              <Pressable onPress={addOccupant} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
                <Icon name="person-add-outline" size={17} color={colors.primary} />
                <Text style={styles.addText}>Add another occupant</Text>
              </Pressable>
            </>
          )}
        </Card>
      ) : null}

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
  flex: { flex: 1 },
  section: { ...font.h3, marginBottom: spacing.md },
  dupCard: { borderRadius: radius.md, padding: spacing.md, marginTop: -6, marginBottom: spacing.lg, borderWidth: 1 },
  dupDanger: { backgroundColor: colors.dangerSoft, borderColor: '#FECACA' },
  dupWarn: { backgroundColor: colors.warningSoft, borderColor: '#FDE68A' },
  dupHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dupText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink, lineHeight: 19 },
  dupMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginLeft: 28 },
  label: { ...font.caption, color: colors.text, fontWeight: '600', marginBottom: 6 },
  hint: { ...font.caption, marginTop: 6, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },

  statusBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },

  occHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  addHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, height: 36, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  addHeaderText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 26,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md,
  },
  emptyText: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  occCard: {
    borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surfaceAlt,
  },
  occHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  occBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  occBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  occTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  occRemove: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primaryTint, borderRadius: radius.md,
    paddingVertical: 14, backgroundColor: colors.primarySoft,
  },
  addText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
