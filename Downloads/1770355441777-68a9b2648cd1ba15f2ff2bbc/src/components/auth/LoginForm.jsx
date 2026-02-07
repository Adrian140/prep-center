import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LogIn, Mail, Lock } from "lucide-react";

export default function LoginForm({ onToggleMode, onForgotPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (!error) {
      navigate("/");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-lg font-extralight text-slate-300 mb-2">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-dashboard-bg border border-dashboard-border rounded-lg pl-12 pr-4 py-3 text-lg font-extralight text-white focus:outline-none focus:border-amazon-orange"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-lg font-extralight text-slate-300 mb-2">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-dashboard-bg border border-dashboard-border rounded-lg pl-12 pr-4 py-3 text-lg font-extralight text-white focus:outline-none focus:border-amazon-orange"
            placeholder="••••••••"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-amazon-orange hover:bg-orange-600 disabled:bg-slate-700 text-white font-light text-lg py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="font-extralight">Signing in...</span>
        ) : (
          <>
            <LogIn className="w-5 h-5" />
            <span className="font-extralight">Sign In</span>
          </>
        )}
      </button>

      <p className="text-center text-lg font-extralight text-slate-400">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={onToggleMode}
          className="text-amazon-orange hover:text-orange-600 font-light"
        >
          Sign up
        </button>
      </p>

      <p className="text-center text-lg font-extralight text-slate-400">
        Forgot your password?{" "}
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-amazon-orange hover:text-orange-600 font-light"
        >
          Reset it
        </button>
      </p>
    </form>
  );
}
