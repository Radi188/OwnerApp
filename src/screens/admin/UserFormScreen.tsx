import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { pickList, pickOne, propertiesApi, rolesApi, usersApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { required, useForm } from '../../hooks/useForm';
import { Button, Card, confirmAction, Header, Screen, SelectField, SwitchRow, TextField } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';
import { errMsg } from '../../utils/format';

export default function UserFormScreen() {
  const nav = useNavigation<any>();
  const user = useRoute<any>().params?.user;
  const editing = !!user;
  const { can, user: me } = useAuth();
  const canAssign = can('assign', 'properties');

  // Properties I manage (only these can be assigned) + the user's current assignments
  const myProps = useApi(async () => pickList(await propertiesApi.list(), 'properties'), [], { refetchOnFocus: false });
  const assigned = useApi(
    async () => (editing ? pickList(await usersApi.properties(user.id), 'properties').map((x: any) => x.id ?? x.propertyId) : []),
    [user?.id],
    { refetchOnFocus: false },
  );
  const [propIds, setPropIds] = useState<Set<number>>(new Set());
  useEffect(() => { if (assigned.data) setPropIds(new Set(assigned.data as number[])); }, [assigned.data]);
  const toggleProp = (id: number) => setPropIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const roles = useApi(async () => pickList(await rolesApi.list(), 'roles'), [], { refetchOnFocus: false });
  const roleOptions = useMemo(
    () => (roles.data ?? []).map(r => ({ label: r.name, value: r.id as number, subtitle: r.description })),
    [roles.data],
  );

  const f = useForm({
    username: user?.username ?? '',
    password: '',
    confirmPassword: '',
    roleId: (user?.roleId ?? user?.role?.id ?? null) as number | null,
    isActive: user?.isActive ?? true,
  }, {
    username: required('Username'),
    roleId: required('Role'),
    password: v => (!editing && !v ? 'Password is required' : v && String(v).length < 6 ? 'At least 6 characters' : null),
    confirmPassword: (v, all) => (all.password && v !== all.password ? 'Passwords do not match' : null),
  });

  const save = f.submit(async v => {
    let id = user?.id;
    if (editing) {
      const body: Record<string, unknown> = { username: v.username.trim(), roleId: v.roleId, isActive: v.isActive };
      if (v.password) { body.password = v.password; body.confirmPassword = v.confirmPassword; }
      await usersApi.update(user.id, body);
    } else {
      const res = await usersApi.create({ username: v.username.trim(), password: v.password, confirmPassword: v.confirmPassword, roleId: Number(v.roleId) });
      id = pickOne<any>(res, 'user', 'users')?.id;
    }
    // Replaces the user's assignments among *my* properties — send every checked box
    if (canAssign && id) await usersApi.assignProperties(id, [...propIds]);
  }, () => nav.goBack());

  const onDelete = () => confirmAction('Delete user', `Delete ${user?.username}? They will no longer be able to sign in.`, async () => {
    try { await usersApi.remove(user.id); nav.goBack(); } catch (e) { Alert.alert('Delete failed', errMsg(e)); }
  });

  const isMe = user?.id === me?.id;

  return (
    <Screen
      header={<Header title={editing ? 'Edit user' : 'New user'} subtitle={editing ? user.username : 'Staff account for the dashboard & app'} />}
      footer={<Button title={editing ? 'Save changes' : 'Create user'} onPress={save} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <TextField label="Username" required autoCapitalize="none" autoCorrect={false} {...f.field('username')} />
        <SelectField label="Role" required value={f.values.roleId} options={roleOptions} onChange={v => f.set('roleId', v)} error={f.errors.roleId} placeholder={roles.loading ? 'Loading roles…' : 'Select role'} />
        {editing && !isMe ? <SwitchRow label="Active" hint="Inactive users cannot sign in" value={!!f.values.isActive} onChange={v => f.set('isActive', v)} /> : null}
      </Card>
      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[font.h3, { marginBottom: spacing.md }]}>{editing ? 'Reset password' : 'Password'}</Text>
        <TextField label="Password" required={!editing} secureTextEntry placeholder={editing ? 'Leave blank to keep current' : 'At least 6 characters'} {...f.field('password')} />
        <TextField label="Confirm password" required={!editing} secureTextEntry {...f.field('confirmPassword')} />
        {!editing ? <Text style={font.caption}>The user will be asked to change this password on first sign-in.</Text> : null}
      </Card>
      {canAssign ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[font.h3, { marginBottom: 4 }]}>Properties</Text>
          <Text style={[font.caption, { marginBottom: spacing.md }]}>
            {propIds.size ? 'This user can only see data from the checked properties.' : 'Staff need at least one property to sign in.'}
          </Text>
          {(myProps.data ?? []).map((pr: any, i: number) => {
            const on = propIds.has(pr.id);
            return (
              <Pressable key={pr.id} onPress={() => toggleProp(pr.id)} style={[styles.propRow, i > 0 && styles.sep]}>
                <Icon name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.muted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.propName} numberOfLines={1}>{pr.name}</Text>
                  {pr.address ? <Text style={font.caption} numberOfLines={1}>{pr.address}</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {!propIds.size ? (
            <View style={styles.warn}>
              <Icon name="warning-outline" size={15} color={colors.warning} />
              <Text style={styles.warnText}>Without a property this user can't log in.</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {editing && !isMe && can('delete', 'user') ? (
        <Button title="Delete user" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  propName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  warnText: { flex: 1, fontSize: 12, color: colors.ink },
});
