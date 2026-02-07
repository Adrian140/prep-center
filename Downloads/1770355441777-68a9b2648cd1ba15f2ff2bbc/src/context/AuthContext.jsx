import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserSubscription(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserSubscription(session.user.id);
      } else {
        setSubscription(null);
      }
      setLoading(false);
    });

    return () => authListener?.unsubscribe();
  }, []);

  const loadUserSubscription = async (userId) => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (!error && data) {
      setSubscription(data);
    } else {
      setSubscription({ tier: "free" });
    }
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast.error(error.message);
      return { error };
    }
    toast.success("Account created successfully! Please check your email.");
    return { data };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      return { error };
    }
    toast.success("Welcome back!");
    return { data };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return { error };
    }
    toast.success("Signed out successfully");
    return {};
  };

  const resetPassword = async (email) => {
    const redirectTo = `${window.location.origin}/auth`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      toast.error(error.message);
      return { error };
    }
    toast.success("Password reset email sent. Check your inbox.");
    return { data };
  };

  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
      return { error };
    }
    toast.success("Password updated successfully.");
    return { data };
  };

  const value = {
    user,
    loading,
    subscription,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
