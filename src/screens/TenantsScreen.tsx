import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { contractsApi, pickList, tenantsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import {
  Avatar, Badge, Card, EmptyState, ErrorView, FilterChips, Header, IconButton, ListRow, LoadingView, Screen, SearchBar,
} from '../components/ui';
import { colors, font, spacing } from '../theme';
import { statusLabel } from '../i18n';

export default function TenantsScreen() {
  const nav = useNavigation<any>();
  const { propertyId, can } = useAuth();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'here' | 'all' | 'movedOut'>('here');

  const { data, loading, error, refreshing, refresh } = useApi(async () => {
    const [t, c] = await Promise.all([
      tenantsApi.list(),
      contractsApi.list({ status: 'Active' }).catch(() => null),
    ]);
    // tenantId → active contract in the current property
    const byTenant = new Map<number, any>();
    pickList(c, 'contracts').forEach((ct: any) => byTenant.set(ct.tenantId, ct));
    return { tenants: pickList(t, 'tenants'), byTenant };
  }, [propertyId]);

  const tenants = useMemo(() => data?.tenants ?? [], [data]);
  const byTenant = useMemo(() => data?.byTenant ?? new Map<number, any>(), [data]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tenants
      .filter(t => {
        if (scope === 'here') return byTenant.has(t.id);
        if (scope === 'movedOut') return t.status !== 'Active';
        return true;
      })
      .filter(t => !s || [t.name, t.phoneNumber, byTenant.get(t.id)?.unit?.unitCode].some(x => String(x ?? '').toLowerCase().includes(s)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [tenants, byTenant, q, scope]);

  return (
    <Screen
      tabBarSpace
      refreshing={refreshing}
      onRefresh={refresh}
      header={
        <Header
          back={false}
          title="Tenants"
          subtitle={`${byTenant.size} renting here · ${tenants.length} total`}
          right={can('create', 'tenant') ? <IconButton icon="person-add-outline" color={colors.white} bg={colors.primary} onPress={() => nav.navigate('TenantForm', {})} /> : undefined}
        />
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search name, phone or unit" />
      <FilterChips
        style={{ marginTop: 12 }}
        value={scope}
        onChange={setScope}
        options={[
          { label: 'Renting here', value: 'here', count: byTenant.size },
          { label: 'All tenants', value: 'all', count: tenants.length },
          { label: statusLabel('Moved Out'), value: 'movedOut', count: tenants.filter(t => t.status !== 'Active').length },
        ]}
      />

      <View style={{ marginTop: spacing.lg }}>
        {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : list.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title={q ? 'No matches' : scope === 'here' ? 'No tenants renting here' : 'No tenants'}
            message={scope === 'here' ? 'Tenants appear here once they have an active contract in this property.' : undefined}
          />
        ) : (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {list.map(t => {
              const ct = byTenant.get(t.id);
              return (
                <ListRow
                  key={t.id}
                  left={<Avatar name={t.name} tone={t.status === 'Active' ? 'primary' : 'neutral'} />}
                  title={t.name}
                  subtitle={ct ? `Unit ${ct.unit?.unitCode ?? '—'} · ${t.phoneNumber}` : t.phoneNumber}
                  meta={t.occupation || undefined}
                  right={
                    <View style={styles.right}>
                      {t.status !== 'Active' ? <Badge status={t.status} /> : null}
                      {t.phoneNumber ? (
                        <TouchableOpacity style={styles.call} onPress={() => Linking.openURL(`tel:${t.phoneNumber}`)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Icon name="call" size={15} color={colors.primary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  }
                  onPress={() => nav.navigate('TenantDetail', { tenantId: t.id })}
                />
              );
            })}
          </Card>
        )}
      </View>
      {!loading && list.length ? <Text style={[font.caption, { textAlign: 'center', marginTop: 12 }]}>{list.length} tenant{list.length === 1 ? '' : 's'}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  call: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
