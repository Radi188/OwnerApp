import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation } from '@react-navigation/native';
import { announcementsApi, pickList, templatesApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import {
  Badge, Card, EmptyState, ErrorView, FAB, FilterChips, Header, IconButton, IconTile, LoadingView, Screen, SearchBar, Segmented,
} from '../../components/ui';
import { colors, font, spacing, Tone } from '../../theme';
import { capitalize, stripHtml, timeAgo } from '../../utils/format';

export const ANNOUNCEMENT_TYPES: { label: string; value: string; icon: string; tone: Tone }[] = [
  { label: 'General', value: 'general', icon: 'megaphone-outline', tone: 'primary' },
  { label: 'Urgent', value: 'urgent', icon: 'alert-circle-outline', tone: 'danger' },
  { label: 'Maintenance', value: 'maintenance', icon: 'construct-outline', tone: 'orange' },
  { label: 'Water', value: 'water', icon: 'water-outline', tone: 'info' },
  { label: 'Electric', value: 'electric', icon: 'flash-outline', tone: 'warning' },
];
export const typeMeta = (t?: string) => ANNOUNCEMENT_TYPES.find(x => x.value === t) ?? ANNOUNCEMENT_TYPES[0];

type Tab = 'announcements' | 'templates';

export default function AnnouncementsScreen() {
  const nav = useNavigation<any>();
  const { propertyId, can } = useAuth();
  const [tab, setTab] = useState<Tab>('announcements');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');

  const ann = useApi(async () => pickList(await announcementsApi.list({ sort: '-createdAt' }), 'data', 'announcements'), [propertyId]);
  const tpl = useApi(async () => pickList(await templatesApi.list(), 'data', 'templates'), [propertyId]);
  const src = tab === 'announcements' ? ann : tpl;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (src.data ?? []).filter(a =>
      (type === 'all' || a.type === type) &&
      (!s || [a.title, a.name, stripHtml(a.content)].some(x => String(x ?? '').toLowerCase().includes(s))),
    );
  }, [src.data, type, q]);

  const isTpl = tab === 'templates';

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={src.refreshing}
        onRefresh={src.refresh}
        header={
          <Header
            title="Announcements"
            subtitle="Broadcast news to your tenants"
            right={<IconButton icon="notifications-outline" onPress={() => nav.navigate('Notifications')} />}
          />
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[{ label: `Posted (${ann.data?.length ?? 0})`, value: 'announcements' }, { label: `Templates (${tpl.data?.length ?? 0})`, value: 'templates' }]}
        />
        <SearchBar value={q} onChangeText={setQ} style={{ marginTop: 12 }} />
        <FilterChips
          style={{ marginTop: 12 }}
          value={type}
          onChange={setType}
          options={[{ label: 'All', value: 'all' }, ...ANNOUNCEMENT_TYPES.map(t => ({ label: t.label, value: t.value }))]}
        />

        <View style={{ marginTop: spacing.lg, paddingBottom: 72, gap: 12 }}>
          {src.loading ? <LoadingView /> : src.error ? <ErrorView message={src.error} onRetry={src.refresh} /> : list.length === 0 ? (
            <EmptyState icon="megaphone-outline" title={isTpl ? 'No templates' : 'No announcements'} message={isTpl ? 'Save reusable messages as templates.' : 'Post your first announcement.'} />
          ) : list.map(a => {
            const meta = typeMeta(a.type);
            return (
              <Card
                key={a.id}
                onPress={() => nav.navigate(isTpl ? 'TemplateForm' : 'AnnouncementForm', isTpl ? { template: a } : { announcement: a })}
              >
                <View style={styles.top}>
                  <IconTile icon={meta.icon} tone={meta.tone} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    {isTpl ? <Text style={styles.tplName} numberOfLines={1}>{a.name}</Text> : null}
                    <Text style={font.bodyStrong} numberOfLines={2}>{stripHtml(a.title)}</Text>
                  </View>
                </View>
                <Text style={styles.body} numberOfLines={3}>{stripHtml(a.content)}</Text>
                <View style={styles.foot}>
                  <Badge label={meta.label} tone={meta.tone} />
                  <Badge label={a.unit?.unitCode ? `Unit ${a.unit.unitCode}` : capitalize(a.audience ?? 'all')} tone="neutral" />
                  <View style={{ flex: 1 }} />
                  <Text style={font.tiny}>{timeAgo(a.createdAt)}</Text>
                </View>
              </Card>
            );
          })}
        </View>
      </Screen>
      {can('create', 'announcement') ? (
        <FAB
          label={isTpl ? 'New template' : 'Announce'}
          icon={isTpl ? 'add' : 'megaphone-outline'}
          onPress={() => nav.navigate(isTpl ? 'TemplateForm' : 'AnnouncementForm', {})}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  tplName: { ...font.tiny, color: colors.primary, marginBottom: 2 },
  body: { ...font.caption, marginTop: 10, lineHeight: 18 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
});
