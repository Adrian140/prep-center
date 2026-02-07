import React, { useState } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function UpdatePasswordForm({ onBackToLogin }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (!error) {
      onBackToLogin();
    }
  };

  const passwordsMatch = password === confirmPassword;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-lg font-extralight text-slate-300 mb-2">New Password</label>
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

      <div>
        <label className="block text-lg font-extralight text-slate-300 mb-2">Confirm New Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-dashboard-bg border border-dashboard-border rounded-lg pl-12 pr-4 py-3 text-lg font-extralight text-white focus:outline-none focus:border-amazon-orange"
            placeholder="••••••••"
          />
        </div>
      </div>

      {!passwordsMatch && confirmPassword.length > 0 && (
        <div className="text-sm text-red-400">Passwords do not match.</div>
      )}

      <button
        type="submit"
        disabled={loading || !passwordsMatch}
        className="w-full bg-amazon-orange hover:bg-orange-600 disabled:bg-slate-700 text-white font-light text-lg py-3 rounded-lg transition-colors"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>

      <p className="text-center text-lg font-extralight text-slate-400">
        Back to{" "}
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-amazon-orange hover:text-orange-600 font-light"
        >
          sign in
        </button>
      </p>
    </form>
  );
}
