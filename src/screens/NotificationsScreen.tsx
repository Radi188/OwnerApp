import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Animated,
  Pressable,
  ScrollView,
} from 'react-native';
import { Text } from '../components/Text';
import { Input } from '../components/form';
import { SearchBar } from '../components/ui';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { notificationsApi, announcementsApi, contractsApi, pickList } from '../services/api';
import { BackButton } from '../components/ui';

const normNotifs = (res: any) => pickList(res, 'notifications').map((n: any) => ({ ...n, isRead: n.isRead ?? !!n.readAt }));
const normAnns = (res: any) => pickList(res, 'announcements', 'data');
import { useBadges } from '../context/BadgeContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type Segment          = 'notifications' | 'announcements';
type PublishTarget    = 'push' | 'announce';
type NotifCategory    = 'Announcement' | 'Invoice' | 'Maintenance' | 'General';
type FilterTab        = 'all' | 'unread' | NotifCategory;
type AnnounceAudience = 'all' | 'tenant' | 'employee';
type TemplateGroup    = 'push' | 'announce';

type NotifItem = {
  id: number; title: string; body: string; type?: string;
  isRead: boolean; createdAt: string;
};
type AnnouncementItem = {
  id: number; title: string; content: string;
  audience: string; createdAt: string;
};
type UnitRow = {
  contractId: number; unitId: number; unitCode: string;
  floorNumber: number | null; tenantName: string; tenantUserId: number | null;
};
type DetailItem =
  | { kind: 'notif'; data: NotifItem }
  | { kind: 'ann';   data: AnnouncementItem };

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORY_META: Record<NotifCategory, { icon: string; iconBg: string; iconColor: string; label: string }> = {
  Announcement: { icon: 'megaphone',           iconBg: '#F0FDFA', iconColor: '#0F766E', label: 'Announcement' },
  Invoice:      { icon: 'receipt',             iconBg: '#DBEAFE', iconColor: '#2563EB', label: 'Invoice' },
  Maintenance:  { icon: 'construct',           iconBg: '#FEF9C3', iconColor: '#CA8A04', label: 'Maintenance' },
  General:      { icon: 'chatbubble-ellipses', iconBg: '#F0FDF4', iconColor: '#16A34A', label: 'General' },
};
const CATEGORIES: NotifCategory[] = ['Announcement', 'Invoice', 'Maintenance', 'General'];

const AUDIENCE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  all:      { label: 'All',     color: '#16A34A', bg: '#DCFCE7', icon: 'people' },
  tenant:   { label: 'Tenants', color: '#2563EB', bg: '#DBEAFE', icon: 'home' },
  employee: { label: 'Staff',   color: '#7C3AED', bg: '#EDE9FE', icon: 'briefcase-outline' },
  admin:    { label: 'Admin',   color: '#EA580C', bg: '#FFF7ED', icon: 'shield-checkmark-outline' },
  manager:  { label: 'Manager', color: '#0891B2', bg: '#CFFAFE', icon: 'star-outline' },
};

// Templates — split into push-alerts and announcement-broadcasts
const PUSH_TEMPLATES = [
  { id: 'rent_due',         icon: 'calendar',         iconBg: '#FEF9C3', iconColor: '#CA8A04', label: 'Rent Due Reminder',   category: 'Invoice'      as NotifCategory, title: 'Rent Payment Reminder',              body: '{{greeting}}your rent payment is due soon. Please complete your payment before the due date to avoid late fees. Thank you.' },
  { id: 'invoice_ready',   icon: 'receipt',           iconBg: '#DBEAFE', iconColor: '#2563EB', label: 'Invoice Is Ready',    category: 'Invoice'      as NotifCategory, title: 'Your Invoice Is Ready',               body: '{{greeting}}your monthly invoice is now ready for review. Please check and complete payment by the due date.' },
  { id: 'payment_received',icon: 'checkmark-circle',  iconBg: '#DCFCE7', iconColor: '#16A34A', label: 'Payment Confirmed',   category: 'Invoice'      as NotifCategory, title: 'Payment Received — Thank You!',       body: '{{greeting}}we have successfully received your payment. Your receipt has been recorded. Thank you.' },
  { id: 'overdue_notice',  icon: 'alert-circle',      iconBg: '#FEF2F2', iconColor: '#DC2626', label: 'Overdue Notice',      category: 'Invoice'      as NotifCategory, title: 'Payment Overdue — Action Required',   body: '{{greeting}}your payment is now overdue. Please settle your outstanding balance as soon as possible.' },
  { id: 'maintenance_upd', icon: 'construct',         iconBg: '#FEF9C3', iconColor: '#CA8A04', label: 'Maintenance Update',  category: 'Maintenance'  as NotifCategory, title: 'Maintenance Request Update',          body: '{{greeting}}your maintenance request has been reviewed and is now being processed. Our team will contact you shortly.' },
];
const ANNOUNCE_TEMPLATES = [
  { id: 'water_cut',  icon: 'water',            iconBg: '#F0FDFA', iconColor: '#0F766E', label: 'Water Interruption',  category: 'Announcement' as NotifCategory, title: 'Temporary Water Supply Interruption', body: '{{greeting}}water supply will be temporarily interrupted for scheduled maintenance. We apologize for the inconvenience.' },
  { id: 'inspection', icon: 'shield-checkmark', iconBg: '#F0FDFA', iconColor: '#0F766E', label: 'Building Inspection', category: 'Announcement' as NotifCategory, title: 'Building Inspection Notice',          body: '{{greeting}}a routine building inspection is scheduled. Please ensure your unit is accessible. Thank you.' },
  { id: 'holiday',    icon: 'sunny',            iconBg: '#F0FDF4', iconColor: '#16A34A', label: 'Holiday Closure',     category: 'General'      as NotifCategory, title: 'Office Closure — Public Holiday',     body: '{{greeting}}our office will be closed during the upcoming public holiday. Normal operations resume on the next working day.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function typeToCategory(type?: string): NotifCategory {
  if (!type) return 'General';
  const t = type.toLowerCase();
  if (t.includes('invoice'))                            return 'Invoice';
  if (t.includes('maintenance') || t.includes('repair')) return 'Maintenance';
  if (t.includes('announcement'))                       return 'Announcement';
  return 'General';
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fullDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}
function dateGroupKey(dateStr: string): string {
  const d = new Date(dateStr); const now = new Date();
  const diff = Math.floor((now.setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return 'This Week';
  return 'Earlier';
}

// ─── Section Label ─────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <View style={sl.container}>
      <Text style={sl.text}>{label}</Text>
      <View style={sl.line} />
    </View>
  );
}

// ─── Notification Card ─────────────────────────────────────────────────────────
function NotifCard({ item, onPress }: { item: NotifItem; onPress: (id: number) => void }) {
  const cat  = typeToCategory(item.type);
  const meta = CATEGORY_META[cat];
  return (
    <TouchableOpacity style={[nc.card, !item.isRead && nc.cardUnread]} activeOpacity={0.75} onPress={() => onPress(item.id)}>
      {!item.isRead && <View style={nc.accentBar} />}
      <View style={nc.inner}>
        <View style={[nc.iconWrap, { backgroundColor: meta.iconBg }]}>
          <Icon name={meta.icon} size={20} color={meta.iconColor} />
        </View>
        <View style={nc.body}>
          <View style={nc.topRow}>
            <View style={[nc.pill, { backgroundColor: meta.iconBg }]}>
              <Text style={[nc.pillText, { color: meta.iconColor }]}>{meta.label}</Text>
            </View>
            <Text style={nc.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[nc.title, !item.isRead && nc.titleUnread]} numberOfLines={1}>{item.title}</Text>
          <Text style={nc.msg} numberOfLines={2}>{item.body}</Text>
        </View>
        {!item.isRead && <View style={nc.dot} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Announcement Card ─────────────────────────────────────────────────────────
function AnnounceCard({ item, onPress }: { item: AnnouncementItem; onPress: (item: AnnouncementItem) => void }) {
  const aud = AUDIENCE_META[item.audience] ?? AUDIENCE_META.all;
  return (
    <TouchableOpacity style={ac.card} activeOpacity={0.75} onPress={() => onPress(item)}>
      <View style={ac.inner}>
        <View style={ac.iconWrap}>
          <Icon name="megaphone" size={20} color="#0F766E" />
        </View>
        <View style={ac.body}>
          <View style={ac.topRow}>
            <View style={[ac.pill, { backgroundColor: aud.bg }]}>
              <Icon name={aud.icon} size={10} color={aud.color} />
              <Text style={[ac.pillText, { color: aud.color }]}>{aud.label}</Text>
            </View>
            <Text style={ac.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={ac.title} numberOfLines={1}>{item.title}</Text>
          <Text style={ac.content} numberOfLines={2}>{item.content}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Detail Sheet (full view of a notification / announcement) ────────────────
function DetailSheet({ item, visible, onClose }: { item: DetailItem | null; visible: boolean; onClose: () => void }) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(700);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 700, duration: 220, useNativeDriver: true }).start(onClose);
  };

  if (!item) return null;

  const isNotif = item.kind === 'notif';
  const title   = item.data.title;
  const body    = isNotif ? (item.data as NotifItem).body : (item.data as AnnouncementItem).content;
  const created = item.data.createdAt;

  let icon: string, iconBg: string, iconColor: string;
  let pillLabel: string, pillBg: string, pillColor: string, pillIcon: string | null = null;
  if (isNotif) {
    const meta = CATEGORY_META[typeToCategory((item.data as NotifItem).type)];
    ({ icon, iconBg, iconColor } = meta);
    pillLabel = meta.label; pillBg = meta.iconBg; pillColor = meta.iconColor;
  } else {
    const aud = AUDIENCE_META[(item.data as AnnouncementItem).audience] ?? AUDIENCE_META.all;
    icon = 'megaphone'; iconBg = '#F0FDFA'; iconColor = '#0F766E';
    pillLabel = aud.label; pillBg = aud.bg; pillColor = aud.color; pillIcon = aud.icon;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={cs.backdrop} onPress={handleClose} />
      <Animated.View style={[cs.sheet, ds.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}>
        <View style={cs.handle} />

        <View style={cs.header}>
          <TouchableOpacity onPress={handleClose} style={cs.closeBtn} activeOpacity={0.7}>
            <Icon name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
          <Text style={cs.headerTitle}>{isNotif ? 'Notification' : 'Announcement'}</Text>
          <View style={ds.headerSpacer} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ds.content}>
          <View style={ds.metaRow}>
            <View style={[ds.iconWrap, { backgroundColor: iconBg }]}>
              <Icon name={icon} size={24} color={iconColor} />
            </View>
            <View style={ds.metaText}>
              <View style={[ds.pill, { backgroundColor: pillBg }]}>
                {pillIcon && <Icon name={pillIcon} size={11} color={pillColor} />}
                <Text style={[ds.pillText, { color: pillColor }]}>{pillLabel}</Text>
              </View>
              <View style={ds.dateRow}>
                <Icon name="time-outline" size={13} color="#9CA3AF" />
                <Text style={ds.dateText}>{fullDateTime(created)}</Text>
              </View>
            </View>
          </View>

          <Text style={ds.title} selectable>{title}</Text>
          <View style={ds.divider} />
          <Text style={ds.body} selectable>{body}</Text>
        </ScrollView>

        <TouchableOpacity style={ds.doneBtn} onPress={handleClose} activeOpacity={0.8}>
          <Text style={ds.doneText}>Close</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Unified Compose Sheet ─────────────────────────────────────────────────────
type AnyTemplate = typeof PUSH_TEMPLATES[0] | typeof ANNOUNCE_TEMPLATES[0];

function ComposeSheet({
  visible, onClose, defaultTargets, units, unitsLoading,
  onNotifSent, onAnnounceSent,
}: {
  visible: boolean;
  onClose: () => void;
  defaultTargets: PublishTarget[];
  units: UnitRow[];
  unitsLoading: boolean;
  onNotifSent: (n: NotifItem) => void;
  onAnnounceSent: (a: AnnouncementItem) => void;
}) {
  const { t }     = useTranslation();
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(700)).current;

  // Publish targets (at least one required)
  const [targets,       setTargets]       = useState<Set<PublishTarget>>(new Set(defaultTargets));
  // Shared fields
  const [title,         setTitle]         = useState('');
  const [body,          setBody]          = useState('');
  const [activeTemplate,setActiveTemplate]= useState<string | null>(null);
  // Push-specific
  const [category,      setCategory]      = useState<NotifCategory>('General');
  const [recipient,     setRecipient]     = useState<'all' | 'unit'>('all');
  // Announce-specific
  const [audience,      setAudience]      = useState<AnnounceAudience>('all');
  // Unit picker (shared)
  const [selectedUnits, setSelectedUnits] = useState<UnitRow[]>([]);
  const [unitSearch,    setUnitSearch]    = useState('');
  const [sending,       setSending]       = useState(false);

  useEffect(() => {
    if (visible) {
      setTargets(new Set(defaultTargets));
      slideAnim.setValue(700);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 700, duration: 230, useNativeDriver: true }).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setTitle(''); setBody(''); setActiveTemplate(null);
      setCategory('General'); setRecipient('all'); setAudience('all');
      setSelectedUnits([]); setUnitSearch('');
    }
  }, [visible]);

  const toggleTarget = (t: PublishTarget) => {
    setTargets(prev => {
      if (prev.has(t) && prev.size === 1) return prev; // keep at least one
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const toggleUnit = (u: UnitRow) =>
    setSelectedUnits(prev => prev.some(s => s.unitId === u.unitId) ? prev.filter(s => s.unitId !== u.unitId) : [...prev, u]);

  const applyTemplate = (tpl: AnyTemplate, group: TemplateGroup) => {
    setActiveTemplate(tpl.id);
    setCategory(tpl.category);
    setTitle(tpl.title);
    let greeting = 'Dear tenant, ';
    if (selectedUnits.length === 1) greeting = `Dear ${selectedUnits[0].tenantName} (Unit ${selectedUnits[0].unitCode}), `;
    else if (selectedUnits.length > 1) greeting = `Dear tenants of ${selectedUnits.map(u => `Unit ${u.unitCode}`).join(', ')}, `;
    setBody(tpl.body.replace('{{greeting}}', greeting));
    // Auto-select the right target for the template group
    if (group === 'push' && !targets.has('push')) setTargets(prev => new Set([...prev, 'push']));
    if (group === 'announce' && !targets.has('announce')) setTargets(prev => new Set([...prev, 'announce']));
  };

  const filteredUnits = units.filter(u => {
    const q = unitSearch.toLowerCase();
    return !q || u.unitCode.toLowerCase().includes(q) || u.tenantName.toLowerCase().includes(q);
  });

  const showUnitPicker = recipient === 'unit' || (targets.has('announce') && audience === 'tenant');
  const canSend = title.trim().length > 0 && body.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) { Alert.alert('Missing fields', 'Please fill in title and message.'); return; }
    setSending(true);
    try {
      const calls: Promise<any>[] = [];

      if (targets.has('push')) {
        const userIds = selectedUnits.map(u => u.tenantUserId).filter((id): id is number => id !== null);
        calls.push(
          notificationsApi.send({
            title: title.trim(),
            body:  body.trim(),
            type:  category.toLowerCase(),
            sendToAll: recipient === 'all',
            ...(recipient === 'unit' && userIds.length > 0 ? { userIds } : {}),
          }),
        );
      }

      if (targets.has('announce')) {
        const unitIds = selectedUnits.length > 0 ? selectedUnits.map(u => u.unitId) : undefined;
        calls.push(
          announcementsApi.create({
            title:   title.trim(),
            content: body.trim(),
            audience,
            unitIds,
          }),
        );
      }

      await Promise.all(calls);

      const now = new Date().toISOString();
      if (targets.has('push')) {
        onNotifSent({ id: Date.now(), title: title.trim(), body: body.trim(), type: category.toLowerCase(), isRead: true, createdAt: now });
      }
      if (targets.has('announce')) {
        onAnnounceSent({ id: Date.now() + 1, title: title.trim(), content: body.trim(), audience, createdAt: now });
      }
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const pushActive     = targets.has('push');
  const announceActive = targets.has('announce');

  // Template row renderer
  const renderTemplate = (tpl: AnyTemplate, group: TemplateGroup, isLast: boolean) => {
    const active = activeTemplate === tpl.id;
    const catM   = CATEGORY_META[tpl.category];
    return (
      <TouchableOpacity
        key={tpl.id}
        style={[cs.tplRow, active && cs.tplRowActive, isLast && cs.tplRowLast]}
        onPress={() => applyTemplate(tpl, group)}
        activeOpacity={0.75}
      >
        <View style={[cs.tplIcon, { backgroundColor: active ? tpl.iconColor : tpl.iconBg }]}>
          <Icon name={tpl.icon} size={17} color={active ? '#fff' : tpl.iconColor} />
        </View>
        <View style={cs.tplBody}>
          <Text style={[cs.tplLabel, active && cs.tplLabelActive]} numberOfLines={1}>{tpl.label}</Text>
          <View style={[cs.tplCatPill, { backgroundColor: catM.iconBg }]}>
            <Text style={[cs.tplCatText, { color: catM.iconColor }]}>{catM.label}</Text>
          </View>
        </View>
        <Icon name={active ? 'checkmark-circle' : 'chevron-forward'} size={17} color={active ? tpl.iconColor : '#D1D5DB'} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={cs.backdrop} onPress={onClose} />
        <Animated.View style={[cs.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}>
          <View style={cs.handle} />

          {/* ── Sheet header ── */}
          <View style={cs.header}>
            <TouchableOpacity onPress={onClose} style={cs.closeBtn} activeOpacity={0.7}>
              <Icon name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
            <Text style={cs.headerTitle}>Compose</Text>
            <TouchableOpacity
              onPress={handleSend}
              style={[cs.sendBtn, (!canSend || sending) && cs.sendBtnOff]}
              activeOpacity={0.8}
              disabled={!canSend || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={cs.sendBtnText}>Send</Text>}
            </TouchableOpacity>
          </View>

          <FlatList
            data={[]}
            renderItem={null}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={cs.form}>

                {/* ── Publish via ── */}
                <Text style={cs.label}>Publish via</Text>
                <View style={cs.targetRow}>
                  {/* Push Notification */}
                  <TouchableOpacity
                    style={[cs.targetBtn, pushActive && cs.targetBtnPushActive]}
                    onPress={() => toggleTarget('push')}
                    activeOpacity={0.8}
                  >
                    <View style={[cs.targetIconWrap, pushActive && cs.targetIconPushActive]}>
                      <Icon name="notifications" size={16} color={pushActive ? '#fff' : '#0F766E'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.targetTitle, pushActive && cs.targetTitleActive]}>Push Notification</Text>
                      <Text style={cs.targetSub}>Instant mobile alert</Text>
                    </View>
                    <View style={[cs.targetCheck, pushActive && cs.targetCheckActive]}>
                      {pushActive && <Icon name="checkmark" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>

                  {/* Announcement */}
                  <TouchableOpacity
                    style={[cs.targetBtn, announceActive && cs.targetBtnAnnActive]}
                    onPress={() => toggleTarget('announce')}
                    activeOpacity={0.8}
                  >
                    <View style={[cs.targetIconWrap, announceActive && cs.targetIconAnnActive]}>
                      <Icon name="megaphone" size={16} color={announceActive ? '#fff' : '#7C3AED'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.targetTitle, announceActive && cs.targetTitleAnnActive]}>Announcement</Text>
                      <Text style={cs.targetSub}>Pinned broadcast post</Text>
                    </View>
                    <View style={[cs.targetCheck, announceActive && cs.targetCheckAnnActive]}>
                      {announceActive && <Icon name="checkmark" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                </View>

                {/* ── Both selected hint ── */}
                {pushActive && announceActive && (
                  <View style={cs.bothHint}>
                    <Icon name="flash" size={13} color="#7C3AED" />
                    <Text style={cs.bothHintText}>Will send to both endpoints simultaneously</Text>
                  </View>
                )}

                {/* ── Push Notification options ── */}
                {pushActive && (
                  <>
                    <Text style={cs.label}>Notification Category</Text>
                    <View style={cs.categoryRow}>
                      {CATEGORIES.map(cat => {
                        const m = CATEGORY_META[cat]; const active = category === cat;
                        return (
                          <TouchableOpacity key={cat} style={[cs.catBtn, active && { backgroundColor: m.iconBg, borderColor: m.iconColor }]} onPress={() => setCategory(cat)} activeOpacity={0.8}>
                            <Icon name={m.icon} size={13} color={active ? m.iconColor : '#9CA3AF'} />
                            <Text style={[cs.catText, active && { color: m.iconColor }]}>{m.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={cs.label}>Push Recipients</Text>
                    <View style={cs.recipRow}>
                      {(['all', 'unit'] as const).map(r => (
                        <TouchableOpacity key={r} style={[cs.recipBtn, recipient === r && cs.recipBtnActive]} onPress={() => { setRecipient(r); if (r === 'all') setSelectedUnits([]); }} activeOpacity={0.8}>
                          <Icon name={r === 'all' ? 'people-outline' : 'home-outline'} size={14} color={recipient === r ? '#0F766E' : '#9CA3AF'} />
                          <Text style={[cs.recipText, recipient === r && cs.recipTextActive]}>
                            {r === 'all' ? 'All Tenants' : selectedUnits.length > 0 ? `${selectedUnits.length} unit${selectedUnits.length > 1 ? 's' : ''}` : 'Specific Units'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* ── Announcement options ── */}
                {announceActive && (
                  <>
                    <Text style={cs.label}>Announcement Audience</Text>
                    <View style={cs.recipRow}>
                      {([['all', 'All', 'people-outline'], ['tenant', 'Tenants', 'home-outline'], ['employee', 'Staff', 'briefcase-outline']] as const).map(([key, label, icon]) => (
                        <TouchableOpacity key={key} style={[cs.recipBtn, { flex: key === 'employee' ? 1 : 1 }, audience === key && cs.recipBtnActive]} onPress={() => { setAudience(key); if (key !== 'tenant') setSelectedUnits([]); }} activeOpacity={0.8}>
                          <Icon name={icon} size={14} color={audience === key ? '#0F766E' : '#9CA3AF'} />
                          <Text style={[cs.recipText, audience === key && cs.recipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* ── Unit picker (shown when push=unit or announce audience=tenant) ── */}
                {showUnitPicker && (
                  <View style={cs.unitPickerWrap}>
                    {/* Selected chips */}
                    {selectedUnits.length > 0 ? (
                      <View style={cs.selectedChipsWrap}>
                        <View style={cs.selectedChipsRow}>
                          {selectedUnits.map(u => (
                            <View key={u.unitId} style={cs.chip}>
                              <Text style={cs.chipText}>Unit {u.unitCode}</Text>
                              <TouchableOpacity onPress={() => toggleUnit(u)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                                <Icon name="close-circle" size={14} color="#0F766E" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                        <View style={cs.chipsFooter}>
                          <Text style={cs.chipsCount}>{selectedUnits.length} unit{selectedUnits.length > 1 ? 's' : ''} selected</Text>
                          <TouchableOpacity onPress={() => setSelectedUnits([])} activeOpacity={0.7}>
                            <Text style={cs.chipsClear}>Clear all</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={cs.unitHint}>
                        <Icon name="information-circle-outline" size={14} color="#9CA3AF" />
                        <Text style={cs.unitHintText}>Tap units below to select recipients</Text>
                      </View>
                    )}

                    {/* Select all */}
                    {!unitsLoading && units.length > 0 && (
                      <View style={cs.selectAllRow}>
                        <TouchableOpacity onPress={() => setSelectedUnits(selectedUnits.length === units.length ? [] : [...units])} activeOpacity={0.7} style={cs.selectAllBtn}>
                          <Icon name={selectedUnits.length === units.length ? 'checkbox' : 'square-outline'} size={16} color="#0F766E" />
                          <Text style={cs.selectAllText}>{selectedUnits.length === units.length ? 'Deselect All' : `Select All (${units.length})`}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Search */}
                    <SearchBar value={unitSearch} onChangeText={setUnitSearch} placeholder="Search unit or tenant…" style={{ marginBottom: 10 }} />

                    {/* Unit rows */}
                    {unitsLoading ? (
                      <ActivityIndicator color="#0F766E" style={{ marginVertical: 16 }} />
                    ) : (
                      <View style={cs.unitList}>
                        {filteredUnits.map((u, i) => {
                          const isSel = selectedUnits.some(s => s.unitId === u.unitId);
                          return (
                            <View key={u.contractId}>
                              <TouchableOpacity style={[cs.unitRow, isSel && cs.unitRowSel]} onPress={() => toggleUnit(u)} activeOpacity={0.75}>
                                <View style={[cs.unitCheckbox, isSel && cs.unitCheckboxSel]}>{isSel && <Icon name="checkmark" size={12} color="#fff" />}</View>
                                <View style={[cs.unitAvatar, isSel && cs.unitAvatarSel]}><Icon name="home" size={13} color={isSel ? '#fff' : '#0F766E'} /></View>
                                <View style={cs.unitInfo}>
                                  <Text style={[cs.unitCode, isSel && cs.unitCodeSel]}>Unit {u.unitCode}{u.floorNumber ? ` · F${u.floorNumber}` : ''}</Text>
                                  <Text style={cs.unitTenant} numberOfLines={1}>{u.tenantName}</Text>
                                </View>
                              </TouchableOpacity>
                              {i < filteredUnits.length - 1 && <View style={cs.unitDivider} />}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {/* ── Templates ── */}
                <View style={cs.tplSection}>
                  {/* Push alert templates */}
                  <View style={cs.tplGroupHeader}>
                    <View style={[cs.tplGroupIcon, { backgroundColor: '#F0FDFA' }]}>
                      <Icon name="notifications" size={13} color="#0F766E" />
                    </View>
                    <Text style={cs.tplGroupLabel}>Push Alert Templates</Text>
                  </View>
                  <View style={cs.tplList}>
                    {PUSH_TEMPLATES.map((tpl, i) => renderTemplate(tpl, 'push', i === PUSH_TEMPLATES.length - 1))}
                  </View>

                  {/* Announcement templates */}
                  <View style={[cs.tplGroupHeader, { marginTop: 16 }]}>
                    <View style={[cs.tplGroupIcon, { backgroundColor: '#EDE9FE' }]}>
                      <Icon name="megaphone" size={13} color="#7C3AED" />
                    </View>
                    <Text style={cs.tplGroupLabel}>Announcement Templates</Text>
                  </View>
                  <View style={cs.tplList}>
                    {ANNOUNCE_TEMPLATES.map((tpl, i) => renderTemplate(tpl, 'announce', i === ANNOUNCE_TEMPLATES.length - 1))}
                  </View>
                </View>

                {/* ── Title ── */}
                <View style={{ marginTop: 16 }}>
                  <Input label="Title" placeholder="Message title…" value={title} onChangeText={setTitle} maxLength={80} returnKeyType="next" />
                </View>

                {/* ── Message ── */}
                <Input label="Message" placeholder="Write your message…" value={body} onChangeText={setBody} multiline maxLength={500} />
              </View>
            }
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const { t }  = useTranslation();
  const insets = useSafeAreaInsets();
  const { refreshBadges } = useBadges();

  const [detail,         setDetail]         = useState<DetailItem | null>(null);
  const [segment,        setSegment]        = useState<Segment>('notifications');
  const [notifications,  setNotifications]  = useState<NotifItem[]>([]);
  const [announcements,  setAnnouncements]  = useState<AnnouncementItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [activeTab,      setActiveTab]      = useState<FilterTab>('all');

  // Shared units for compose
  const [units,        setUnits]        = useState<UnitRow[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const loadUnits = useCallback(() => {
    if (units.length > 0) return;
    setUnitsLoading(true);
    contractsApi.list('status=Active')
      .then(res => {
        const rows: UnitRow[] = (res?.data?.contracts ?? [])
          .filter((c: any) => c.unit && c.tenant)
          .map((c: any) => ({
            contractId: c.id, unitId: c.unit.id, unitCode: c.unit.unitCode,
            floorNumber: c.unit.floorNumber ?? null,
            tenantName: c.tenant.name,
            tenantUserId: c.tenant.userId ?? c.tenant.user?.id ?? null,
          }))
          .sort((a: UnitRow, b: UnitRow) => a.unitCode.localeCompare(b.unitCode));
        setUnits(rows);
      })
      .catch(() => {})
      .finally(() => setUnitsLoading(false));
  }, [units.length]);

  // Load both segments on mount
  useEffect(() => {
    (async () => {
      const [nRes, aRes] = await Promise.allSettled([
        notificationsApi.list(),
        announcementsApi.list(),
      ]);
      if (nRes.status === 'fulfilled') setNotifications(normNotifs(nRes.value));
      if (aRes.status === 'fulfilled') setAnnouncements(normAnns(aRes.value));
      setLoading(false);
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const [nRes, aRes] = await Promise.allSettled([notificationsApi.list(), announcementsApi.list()]);
    if (nRes.status === 'fulfilled') setNotifications(normNotifs(nRes.value));
    if (aRes.status === 'fulfilled') setAnnouncements(normAnns(aRes.value));
    setRefreshing(false);
  }, []);

  const handleOpenCompose = () => { loadUnits(); setComposeVisible(true); };

  // Open the full view; mark unread notifications as read in the background
  const handleOpenNotif = (id: number) => {
    const item = notifications.find(n => n.id === id);
    if (!item) return;
    setDetail({ kind: 'notif', data: item });
    if (!item.isRead) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      notificationsApi.markRead(id).then(refreshBadges).catch(() => {/* silent */});
    }
  };

  const handleOpenAnnouncement = (item: AnnouncementItem) => setDetail({ kind: 'ann', data: item });

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (!unread.length) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    await Promise.allSettled(unread.map(n => notificationsApi.markRead(n.id)));
    refreshBadges();
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Build filtered notification list
  const filteredNotifs = notifications.filter(n => {
    if (activeTab === 'all')    return true;
    if (activeTab === 'unread') return !n.isRead;
    return typeToCategory(n.type) === activeTab;
  });

  type ListRow =
    | { kind: 'header'; label: string; key: string }
    | { kind: 'notif';  data: NotifItem;        key: string }
    | { kind: 'ann';    data: AnnouncementItem; key: string };

  const buildGrouped = <T extends { createdAt: string }>(
    items: T[], kind: 'notif' | 'ann',
  ): ListRow[] => {
    const out: ListRow[] = [];
    let lastGroup = '';
    for (const item of items) {
      const g = dateGroupKey(item.createdAt);
      if (g !== lastGroup) { out.push({ kind: 'header', label: g, key: `hdr-${kind}-${g}` }); lastGroup = g; }
      out.push({ kind, data: item as any, key: `${kind}-${ (item as any).id}` });
    }
    return out;
  };

  const notifListData = buildGrouped(filteredNotifs, 'notif');
  const annListData   = buildGrouped(announcements, 'ann');

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'unread',       label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'Announcement', label: 'Announcement' },
    { key: 'Invoice',      label: 'Invoice' },
    { key: 'Maintenance',  label: 'Maintenance' },
    { key: 'General',      label: 'General' },
  ];

  // Default targets based on active segment
  const defaultTargets: PublishTarget[] = segment === 'notifications' ? ['push'] : ['announce'];

  return (
    <SafeAreaView style={s.container} edges={[]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <View style={s.headerRow}>
          <BackButton />
          <View style={s.headerTitleBlock}>
            <Text style={s.headerTitle}>{t('notifications.title')}</Text>
            <Text style={s.headerSub}>Push notifications & announcements</Text>
          </View>
          <TouchableOpacity style={s.composeBtn} onPress={handleOpenCompose} activeOpacity={0.8}>
            <Icon name="create-outline" size={16} color="#fff" />
            <Text style={s.composeBtnText}>Compose</Text>
          </TouchableOpacity>
        </View>

        {/* Segment switcher */}
        <View style={s.segmentRow}>
          {(['notifications', 'announcements'] as Segment[]).map(seg => (
            <TouchableOpacity
              key={seg}
              style={[s.segBtn, segment === seg && s.segBtnActive]}
              onPress={() => { setSegment(seg); setActiveTab('all'); }}
              activeOpacity={0.8}
            >
              <Icon
                name={seg === 'notifications' ? 'notifications-outline' : 'megaphone-outline'}
                size={14}
                color={segment === seg ? '#0F766E' : '#9CA3AF'}
              />
              <Text style={[s.segText, segment === seg && s.segTextActive]}>
                {seg === 'notifications' ? 'Notifications' : 'Announcements'}
              </Text>
              {seg === 'notifications' && unreadCount > 0 && (
                <View style={s.segBadge}><Text style={s.segBadgeText}>{unreadCount}</Text></View>
              )}
              {seg === 'announcements' && announcements.length > 0 && (
                <View style={[s.segBadge, s.segBadgeIndigo]}>
                  <Text style={[s.segBadgeText, s.segBadgeTextIndigo]}>{announcements.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Mark all read */}
        {segment === 'notifications' && unreadCount > 0 && (
          <View style={s.headerMeta}>
            <View style={s.unreadBadge}>
              <View style={s.unreadDot} />
              <Text style={s.unreadBadgeText}>{unreadCount} unread</Text>
            </View>
            <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn} activeOpacity={0.7}>
              <Icon name="checkmark-done-outline" size={13} color="#0F766E" />
              <Text style={s.markAllText}>Mark all as read</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Notification filter tabs ── */}
      {segment === 'notifications' && (
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.key}
          contentContainerStyle={s.tabsContent}
          style={s.tabsBar}
          renderItem={({ item: tab }) => {
            const active  = activeTab === tab.key;
            const catMeta = CATEGORIES.includes(tab.key as NotifCategory) ? CATEGORY_META[tab.key as NotifCategory] : null;
            return (
              <TouchableOpacity
                style={[s.tab, active && (catMeta ? { backgroundColor: catMeta.iconBg, borderColor: catMeta.iconColor } : s.tabActive)]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                {catMeta && <Icon name={catMeta.icon} size={12} color={active ? catMeta.iconColor : '#9CA3AF'} />}
                <Text style={[s.tabText, active && (catMeta ? { color: catMeta.iconColor } : s.tabTextActive)]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color="#0F766E" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={segment === 'notifications' ? notifListData : annListData}
          keyExtractor={item => item.key}
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0F766E']} tintColor="#0F766E" />}
          renderItem={({ item }) => {
            if (item.kind === 'header') return <SectionLabel label={item.label} />;
            if (item.kind === 'notif')  return <NotifCard item={item.data as NotifItem} onPress={handleOpenNotif} />;
            return <AnnounceCard item={item.data as AnnouncementItem} onPress={handleOpenAnnouncement} />;
          }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Icon name={segment === 'notifications' ? 'notifications-off-outline' : 'megaphone-outline'} size={40} color="#99F6E4" />
              </View>
              <Text style={s.emptyTitle}>No {segment === 'notifications' ? 'notifications' : 'announcements'}</Text>
              <Text style={s.emptySubtitle}>
                {segment === 'notifications' && activeTab === 'unread' ? "You're all caught up!" : `${segment === 'notifications' ? 'Notifications' : 'Announcements'} will appear here.`}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Unified compose sheet ── */}
      <ComposeSheet
        visible={composeVisible}
        onClose={() => setComposeVisible(false)}
        defaultTargets={defaultTargets}
        units={units}
        unitsLoading={unitsLoading}
        onNotifSent={n => setNotifications(prev => [n, ...prev])}
        onAnnounceSent={a => setAnnouncements(prev => [a, ...prev])}
      />

      {/* ── Full-view detail sheet ── */}
      <DetailSheet item={detail} visible={detail !== null} onClose={() => setDetail(null)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 4, gap: 12,
  },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleBlock: { flex: 1, marginRight: 12 },
  headerTitle:      { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub:        { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  headerMeta:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unreadBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDFA', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  unreadDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0F766E' },
  unreadBadgeText:  { fontSize: 12, fontWeight: '700', color: '#0F766E' },
  markAllBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markAllText:      { fontSize: 12, fontWeight: '600', color: '#0F766E' },
  composeBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F766E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  composeBtnText:   { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  segmentRow:         { flexDirection: 'row', gap: 8 },
  segBtn:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: 'transparent' },
  segBtnActive:       { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' },
  segText:            { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  segTextActive:      { color: '#0F766E', fontWeight: '700' },
  segBadge:           { backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, minWidth: 18, alignItems: 'center' },
  segBadgeIndigo:     { backgroundColor: '#F0FDFA' },
  segBadgeText:       { fontSize: 10, fontWeight: '700', color: '#fff' },
  segBadgeTextIndigo: { color: '#0F766E' },

  tabsBar:     { backgroundColor: '#FFFFFF', maxHeight: 52, flexGrow: 0 },
  tabsContent: { paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  tab:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent' },
  tabActive:   { backgroundColor: '#F0FDFA', borderColor: '#0F766E' },
  tabText:     { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#0F766E' },

  list:        { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  emptyWrap:    { alignItems: 'center', paddingTop: 64, gap: 10 },
  emptyIconWrap:{ width: 80, height: 80, borderRadius: 24, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle:   { fontSize: 16, fontWeight: '800', color: '#374151' },
  emptySubtitle:{ fontSize: 13, color: '#9CA3AF' },
});

const nc = StyleSheet.create({
  card:        { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 10 },
  cardUnread:  { shadowColor: '#0F766E', shadowOpacity: 0.08 },
  accentBar:   { width: 4, backgroundColor: '#0F766E' },
  inner:       { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  iconWrap:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:        { flex: 1 },
  topRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  pill:        { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  pillText:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  time:        { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  title:       { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 3, lineHeight: 20 },
  titleUnread: { fontWeight: '800', color: '#0F172A' },
  msg:         { fontSize: 12, color: '#6B7280', lineHeight: 18 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0F766E', flexShrink: 0, marginTop: 6 },
});

const ac = StyleSheet.create({
  card:    { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 10 },
  inner:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  iconWrap:{ width: 46, height: 46, borderRadius: 14, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:    { flex: 1 },
  topRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  pillText:{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  time:    { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  title:   { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4, lineHeight: 20 },
  content: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
});

const ds = StyleSheet.create({
  sheet:    { maxHeight: '85%' },
  headerSpacer: { width: 32 },
  metaText: { flex: 1, gap: 6 },
  content:  { paddingBottom: 20 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  iconWrap: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  dateRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  title:    { fontSize: 19, fontWeight: '800', color: '#0F172A', lineHeight: 26, letterSpacing: -0.3 },
  divider:  { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 16 },
  body:     { fontSize: 15, color: '#374151', lineHeight: 23 },
  doneBtn:  { backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  doneText: { fontSize: 15, fontWeight: '700', color: '#374151' },
});

const sl = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
  text:      { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0 },
  line:      { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
});

const cs = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '94%' },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  sendBtn:     { backgroundColor: '#0F766E', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  sendBtnOff:  { backgroundColor: '#5EEAD4' },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  form:      { paddingBottom: 24 },
  label:     { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 20 },

  // Publish targets
  targetRow:          { gap: 10 },
  targetBtn:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FAFAFA' },
  targetBtnPushActive:{ borderColor: '#99F6E4', backgroundColor: '#F0FDFA' },
  targetBtnAnnActive: { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' },
  targetIconWrap:     { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  targetIconPushActive: { backgroundColor: '#0F766E' },
  targetIconAnnActive:  { backgroundColor: '#7C3AED' },
  targetTitle:        { fontSize: 14, fontWeight: '700', color: '#374151' },
  targetTitleActive:  { color: '#115E59' },
  targetTitleAnnActive: { color: '#5B21B6' },
  targetSub:          { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  targetCheck:        { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: '#FFFFFF' },
  targetCheckActive:  { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  targetCheckAnnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },

  bothHint:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginTop: 10 },
  bothHintText: { fontSize: 12, color: '#7C3AED', fontWeight: '600', flex: 1 },

  // Category
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  catText:     { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  // Recipients
  recipRow:       { flexDirection: 'row', gap: 8 },
  recipBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  recipBtnActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' },
  recipText:      { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  recipTextActive:{ color: '#0F766E', fontWeight: '700' },

  // Unit picker
  unitPickerWrap:  { marginTop: 12, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', overflow: 'hidden', backgroundColor: '#FAFAFA' },
  selectedChipsWrap: { backgroundColor: '#F0FDFA', borderBottomWidth: 1, borderBottomColor: '#CCFBF1', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 8 },
  selectedChipsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#99F6E4', paddingHorizontal: 10, paddingVertical: 5 },
  chipText:        { fontSize: 12, fontWeight: '600', color: '#115E59' },
  chipsFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipsCount:      { fontSize: 11, color: '#0F766E', fontWeight: '600' },
  chipsClear:      { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  unitHint:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  unitHintText:    { fontSize: 12, color: '#9CA3AF' },
  selectAllRow:    { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  selectAllBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText:   { fontSize: 13, fontWeight: '600', color: '#0F766E' },
  unitList:        { maxHeight: 200 },
  unitRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  unitRowSel:      { backgroundColor: '#F5F3FF' },
  unitCheckbox:    { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: '#fff' },
  unitCheckboxSel: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  unitAvatar:      { width: 32, height: 32, borderRadius: 9, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unitAvatarSel:   { backgroundColor: '#0F766E' },
  unitInfo:        { flex: 1 },
  unitCode:        { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  unitCodeSel:     { color: '#115E59' },
  unitTenant:      { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  unitDivider:     { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginHorizontal: 14 },

  // Templates
  tplSection:     { marginTop: 20 },
  tplGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tplGroupIcon:   { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tplGroupLabel:  { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  tplList:        { borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', overflow: 'hidden', backgroundColor: '#fff' },
  tplRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  tplRowActive:   { backgroundColor: '#F5F3FF' },
  tplRowLast:     { borderBottomWidth: 0 },
  tplIcon:        { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tplBody:        { flex: 1 },
  tplLabel:       { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  tplLabelActive: { color: '#115E59' },
  tplCatPill:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tplCatText:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Inputs
});
