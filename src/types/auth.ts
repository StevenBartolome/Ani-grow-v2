export type BaseUserRole = 'super_admin' | 'admin' | 'employee' | string;

export interface CustomPermissions {
  add: string[];
  remove: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  farmId?: string;
  displayName: string;
  photoURL?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  role: BaseUserRole;
  roleId?: string;
  platform: 'web' | 'mobile';
  status: 'active' | 'suspended' | 'pending';
  customPermissions: CustomPermissions;
  assignedModules: string[];
  lastLogin: any;
  createdAt: any;
  createdBy: string;
  loginHistory: any[];
  failedLoginAttempts: number;
  lockedUntil?: any;
}

export interface SystemConfig {
  superAdminEmail: string;
  appName: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  defaultRoleForNewUsers: string;
  sessionTimeoutMinutes: number;
  featureFlags: {
    weighingEnabled: boolean;
    feedingEnabled: boolean;
    analyticsEnabled: boolean;
    deviceManagementEnabled: boolean;
    segregationEnabled: boolean;
    notificationsEnabled: boolean;
  };
  passwordPolicy: {
    minLength: number;
    requireSpecialChar: boolean;
    requireNumber: boolean;
  };
  updatedAt: any;
  updatedBy: string;
}
