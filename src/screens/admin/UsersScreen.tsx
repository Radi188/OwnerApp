import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { pickList, usersApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import {
  Avatar, Badge, Card, EmptyState, ErrorView, FAB, FilterChips, Header, ListRow, LoadingView, Screen, SearchBar,
} from '../../components/ui';
import { spacing } from '../../theme';
import { capitalize, timeAgo } from '../../utils/format';

export default function UsersScreen() {
  const nav = useNavigation<any>();
  const { can, user: me } = useAuth();
  const [q, setQ] = useState('');
  const [type, setType] = useState('system_user');

  const { data, loading, error, refreshing, refresh } = useApi(async () => pickList(await usersApi.list(), 'users'), []);
  const all = useMemo(() => data ?? [], [data]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(u =>
      (type === 'all' || u.type === type || (type === 'tenant' && u.type !== 'system_user')) &&
      (!s || [u.username, u.role?.name].some(x => String(x ?? '').toLowerCase().includes(s))),
    );
  }, [all, q, type]);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={refresh} header={<Header title="Users" subtitle="Staff accounts & tenant logins" />}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search username or role" />
        <FilterChips
          style={{ marginTop: 12 }}
          value={type}
          onChange={setType}
          options={[
            { label: 'Staff', value: 'system_user', count: all.filter(u => u.type === 'system_user').length },
            { label: 'Tenants', value: 'tenant', count: all.filter(u => u.type !== 'system_user').length },
            { label: 'All', value: 'all', count: all.length },
          ]}
        />
        <View style={{ marginTop: spacing.lg, paddingBottom: 72 }}>
          {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : list.length === 0 ? (
            <EmptyState icon="people-circle-outline" title="No users" />
          ) : (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {list.map(u => (
                <ListRow
                  key={u.id}
                  left={<Avatar name={u.username} tone={u.type === 'system_user' ? 'violet' : 'primary'} />}
                  title={`${u.username}${u.id === me?.id ? ' (you)' : ''}`}
                  subtitle={u.role?.name ?? capitalize(u.type)}
                  meta={`Joined ${timeAgo(u.createdAt)}`}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {u.isLocked ? <Badge label="Locked" tone="danger" /> : !u.isActive ? <Badge label="Inactive" tone="neutral" /> : null}
                      {u.mustChangePassword ? <Badge label="Temp password" tone="warning" /> : null}
                    </View>
                  }
                  onPress={can('edit', 'user') ? () => nav.navigate('UserForm', { user: u }) : undefined}
                />
              ))}
            </Card>
          )}
        </View>
      </Screen>
      {can('create', 'user') ? <FAB label="New user" icon="person-add-outline" onPress={() => nav.navigate('UserForm', {})} /> : null}
    </View>
  );
}
