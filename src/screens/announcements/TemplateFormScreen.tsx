import React from 'react';
import { Alert } from 'react-native';
import { Text } from '../../components/Text';
import { useNavigation, useRoute } from '@react-navigation/native';
import { templatesApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { required, useForm } from '../../hooks/useForm';
import { Button, Card, confirmAction, FilterChips, Header, Screen, TextField } from '../../components/ui';
import { colors, font, spacing } from '../../theme';
import { errMsg, stripHtml, textToHtml } from '../../utils/format';
import { ANNOUNCEMENT_TYPES } from './AnnouncementsScreen';

export default function TemplateFormScreen() {
  const nav = useNavigation<any>();
  const template = useRoute<any>().params?.template;
  const editing = !!template;
  const { can } = useAuth();

  const f = useForm({
    name: template?.name ?? '',
    title: stripHtml(template?.title ?? ''),
    content: stripHtml(template?.content ?? ''),
    type: template?.type ?? 'general',
  }, { name: required('Template name'), title: required('Title'), content: required('Message') });

  const save = f.submit(async v => {
    const body = { name: v.name.trim(), title: v.title.trim(), content: textToHtml(v.content.trim()), type: v.type, audience: template?.audience ?? 'all' };
    if (editing) await templatesApi.update(template.id, body);
    else await templatesApi.create(body);
  }, () => nav.goBack());

  const onDelete = () => confirmAction('Delete template', `Delete "${template?.name}"?`, async () => {
    try { await templatesApi.remove(template.id); nav.goBack(); } catch (e) { Alert.alert('Delete failed', errMsg(e)); }
  });

  return (
    <Screen
      header={<Header title={editing ? 'Edit template' : 'New template'} subtitle="Reusable announcement" />}
      footer={
        <>
          {editing ? (
            <Button title="Use" variant="secondary" icon="paper-plane-outline" style={{ flex: 1 }}
              onPress={() => nav.navigate('AnnouncementForm', { template: { ...template, ...f.values, content: textToHtml(f.values.content) } })} />
          ) : null}
          <Button title={editing ? 'Save' : 'Create template'} onPress={save} loading={f.submitting} style={{ flex: 2 }} />
        </>
      }
    >
      <Card>
        <TextField label="Template name" required placeholder="e.g. Monthly rent reminder" {...f.field('name')} />
        <Text style={{ ...font.caption, color: colors.text, fontWeight: '600', marginBottom: 6 }}>Type</Text>
        <FilterChips value={f.values.type} onChange={v => f.set('type', v)} options={ANNOUNCEMENT_TYPES} style={{ marginBottom: spacing.lg }} />
        <TextField label="Title" required {...f.field('title')} />
        <TextField label="Message" required multiline style={{ minHeight: 180 }} {...f.field('content')} />
        <Text style={font.caption}>Use [[tenant_name]], [[unit_code]] or [[property_name]] to personalise.</Text>
      </Card>
      {editing && can('delete', 'announcement') ? (
        <Button title="Delete template" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: spacing.xxl }} />
      ) : null}
    </Screen>
  );
}
