import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/Text';
import { DateField, Input, Select } from '../../components/form';
import { Button, Header, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { categoriesApi, num, pickList, transactionsApi, unitsApi } from '../../services/api';
import type { TransactionInput } from '../../services/api';
import { colors, spacing } from '../../theme';
import { capitalize, errMsg, todayYMD } from '../../utils/format';
import { toast } from '../../components/Toast';

type TxType = 'expense' | 'income';
type Scope = 'property' | 'room';

/** Add / edit an expense or income entry (FRONTEND_GUIDE §15 "Add expense form"). */
export default function TransactionFormScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const params = (useRoute<any>().params ?? {}) as { transaction?: any; type?: TxType };
  const tx = params.transaction;
  const editing = !!tx;
  const { can, propertyId } = useAuth();

  const [type, setType] = useState<TxType>(tx?.type ?? params.type ?? 'expense');
  const [date, setDate] = useState<string>(String(tx?.transactionDate ?? todayYMD()).slice(0, 10));
  const [categoryId, setCategoryId] = useState<number | null>(tx?.categoryId ?? tx?.category?.id ?? null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState(tx?.amount != null ? String(num(tx.amount)) : '');
  const [scope, setScope] = useState<Scope>(tx?.unitId || tx?.unit ? 'room' : 'property');
  const [unitId, setUnitId] = useState<number | null>(tx?.unitId ?? tx?.unit?.id ?? null);
  const [vendor, setVendor] = useState(tx?.vendor ?? '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const cats = useApi(async () => pickList(await categoriesApi.list({ limit: 500 }), 'transactionCategories', 'categories', 'data'), [], { refetchOnFocus: true });
  const units = useApi(async () => pickList(await unitsApi.list({ sort: 'unitCode' }), 'units'), [propertyId], { refetchOnFocus: false });

  const catOptions = useMemo(() => (cats.data ?? [])
    .filter((c: any) => !c.type || c.type === type)
    .map((c: any) => ({ value: c.id as number, label: capitalize(c.name) })), [cats.data, type]);

  const unitOptions = useMemo(() => (units.data ?? []).map((u: any) => ({ value: u.id as number, label: t('billing.unit', { code: u.unitCode }) })), [units.data, t]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!(num(amount) > 0)) e.amount = t('expenses.errAmount');
    if (!description.trim()) e.description = t('expenses.errDescription');
    if (!categoryId && !newCategory?.trim()) e.category = t('expenses.errCategory');
    if (scope === 'room' && !unitId) e.unit = t('expenses.errUnit');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (again = false) => {
    if (!validate()) return;
    setSaving(true);
    const body: TransactionInput = {
      type,
      transactionDate: date || undefined,
      amount: num(amount),
      description: description.trim(),
      vendor: vendor.trim() || undefined,
      note: note.trim() || undefined,
      ...(newCategory?.trim() ? { categoryName: newCategory.trim() } : { categoryId: categoryId ?? undefined }),
      // Room → property is filled in by the server; property-wide → current property, unitId cleared
      ...(scope === 'room' ? { unitId: unitId ?? undefined } : { propertyId: propertyId ?? undefined, unitId: editing ? null : undefined }),
    };
    try {
      if (editing) await transactionsApi.update(tx.id, body);
      else await transactionsApi.create(body);
      if (again) {
        setAmount(''); setDescription(''); setVendor(''); setNote(''); setErrors({});
        if (newCategory) { setNewCategory(null); cats.reload(); }
        toast.success(t('expenses.saved'));
      } else {
        nav.goBack();
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => Alert.alert(t('expenses.deleteTitle'), t('expenses.deleteMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('unitDetail.delete'), style: 'destructive',
      onPress: async () => { try { await transactionsApi.remove(tx.id); toast.deleted(); nav.goBack(); } catch (e) { toast.error(errMsg(e)); } },
    },
  ]);

  return (
    <Screen
      header={<Header title={editing ? t('expenses.edit') : type === 'expense' ? t('expenses.addExpense') : t('expenses.addIncome')} />}
      footer={editing ? (
        <Button title={t('expenses.save')} onPress={() => save()} loading={saving} style={{ flex: 1 }} />
      ) : (
        <>
          <Button title={t('expenses.saveAnother')} variant="secondary" onPress={() => save(true)} disabled={saving} style={{ flex: 1 }} />
          <Button title={t('expenses.save')} onPress={() => save()} loading={saving} style={{ flex: 1 }} />
        </>
      )}
    >
      {tx?.maintenance || tx?.maintenanceId ? (
        <View style={styles.note}>
          <Icon name="construct-outline" size={16} color={colors.primary} />
          <Text style={styles.noteText}>{t('expenses.fromMaintenance')}</Text>
        </View>
      ) : null}

      <Select<TxType>
        label={t('expenses.type')}
        variant="chips"
        value={type}
        onChange={v => { setType(v); setCategoryId(null); }}
        options={[{ value: 'expense', label: t('expenses.expense') }, { value: 'income', label: t('expenses.incomeOne') }]}
      />
      <DateField label={t('expenses.date')} value={date} onChange={setDate} />

      {newCategory === null ? (
        <>
          <Select<number>
            label={t('expenses.category')}
            icon="pricetag-outline"
            required
            searchable
            value={categoryId}
            options={catOptions}
            onChange={v => { setCategoryId(v); setErrors(e => ({ ...e, category: undefined })); }}
            error={errors.category}
          />
          {/* `categoryName` creates the category while saving the entry */}
          <TouchableOpacity style={styles.link} onPress={() => { setNewCategory(''); setCategoryId(null); }} hitSlop={8}>
            <Icon name="add" size={15} color={colors.primary} />
            <Text style={styles.linkText}>{t('expenses.newCategory')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Input
            label={t('expenses.newCategoryName')}
            icon="pricetag-outline"
            required
            value={newCategory}
            onChangeText={v => { setNewCategory(v); setErrors(e => ({ ...e, category: undefined })); }}
            error={errors.category}
            hint={t('expenses.newCategoryHint')}
            autoFocus
          />
          <TouchableOpacity style={styles.link} onPress={() => setNewCategory(null)} hitSlop={8}>
            <Icon name="list-outline" size={15} color={colors.primary} />
            <Text style={styles.linkText}>{t('expenses.pickCategory')}</Text>
          </TouchableOpacity>
        </>
      )}

      <Input
        label={t('payment.amount')}
        prefix="$"
        icon="cash-outline"
        required
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={v => { setAmount(v.replace(',', '.')); setErrors(e => ({ ...e, amount: undefined })); }}
        error={errors.amount}
      />

      <Select<Scope>
        label={t('expenses.for')}
        variant="chips"
        value={scope}
        onChange={setScope}
        options={[{ value: 'property', label: t('expenses.wholeProperty') }, { value: 'room', label: t('expenses.aRoom') }]}
      />
      {scope === 'room' ? (
        <Select<number>
          label={t('units.title')}
          icon="home-outline"
          required
          searchable
          value={unitId}
          options={unitOptions}
          onChange={v => { setUnitId(v); setErrors(e => ({ ...e, unit: undefined })); }}
          error={errors.unit}
        />
      ) : null}

      <Input label={type === 'expense' ? t('expenses.vendor') : t('expenses.payer')} icon="storefront-outline" value={vendor} onChangeText={setVendor} />
      <Input
        label={t('expenses.description')}
        required
        value={description}
        onChangeText={v => { setDescription(v); setErrors(e => ({ ...e, description: undefined })); }}
        error={errors.description}
      />
      <Input label={t('payment.note')} value={note} onChangeText={setNote} multiline maxLength={300} />

      {editing && can('delete', 'transaction') ? (
        <Button title={t('expenses.deleteTitle')} variant="danger" icon="trash-outline" onPress={remove} style={{ marginTop: spacing.lg }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: -6, marginBottom: 14, paddingHorizontal: 4 },
  linkText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft, marginBottom: 14 },
  noteText: { flex: 1, fontSize: 13, color: colors.ink },
});
