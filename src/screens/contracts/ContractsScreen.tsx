import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation } from '@react-navigation/native';
import { contractsApi, pickList } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import {
  Avatar, Badge, Card, EmptyState, ErrorView, FAB, FilterChips, Header, ListRow, LoadingView, Screen, SearchBar,
} from '../../components/ui';
import { colors, font, spacing } from '../../theme';
import { daysUntil, fmtDate, money } from '../../utils/format';

export default function ContractsScreen() {
  const nav = useNavigation<any>();
  const { propertyId, can } = useAuth();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const { data, loading, error, refreshing, refresh } = useApi(
    async () => pickList(await contractsApi.list({ sort: '-createdAt' }), 'contracts'),
    [propertyId],
  );

  const all = useMemo(() => data ?? [], [data]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(c =>
      (status === 'all' || c.status === status) &&
      (!s || [c.tenant?.name, c.unit?.unitCode].some(x => String(x ?? '').toLowerCase().includes(s))),
    );
  }, [all, status, q]);
  const count = (s: string) => all.filter(c => c.status === s).length;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={refresh}
        header={<Header title="Contracts" subtitle={`${count('Active')} active · ${all.length} total`} />}
      >
        <SearchBar value={q} onChangeText={setQ} placeholder="Search tenant or unit" />
        <FilterChips
          style={{ marginTop: 12 }}
          value={status}
          onChange={setStatus}
          options={[
            { label: 'All', value: 'all', count: all.length },
            ...['Active', 'Expired', 'Terminated'].map(s => ({ label: s, value: s, count: count(s) })),
          ]}
        />
        <View style={{ marginTop: spacing.lg, paddingBottom: 72 }}>
          {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : list.length === 0 ? (
            <EmptyState icon="document-text-outline" title="No contracts" message="Create a contract to move a tenant into a unit." />
          ) : (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {list.map(c => {
                const left = daysUntil(c.endDate);
                const soon = c.status === 'Active' && left <= 30;
                return (
                  <ListRow
                    key={c.id}
                    left={<Avatar name={c.tenant?.name} />}
                    title={c.tenant?.name ?? 'Tenant'}
                    subtitle={`Unit ${c.unit?.unitCode ?? '—'} · ${money(c.monthlyRent)}/${c.rentCycle ?? 'month'}`}
                    meta={`${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`}
                    right={
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Badge status={c.status} />
                        {soon ? <Text style={[font.tiny, { color: colors.danger }]}>{left <= 0 ? 'ended' : `${left}d left`}</Text> : null}
                      </View>
                    }
                    chevron={false}
                    onPress={() => nav.navigate('ContractDetail', { contractId: c.id })}
                  />
                );
              })}
            </Card>
          )}
        </View>
      </Screen>
      {can('create', 'contract') ? <FAB label="New contract" onPress={() => nav.navigate('ContractForm', {})} /> : null}
    </View>
  );
}
