import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AssignPropertiesSheet from '../../components/AssignPropertiesSheet';
import { useNavigation } from '@react-navigation/native';
import { pickList, usersApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import {
  Avatar, Badge, Card, EmptyState, ErrorView, FAB, FilterChips, Header, ListRow, LoadingView, Screen, SearchBar,
} from '../../components/ui';
import { colors, radius, spacing } from '../../theme';
import { capitalize, timeAgo } from '../../utils/format';

export default function UsersScreen() {
  const nav = useNavigation<any>();
  const { can, hasPermission, user: me } = useAuth();
  const canAssign = hasPermission('assign properties');
  const [q, setQ] = useState('');
  const [type, setType] = useState('system_user');
  const [assignFor, setAssignFor] = useState<{ id: number; username: string } | null>(null);

  // Users + each staff member's properties (the list endpoint doesn't include them)
  const { data, loading, error, refreshing, refresh } = useApi(async () => {
    const users = pickList<any>(await usersApi.list(), 'users');
    const staff = users.filter(u => u.type === 'system_user');
    const props = await Promise.all(staff.map(u =>
      usersApi.properties(u.id).then(r => pickList<any>(r, 'properties')).catch(() => null)));
    const byUser = new Map<number, { id: number; name: string }[] | null>(staff.map((u, i) => [u.id, props[i]]));
    return { users, byUser };
  }, []);
  const all = useMemo(() => data?.users ?? [], [data]);
  const propsOf = (id: number) => data?.byUser.get(id);

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
                  subtitle={[
                    u.role?.name ?? capitalize(u.type),
                    u.type === 'system_user' && propsOf(u.id)?.length ? propsOf(u.id)!.map(p => p.name).join(', ') : null,
                  ].filter(Boolean).join(' · ')}
                  meta={`Joined ${timeAgo(u.createdAt)}`}
                  right={
                    <View style={styles.right}>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {u.isLocked ? <Badge label="Locked" tone="danger" /> : !u.isActive ? <Badge label="Inactive" tone="neutral" /> : null}
                        {u.mustChangePassword ? <Badge label="Temp password" tone="warning" /> : null}
                        {u.type === 'system_user' && propsOf(u.id)?.length === 0 ? <Badge label="No property" tone="danger" /> : null}
                      </View>
                      {canAssign && u.type === 'system_user' ? (
                        <Pressable
                          onPress={() => setAssignFor({ id: u.id, username: u.username })}
                          style={({ pressed }) => [styles.assignBtn, pressed && { opacity: 0.6 }]}
                          hitSlop={6}
                          accessibilityLabel={`Assign properties to ${u.username}`}
                        >
                          <Icon name="business-outline" size={17} color={colors.primary} />
                        </Pressable>
                      ) : null}
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
      <AssignPropertiesSheet
        visible={!!assignFor}
        user={assignFor}
        onClose={() => setAssignFor(null)}
        onSaved={() => refresh()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
