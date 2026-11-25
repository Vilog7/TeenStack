import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { StudentCharactersPanel } from './StudentCharactersPanel';
import { SPRINGS } from '../../lib/tokens';
import { api } from '../../lib/api';
import type { UserAccount, UserInteraction } from '../../types';

interface AuthViewProps {
  mode: 'login' | 'signup';
  onSwitchMode: (next: 'login' | 'signup') => void;
  onBackToLanding: () => void;
  onAuthenticated: (
    user: UserAccount,
    interactions: UserInteraction[],
    isNewSignup: boolean
  ) => void;
}

export function AuthView({
  mode,
  onSwitchMode,
  onBackToLanding,
  onAuthenticated,
}: AuthViewProps) {
  // Login state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotSheet, setShowForgotSheet] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Sign Up state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('2009-09-15');
  const [age, setAge] = useState(16);
  const [signupPassword, setSignupPassword] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);

  // UI feedback state
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDobChange = (val: string) => {
    setDob(val);
    if (val) {
      const birthYear = new Date(val).getFullYear();
      const currentYear = new Date().getFullYear();
      const computed = Math.max(13, Math.min(22, currentYear - birthYear));
      if (!Number.isNaN(computed)) setAge(computed);
    }
  };

  const fillDemoAccount = () => {
    setErrorMsg('');
    setIdentifier('arav@teenstack.edu');
    setLoginPassword('TeenStack@2026');
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await api.login({ identifier, password: loginPassword, rememberMe });
      onAuthenticated(res.user, res.interactions || [], false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to sign in. Please check your credentials.');
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await api.signup({
        fullName,
        email,
        phone,
        dob,
        age,
        password: signupPassword,
        marketingOptIn,
        acceptedTerms,
      });
      onAuthenticated(res.user, [], true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to create account.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
      {/* Top Bar — Mobile & Desktop Ergonomic */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBackToLanding}
            aria-label="Back to landing page"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-[#111426]/90 text-[#A5A9BC] hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onBackToLanding}
            className="font-heading text-base font-bold uppercase tracking-[0.2em] text-white sm:text-lg"
          >
            TEEN<span className="text-[#27D9D0]">STACK</span>
          </button>
        </div>

        {/* Morphing Segmented Switcher (Login <-> Sign Up) */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="relative inline-flex items-center rounded-2xl border border-white/12 bg-[#111426]/95 p-1"
        >
          {(['login', 'signup'] as const).map((tab) => {
            const active = mode === tab;
            return (
              <button
                key={tab}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => {
                  setErrorMsg('');
                  setShowForgotSheet(false);
                  onSwitchMode(tab);
                }}
                className={`relative z-10 min-h-[36px] rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                  active ? 'text-white' : 'text-[#A5A9BC] hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="auth-segmented-pill"
                    transition={SPRINGS.pill}
                    className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] shadow-[0_4px_16px_rgba(116,59,255,0.5)]"
                  />
                )}
                {tab === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Split Card — Compact Stacked on Mobile, Split-Swapping on Desktop */}
      <main className="my-auto py-3 sm:py-6">
        <motion.div
          layout
          layoutId="primary-auth-card"
          transition={SPRINGS.morph}
          className={`ts-surface-elevated mx-auto flex max-w-5xl flex-col gap-4 rounded-3xl p-3.5 sm:gap-6 sm:p-6 ${
            mode === 'login' ? 'lg:flex-row' : 'lg:flex-row-reverse'
          }`}
        >
          {/* Half 1: Interactive Student Characters Panel */}
          <div className="w-full lg:w-[46%]">
            <StudentCharactersPanel
              mode={mode}
              passwordFocused={passwordFocused}
              passwordVisible={showPassword}
            />
          </div>

          {/* Half 2: Morphing Form Panel */}
          <motion.div
            layout
            transition={SPRINGS.morph}
            className="flex w-full flex-col justify-center px-1 py-1 sm:px-5 sm:py-2 lg:w-[54%]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {mode === 'login' ? (
                <motion.div
                  key="login-form-pane"
                  layout="position"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={SPRINGS.morph}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#27D9D0] sm:text-[11px]">
                        Student Portal
                      </span>
                      <h1 className="mt-0.5 font-heading text-xl font-bold text-white sm:text-3xl">
                        Log in to TeenStack
                      </h1>
                      <p className="mt-0.5 text-xs text-[#A5A9BC] sm:text-sm">
                        Enter your student email or username to open your workspace.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={fillDemoAccount}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#27D9D0]/35 bg-[#27D9D0]/10 px-3 py-1.5 text-xs font-medium text-[#27D9D0] hover:bg-[#27D9D0]/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Demo Student
                    </button>
                  </div>

                  {errorMsg && (
                    <motion.div
                      layout
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <span>{errorMsg}</span>
                    </motion.div>
                  )}

                  {showForgotSheet ? (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={SPRINGS.modal}
                      className="space-y-4 rounded-2xl border border-[#258BFF]/35 bg-[#0B0E1F] p-4 sm:p-5"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <KeyRound className="h-4 w-4 text-[#258BFF]" />
                        <span>Reset your student password</span>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="reset-email" className="block text-xs font-medium text-white">
                          Student Email
                        </label>
                        <input
                          id="reset-email"
                          type="email"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="you@school.edu"
                          className="ts-input w-full rounded-xl border border-white/14 bg-[#111426] px-3.5 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/50 sm:text-sm"
                        />
                      </div>
                      {resetEmailSent && (
                        <div className="flex items-center gap-2 text-xs text-[#27D9D0]">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Recovery instructions queued for {identifier || 'your inbox'}.</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setResetEmailSent(true)}
                          className="min-h-[42px] rounded-xl bg-[#258BFF] px-4 py-2 text-xs font-semibold text-white"
                        >
                          Send Recovery Link
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotSheet(false);
                            setResetEmailSent(false);
                          }}
                          className="min-h-[42px] rounded-xl border border-white/12 px-3.5 py-2 text-xs text-[#A5A9BC] hover:text-white"
                        >
                          Back to Log In
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleLoginSubmit} className="space-y-3.5 sm:space-y-4">
                      <div>
                        <label htmlFor="login-identifier" className="mb-1.5 block text-xs font-medium text-white">
                          Username or Email
                        </label>
                        <input
                          id="login-identifier"
                          name="username"
                          type="text"
                          required
                          spellCheck={false}
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="username"
                          enterKeyHint="next"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="arav@teenstack.edu or arav_dev"
                          className="ts-input min-h-[46px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-4 py-2.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                        />
                        <div className="ts-field-error mt-1.5 items-center gap-1.5 text-xs text-rose-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Please enter your username or email address.</span>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label htmlFor="login-password" className="text-xs font-medium text-white">
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowForgotSheet(true)}
                            className="text-xs font-medium text-[#258BFF] hover:text-[#27D9D0]"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            id="login-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            enterKeyHint="done"
                            value={loginPassword}
                            onFocus={() => setPasswordFocused(true)}
                            onBlur={() => setPasswordFocused(false)}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="ts-input min-h-[46px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] py-2.5 pr-12 pl-4 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#A5A9BC] hover:text-white"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#A5A9BC]">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-[#0B0E1D] accent-[#743BFF]"
                          />
                          <span>Remember me for 30 days</span>
                        </label>
                      </div>

                      <motion.button
                        layout
                        type="submit"
                        disabled={submitting}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        transition={SPRINGS.morph}
                        className="mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.75)] disabled:opacity-70"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 ts-spin" />
                            <span>Opening Workspace…</span>
                          </>
                        ) : (
                          <>
                            <span>Log In</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </motion.button>
                    </form>
                  )}

                  <p className="pt-0.5 text-center text-xs text-[#A5A9BC]">
                    New to TeenStack?{' '}
                    <button
                      type="button"
                      onClick={() => onSwitchMode('signup')}
                      className="font-semibold text-[#27D9D0] hover:underline"
                    >
                      Morph to Sign Up →
                    </button>
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="signup-form-pane"
                  layout="position"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={SPRINGS.morph}
                  className="space-y-3.5"
                >
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#743BFF] sm:text-[11px]">
                      New Student Registration
                    </span>
                    <h1 className="mt-0.5 font-heading text-xl font-bold text-white sm:text-3xl">
                      Create your TeenStack ID
                    </h1>
                  </div>

                  {errorMsg && (
                    <motion.div
                      layout
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <span>{errorMsg}</span>
                    </motion.div>
                  )}

                  <form onSubmit={handleSignupSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="signup-name" className="mb-1 block text-xs font-medium text-white">
                        Full Name
                      </label>
                      <input
                        id="signup-name"
                        name="name"
                        type="text"
                        required
                        autoComplete="name"
                        enterKeyHint="next"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Jordan Rivera"
                        className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="signup-email" className="mb-1 block text-xs font-medium text-white">
                          Email Address
                        </label>
                        <input
                          id="signup-email"
                          name="email"
                          type="email"
                          required
                          spellCheck={false}
                          autoComplete="email"
                          enterKeyHint="next"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="jordan@school.edu"
                          className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="signup-phone" className="mb-1 block text-xs font-medium text-white">
                          Phone <span className="text-[#A5A9BC]">(Private)</span>
                        </label>
                        <input
                          id="signup-phone"
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          enterKeyHint="next"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+1 (555) 234-5678"
                          className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                        />
                      </div>
                    </div>

                    {/* Side-by-side DOB + Age even on mobile so form stays compact */}
                    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                      <div className="col-span-2">
                        <label htmlFor="signup-dob" className="mb-1 block text-xs font-medium text-white">
                          Date of Birth
                        </label>
                        <input
                          id="signup-dob"
                          name="bday"
                          type="date"
                          autoComplete="bday"
                          value={dob}
                          onChange={(e) => handleDobChange(e.target.value)}
                          className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2 text-base text-white focus:border-[#743BFF] sm:text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="signup-age" className="mb-1 block text-xs font-medium text-white">
                          Age
                        </label>
                        <input
                          id="signup-age"
                          name="age"
                          type="number"
                          min={13}
                          max={22}
                          required
                          inputMode="numeric"
                          value={age}
                          onChange={(e) => setAge(Number(e.target.value))}
                          className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3 py-2 text-base text-white focus:border-[#743BFF] sm:text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="signup-password" className="block text-xs font-medium text-white">
                        Password
                      </label>
                      <span id="signup-password-hint" className="mb-1 block text-[11px] text-[#A5A9BC]">
                        Minimum 8 characters · Paste supported
                      </span>
                      <div className="relative">
                        <input
                          id="signup-password"
                          name="new-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          enterKeyHint="done"
                          aria-describedby="signup-password-hint"
                          value={signupPassword}
                          onFocus={() => setPasswordFocused(true)}
                          onBlur={() => setPasswordFocused(false)}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Create a strong password"
                          className="ts-input min-h-[44px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] py-2 pr-12 pl-3.5 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#743BFF] sm:text-sm"
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#A5A9BC] hover:text-white"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-0.5">
                      <label className="flex cursor-pointer items-start gap-2.5 text-xs text-[#A5A9BC]">
                        <input
                          type="checkbox"
                          checked={marketingOptIn}
                          onChange={(e) => setMarketingOptIn(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-[#0B0E1D] accent-[#258BFF]"
                        />
                        <span>Send me verified hackathon grants & scholarship alerts (optional)</span>
                      </label>

                      <label className="flex cursor-pointer items-start gap-2.5 text-xs text-white/90">
                        <input
                          type="checkbox"
                          required
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-[#0B0E1D] accent-[#743BFF]"
                        />
                        <span>
                          I accept the TeenStack Terms, Privacy Policy & Teen Safety Guidelines.
                        </span>
                      </label>
                    </div>

                    <motion.button
                      layout
                      type="submit"
                      disabled={submitting}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SPRINGS.morph}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] via-[#4D63FF] to-[#258BFF] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.75)] disabled:opacity-70"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 ts-spin" />
                          <span>Creating Account…</span>
                        </>
                      ) : (
                        <>
                          <span>Create Account</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>
                  </form>

                  <p className="text-center text-xs text-[#A5A9BC]">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => onSwitchMode('login')}
                      className="font-semibold text-[#27D9D0] hover:underline"
                    >
                      ← Morph to Log In
                    </button>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </main>

      <div className="text-center text-[10px] text-[#A5A9BC]/70 sm:text-[11px]">
        Salted Scrypt security · Teen Privacy Shield active
      </div>
    </div>
  );
}
