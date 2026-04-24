import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, BaseUserRole, SystemConfig } from '../types/auth';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

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
    // Note: This requires a 'profiles' table in your Supabase database
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'no rows'
      if (data) {
        setProfile({
          ...data,
          firstName: data.first_name,
          lastName: data.last_name,
        } as UserProfile);
        setRole(data.role);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
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
        signOut,
        signUp
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
