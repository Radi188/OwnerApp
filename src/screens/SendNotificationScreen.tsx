import React from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { notificationsApi } from '../services/api';
import { required, useForm } from '../hooks/useForm';
import { Button, Card, FilterChips, Header, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';

const TYPES = [
  { label: 'General', value: 'general' },
  { label: 'Payment', value: 'payment' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Reminder', value: 'reminder' },
];

/** Send a push notification to one tenant (route params: userId, name). */
export default function SendNotificationScreen() {
  const nav = useNavigation<any>();
  const { userId, name } = useRoute<any>().params;

  const f = useForm({ title: '', body: '', type: 'general' }, {
    title: required('Title'),
    body: required('Message'),
  });

  const send = f.submit(
    v => notificationsApi.send({ title: v.title.trim(), body: v.body.trim(), type: v.type, userId }),
    () => { Alert.alert('Sent', `Notification sent to ${name}.`); nav.goBack(); },
  );

  return (
    <Screen
      header={<Header title="Send notification" subtitle={`To ${name}`} />}
      footer={<Button title="Send" icon="paper-plane-outline" onPress={send} loading={f.submitting} style={{ flex: 1 }} />}
    >
      <Card>
        <FilterChips value={f.values.type} onChange={v => f.set('type', v)} options={TYPES} style={{ marginBottom: spacing.lg }} />
        <TextField label="Title" required placeholder="e.g. Rent reminder" {...f.field('title')} />
        <TextField label="Message" required multiline placeholder="Write your message…" {...f.field('body')} />
      </Card>
    </Screen>
  );
}
