import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileCheck2,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { SPRINGS } from '../../lib/tokens';
import { api } from '../../lib/api';
import type { ParentPortalState } from '../../types';

interface ParentPortalViewProps {
  initialInviteToken?: string;
  onExitPortal: () => void;
}

export function ParentPortalView({
  initialInviteToken = '',
  onExitPortal,
}: ParentPortalViewProps) {
  const [parentSessionToken, setParentSessionToken] = useState<string>(() =>
    api.getStoredParentSessionToken()
  );
  const [inviteInput, setInviteInput] = useState(initialInviteToken);
  const [portalState, setPortalState] = useState<ParentPortalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Screen 4: Parent Independent Registration Form
  const [parentName, setParentName] = useState('');
  const [parentMobile, setParentMobile] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [relationshipType, setRelationshipType] = useState<
    'MOTHER' | 'FATHER' | 'COURT_APPOINTED_GUARDIAN'
  >('MOTHER');
  const [sandboxAuthorityChecked, setSandboxAuthorityChecked] = useState(true);

  // Screen 5: Explicit Informed Consent Acknowledgements + Withdrawal
  const [ackPurpose, setAckPurpose] = useState(false);
  const [ackPrivacySafety, setAckPrivacySafety] = useState(false);
  const [ackRetentionWithdrawal, setAckRetentionWithdrawal] = useState(false);
  const [issuedWithdrawalToken, setIssuedWithdrawalToken] = useState('');
  const [manualWithdrawalToken, setManualWithdrawalToken] = useState('');

  const loadPortalState = async (sessionTok: string) => {
    if (!sessionTok) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const state = await api.getParentPortalState(sessionTok);
      setPortalState(state);
      if (state.parentVerification.parentName) {
        setParentName(state.parentVerification.parentName);
      }
      if (state.parentVerification.parentEmail) {
        setParentEmail(state.parentVerification.parentEmail);
      }
      if (state.parentVerification.parentMobile) {
        setParentMobile(state.parentVerification.parentMobile);
      }
      if (
        state.parentVerification.relationshipType === 'MOTHER' ||
        state.parentVerification.relationshipType === 'FATHER' ||
        state.parentVerification.relationshipType === 'COURT_APPOINTED_GUARDIAN'
      ) {
        setRelationshipType(state.parentVerification.relationshipType);
      }
    } catch (err: any) {
      setPortalState(null);
      api.setStoredParentSessionToken('');
      setParentSessionToken('');
      setErrorMsg(err.message || 'Parent session expired or invalid.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (initialInviteToken) {
        setBusy(true);
        setErrorMsg('');
        try {
          const exchanged = await api.exchangeParentInviteToken(initialInviteToken);
          setParentSessionToken(exchanged.parentSessionToken);
          await loadPortalState(exchanged.parentSessionToken);
          // Strip single-use token from URL bar so refreshing doesn't trigger replay error
          window.history.replaceState(null, '', '#/parent-portal');
          return;
        } catch (err: any) {
          setErrorMsg(err.message || 'Could not consume parent invite link.');
          setBusy(false);
          return;
        }
      }
      if (parentSessionToken) {
        await loadPortalState(parentSessionToken);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInviteToken]);

  const handleManualTokenExchange = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const raw = inviteInput.includes('invite=')
        ? new URLSearchParams(inviteInput.split('?')[1] || '').get('invite') || inviteInput.trim()
        : inviteInput.trim();
      const res = await api.exchangeParentInviteToken(raw);
      setParentSessionToken(res.parentSessionToken);
      await loadPortalState(res.parentSessionToken);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid or expired parent invite token.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveParentDetails = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      await api.submitParentDetails(parentSessionToken, {
        parentName: parentName.trim(),
        parentMobile: parentMobile.trim(),
        parentEmail: parentEmail.trim(),
        relationshipType,
      });
      await loadPortalState(parentSessionToken);
      setInfoMsg('Parent registration details saved. Proceed to adult identity & authority verification below.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save parent details.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunParentVerification = async (
    scenario: 'ADULT_18_PLUS' | 'UNDERAGE_IMPOSTOR' | 'FAILED'
  ) => {
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await api.verifyParentIdentity(parentSessionToken, {
        scenario,
        sandboxAuthorityVerified: sandboxAuthorityChecked,
      });
      await loadPortalState(parentSessionToken);
      if (res.hostedUrl) {
        window.open(res.hostedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Parent verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleConsentDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!portalState) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.submitParentalConsent(parentSessionToken, {
        decision,
        consentVersion: portalState.consentVersion,
        acknowledgements: {
          purposeAndDataCollection: ackPurpose,
          privacyAndSafetyPolicy: ackPrivacySafety,
          retentionAndWithdrawalRights: ackRetentionWithdrawal,
        },
      });
      if (res.withdrawalToken) {
        setIssuedWithdrawalToken(res.withdrawalToken);
      }
      await loadPortalState(parentSessionToken);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to record consent decision.');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdrawConsent = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await api.withdrawParentalConsent({
        parentSessionToken: parentSessionToken || undefined,
        withdrawalToken: manualWithdrawalToken.trim() || issuedWithdrawalToken || undefined,
      });
      setInfoMsg(
        `Parental consent (${res.consentTransactionId}) has been WITHDRAWN. Student account status is now ${res.studentAccountStatus}.`
      );
      if (parentSessionToken) {
        await loadPortalState(parentSessionToken);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to withdraw consent.');
    } finally {
      setBusy(false);
    }
  };

  const pv = portalState?.parentVerification;
  const adultVerified = pv?.adultVerificationStatus === 'VERIFIED_18_PLUS';
  const authorityVerified =
    pv?.authorityVerificationStatus === 'VERIFIED' ||
    pv?.authorityVerificationStatus === 'SANDBOX_VERIFIED';
  const readyForConsentDashboard = Boolean(adultVerified && authorityVerified);

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-4xl flex-col justify-between px-4 py-6 sm:px-8 sm:py-10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExitPortal}
            aria-label="Exit Parent Portal"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-[#111426] text-[#A5A9BC] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#27D9D0]">
              Isolated Guardian Session
            </span>
            <h1 className="font-heading text-lg font-bold text-white sm:text-xl">
              TeenStack Parent Verification &amp; Consent Portal
            </h1>
          </div>
        </div>

        {parentSessionToken && (
          <button
            type="button"
            onClick={() => {
              api.setStoredParentSessionToken('');
              setParentSessionToken('');
              setPortalState(null);
            }}
            className="rounded-xl border border-white/12 px-3 py-1.5 text-xs text-[#A5A9BC] hover:text-white"
          >
            Close Session
          </button>
        )}
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/12 p-3.5 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      )}

      {infoMsg && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-2xl border border-[#27D9D0]/40 bg-[#27D9D0]/10 p-3.5 text-xs text-[#27D9D0]"
        >
          {infoMsg}
        </div>
      )}

      <main className="my-auto space-y-6 py-6">
        {!portalState ? (
          /* Entry Gate: Exchange Short-Lived Single-Use Invite Token OR Withdraw Existing Consent */
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="ts-surface-elevated space-y-4 rounded-3xl p-6">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="h-5 w-5 text-[#27D9D0]" />
                <h2>Open Parent Verification Link</h2>
              </div>
              <p className="text-xs leading-relaxed text-[#A5A9BC]">
                Enter the single-use 30-minute verification token or link sent to your parent email/SMS to verify your identity and review your child&apos;s TeenStack registration.
              </p>
              <form onSubmit={handleManualTokenExchange} className="space-y-3">
                <div>
                  <label htmlFor="invite-token-input" className="mb-1 block text-xs font-medium text-white">
                    Single-Use Parent Invite Token or URL <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="invite-token-input"
                    name="invite_token"
                    type="text"
                    required
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="Paste invite token…"
                    className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[48px] w-full rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-5 py-2.5 text-xs font-semibold text-white sm:text-sm"
                >
                  {busy ? 'Validating Link…' : 'Verify Single-Use Link'}
                </button>
              </form>
            </section>

            <section className="ts-surface space-y-4 rounded-3xl p-6">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <RotateCcw className="h-5 w-5 text-amber-300" />
                <h2>Withdraw Prior Parental Consent</h2>
              </div>
              <p className="text-xs leading-relaxed text-[#A5A9BC]">
                Under Section 6(4) of the DPDP Act 2023, parents may withdraw previously granted consent at any time using their Consent Withdrawal Receipt Token.
              </p>
              <form onSubmit={handleWithdrawConsent} className="space-y-3">
                <div>
                  <label htmlFor="withdraw-token-input" className="mb-1 block text-xs font-medium text-white">
                    Consent Withdrawal Token <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="withdraw-token-input"
                    name="withdrawal_token"
                    type="text"
                    required
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={manualWithdrawalToken}
                    onChange={(e) => setManualWithdrawalToken(e.target.value)}
                    placeholder="Paste withdrawal receipt token…"
                    className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[48px] w-full rounded-2xl border border-rose-500/40 bg-rose-500/15 px-5 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 sm:text-sm"
                >
                  Withdraw Consent &amp; Restrict Student Account
                </button>
              </form>
            </section>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* If Consent Already Recorded -> Show Consent Receipt & Withdrawal Control */}
            {portalState.consent ? (
              <motion.section
                key="parent-consent-recorded"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRINGS.morph}
                className="ts-surface-elevated space-y-5 rounded-3xl p-6 sm:p-8"
              >
                <div className="flex items-start gap-3.5">
                  {portalState.consent.consentStatus === 'APPROVED' ? (
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-[#27D9D0]" />
                  ) : (
                    <XCircle className="h-8 w-8 shrink-0 text-rose-400" />
                  )}
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#27D9D0]">
                      Parental Decision Recorded
                    </span>
                    <h2 className="mt-0.5 font-heading text-xl font-bold text-white sm:text-2xl">
                      Status: {portalState.consent.consentStatus}
                    </h2>
                    <p className="mt-1 text-xs text-[#A5A9BC] sm:text-sm">
                      Student: <strong className="text-white">{portalState.student.fullName}</strong> (@{portalState.student.username}) · Account State:{' '}
                      <strong className="text-white">{portalState.student.accountStatus}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-white/10 bg-[#080910]/85 p-4 text-xs text-[#A5A9BC]">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>Consent Transaction ID:</span>
                    <code className="font-bold text-[#27D9D0]">
                      {portalState.consent.consentTransactionId}
                    </code>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>Consent Version:</span>
                    <span className="text-white">{portalState.consent.consentVersion}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>Recorded Timestamp:</span>
                    <span className="text-white">{portalState.consent.consentTimestamp}</span>
                  </div>
                  {portalState.consent.withdrawalTimestamp && (
                    <div className="flex flex-wrap justify-between gap-2 text-rose-300">
                      <span>Withdrawn Timestamp:</span>
                      <span>{portalState.consent.withdrawalTimestamp}</span>
                    </div>
                  )}
                </div>

                {issuedWithdrawalToken && portalState.consent.consentStatus === 'APPROVED' && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-100">
                    <strong>Save Your Withdrawal Receipt Token:</strong> You can use this token at any time on the Parent Portal to withdraw consent under DPDP Section 6(4):
                    <code className="mt-2 block break-all rounded-lg bg-black/60 p-2.5 text-[#27D9D0]">
                      {issuedWithdrawalToken}
                    </code>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  {portalState.consent.consentStatus === 'APPROVED' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleWithdrawConsent()}
                      className="min-h-[46px] rounded-xl border border-rose-500/40 bg-rose-500/15 px-5 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
                    >
                      Withdraw Consent Immediately
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onExitPortal}
                    className="min-h-[46px] rounded-xl bg-[#258BFF] px-5 py-2.5 text-xs font-semibold text-white"
                  >
                    Return to TeenStack
                  </button>
                </div>
              </motion.section>
            ) : !readyForConsentDashboard ? (
              /* =====================================================================
                 SCREEN 4: PARENT VERIFICATION INTERFACE
                ===================================================================== */
              <motion.section
                key="screen-parent-verification"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRINGS.morph}
                className="ts-surface-elevated space-y-6 rounded-3xl p-6 sm:p-8"
              >
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#258BFF]">
                    Step 1 of 2 · Independent Parent / Guardian Verification
                  </span>
                  <h2 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
                    Verify Guardian Identity for {portalState.student.fullName}
                  </h2>
                  <p className="mt-1 text-xs text-[#A5A9BC] sm:text-sm">
                    TeenStack never assumes a student&apos;s phone number belongs to their parent. Please enter your own independent contact details and complete adult (18+) &amp; guardianship verification.
                  </p>
                </div>

                <form onSubmit={handleSaveParentDetails} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="pv-name" className="mb-1 block text-xs font-medium text-white">
                        Parent / Legal Guardian Full Name <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="pv-name"
                        name="parent_name"
                        type="text"
                        required
                        autoComplete="name"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="e.g. Rajesh Kulkarni"
                        className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="pv-mobile" className="mb-1 block text-xs font-medium text-white">
                        Parent&apos;s Own Mobile Number <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="pv-mobile"
                        name="parent_mobile"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={parentMobile}
                        onChange={(e) => setParentMobile(e.target.value)}
                        placeholder="+91 98111 22334"
                        className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pv-email" className="mb-1 block text-xs font-medium text-white">
                      Parent&apos;s Own Email Address <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="pv-email"
                      name="parent_email"
                      type="email"
                      required
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="ts-input min-h-[48px] w-full rounded-xl border border-white/14 bg-[#080910] px-3.5 py-2 text-base text-white sm:text-sm"
                    />
                  </div>

                  {/* 3 Mutually Exclusive Options -> Visible Radio Group inside <fieldset>/<legend> (modern-web-guidance: forms) */}
                  <fieldset className="space-y-2 rounded-2xl border border-white/12 bg-[#080910]/70 p-3.5">
                    <legend className="px-1 text-xs font-semibold text-white">
                      Relationship to Student <span aria-hidden="true">*</span>
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          { id: 'MOTHER', label: 'Mother' },
                          { id: 'FATHER', label: 'Father' },
                          { id: 'COURT_APPOINTED_GUARDIAN', label: 'Court-Appointed Guardian' },
                        ] as const
                      ).map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111426] px-3 py-2.5"
                        >
                          <input
                            id={`rel-${opt.id}`}
                            type="radio"
                            name="relationship_type"
                            value={opt.id}
                            checked={relationshipType === opt.id}
                            onChange={() => setRelationshipType(opt.id)}
                            className="h-4 w-4 accent-[#743BFF]"
                          />
                          <label htmlFor={`rel-${opt.id}`} className="cursor-pointer text-xs text-white">
                            {opt.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[48px] rounded-xl border border-[#258BFF]/45 bg-[#258BFF]/20 px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#258BFF]/35"
                  >
                    1. Save Parent Details
                  </button>
                </form>

                {/* Step 1B: Adult Identity (Signzy) + Legal Authority Verification */}
                <div className="space-y-3 border-t border-white/10 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-sm font-bold text-white">
                      2. Complete Adult (18+) Identity &amp; Parental Authority Check
                    </h3>
                    <span className="text-xs text-[#A5A9BC]">
                      Adult: <strong className="text-white">{pv?.adultVerificationStatus}</strong> · Authority:{' '}
                      <strong className="text-white">{pv?.authorityVerificationStatus}</strong>
                    </span>
                  </div>

                  {portalState.environmentMode === 'sandbox_mock' ? (
                    <div className="space-y-3 rounded-2xl border border-[#743BFF]/40 bg-[#080910] p-4">
                      <div className="flex items-center gap-2 text-xs text-white">
                        <input
                          id="sbx-authority-toggle"
                          type="checkbox"
                          checked={sandboxAuthorityChecked}
                          onChange={(e) => setSandboxAuthorityChecked(e.target.checked)}
                          className="h-4 w-4 rounded accent-[#27D9D0]"
                        />
                        <label htmlFor="sbx-authority-toggle" className="cursor-pointer">
                          Confirm parental / legal-guardian authority check alongside adult 18+ verification
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          disabled={busy || !pv?.parentName}
                          onClick={() => handleRunParentVerification('ADULT_18_PLUS')}
                          className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-45"
                        >
                          Simulate Verified Adult (18+) Parent
                        </button>
                        <button
                          type="button"
                          disabled={busy || !pv?.parentName}
                          onClick={() => handleRunParentVerification('UNDERAGE_IMPOSTOR')}
                          className="min-h-[46px] rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-2 text-xs font-semibold text-rose-200 disabled:opacity-45"
                        >
                          Simulate Minor Pretending to Be Parent (Block)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !pv?.parentName}
                      onClick={() => handleRunParentVerification('ADULT_18_PLUS')}
                      className="min-h-[48px] rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-6 py-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Verify Adult Identity via Signzy DigiLocker
                    </button>
                  )}
                </div>
              </motion.section>
            ) : (
              /* =====================================================================
                 SCREEN 5: PARENT CONSENT DASHBOARD
                ===================================================================== */
              <motion.section
                key="screen-parent-consent-dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRINGS.morph}
                className="ts-surface-elevated space-y-6 rounded-3xl p-6 sm:p-8"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#27D9D0]">
                      <FileCheck2 className="h-3.5 w-3.5" />
                      Step 2 of 2 · Informed Verifiable Parental Consent ({portalState.consentVersion})
                    </span>
                    <h2 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
                      Review &amp; Decide Registration for {portalState.student.fullName}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#A5A9BC]">
                      Student Handle: @{portalState.student.username} · Verified Age Band: 13–17 Years · Guardian: {pv?.parentName} ({pv?.relationshipType})
                    </p>
                  </div>
                </div>

                {/* Mandatory DPDP Disclosures */}
                <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-[#A5A9BC] sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4">
                    <h3 className="font-heading text-xs font-bold text-white">
                      1. TeenStack&apos;s Purpose
                    </h3>
                    <p className="mt-1">
                      TeenStack is an Indian student-focused portfolio showcase, peer collaboration, and structured technology learning platform for students aged 13 and above.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4">
                    <h3 className="font-heading text-xs font-bold text-white">
                      2. Information Collected
                    </h3>
                    <p className="mt-1">
                      Account identifiers (name, username, encrypted email &amp; mobile), verified age band (<code className="text-white">13–17</code>), academic skills, projects, posts, and peer messages created by the student. Aadhaar numbers and biometrics are never stored.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4">
                    <h3 className="font-heading text-xs font-bold text-white">
                      3. How Student Information Is Used &amp; Child Ad Ban
                    </h3>
                    <p className="mt-1">
                      Used solely to operate learning modules, project portfolios, and moderated peer communication. TeenStack strictly prohibits behavioural monitoring, profiling, and targeted advertising to children under 18 (DPDP Act Section 9).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4">
                    <h3 className="font-heading text-xs font-bold text-white">
                      4. Privacy, Safety &amp; Moderation Policy
                    </h3>
                    <p className="mt-1">
                      Student contact details are masked by default, PII is encrypted at rest (AES-256-GCM), direct messaging defaults to verified peers/connections, and content safety filters are enforced.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#080910]/80 p-4 sm:col-span-2">
                    <h3 className="font-heading text-xs font-bold text-white">
                      5. Data Retention, Withdrawal &amp; Deletion Rights
                    </h3>
                    <p className="mt-1">
                      Personal data is retained only while the student account remains active or as required by Indian law for compliance audit logs. As parent/guardian, you have the right to withdraw consent at any time with a single action—immediately suspending data processing, locking account features, and scheduling account erasure.
                    </p>
                  </div>
                </div>

                {/* Explicit Informed Checkboxes */}
                <fieldset className="space-y-3 rounded-2xl border border-[#743BFF]/35 bg-[#080910]/90 p-4">
                  <legend className="px-1 text-xs font-bold text-white">
                    Explicit Informed Parental Consent Declarations
                  </legend>

                  <div className="flex items-start gap-2.5 text-xs text-white/90">
                    <input
                      id="ack-1"
                      type="checkbox"
                      checked={ackPurpose}
                      onChange={(e) => setAckPurpose(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#743BFF]"
                    />
                    <label htmlFor="ack-1" className="cursor-pointer">
                      I confirm I am the lawful parent/guardian of <strong>{portalState.student.fullName}</strong> and have read TeenStack&apos;s purpose, information collected, and how student data is used.
                    </label>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-white/90">
                    <input
                      id="ack-2"
                      type="checkbox"
                      checked={ackPrivacySafety}
                      onChange={(e) => setAckPrivacySafety(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#743BFF]"
                    />
                    <label htmlFor="ack-2" className="cursor-pointer">
                      I have reviewed and accept TeenStack&apos;s Privacy Policy and Child Safety &amp; Moderation Policy.
                    </label>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-white/90">
                    <input
                      id="ack-3"
                      type="checkbox"
                      checked={ackRetentionWithdrawal}
                      onChange={(e) => setAckRetentionWithdrawal(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#743BFF]"
                    />
                    <label htmlFor="ack-3" className="cursor-pointer">
                      I understand the data retention schedule and my right to withdraw parental consent at any time.
                    </label>
                  </div>
                </fieldset>

                {/* Two Explicit Actions: APPROVE REGISTRATION | REJECT REGISTRATION */}
                <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleConsentDecision('APPROVED')}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#743BFF] to-[#258BFF] px-6 py-3 text-sm font-bold tracking-wide text-white shadow-[0_10px_28px_-6px_rgba(116,59,255,0.8)] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>APPROVE REGISTRATION</span>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleConsentDecision('REJECTED')}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-rose-500/45 bg-rose-500/12 px-6 py-3 text-sm font-bold tracking-wide text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>REJECT REGISTRATION</span>
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        )}
      </main>

      <footer className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[#A5A9BC]/70">
        <Lock className="h-3 w-3" />
        <span>Single-use token protected · Explicit transaction-logged DPDP consent</span>
      </footer>
    </div>
  );
}
