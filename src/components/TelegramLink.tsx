import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Share, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { generatePDF } from 'react-native-html-to-pdf';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Button, Card } from './ui';
import { toast } from './Toast';
import { telegramApi, tenantsApi } from '../services/api';
import { MIME, openFile } from '../services/files';
import { dayLabel } from '../i18n';
import { colors, font, radius, spacing } from '../theme';
import { errMsg } from '../utils/format';

/**
 * Linking tenants to Telegram without the app (FRONTEND_UPDATE 2026-11-11 §2):
 *  - <TelegramJoinCard>: one join QR for all tenants (scan → Start → share phone number)
 *  - <TelegramInviteSheet>: a personal 7-day invite for one tenant
 */

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A one-page printable PDF with the QR and the steps, opened in the system viewer (Print / Share). */
async function printQr(opts: { title: string; subtitle?: string; qrDataUrl: string; link: string; steps: string[] }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: 'Kantumruy Pro', -apple-system, Roboto, Arial, sans-serif; color: #17153B; text-align: center; margin: 0; }
    .card { border: 2px solid #554ADF; border-radius: 24px; padding: 36px 30px; margin: 30px auto; max-width: 440px; }
    h1 { font-size: 24px; margin: 0 0 4px; } .sub { color: #475569; font-size: 14px; margin-bottom: 22px; }
    img { width: 260px; height: 260px; } .link { font-size: 12px; color: #554ADF; margin-top: 12px; word-break: break-all; }
    ol { text-align: left; font-size: 14px; line-height: 1.8; margin: 22px auto 0; max-width: 340px; padding-left: 20px; }
    .brand { margin-top: 24px; font-size: 11px; color: #94A3B8; letter-spacing: .5px; }
  </style></head><body><div class="card">
    <h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}
    <img src="${opts.qrDataUrl}" /><div class="link">${esc(opts.link)}</div>
    <ol>${opts.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="brand">PTEAH MANAGER</div>
  </div></body></html>`;
  const res = await generatePDF({ html, fileName: `telegram-qr-${Date.now()}`, width: 595, height: 842, padding: 24, bgColor: '#FFFFFF', shouldPrintBackgrounds: true });
  await openFile(res.filePath.replace(/^file:\/\//, ''), MIME.pdf);
}

// ─── Join QR card (property settings) ───────────────────────────────────────

export function TelegramJoinCard({ propertyName, style }: { propertyName?: string; style?: any }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ link: string; qrDataUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d: any = await telegramApi.joinLink();
      setData({ link: d?.link, qrDataUrl: d?.qrDataUrl ?? d?.qrDataURL });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = [t('tgLink.step1'), t('tgLink.step2'), t('tgLink.step3')];

  return (
    <Card style={style}>
      <View style={styles.head}>
        <View style={styles.tgIcon}><Icon name="paper-plane" size={16} color={colors.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{t('tgLink.joinTitle')}</Text>
          <Text style={styles.hint}>{t('tgLink.joinHint')}</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} /> : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Button title={t('tgLink.retry')} variant="secondary" small onPress={load} style={{ marginTop: spacing.sm }} />
        </View>
      ) : data ? (
        <>
          <View style={styles.qrFrame}>
            <Image source={{ uri: data.qrDataUrl }} style={styles.qr} resizeMode="contain" />
          </View>
          <Text style={styles.link} numberOfLines={1} selectable>{data.link}</Text>
          <View style={styles.steps}>
            {steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <Button title={t('tgLink.shareLink')} icon="share-outline" variant="secondary" small style={{ flex: 1 }}
              onPress={() => Share.share({ message: data.link, url: data.link }).catch(() => {})} />
            <Button title={t('tgLink.print')} icon="print-outline" small style={{ flex: 1 }}
              onPress={() => printQr({ title: t('tgLink.joinTitle'), subtitle: propertyName, qrDataUrl: data.qrDataUrl, link: data.link, steps })
                .catch(e => toast.error(errMsg(e)))} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

// ─── Personal invite (tenant page) ───────────────────────────────────────────

type Invite = { deepLink: string; qrDataUrl: string; expiresAt?: string; alreadyLinked?: boolean; shareText?: string };

export function TelegramInviteSheet({ visible, tenant, onClose }: {
  visible: boolean; tenant: { id: number; name: string } | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!tenant) return;
    setLoading(true); setError(null);
    try {
      const d: any = await tenantsApi.telegramInvite(tenant.id);
      setInvite({ ...d, qrDataUrl: d?.qrDataUrl ?? d?.qrDataURL });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  // A new invite cancels the previous one — create one each time the sheet opens
  useEffect(() => { if (visible) { setInvite(null); create(); } }, [visible, tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet visible={visible} onClose={onClose} title={t('tgLink.inviteTitle', { name: tenant?.name ?? '' })}>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xxl }} /> : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Button title={t('tgLink.retry')} variant="secondary" small onPress={create} style={{ marginTop: spacing.sm }} />
        </View>
      ) : invite ? (
        <>
          {invite.alreadyLinked ? (
            <View style={styles.linked}>
              <Icon name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.linkedText}>{t('tgLink.alreadyLinked')}</Text>
            </View>
          ) : null}
          <Text style={styles.hint}>{t('tgLink.inviteHint')}</Text>
          <View style={[styles.qrFrame, { marginTop: spacing.md }]}>
            <Image source={{ uri: invite.qrDataUrl }} style={styles.qr} resizeMode="contain" />
          </View>
          {invite.expiresAt ? <Text style={styles.expires}>{t('tgLink.expires', { date: dayLabel(invite.expiresAt, true) })}</Text> : null}
          <View style={styles.actions}>
            <Button title={t('tgLink.shareMessage')} icon="chatbubble-ellipses-outline" small style={{ flex: 1 }}
              onPress={() => Share.share({ message: invite.shareText || invite.deepLink }).catch(() => {})} />
            <Button title={t('tgLink.print')} icon="print-outline" variant="secondary" small style={{ flex: 1 }}
              onPress={() => printQr({
                title: tenant?.name ?? '', subtitle: t('tgLink.inviteHint'), qrDataUrl: invite.qrDataUrl, link: invite.deepLink,
                steps: [t('tgLink.step1'), t('tgLink.step2Personal')],
              }).catch(e => toast.error(errMsg(e)))} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: spacing.md },
  tgIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#229ED9', alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  center: { alignItems: 'center', paddingVertical: spacing.lg },
  error: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  qrFrame: {
    alignSelf: 'center', width: 200, height: 200, padding: 10, borderRadius: radius.lg,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  qr: { width: '100%', height: '100%' },
  link: { fontSize: 12, color: colors.primary, textAlign: 'center', marginTop: 8 },
  steps: { marginTop: spacing.md, gap: 8 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primarySoft, color: colors.primary,
    fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 20, overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  linked: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing.sm,
    backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  linkedText: { fontSize: 12, fontWeight: '700', color: colors.success },
  expires: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
