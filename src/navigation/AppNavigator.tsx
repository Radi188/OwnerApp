import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ReportScreen from '../screens/ReportScreen';
import RequestsScreen from '../screens/RequestsScreen';
import RequestDetailScreen from '../screens/RequestDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import TenantsScreen from '../screens/TenantsScreen';
import TenantDetailScreen from '../screens/TenantDetailScreen';
import GenerateInvoiceScreen from '../screens/GenerateInvoiceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CustomTabBar from '../components/CustomTabBar';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Main: undefined;
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  Report: undefined;
};

export type RequestsStackParamList = {
  RequestsList: undefined;
  RequestDetail: { requestId: number };
};

export type TenantsStackParamList = {
  TenantsList: undefined;
  TenantDetail: { tenantId: number };
  GenerateInvoice: {
    tenantId: number; contractId: number; unitId: number; lastReading?: any;
    // Invoice already saved on the API for this billing month (if any)
    apiInvoice?: { id: number; totalAmount: number; dueDate?: string | null; status?: string; billingMonth?: string } | null;
  };
};

const RootStack      = createStackNavigator<RootStackParamList>();
const Tab            = createBottomTabNavigator();
const DashboardStack = createStackNavigator<DashboardStackParamList>();
const RequestsStack  = createStackNavigator<RequestsStackParamList>();
const TenantsStack   = createStackNavigator<TenantsStackParamList>();

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashboardStack.Screen name="Report"        component={ReportScreen} />
    </DashboardStack.Navigator>
  );
}

function RequestsNavigator() {
  return (
    <RequestsStack.Navigator screenOptions={{ headerShown: false }}>
      <RequestsStack.Screen name="RequestsList"  component={RequestsScreen} />
      <RequestsStack.Screen name="RequestDetail" component={RequestDetailScreen} />
    </RequestsStack.Navigator>
  );
}

function TenantsNavigator() {
  return (
    <TenantsStack.Navigator screenOptions={{ headerShown: false }}>
      <TenantsStack.Screen name="TenantsList"     component={TenantsScreen} />
      <TenantsStack.Screen name="TenantDetail"    component={TenantDetailScreen} />
      <TenantsStack.Screen name="GenerateInvoice" component={GenerateInvoiceScreen} />
    </TenantsStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard"     component={DashboardNavigator} />
      <Tab.Screen name="Requests"      component={RequestsNavigator} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Tenants"       component={TenantsNavigator} />
      <Tab.Screen name="Profile"       component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        {!isAuthenticated ? (
          <>
            <RootStack.Screen name="Splash" component={SplashScreen} />
            <RootStack.Screen
              name="Login"
              component={LoginScreen}
              options={{ animation: 'fade', animationDuration: 350 }}
            />
          </>
        ) : (
          <RootStack.Screen
            name="Main"
            component={MainTabs}
            options={{ animation: 'fade', animationDuration: 500 }}
          />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
