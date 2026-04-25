import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { UserProfile, BaseUserRole, SystemConfig } from '../types/auth';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

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
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (data: any) => Promise<void>;
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
  refreshProfile: async () => {},
  hasPermission: () => false,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  signUp: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<BaseUserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
         refreshProfile();
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    // Note: This requires a 'users' table in your Supabase database
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;
    
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
          role: 'caretaker',
          status: 'active',
          platform: Platform.OS === 'web' ? 'web' : 'mobile',
          custom_permissions: { add: [], remove: [] },
          assigned_modules: [],
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
        };

        const { data: createdData, error: createError } = await supabase
          .from('users')
          .insert(newProfile)
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      const redirectTo = Linking.createURL('/');
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
          const params = Linking.parse(url);
          
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

  return (
    <AuthContext.Provider value={{ 
        user, 
        session,
        profile, 
        role, 
        permissions: {}, 
        effectivePermissions: [], 
        systemConfig: null, 
        isLoading, 
        refreshProfile, 
        hasPermission: (key) => true,
        signIn,
        signInWithGoogle,
        signOut,
        signUp
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
