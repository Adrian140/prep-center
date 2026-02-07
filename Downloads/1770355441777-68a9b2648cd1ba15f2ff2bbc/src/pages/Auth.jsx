import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LoginForm from "../components/auth/LoginForm";
import SignupForm from "../components/auth/SignupForm";
import ResetPasswordForm from "../components/auth/ResetPasswordForm";
import UpdatePasswordForm from "../components/auth/UpdatePasswordForm";

export default function Auth() {
  const [mode, setMode] = useState(() => {
    const hash = window.location.hash || "";
    return hash.includes("type=recovery") ? "update" : "login";
  });
  const { user, loading } = useAuth();

  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-dashboard-bg flex items-center justify-center">
        <div className="text-white text-xl font-extralight">Loading...</div>
      </div>
    );
  }

  if (user && mode !== "update") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-dashboard-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-gradient-to-br from-amazon-orange to-orange-600 mb-4">
            <span className="text-3xl font-bold text-white">A</span>
          </div>
          <h1 className="text-3xl font-light text-white mb-2">Amazon Seller Analytics</h1>
          <p className="text-lg font-extralight text-slate-400">
            {mode === "login" && "Welcome back!"}
            {mode === "signup" && "Create your account"}
            {mode === "reset" && "Reset your password"}
            {mode === "update" && "Set a new password"}
          </p>
        </div>

        <div className="bg-dashboard-card border border-dashboard-border rounded-lg p-8">
          {mode === "login" && (
            <LoginForm
              onToggleMode={() => setMode("signup")}
              onForgotPassword={() => setMode("reset")}
            />
          )}
          {mode === "signup" && <SignupForm onToggleMode={() => setMode("login")} />}
          {mode === "reset" && <ResetPasswordForm onBackToLogin={() => setMode("login")} />}
          {mode === "update" && <UpdatePasswordForm onBackToLogin={() => setMode("login")} />}
        </div>
      </div>
    </div>
  );
}
