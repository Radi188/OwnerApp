import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { announcementsApi, pickList, templatesApi, unitsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { required, useForm } from '../../hooks/useForm';
import {
  Button, Card, confirmAction, FilterChips, Header, IconButton, ListRow, Screen, SelectField, Sheet, TextField,
} from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';
import { errMsg, stripHtml, textToHtml } from '../../utils/format';
import { ANNOUNCEMENT_TYPES, typeMeta } from './AnnouncementsScreen';

const AUDIENCES = [
  { label: 'Everyone', value: 'all' },
  { label: 'Tenants', value: 'tenant' },
  { label: 'Employees', value: 'employee' },
  { label: 'Managers', value: 'manager' },
  { label: 'Admins', value: 'admin' },
];

const VARIABLES = ['tenant_name', 'unit_code', 'property_name'];

export default function AnnouncementFormScreen() {
  const nav = useNavigation<any>();
  const params = useRoute<any>().params ?? {};
  const announcement = params.announcement;
  const seed = announcement ?? params.template; // prefill from a template when "Use" is tapped
  const editing = !!announcement;
  const { propertyId, can } = useAuth();
  const [tplOpen, setTplOpen] = useState(false);
  const [target, setTarget] = useState<'all' | 'units'>(announcement?.unitId ? 'units' : 'all');
  const [unitIds, setUnitIds] = useState<number[]>(announcement?.unitId ? [announcement.unitId] : []);

  const templates = useApi(async () => pickList(await templatesApi.list(), 'data'), [], { refetchOnFocus: false });
  const units = useApi(async () => pickList(await unitsApi.list({ sort: 'unitCode' }), 'units'), [], { refetchOnFocus: false });

  const f = useForm({
    title: stripHtml(seed?.title ?? ''),
    content: stripHtml(seed?.content ?? ''),
    type: seed?.type ?? 'general',
    audience: seed?.audience ?? 'all',
  }, { title: required('Title'), content: required('Message') });

  const applyTemplate = (t: any) => {
    f.set('title', stripHtml(t.title));
    f.set('content', stripHtml(t.content));
    if (t.type) f.set('type', t.type);
    if (t.audience) f.set('audience', t.audience);
    setTplOpen(false);
  };

  const unitOptions = useMemo(() => (units.data ?? []).map(u => ({ id: u.id as number, code: String(u.unitCode) })), [units.data]);
  const toggleUnit = (id: number) => setUnitIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const save = f.submit(async v => {
    if (target === 'units' && unitIds.length === 0) throw new Error('Pick at least one unit, or send to everyone.');
    const body = {
      title: v.title.trim(),
      content: textToHtml(v.content.trim()),
      type: v.type,
      audience: v.audience,
      propertyId: propertyId ?? undefined,
      ...(target === 'units' ? { unitIds } : {}),
    };
    if (editing) await announcementsApi.update(announcement.id, body);
    else await announcementsApi.create(body);
  }, () => nav.goBack());

  const onDelete = () => confirmAction('Delete announcement', 'Delete this announcement for everyone?', async () => {
    try { await announcementsApi.remove(announcement.id); nav.goBack(); } catch (e) { Alert.alert('Delete failed', errMsg(e)); }
  });

  const meta = typeMeta(f.values.type);

  return (
    <Screen
      header={
        <Header
          title={editing ? 'Edit announcement' : 'New announcement'}
          right={!editing ? <IconButton icon="documents-outline" onPress={() => setTplOpen(true)} /> : undefined}
        />
      }
      footer={<Button title={editing ? 'Save changes' : 'Publish'} icon={editing ? undefined : 'paper-plane-outline'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      {!editing && (templates.data ?? []).length ? (
        <TouchableOpacity style={styles.tplBanner} onPress={() => setTplOpen(true)} activeOpacity={0.85}>
          <Icon name="documents-outline" size={18} color={colors.primary} />
          <Text style={styles.tplText}>Start from a template ({templates.data!.length})</Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}

      <Card>
        <Text style={styles.label}>Type</Text>
        <FilterChips value={f.values.type} onChange={v => f.set('type', v)} options={ANNOUNCEMENT_TYPES} style={{ marginBottom: spacing.lg }} />
        <TextField label="Title" required placeholder={`${meta.label} notice`} {...f.field('title')} />
        <TextField label="Message" required multiline placeholder="Write the announcement…" style={{ minHeight: 160 }} {...f.field('content')} />
        <Text style={font.caption}>
          Variables: {VARIABLES.map(v => `[[${v}]]`).join('  ')} are filled in per tenant.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <SelectField label="Audience" value={f.values.audience} options={AUDIENCES} onChange={v => f.set('audience', v)} />
        <Text style={styles.label}>Send to</Text>
        <FilterChips
          value={target}
          onChange={setTarget}
          options={[{ label: 'Whole property', value: 'all' }, { label: `Specific units${unitIds.length ? ` (${unitIds.length})` : ''}`, value: 'units' }]}
        />
        {target === 'units' ? (
          <View style={styles.unitGrid}>
            {unitOptions.map(u => {
              const on = unitIds.includes(u.id);
              return (
                <TouchableOpacity key={u.id} style={[styles.unit, on && styles.unitOn]} onPress={() => toggleUnit(u.id)}>
                  <Text style={[styles.unitText, on && { color: colors.white }]}>{u.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </Card>

      {editing && can('delete', 'announcement') ? (
        <Button title="Delete announcement" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
      ) : null}

      <Sheet visible={tplOpen} onClose={() => setTplOpen(false)} title="Templates">
        {(templates.data ?? []).map((t: any) => (
          <ListRow
            key={t.id}
            title={t.name}
            subtitle={stripHtml(t.title)}
            onPress={() => applyTemplate(t)}
            style={{ borderRadius: radius.md, paddingHorizontal: 8 }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...font.caption, color: colors.text, fontWeight: '600', marginBottom: 6 },
  tplBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, borderRadius: radius.md,
    padding: 14, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primaryTint,
  },
  tplText: { flex: 1, color: colors.primary, fontWeight: '700' },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  unit: { paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  unitOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitText: { fontWeight: '700', color: colors.text, fontSize: 13 },
});
