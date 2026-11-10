import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { contractsApi, pickOne } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import {
  Avatar, Badge, Button, Card, confirmAction, Divider, ErrorView, Header, IconButton, IconTile, KeyValue,
  ListRow, LoadingView, ProgressBar, Screen, SectionTitle,
} from '../../components/ui';
import { colors, font, spacing } from '../../theme';
import { capitalize, daysUntil, errMsg, fmtDate, money } from '../../utils/format';

export default function ContractDetailScreen() {
  const nav = useNavigation<any>();
  const { contractId } = useRoute<any>().params;
  const { can } = useAuth();

  const { data: c, loading, error, refresh, refreshing } = useApi(
    async () => pickOne<any>(await contractsApi.get(contractId), 'contracts', 'contract'),
    [contractId],
  );

  const onDelete = () => confirmAction('Delete contract', 'Delete this contract? Invoices linked to it may be affected.', async () => {
    try { await contractsApi.remove(contractId); nav.goBack(); } catch (e) { Alert.alert('Delete failed', errMsg(e)); }
  });

  const start = c ? new Date(c.startDate).getTime() : 0;
  const end = c ? new Date(c.endDate).getTime() : 0;
  const progress = end > start ? (Date.now() - start) / (end - start) : 0;
  const left = c ? daysUntil(c.endDate) : 0;
  const isActive = c?.status === 'Active';

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      header={
        <Header
          title={`Contract #${contractId}`}
          subtitle={c?.unit ? `Unit ${c.unit.unitCode}` : undefined}
          right={c && can('edit', 'contract') ? <IconButton icon="create-outline" onPress={() => nav.navigate('ContractForm', { contract: c })} /> : undefined}
        />
      }
      footer={c && isActive && can('create', 'invoice') ? (
        <Button
          title="Generate invoice"
          icon="receipt-outline"
          style={{ flex: 1 }}
          onPress={() => nav.navigate('GenerateInvoice', { tenantId: c.tenantId, contractId: c.id, unitId: c.unitId })}
        />
      ) : undefined}
    >
      {loading ? <LoadingView /> : error || !c ? <ErrorView message={error ?? 'Contract not found'} onRetry={refresh} /> : (
        <>
          <Card>
            <View style={styles.top}>
              <Badge status={c.status} />
              <Text style={font.caption}>{capitalize(c.billingStrategy)} billing</Text>
            </View>
            <Text style={styles.rent}>{money(c.monthlyRent, { decimals: 2 })}<Text style={styles.per}> / {c.rentCycle ?? 'month'}</Text></Text>
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.dates}>
                <Text style={font.caption}>{fmtDate(c.startDate)}</Text>
                <Text style={font.caption}>{fmtDate(c.endDate)}</Text>
              </View>
              <ProgressBar value={progress} color={isActive && left <= 30 ? colors.danger : colors.primary} />
              <Text style={[font.caption, { marginTop: 8 }]}>
                {isActive ? (left > 0 ? `${left} days remaining` : 'End date has passed') : `Contract ${String(c.status).toLowerCase()}`}
              </Text>
            </View>
          </Card>

          <SectionTitle title="Parties" />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow
              left={<Avatar name={c.tenant?.name} />}
              title={c.tenant?.name ?? 'Tenant'}
              subtitle={c.tenant?.phoneNumber}
              onPress={() => nav.navigate('TenantDetail', { tenantId: c.tenantId })}
            />
            <Divider />
            <ListRow
              left={<IconTile icon="home-outline" />}
              title={`Unit ${c.unit?.unitCode ?? c.unitId}`}
              subtitle={c.unit ? `Floor ${c.unit.floorNumber || '—'}${c.unit.property?.name ? ' · ' + c.unit.property.name : ''}` : undefined}
              onPress={() => nav.navigate('UnitDetail', { unitId: c.unitId })}
            />
          </Card>

          <SectionTitle title="Terms" />
          <Card>
            <KeyValue label="Rent" value={`${money(c.monthlyRent, { decimals: 2 })} per ${c.rentCycle ?? 'month'}`} />
            <KeyValue label="Deposit" value={money(c.depositAmount, { decimals: 2 })} />
            <KeyValue label="Billing strategy" value={capitalize(c.billingStrategy)} />
            <KeyValue label="Created" value={fmtDate(c.createdAt)} />
            {c.terms ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <Text style={font.body}>{c.terms}</Text>
              </>
            ) : null}
          </Card>

          {can('delete', 'contract') ? (
            <Button title="Delete contract" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rent: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.8, marginTop: 12 },
  per: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
});
