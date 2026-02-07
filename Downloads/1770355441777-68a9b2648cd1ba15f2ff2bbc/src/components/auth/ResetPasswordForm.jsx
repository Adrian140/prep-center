import React, { useState } from "react";
import { Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function ResetPasswordForm({ onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (!error) {
      onBackToLogin();
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

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-amazon-orange hover:bg-orange-600 disabled:bg-slate-700 text-white font-light text-lg py-3 rounded-lg transition-colors"
      >
        {loading ? "Sending..." : "Send Reset Link"}
      </button>

      <p className="text-center text-lg font-extralight text-slate-400">
        Remembered your password?{" "}
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-amazon-orange hover:text-orange-600 font-light"
        >
          Back to sign in
        </button>
      </p>
    </form>
  );
}
