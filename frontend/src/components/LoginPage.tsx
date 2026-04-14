import React, { useState } from 'react';

/**
 * LoginPage — Supervisor/Manager login with email + password.
 *
 * Floor workers continue to use badge scan (no passwords).
 * This is the entry point for supervisors, managers, and admins
 * who need access to the management dashboard, admin panel, etc.
 *
 * Posts to /api/v1/auth/login and stores the JWT in localStorage.
 */

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store token and redirect
      localStorage.setItem('token', data.token);

      // Determine redirect based on role
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        if (payload.role === 'Admin') {
          window.location.href = '/admin';
        } else if (payload.role === 'Supervisor') {
          window.location.href = '/supervisor';
        } else {
          window.location.href = '/station';
        }
      } catch {
        window.location.href = '/';
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        background: '#111', border: '1px solid #1e1e1e', borderRadius: 16,
        padding: '40px 36px', width: 380, maxWidth: '90vw',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em' }}>
            Ti<span style={{ color: '#3b82f6' }}>M</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Manufacturing Execution System
          </div>
        </div>

        <div style={{
          fontSize: 16, fontWeight: 700, color: '#f1f5f9', textAlign: 'center', marginBottom: 24,
        }}>
          Supervisor / Manager Login
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: '#2d1010', border: '1px solid #7f1d1d',
            borderRadius: 10, marginBottom: 16, color: '#fca5a5', fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 6,
              fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="supervisor@trelleborg.com"
              autoComplete="email"
              style={{
                width: '100%', padding: '10px 14px', background: '#1e1e1e', color: '#f1f5f9',
                border: '1px solid #333', borderRadius: 10, fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 6,
              fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 14px', background: '#1e1e1e', color: '#f1f5f9',
                border: '1px solid #333', borderRadius: 10, fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: '#1e3a5f', color: '#60a5fa',
              border: '1px solid #3b82f6', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{
            fontSize: 11, color: '#4b5563', padding: '10px 0',
            borderTop: '1px solid #1e1e1e', marginTop: 8,
          }}>
            Floor workers: Use badge scan at <a href="/station" style={{ color: '#60a5fa', textDecoration: 'none' }}>/station</a>
          </div>
        </div>
      </div>
    </div>
  );
}
