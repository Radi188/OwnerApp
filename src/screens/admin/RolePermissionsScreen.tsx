import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import { Button, ErrorView, Header, LoadingView, Screen, SearchBar } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { pickOne, rolesApi } from '../../services/api';
import { colors, radius, spacing } from '../../theme';
import { capitalize, errMsg } from '../../utils/format';

type Perm = { id: number; name: string; description?: string };
type Feature = { key: string; title: string; perms: Perm[] };

/** Walk any `type → feature → [permission]` nesting and return one entry per feature. */
function toFeatures(grouped: any): Feature[] {
  const out: Feature[] = [];
  const walk = (node: any, path: string[]) => {
    if (Array.isArray(node)) {
      const perms = node.filter(p => p && p.id != null && p.name);
      if (perms.length) out.push({ key: path.join('/'), title: path[path.length - 1] ?? '', perms });
      return;
    }
    if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => walk(v, [...path, k]));
  };
  walk(grouped, []);
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Names the role already has (its `permissions` come grouped like the login response). */
function namesOf(rolePerms: any): Set<string> {
  const out = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(p => (typeof p === 'string' ? out.add(p) : p?.name && out.add(p.name)));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(rolePerms);
  return out;
}

/**
 * Permission matrix for one role (FRONTEND_GUIDE §19). `POST /roles/:id/permissions` replaces the
 * whole list. You can only grant permissions you have, and you can't edit your own role.
 */
export default function RolePermissionsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { role } = useRoute<any>().params as { role: any };
  const { user, hasPermission, can } = useAuth();
  const ownRole = user?.roleId === role.id || user?.role?.id === role.id;
  const readOnly = ownRole || !can('assign', 'permission');

  const all = useApi(async () => {
    const [g, r] = await Promise.all([rolesApi.groupedPermissions(), rolesApi.get(role.id)]);
    return { features: toFeatures((g as any)?.data ?? g), role: pickOne<any>(r, 'roles', 'role') };
  }, [role.id], { refetchOnFocus: false });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  // Initial selection = the role's current permissions
  useEffect(() => {
    if (!all.data) return;
    const have = namesOf(all.data.role?.permissions);
    const ids = new Set<number>();
    all.data.features.forEach(f => f.perms.forEach(p => { if (have.has(p.name)) ids.add(p.id); }));
    setSelected(ids);
  }, [all.data]);

  const features = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = all.data?.features ?? [];
    if (!s) return list;
    return list
      .map(f => ({ ...f, perms: f.perms.filter(p => p.name.toLowerCase().includes(s) || f.title.toLowerCase().includes(s)) }))
      .filter(f => f.perms.length);
  }, [all.data, q]);

  const toggle = (p: Perm) => {
    if (readOnly || !hasPermission(p.name)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
      return next;
    });
  };

  const save = async () => {
    const isTenantRole = String(role.name).toLowerCase() === 'tenant';
    const createPayment = (all.data?.features ?? []).flatMap(f => f.perms).find(p => p.name === 'create payment');
    const doSave = async () => {
      setSaving(true);
      try {
        await rolesApi.setPermissions(role.id, [...selected]);
        nav.goBack();
      } catch (e) {
        Alert.alert(t('common.error'), errMsg(e));
      } finally {
        setSaving(false);
      }
    };
    // Tenants need `create payment` to pay from the tenant app
    if (isTenantRole && createPayment && !selected.has(createPayment.id)) {
      Alert.alert(t('rolePerms.tenantWarnTitle'), t('rolePerms.tenantWarnMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('rolePerms.saveAnyway'), style: 'destructive', onPress: doSave },
      ]);
    } else {
      doSave();
    }
  };

  /** "verify payment" → "Verify" (the feature name is the card title) */
  const verb = (name: string) => capitalize(name.split(' ')[0]);

  return (
    <Screen
      header={<Header title={role.name} subtitle={t('rolePerms.subtitle', { count: selected.size })} />}
      footer={readOnly ? undefined : <Button title={t('rolePerms.save')} onPress={save} loading={saving} style={{ flex: 1 }} />}
    >
      {readOnly ? (
        <View style={styles.notice}>
          <Icon name="lock-closed-outline" size={16} color={colors.warning} />
          <Text style={styles.noticeText}>{ownRole ? t('rolePerms.ownRole') : t('rolePerms.noAccess')}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>{t('rolePerms.hint')}</Text>
      )}
      <SearchBar value={q} onChangeText={setQ} placeholder={t('rolePerms.search')} />

      {all.loading ? <LoadingView /> : all.error ? <ErrorView message={all.error} onRetry={all.refresh} /> : (
        <View style={{ gap: 10, marginTop: spacing.md }}>
          {features.map(f => {
            const on = f.perms.filter(p => selected.has(p.id)).length;
            return (
              <View key={f.key} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.feature}>{capitalize(f.title.replace(/[-_]/g, ' '))}</Text>
                  <Text style={styles.count}>{on}/{f.perms.length}</Text>
                </View>
                <View style={styles.chips}>
                  {f.perms.map(p => {
                    const active = selected.has(p.id);
                    const allowed = hasPermission(p.name);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => toggle(p)}
                        disabled={readOnly || !allowed}
                        style={[styles.chip, active && styles.chipOn, (!allowed || readOnly) && styles.chipOff]}
                        accessibilityLabel={p.name}
                      >
                        <Icon name={active ? 'checkbox' : 'square-outline'} size={15} color={active ? colors.primary : colors.muted} />
                        <Text style={[styles.chipText, active && { color: colors.primary }]}>{verb(p.name)}</Text>
                        {!allowed ? <Icon name="lock-closed" size={10} color={colors.muted} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.muted, marginBottom: 10, paddingHorizontal: 4, lineHeight: 17 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.warningSoft, marginBottom: 10 },
  noticeText: { flex: 1, fontSize: 13, color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  feature: { fontSize: 15, fontWeight: '700', color: colors.ink },
  count: { fontSize: 12, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipOff: { opacity: 0.45 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
});
