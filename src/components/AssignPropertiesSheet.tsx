import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { toast } from './Toast';
import { pickList, propertiesApi, usersApi } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { errMsg } from '../utils/format';

type Prop = { id: number; name: string; address?: string };

/**
 * "Assign properties" — same as the web dashboard dialog (FRONTEND_GUIDE §19).
 * Lists the properties *you* manage; `POST /users/:id/properties` replaces the user's assignments
 * among them (assignments to properties you don't manage are kept by the server).
 */
export default function AssignPropertiesSheet({
  visible, user, onClose, onSaved,
}: {
  visible: boolean;
  user: { id: number; username: string } | null;
  onClose: () => void;
  onSaved?: (propertyIds: number[]) => void;
}) {
  const [mine, setMine] = useState<Prop[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    let alive = true;
    setLoading(true);
    Promise.all([propertiesApi.list(), usersApi.properties(user.id)])
      .then(([all, assigned]) => {
        if (!alive) return;
        setMine(pickList<Prop>(all, 'properties'));
        setSelected(new Set(pickList<any>(assigned, 'properties').map(p => Number(p.id ?? p.propertyId))));
      })
      .catch(e => { toast.error(errMsg(e)); onClose(); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user?.id]);

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const ids = [...selected];
      await usersApi.assignProperties(user.id, ids);
      toast.success(
        ids.length ? `${user.username} can now access ${ids.length} ${ids.length === 1 ? 'property' : 'properties'}.` : `${user.username} has no properties and can't log in.`,
        { title: 'Properties updated' },
      );
      onSaved?.(ids);
      onClose();
    } catch (e) {
      toast.error(errMsg(e), { title: 'Could not assign properties' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Assign properties"
      footer={
        <View style={styles.footer}>
          <Button title="Cancel" variant="secondary" onPress={onClose} style={styles.flex} />
          <Button title="Save" onPress={save} loading={saving} disabled={loading} style={styles.flex} />
        </View>
      }
    >
      <Text style={styles.sub}>Choose the properties {user?.username ?? 'this user'} can access.</Text>

      <View style={[styles.note, !loading && selected.size === 0 && styles.noteWarn]}>
        <Icon
          name={!loading && selected.size === 0 ? 'warning-outline' : 'information-circle-outline'}
          size={16}
          color={!loading && selected.size === 0 ? colors.warning : colors.textSecondary}
        />
        <Text style={styles.noteText}>Without a property the user can't log in.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : mine.length === 0 ? (
        <Text style={styles.empty}>You don't manage any properties yet.</Text>
      ) : (
        mine.map((p, i) => {
          const on = selected.has(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggle(p.id)}
              style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { opacity: 0.7 }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Icon name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.muted} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                {p.address ? <Text style={styles.address} numberOfLines={1}>{p.address}</Text> : null}
              </View>
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: -6, marginBottom: spacing.md },
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm,
  },
  noteWarn: { backgroundColor: colors.warningSoft },
  noteText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  address: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', marginVertical: spacing.xl },
  footer: { flexDirection: 'row', gap: 12 },
});
