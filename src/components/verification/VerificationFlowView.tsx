import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Lock,
  ExternalLink,
  LogOut,
  ArrowRight,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import { SPRINGS } from '../../lib/tokens';
import { api } from '../../lib/api';
import type { UserAccount } from '../../types';

/**
 * Validates external Signzy / DigiLocker gateway redirect URLs using the Origin API
 * with a `new URL()` tuple fallback (modern-web-guidance: validate-origins).
 */
function isTrustedSignzyOrDigiLockerGateway(candidateUrl: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    if (parsed.protocol !== 'https:' || parsed.origin === 'null') return false;
    if ('Origin' in globalThis) {
      const candidateOrigin = (globalThis as any).Origin.from(candidateUrl);
      if (candidateOrigin.opaque) return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'digilocker.gov.in' ||
      host.endsWith('.digilocker.gov.in') ||
      host === 'signzy.app' ||
      host.endsWith('.signzy.app') ||
      host === 'signzy.tech' ||
      host.endsWith('.signzy.tech')
    );
  } catch {
    return false;
  }
}

interface VerificationFlowViewProps {
  user: UserAccount;
  onUpdateUser: (nextUser: UserAccount) => void;
  onProceedAfterApproval: () => void;
  onOpenParentPortalWithToken: (inviteToken: string) => void;
  onLogout: () => void;
}

export function VerificationFlowView({
  user,
  onUpdateUser,
  onProceedAfterApproval,
  onOpenParentPortalWithToken,
  onLogout,
}: VerificationFlowViewProps) {
  const [viewTab, setViewTab] = useState<'pending_overview' | 'age_interface'>('pending_overview');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  // Parent invitation inputs (only used when VERIFIED_13_17)
  const [parentEmail, setParentEmail] = useState('');
  const [parentMobile, setParentMobile] = useState('');
  const [sandboxInviteToken, setSandboxInviteToken] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const overview = user.verificationOverview;
  const accountStatus = user.accountStatus || overview?.accountStatus || 'PENDING_VERIFICATION';
  const verifiedAgeBand = user.verifiedAgeBand || overview?.verifiedAgeBand || 'UNVERIFIED';
  const isSandboxMode = (overview?.environmentMode || 'sandbox_mock') === 'sandbox_mock';
  const ageSessionPending = overview?.ageVerification?.status === 'PENDING';
  const hostedUrl = overview?.ageVerification?.hostedUrl || '';

  const refreshVerificationState = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.getVerificationStatus();
      onUpdateUser(res.user);
      setStatusBanner('Verification status synchronized.');
      setTimeout(() => setStatusBanner(''), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not refresh verification status.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshVerificationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartAgeVerification = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const idempotencyKey = `init_${user.id}_${Date.now()}`;
      const res = await api.initiateAgeVerification(idempotencyKey);
      const fresh = await api.getVerificationStatus();
      onUpdateUser(fresh.user);
      setViewTab('age_interface');

      if (res.hostedUrl && isTrustedSignzyOrDigiLockerGateway(res.hostedUrl)) {
        window.open(res.hostedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to start Signzy age verification.');
    } finally {
      setBusy(false);
    }
  };

  const handleSandboxSimulate = async (
    scenario:
      | 'VERIFIED_13_17'
      | 'VERIFIED_18_PLUS'
      | 'UNDER_13'
      | 'TAMPERED_DOC'
      | 'NAME_MISMATCH'
      | 'MANUAL_REVIEW'
  ) => {
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.simulateSandboxAgeVerification(scenario);
      onUpdateUser(res.user);
      setViewTab('pending_overview');
    } catch (err: any) {
      setErrorMsg(err.message || 'Simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendParentInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.inviteParentVerification({
        parentEmail: parentEmail.trim(),
        parentMobile: parentMobile.trim(),
      });
      onUpdateUser(res.user);
      if (res.sandboxPortalInviteToken) {
        setSandboxInviteToken(res.sandboxPortalInviteToken);
      }
      setStatusBanner('Single-use 30-minute parent verification invite generated.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send parent verification invite.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePendingAccount = async () => {
    setBusy(true);
    try {
      await api.requestAccountDeletion();
      onLogout();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not schedule deletion.');
      setBusy(false);
    }
  };

  // Step progress state
  const currentStepIndex =
    accountStatus === 'ACTIVE'
      ? 3
      : verifiedAgeBand === 'VERIFIED_13_17'
      ? 2
      : 1;

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-4xl flex-col justify-between px-4 py-6 sm:px-8 sm:py-10">
      {/* Top Minimalist Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#743BFF]/40 bg-[#743BFF]/15 text-[#27D9D0]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-heading text-sm font-bold uppercase tracking-[0.2em] text-white">
              TEEN<span className="text-[#27D9D0]">STACK</span> TRUST GATE
            </div>
            <div className="text-[11px] text-[#A5A9BC]">
              Account @{user.username} · Status: <span className="font-semibold text-white">{accountStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={refreshVerificationState}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#111426] px-3 py-1.5 text-xs font-medium text-[#A5A9BC] hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'ts-spin' : ''}`} />
            <span>Sync Status</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#080910] px-3 py-1.5 text-xs font-medium text-[#A5A9BC] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Accessible Multi-Step Progress Tracker */}
      <nav aria-label="Account verification progress" className="mt-6">
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { idx: 1, title: '1. Registration', sub: 'Temporary record created' },
            { idx: 2, title: '2. Signzy Age Check', sub: 'Govt ID / DigiLocker' },
            { idx: 3, title: '3. Consent & Activation', sub: 'Parent portal (if 13–17)' },
          ].map((step) => {
            const done = currentStepIndex > step.idx || accountStatus === 'ACTIVE';
            const current = currentStepIndex === step.idx && accountStatus !== 'ACTIVE';
            return (
              <li
                key={step.idx}
                aria-current={current ? 'step' : undefined}
                className={`rounded-2xl border p-3.5 transition-colors ${
                  done
                    ? 'border-[#27D9D0]/45 bg-[#27D9D0]/10'
                    : current
                    ? 'border-[#743BFF] bg-[#111426]'
                    : 'border-white/10 bg-[#080910]/70 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold text-white sm:text-sm">
                    {step.title}
                  </span>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-[#27D9D0]" />
                  ) : current ? (
                    <Clock className="h-4 w-4 text-[#743BFF]" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-[#A5A9BC]" />
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-[#A5A9BC]">{step.sub}</div>
              </li>
            );
          })}
        </ol>
      </nav>

      {errorMsg && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/12 p-3.5 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      )}

      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-2xl border border-[#27D9D0]/35 bg-[#27D9D0]/10 p-3 text-xs text-[#27D9D0]"
        >
          {statusBanner}
        </div>
      )}

      {/* MAIN DYNAMIC SCREEN BODY */}
      <main className="my-auto py-6">
        <AnimatePresence mode="wait">
          {/* =====================================================================
              SCREEN 6: REGISTRATION APPROVED SCREEN
             ===================================================================== */}
          {accountStatus === 'ACTIVE' ? (
            <motion.section
              key="screen-approved"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRINGS.morph}
              className="ts-surface-elevated space-y-5 rounded-3xl p-6 text-center sm:p-9"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-[#27D9D0]/45 bg-[#27D9D0]/15 text-[#27D9D0] shadow-[0_0_32px_rgba(39,217,208,0.28)]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#27D9D0]">
                  Registration Approved
                </span>
                <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
                  Your TeenStack Account Is Active
                </h1>
                <p className="mx-auto mt-2 max-w-lg text-sm text-[#A5A9BC]">
                  {verifiedAgeBand === 'VERIFIED_18_PLUS'
                    ? 'Independent adult (18+) age verification succeeded. No parental consent is required.'
                    : 'Student age verification (13–17), parent adult verification, and explicit informed parental consent have all been verified and recorded.'}
                </p>
              </div>

              {overview?.parentalConsent && (
                <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#080910]/80 p-3.5 text-left text-xs text-[#A5A9BC]">
                  <div className="flex justify-between">
                    <span>Verified Age Band:</span>
                    <strong className="text-white">{verifiedAgeBand}</strong>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>Consent Transaction ID:</span>
                    <code className="text-[#27D9D0]">
                      {overview.parentalConsent.consentTransactionId}
                    </code>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onProceedAfterApproval}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.8)]"
                >
                  <span>Continue to TeenStack Setup</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.section>
          ) : /* =====================================================================
                 SCREEN 7: REGISTRATION REJECTED / CONSENT WITHDRAWN SCREEN
                ===================================================================== */
          accountStatus === 'REJECTED_UNDER_13' ||
            accountStatus === 'PARENT_REJECTED' ||
            accountStatus === 'CONSENT_WITHDRAWN_RESTRICTED' ? (
            <motion.section
              key="screen-rejected"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRINGS.morph}
              className="ts-surface-elevated space-y-5 rounded-3xl border-rose-500/35 p-6 text-center sm:p-9"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
                <XCircle className="h-8 w-8" />
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                  {accountStatus === 'CONSENT_WITHDRAWN_RESTRICTED'
                    ? 'Parental Consent Withdrawn'
                    : 'Registration Not Permitted'}
                </span>
                <h1 className="mt-1 font-heading text-2xl font-bold text-white sm:text-3xl">
                  {accountStatus === 'REJECTED_UNDER_13'
                    ? 'Minimum Age Requirement Not Met (Under 13)'
                    : accountStatus === 'PARENT_REJECTED'
                    ? 'Registration Declined by Parent / Guardian'
                    : 'Account Processing Restricted'}
                </h1>
                <p className="mx-auto mt-2 max-w-lg text-sm text-[#A5A9BC]">
                  {accountStatus === 'REJECTED_UNDER_13'
                    ? 'TeenStack requires verified members to be at least 13 years old. Your account remains inactive and your registration record has been queued for scheduled data deletion.'
                    : accountStatus === 'PARENT_REJECTED'
                    ? 'Your parent or legal guardian chose REJECT REGISTRATION on the TeenStack Parent Consent Portal. Social, messaging, and learning features remain disabled and data deletion has been scheduled.'
                    : 'Your parent or legal guardian withdrew consent under Section 6(4) of the DPDP Act. All account features have been disabled and personal data retention/deletion rules are active.'}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onLogout}
                  className="min-h-[46px] rounded-xl border border-white/15 bg-[#111426] px-5 py-2.5 text-xs font-semibold text-white hover:border-white/30"
                >
                  Return to Home Page
                </button>
              </div>
            </motion.section>
          ) : /* =====================================================================
                 SCREEN 8: VERIFICATION FAILED / MANUAL REVIEW / RETRY SCREEN
                ===================================================================== */
          accountStatus === 'VERIFICATION_FAILED' || accountStatus === 'MANUAL_REVIEW' ? (
            <motion.section
              key="screen-failed-retry"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRINGS.morph}
              className="ts-surface-elevated space-y-5 rounded-3xl p-6 sm:p-8"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                    {accountStatus === 'MANUAL_REVIEW'
                      ? 'Manual Trust Review Required'
                      : 'Age Verification Unsuccessful'}
                  </span>
                  <h1 className="mt-0.5 font-heading text-xl font-bold text-white sm:text-2xl">
                    {accountStatus === 'MANUAL_REVIEW'
                      ? 'Your verification requires compliance review'
                      : 'We could not verify your identity document'}
                  </h1>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#A5A9BC] sm:text-sm">
                    {accountStatus === 'MANUAL_REVIEW'
                      ? 'The name or document confidence returned from verification did not match your registration details closely enough for automatic activation. Your account remains locked until verified.'
                      : 'Verification failed due to an unreadable document, tampering check, or an expired session. TeenStack never bypasses verification automatically—please start a fresh verification session.'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4 text-xs text-[#A5A9BC]">
                <strong className="text-white">Troubleshooting checklist:</strong>
                <ul className="mt-1.5 list-inside list-disc space-y-1">
                  <li>Ensure your registered Full Name matches your DigiLocker / Government ID name.</li>
                  <li>Complete the DigiLocker session within 15 minutes of starting.</li>
                  <li>Use only authentic, unaltered official digital credentials.</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleStartAgeVerification}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-6 py-3 text-sm font-semibold text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Age Verification</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDeletePendingAccount}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-500/30 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Cancel & Delete Registration</span>
                </button>
              </div>
            </motion.section>
          ) : /* =====================================================================
                 SCREEN 3: SIGNZY AGE VERIFICATION INTERFACE
                ===================================================================== */
          viewTab === 'age_interface' || ageSessionPending ? (
            <motion.section
              key="screen-age-interface"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRINGS.morph}
              className="ts-surface-elevated space-y-5 rounded-3xl p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#27D9D0]">
                    Signzy Identity & Age Verification
                  </span>
                  <h1 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
                    Verify your age via DigiLocker / Govt ID
                  </h1>
                  <p className="mt-1 text-xs text-[#A5A9BC] sm:text-sm">
                    TeenStack uses Signzy&apos;s consent-based India Stack verification to confirm your age band without storing Aadhaar numbers, biometrics, or document scans.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setViewTab('pending_overview')}
                  className="rounded-xl border border-white/12 px-3 py-1.5 text-xs text-[#A5A9BC] hover:text-white"
                >
                  ← Overview
                </button>
              </div>

              {/* Privacy & Data Minimization Guarantees */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#080910]/75 p-3.5">
                  <div className="text-xs font-bold text-white">Zero Aadhaar Storage</div>
                  <p className="mt-1 text-[11px] text-[#A5A9BC]">
                    Aadhaar numbers and document files are never persisted in TeenStack databases.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#080910]/75 p-3.5">
                  <div className="text-xs font-bold text-white">Zero Biometrics</div>
                  <p className="mt-1 text-[11px] text-[#A5A9BC]">
                    No biometric templates or facial vectors are retained on TeenStack servers.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#080910]/75 p-3.5">
                  <div className="text-xs font-bold text-white">Age-Band Result Only</div>
                  <p className="mt-1 text-[11px] text-[#A5A9BC]">
                    Only your verified age band (<code className="text-[#27D9D0]">13–17</code> or{' '}
                    <code className="text-[#27D9D0]">18+</code>) is recorded.
                  </p>
                </div>
              </div>

              {/* Live Hosted Gateway Action */}
              {hostedUrl && isTrustedSignzyOrDigiLockerGateway(hostedUrl) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#258BFF]/40 bg-[#258BFF]/10 p-4">
                  <div className="text-xs text-white">
                    <strong>Signzy DigiLocker Gateway Ready:</strong> Complete consent on DigiLocker, then click Sync Status.
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#258BFF] px-4 py-2 text-xs font-semibold text-white"
                    >
                      <span>Open DigiLocker</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await api.pollAgeVerification();
                          onUpdateUser(r.user);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="min-h-[42px] rounded-xl border border-white/15 bg-[#111426] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Check Result
                    </button>
                  </div>
                </div>
              )}

              {/* Explicitly Labelled Sandbox Simulator (Non-Production Only) */}
              {isSandboxMode && (
                <div className="space-y-3 rounded-2xl border border-[#743BFF]/40 bg-[#080910]/90 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#27D9D0]">
                      Signzy Verification Outcome Controls
                    </span>
                  </div>
                  <p className="text-xs text-[#A5A9BC]">
                    Simulate Signzy&apos;s callback payload to test every age-band, tamper-detection, and activation path:
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('VERIFIED_13_17')}
                      className="min-h-[44px] rounded-xl border border-[#743BFF]/50 bg-[#743BFF]/20 px-3 py-2 text-xs font-semibold text-white hover:bg-[#743BFF]/35"
                    >
                      Simulate Verified 13–17 (Requires Parent)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('VERIFIED_18_PLUS')}
                      className="min-h-[44px] rounded-xl border border-[#27D9D0]/45 bg-[#27D9D0]/15 px-3 py-2 text-xs font-semibold text-[#27D9D0] hover:bg-[#27D9D0]/25"
                    >
                      Simulate Verified 18+ (Direct Activation)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('UNDER_13')}
                      className="min-h-[44px] rounded-xl border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                    >
                      Simulate Under 13 (Block Registration)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('TAMPERED_DOC')}
                      className="min-h-[44px] rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                    >
                      Simulate Tampered ID (Fail)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('NAME_MISMATCH')}
                      className="min-h-[44px] rounded-xl border border-white/15 bg-[#111426] px-3 py-2 text-xs font-semibold text-[#A5A9BC] hover:text-white"
                    >
                      Simulate Sibling ID Mismatch (Manual Review)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSandboxSimulate('MANUAL_REVIEW')}
                      className="min-h-[44px] rounded-xl border border-white/15 bg-[#111426] px-3 py-2 text-xs font-semibold text-[#A5A9BC] hover:text-white"
                    >
                      Simulate Low OCR Confidence
                    </button>
                  </div>
                </div>
              )}
            </motion.section>
          ) : (
            /* =====================================================================
               SCREEN 2: VERIFICATION PENDING SCREEN (+ PARENT INVITE FOR 13–17)
              ===================================================================== */
            <motion.section
              key="screen-pending"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRINGS.morph}
              className="ts-surface-elevated space-y-6 rounded-3xl p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#258BFF]">
                    <Lock className="h-3.5 w-3.5" />
                    Verification Pending · Account Features Locked
                  </span>
                  <h1 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
                    {verifiedAgeBand === 'VERIFIED_13_17'
                      ? 'Age Verified (13–17) — Parental Consent Required'
                      : 'Complete Signzy Age Verification to Activate'}
                  </h1>
                  <p className="mt-1 text-xs text-[#A5A9BC] sm:text-sm">
                    Posting, messaging, courses, and profile discovery are disabled on the server until all required verification checks pass.
                  </p>
                </div>
              </div>

              {verifiedAgeBand !== 'VERIFIED_13_17' ? (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#743BFF]/35 bg-[#080910]/80 p-4 sm:p-5">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-white">
                      Step 2: Verify your age with Signzy
                    </div>
                    <p className="max-w-lg text-xs text-[#A5A9BC]">
                      Your declared date of birth ({user.declaredDob || user.dob || 'recorded'}) is unverified. Launch Signzy&apos;s verification flow to confirm whether you are 13–17 or 18+.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleStartAgeVerification}
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-3 text-xs font-semibold text-white shadow-[0_10px_24px_-6px_rgba(116,59,255,0.75)] sm:text-sm"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Start Age Verification</span>
                  </button>
                </div>
              ) : (
                /* Student is VERIFIED_13_17 -> Must invite separate Parent / Legal Guardian */
                <div className="space-y-4 rounded-2xl border border-[#258BFF]/35 bg-[#080910]/85 p-4 sm:p-5">
                  <div>
                    <div className="text-sm font-bold text-white">
                      Step 3: Send Separate Parent / Legal Guardian Verification Link
                    </div>
                    <p className="mt-1 text-xs text-[#A5A9BC]">
                      Under India&apos;s DPDP Act &amp; TeenStack policy, a parent or legal guardian must independently verify their adult identity, establish parental authority, and explicitly approve your registration.{' '}
                      <strong className="text-white">
                        You cannot enter your own mobile number or email address.
                      </strong>
                    </p>
                  </div>

                  {overview?.parentVerification && (
                    <div className="rounded-xl border border-white/10 bg-[#111426] p-3 text-xs text-[#A5A9BC]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Parent Invite ({overview.parentVerification.maskedParentMobile}):
                        </span>
                        <span className="font-semibold text-[#27D9D0]">
                          {overview.parentVerification.inviteConsumed
                            ? `Session Active · Adult Check: ${overview.parentVerification.adultVerificationStatus}`
                            : overview.parentVerification.inviteExpired
                            ? 'Link Expired — Send Fresh Link Below'
                            : 'Sent · Waiting for Parent'}
                        </span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSendParentInvite} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="parent-invite-email" className="mb-1 block text-xs font-medium text-white">
                        Parent / Guardian Email <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="parent-invite-email"
                        name="parent_email"
                        type="email"
                        required
                        spellCheck={false}
                        autoCapitalize="none"
                        autoCorrect="off"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="parent.guardian@example.com"
                        className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#258BFF] sm:text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="parent-invite-mobile" className="mb-1 block text-xs font-medium text-white">
                        Parent / Guardian Mobile <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="parent-invite-mobile"
                        name="parent_mobile"
                        type="tel"
                        required
                        value={parentMobile}
                        onChange={(e) => setParentMobile(e.target.value)}
                        placeholder="+91 98111 22334"
                        className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#0B0E1D] px-3.5 py-2 text-base text-white placeholder:text-[#A5A9BC]/45 focus:border-[#258BFF] sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-2.5 text-xs font-semibold text-white sm:text-sm"
                      >
                        <Send className="h-4 w-4" />
                        <span>Send Single-Use Parent Verification Link (30m TTL)</span>
                      </button>
                    </div>
                  </form>

                  {/* Direct Parent Portal link */}
                  {sandboxInviteToken && isSandboxMode && (
                    <div className="space-y-2 rounded-2xl border border-[#27D9D0]/40 bg-[#27D9D0]/10 p-3.5 text-xs">
                      <div className="font-bold text-[#27D9D0]">
                        Single-Use Parent Portal Invite Ready
                      </div>
                      <p className="text-white/85">
                        Open or copy the single-use verification link below for your parent or legal guardian:
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenParentPortalWithToken(sandboxInviteToken)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#27D9D0] px-4 py-2 text-xs font-bold text-[#080910]"
                        >
                          <span>Open Parent Verification Portal</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}#/parent-portal?invite=${sandboxInviteToken}`;
                            navigator.clipboard?.writeText(url).catch(() => {});
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 1800);
                          }}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/20 bg-[#080910] px-3.5 py-2 text-xs font-semibold text-white"
                        >
                          {copiedLink ? <Check className="h-3.5 w-3.5 text-[#27D9D0]" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedLink ? 'Copied Link' : 'Copy Invite URL'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Privacy Deletion Control */}
              <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#A5A9BC]">
                <span>Want to cancel registration and purge your data?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDeletePendingAccount}
                  className="inline-flex items-center gap-1 font-medium text-rose-300 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Pending Account</span>
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="text-center text-[11px] text-[#A5A9BC]/70">
        TeenStack Child Safety &amp; DPDP Act 2023 Verification Architecture · Internal provider identifiers hidden
      </footer>
    </div>
  );
}
