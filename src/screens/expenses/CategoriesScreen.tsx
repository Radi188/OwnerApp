import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import Segments from '../../components/Segments';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/form';
import { Button, EmptyState, ErrorView, Header, IconButton, LoadingView, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { categoriesApi, pickList } from '../../services/api';
import { colors, radius, spacing } from '../../theme';
import { capitalize, errMsg } from '../../utils/format';

type TxType = 'expense' | 'income';

/** Expense / income categories. System ones (salary, utility, …) can't be deleted. */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [type, setType] = useState<TxType>('expense');
  const [editing, setEditing] = useState<{ id?: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, refresh, refreshing, reload } = useApi(
    async () => pickList(await categoriesApi.list({ limit: 500 }), 'transactionCategories', 'categories', 'data'),
    [],
  );
  const list = (data ?? []).filter((c: any) => (c.type ?? 'expense') === type)
    .sort((a: any, b: any) => Number(!!b.isSystem) - Number(!!a.isSystem) || String(a.name).localeCompare(String(b.name)));

  const save = async () => {
    if (!editing?.name.trim()) return;
    setSaving(true);
    try {
      if (editing.id) await categoriesApi.update(editing.id, { name: editing.name.trim() });
      else await categoriesApi.create({ name: editing.name.trim(), type });
      setEditing(null);
      await reload();
    } catch (e) {
      Alert.alert(t('common.error'), errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: any) => Alert.alert(t('expenses.deleteCategory'), t('expenses.deleteCategoryMsg', { name: c.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('unitDetail.delete'), style: 'destructive',
      onPress: async () => { try { await categoriesApi.remove(c.id); await reload(); } catch (e) { Alert.alert(t('common.error'), errMsg(e)); } },
    },
  ]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      header={
        <Header
          title={t('expenses.categories')}
          right={can('create', 'transaction category') ? (
            <IconButton icon="add" color={colors.white} bg={colors.primary} onPress={() => setEditing({ name: '' })} />
          ) : undefined}
        />
      }
    >
      <Segments<TxType>
        value={type}
        onChange={setType}
        options={[{ value: 'expense', label: t('expenses.expenses') }, { value: 'income', label: t('expenses.income') }]}
      />
      <View style={{ marginTop: spacing.md }}>
        {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={refresh} /> : list.length === 0 ? (
          <EmptyState icon="pricetags-outline" title={t('expenses.noCategories')} />
        ) : (
          <View style={styles.card}>
            {list.map((c: any, i: number) => (
              <Pressable
                key={c.id}
                onPress={() => !c.isSystem && can('edit', 'transaction category') && setEditing({ id: c.id, name: c.name })}
                style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={styles.icon}><Icon name={c.isSystem ? 'lock-closed-outline' : 'pricetag-outline'} size={16} color={colors.textSecondary} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{capitalize(c.name)}</Text>
                  {c.isSystem ? <Text style={styles.sub}>{t('expenses.systemCategory')}</Text> : null}
                </View>
                {!c.isSystem && can('delete', 'transaction category') ? (
                  <IconButton icon="trash-outline" color={colors.danger} bg={colors.dangerSoft} size={16} onPress={() => remove(c)} />
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('expenses.renameCategory') : t('expenses.newCategory')}
        footer={<Button title={t('expenses.save')} onPress={save} loading={saving} disabled={!editing?.name.trim()} />}
      >
        <Input
          label={t('expenses.newCategoryName')}
          value={editing?.name ?? ''}
          onChangeText={v => setEditing(e => (e ? { ...e, name: v } : e))}
          hint={t('expenses.khmerOk')}
          autoFocus
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
