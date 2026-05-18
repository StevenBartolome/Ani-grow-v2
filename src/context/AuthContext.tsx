import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Platform } from 'react-native';
import { UserProfile, BaseUserRole, SystemConfig } from '@/types/auth';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { createURL, parse } from 'expo-linking';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: BaseUserRole | null;
  permissions: any;
  effectivePermissions: string[];
  systemConfig: SystemConfig | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  signIn: (email: string, pass: string) => Promise<{ mfaRequired: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (data: any) => Promise<void>;
  resendVerificationCode: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  enrollMFA: () => Promise<{ factorId: string; qrCode: string; secret: string }>;
  verifyMFA: (factorId: string, code: string, challengeId?: string) => Promise<void>;
  unenrollMFA: (factorId: string) => Promise<void>;
  getMFAFactors: () => Promise<any[]>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  permissions: {},
  effectivePermissions: [],
  systemConfig: null,
  isLoading: true,
  refreshProfile: async () => { },
  hasPermission: () => false,
  signIn: async (_email: string, _pass: string) => ({ mfaRequired: false }),
  signInWithGoogle: async () => { },
  signOut: async () => { },
  signUp: async (_data: any) => { },
  resendVerificationCode: async (_email: string) => { },
  resetPassword: async (_email: string) => { },
  updatePassword: async (_password: string) => { },
  enrollMFA: async () => ({ factorId: '', qrCode: '', secret: '' }),
  verifyMFA: async (_factorId: string, _code: string, _challengeId?: string) => { },
  unenrollMFA: async (_factorId: string) => { },
  getMFAFactors: async () => [],
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<BaseUserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale/invalid refresh token — clear it so the user gets a clean login screen
        supabase.auth.signOut();
        setIsLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshProfile();
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        supabase.auth.signOut();
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshProfile();
      } else {
        setProfile(null);
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;
    // OAuth users (Google) skip email confirmation flow — treat them as confirmed
    const isOAuthUser = (currentUser.app_metadata?.provider !== 'email');
    if (!isOAuthUser && !currentUser.email_confirmed_at) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setProfile({
          ...data,
          uid: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          customPermissions: data.custom_permissions || { add: [], remove: [] },
          assignedModules: data.assigned_modules || [],
        } as UserProfile);
        setRole(data.role);
      } else {
        // [AUTO-REGISTER] If no profile exists, create one (e.g. for Google users)
        console.log('No profile found, creating auto-registration record...');

        // Extract names from Google metadata
        const fullName = currentUser.user_metadata?.full_name || '';
        const firstName = currentUser.user_metadata?.given_name || fullName.split(' ')[0] || 'User';
        const lastName = currentUser.user_metadata?.family_name || fullName.split(' ').slice(1).join(' ') || '';

        const newProfile = {
          id: currentUser.id,
          email: currentUser.email,
          first_name: firstName,
          last_name: lastName,
          username: (currentUser.email?.split('@')[0] || 'user') + Math.floor(Math.random() * 1000),
          role: 'farm_admin',
          status: 'active',
          platform: Platform.OS === 'web' ? 'web' : 'mobile',
          custom_permissions: { add: [], remove: [] },
          assigned_modules: [],
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
        };

        const { data: createdData, error: createError } = await supabase
          .from('users')
          .upsert(newProfile, { onConflict: 'id' })
          .select()
          .single();

        if (createError) {
          console.error('Error creating auto-profile:', createError);
          return;
        }

        if (createdData) {
          setProfile({
            ...createdData,
            uid: createdData.id,
            firstName: createdData.first_name,
            lastName: createdData.last_name,
            customPermissions: createdData.custom_permissions || { add: [], remove: [] },
            assignedModules: createdData.assigned_modules || [],
          } as UserProfile);
          setRole(createdData.role);
        }
      }
    } catch (error) {
      console.error('Error refreshing/creating profile:', error);
    }
  };

  const signIn = async (email: string, pass: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      setIsLoading(false);
      throw error;
    }

    // Check if MFA is required
    const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) {
      console.error('Error listing MFA factors:', factorError);
    } else if (factorData.all.length > 0) {
      const verifiedFactors = factorData.all.filter(f => f.status === 'verified');
      if (verifiedFactors.length > 0) {
        // MFA is required. The session is already set but AAL is 1.
        // We will handle navigation in the LoginScreen based on this check or a returned value.
        // For now, let's keep it simple and throw a specific "error" or return a status.
        setIsLoading(false);
        return { mfaRequired: true };
      }
    }

    setIsLoading(false);
    return { mfaRequired: false };
  };

  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      const redirectTo = createURL('/');
      console.log('Redirecting to:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (Platform.OS === 'web') {
        // On web, just redirect the current window
        window.location.href = data.url;
      } else {
        // On mobile, use WebBrowser for a modal-like experience
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (res.type === 'success') {
          const { url } = res;
          const params = parse(url);

          if (params.queryParams?.access_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: params.queryParams.access_token as string,
              refresh_token: params.queryParams.refresh_token as string,
            });
            if (sessionError) throw sessionError;
          }
        }
      }
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signUp = async (data: any) => {
    setIsLoading(true);
    const { email, password, ...metadata } = data;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    if (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const resendVerificationCode = async (email: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    setIsLoading(false);
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    setIsLoading(false);
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });
      if (error) {
        if (error.message.includes('AAL2 session is required')) {
          throw new Error('Multi-factor authentication is required to change your password. Please verify your identity first.');
        }
        throw error;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const enrollMFA = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Ani-Grow',
      friendlyName: user?.email || 'Ani-Grow User',
    });
    if (error) throw error;
    if (!data) throw new Error('Failed to enroll MFA: No data returned');

    return {
      factorId: data.id,
      qrCode: data.totp.uri,
      secret: data.totp.secret,
    };
  };

  const verifyMFA = async (factorId: string, code: string, challengeId?: string) => {
    let cId = challengeId;
    if (!cId) {
      const { data, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;
      if (!data) throw new Error('Failed to create MFA challenge: No data returned');
      cId = data.id;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: cId,
      code,
    });
    if (error) throw error;
  };

  const unenrollMFA = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId,
    });
    if (error) throw error;
  };

  const getMFAFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data?.all ?? [];
  };

  const ADMIN_ROLES = useMemo(() => ['super_admin', 'farm_admin', 'admin'], []);

  const rawPermissions = useMemo<Record<string, boolean>>(
    () => (profile as any)?.permissions ?? {},
    [profile]
  );

  const resolvedPermissions = useMemo<Record<string, boolean>>(
    () => ADMIN_ROLES.includes(role ?? '')
      ? { dashboard: true, ani_weigh: true, animals_guide: true, health_records: true, analytics: true, feeding_control: true }
      : rawPermissions,
    [role, rawPermissions, ADMIN_ROLES]
  );

  const effectivePermissionsList = useMemo(
    () => Object.entries(resolvedPermissions).filter(([, v]) => v === true).map(([k]) => k),
    [resolvedPermissions]
  );

  const hasPermission = useCallback((key: string) => {
    if (!role) return false;
    if (ADMIN_ROLES.includes(role)) return true;
    return resolvedPermissions[key] === true;
  }, [role, resolvedPermissions, ADMIN_ROLES]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      permissions: resolvedPermissions,
      effectivePermissions: effectivePermissionsList,
      systemConfig: null,
      isLoading,
      refreshProfile,
      hasPermission,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      resendVerificationCode,
      resetPassword,
      updatePassword,
      enrollMFA,
      verifyMFA,
      unenrollMFA,
      getMFAFactors
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
