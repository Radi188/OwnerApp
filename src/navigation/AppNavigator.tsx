import React from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import TelegramScreen from '../screens/TelegramScreen';
import RolePermissionsScreen from '../screens/admin/RolePermissionsScreen';
import HomeScreen from '../screens/HomeScreen';
import RequestsScreen from '../screens/RequestsScreen';
import RequestDetailScreen from '../screens/RequestDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import TenantsScreen from '../screens/TenantsScreen';
import TenantDetailScreen from '../screens/TenantDetailScreen';
import GenerateInvoiceScreen from '../screens/GenerateInvoiceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MoreScreen from '../screens/MoreScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import SendNotificationScreen from '../screens/SendNotificationScreen';
import UnitsScreen from '../screens/units/UnitsScreen';
import UnitDetailScreen from '../screens/units/UnitDetailScreen';
import MoveInScreen from '../screens/tenancy/MoveInScreen';
import MoveOutScreen from '../screens/tenancy/MoveOutScreen';
import UnitFormScreen from '../screens/units/UnitFormScreen';
import PropertySettingsScreen from '../screens/units/PropertySettingsScreen';
import TenantFormScreen from '../screens/tenants/TenantFormScreen';
import OccupantFormScreen from '../screens/tenants/OccupantFormScreen';
import BillingScreen from '../screens/billing/BillingScreen';
import InvoiceDetailScreen from '../screens/billing/InvoiceDetailScreen';
import PaymentsScreen from '../screens/billing/PaymentsScreen';
import MeterRoundScreen from '../screens/billing/MeterRoundScreen';
import ExpensesScreen from '../screens/expenses/ExpensesScreen';
import TransactionFormScreen from '../screens/expenses/TransactionFormScreen';
import CategoriesScreen from '../screens/expenses/CategoriesScreen';
import UtilityFormScreen from '../screens/billing/UtilityFormScreen';
import type { GroupedReadingRow, MeterType } from '../services/types';
import ContractsScreen from '../screens/contracts/ContractsScreen';
import ContractDetailScreen from '../screens/contracts/ContractDetailScreen';
import ContractFormScreen from '../screens/contracts/ContractFormScreen';
import AnnouncementsScreen from '../screens/announcements/AnnouncementsScreen';
import AnnouncementFormScreen from '../screens/announcements/AnnouncementFormScreen';
import TemplateFormScreen from '../screens/announcements/TemplateFormScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import UserFormScreen from '../screens/admin/UserFormScreen';
import RolesScreen from '../screens/admin/RolesScreen';
import ReportsHubScreen from '../screens/reports/ReportsHubScreen';
import ReportDetailScreen from '../screens/reports/ReportDetailScreen';
import CustomTabBar from '../components/CustomTabBar';

// ─── Route params ────────────────────────────────────────────────────────────

type ApiInvoiceSummary = {
  id: number; totalAmount: number; dueDate?: string | null; status?: string; billingMonth?: string;
} | null;

export type AppStackParamList = {
  Main: undefined;
  // Tenants
  TenantDetail: { tenantId: number };
  TenantForm: { tenant?: any };
  OccupantForm: { tenantId: number; occupant?: any };
  GenerateInvoice: { tenantId: number; contractId: number; unitId: number; lastReading?: any; apiInvoice?: ApiInvoiceSummary; tenantName?: string; unitCode?: string };
  SendNotification: { userId: number; name: string };
  // Units & property
  UnitDetail: { unitId: number };
  UnitForm: { unit?: any };
  MoveIn: { unitId: number; tenantId?: number };
  MoveOut: { unitId: number };
  PropertySettings: undefined;
  // Billing
  InvoiceDetail: { invoiceId: number };
  Payments: undefined;
  MeterRound: undefined;
  Expenses: undefined;
  TransactionForm: { transaction?: any; type?: 'expense' | 'income' } | undefined;
  Categories: undefined;
  /** `row` → edit both meters of a grouped row; `addMeter` + `readingDate` → add a row's missing meter. */
  UtilityForm: { unitId?: number; unitCode?: string; row?: GroupedReadingRow; addMeter?: MeterType; readingDate?: string };
  // Contracts
  Contracts: undefined;
  ContractDetail: { contractId: number };
  ContractForm: { contract?: any; tenantId?: number; unitId?: number; monthlyRent?: any; depositAmount?: any };
  // Maintenance
  Requests: { filter?: string } | undefined;
  RequestDetail: { requestId: number };
  // Communication
  Notifications: undefined;
  Announcements: undefined;
  AnnouncementForm: { announcement?: any; template?: any };
  TemplateForm: { template?: any };
  // Insights
  Reports: undefined;
  ReportDetail: { kind: string };
  // Admin
  Users: undefined;
  UserForm: { user?: any };
  Roles: undefined;
  RolePermissions: { role: any };
  Profile: undefined;
  Telegram: undefined;
  ChangePassword: { forced?: boolean } | undefined;
};

export type RootStackParamList = AppStackParamList & { Splash: undefined; Login: undefined; ForgotPassword: undefined };

// Kept for existing screens that type their route params with these names
export type TenantsStackParamList = AppStackParamList;
export type RequestsStackParamList = AppStackParamList;

const RootStack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator tabBar={props => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Units" component={UnitsScreen} />
      <Tab.Screen name="Tenants" component={TenantsScreen} />
      <Tab.Screen name="Billing" component={BillingScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: colors.surface },
};

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuth();

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <RootStack.Screen name="Splash" component={SplashScreen} options={{ animation: 'none' }} />
            <RootStack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
            <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
          </>
        ) : user?.mustChangePassword ? (
          // First login with a temporary password: nothing else is reachable until it's changed
          <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} initialParams={{ forced: true }} options={{ gestureEnabled: false }} />
        ) : (
          <>
            <RootStack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
            <RootStack.Group screenOptions={{ animation: 'slide_from_right' }}>
              <RootStack.Screen name="TenantDetail" component={TenantDetailScreen} />
              <RootStack.Screen name="GenerateInvoice" component={GenerateInvoiceScreen} />
              <RootStack.Screen name="SendNotification" component={SendNotificationScreen} />
              <RootStack.Screen name="UnitDetail" component={UnitDetailScreen} />
              <RootStack.Screen name="PropertySettings" component={PropertySettingsScreen} />
              <RootStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
              <RootStack.Screen name="Payments" component={PaymentsScreen} />
              <RootStack.Screen name="Expenses" component={ExpensesScreen} />
              <RootStack.Screen name="Categories" component={CategoriesScreen} />
              <RootStack.Screen name="Contracts" component={ContractsScreen} />
              <RootStack.Screen name="ContractDetail" component={ContractDetailScreen} />
              <RootStack.Screen name="Requests" component={RequestsScreen} />
              <RootStack.Screen name="RequestDetail" component={RequestDetailScreen} />
              <RootStack.Screen name="Notifications" component={NotificationsScreen} />
              <RootStack.Screen name="Announcements" component={AnnouncementsScreen} />
              <RootStack.Screen name="Reports" component={ReportsHubScreen} />
              <RootStack.Screen name="ReportDetail" component={ReportDetailScreen} />
              <RootStack.Screen name="Users" component={UsersScreen} />
              <RootStack.Screen name="Roles" component={RolesScreen} />
              <RootStack.Screen name="RolePermissions" component={RolePermissionsScreen} />
              <RootStack.Screen name="Profile" component={ProfileScreen} />
              <RootStack.Screen name="Telegram" component={TelegramScreen} />
            </RootStack.Group>
            {/* Forms slide up like sheets */}
            <RootStack.Group screenOptions={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }}>
              <RootStack.Screen name="TenantForm" component={TenantFormScreen} />
              <RootStack.Screen name="OccupantForm" component={OccupantFormScreen} />
              <RootStack.Screen name="UnitForm" component={UnitFormScreen} />
              <RootStack.Screen name="UtilityForm" component={UtilityFormScreen} />
              <RootStack.Screen name="MoveIn" component={MoveInScreen} />
              <RootStack.Screen name="MeterRound" component={MeterRoundScreen} />
              <RootStack.Screen name="TransactionForm" component={TransactionFormScreen} />
              <RootStack.Screen name="MoveOut" component={MoveOutScreen} />
              <RootStack.Screen name="ContractForm" component={ContractFormScreen} />
              <RootStack.Screen name="AnnouncementForm" component={AnnouncementFormScreen} />
              <RootStack.Screen name="TemplateForm" component={TemplateFormScreen} />
              <RootStack.Screen name="UserForm" component={UserFormScreen} />
              <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            </RootStack.Group>
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
