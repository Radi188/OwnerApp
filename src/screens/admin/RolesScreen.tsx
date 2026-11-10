import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Text } from '../../components/Text';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { pickList, rolesApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { required, useForm } from '../../hooks/useForm';
import {
  Button, Card, confirmAction, EmptyState, ErrorView, FAB, Header, IconButton, IconTile, ListRow, LoadingView, Screen, Sheet, TextField,
} from '../../components/ui';
import { font, spacing } from '../../theme';
import { errMsg } from '../../utils/format';

export default function RolesScreen() {
  const { can } = useAuth();
  const nav = useNavigation<any>();
  const [editing, setEditing] = useState<any | null>(null); // {} = new role
  const { data, loading, error, refreshing, refresh, reload } = useApi(async () => pickList(await rolesApi.list(), 'roles'), []);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={refresh} header={<Header title="Roles" subtitle="Control what each staff member can do" />}>
        {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : !(data ?? []).length ? (
          <EmptyState icon="shield-outline" title="No roles" />
        ) : (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {(data ?? []).map(r => (
              <ListRow
                key={r.id}
                left={<IconTile icon="shield-checkmark-outline" tone="violet" />}
                title={r.name}
                subtitle={r.description || 'No description'}
                onPress={() => nav.navigate('RolePermissions', { role: r })}
                right={can('edit', 'role') ? <IconButton icon="create-outline" size={17} onPress={() => setEditing(r)} /> : undefined}
              />
            ))}
          </Card>
        )}
        <Text style={[font.caption, { marginTop: spacing.lg, paddingBottom: 72, lineHeight: 18 }]}>
          Tap a role to choose what it can do. You can only grant permissions you have yourself.
        </Text>
      </Screen>
      {can('create', 'role') ? <FAB label="New role" onPress={() => setEditing({})} /> : null}
      {editing ? <RoleSheet role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </View>
  );
}

function RoleSheet({ role, onClose, onSaved }: { role: any; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const isNew = !role.id;
  const f = useForm({ name: role.name ?? '', description: role.description ?? '' }, { name: required('Name') });

  const save = f.submit(async v => {
    if (isNew) await rolesApi.create({ name: v.name.trim(), description: v.description.trim() });
    else await rolesApi.update(role.id, { name: v.name.trim(), description: v.description.trim() });
  }, onSaved);

  const onDelete = () => confirmAction('Delete role', `Delete "${role.name}"? Users with this role will lose access.`, async () => {
    try { await rolesApi.remove(role.id); onSaved(); } catch (e) { Alert.alert('Delete failed', errMsg(e)); }
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={isNew ? 'New role' : 'Edit role'}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!isNew && can('delete', 'role') ? <Button title="Delete" variant="danger" onPress={onDelete} style={{ flex: 1 }} /> : null}
          <Button title="Save" onPress={save} loading={f.submitting} style={{ flex: 2 }} />
        </View>
      }
    >
      <TextField label="Name" required placeholder="e.g. Caretaker" {...f.field('name')} />
      <TextField label="Description" multiline placeholder="What is this role for?" {...f.field('description')} />
    </Sheet>
  );
}
