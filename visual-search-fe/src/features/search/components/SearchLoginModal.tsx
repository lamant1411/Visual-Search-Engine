import { type FormEvent, useRef, useState } from 'react'
import axios from 'axios'
import { Eye, EyeOff, LockKeyhole, Mail, Search, UserRound, X } from 'lucide-react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/api/auth'
import { saveTokens } from '@/lib/auth/tokenStorage'
import { useDialogAccessibility } from '@/lib/ui/useDialogAccessibility'

type SearchLoginModalProps = {
  onClose: () => void
  onSuccess: () => void
}

export function SearchLoginModal({ onClose, onSuccess }: SearchLoginModalProps) {
  const { login } = useAuth()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose, {
    closeOnEscape: !isSubmitting,
    initialFocusRef: emailInputRef,
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(undefined)

    const validationError = validateForm({ view, fullName, email, password, confirmPassword })
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setIsSubmitting(true)

    try {
      if (view === 'register') {
        await authApi.register({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        })
      }

      const tokenResponse = await authApi.login({ email: email.trim(), password })
      saveTokens(tokenResponse.access_token, tokenResponse.refresh_token)
      const user = await authApi.me()

      login({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        user,
      })

      onSuccess()
    } catch (error) {
      if (
        view === 'register' &&
        axios.isAxiosError(error) &&
        (error.response?.status === 409 || error.response?.status === 400)
      ) {
        setErrorMessage('This email may already be registered.')
      } else if (axios.isAxiosError(error) && error.response?.status === 401) {
        setErrorMessage('Incorrect email or password.')
      } else {
        setErrorMessage('Unable to sign in. Check your connection and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      aria-labelledby="search-login-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      role="dialog"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white px-6 py-7 shadow-2xl sm:px-8"
        tabIndex={-1}
      >
        <Button
          aria-label="Close sign in dialog"
          className="absolute right-4 top-4"
          disabled={isSubmitting}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="pr-10">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-ink-primary text-white shadow-sm">
            <Search className="h-5 w-5" />
          </span>
          <h2 id="search-login-title" className="font-display mt-5 text-2xl font-bold text-ink-primary">
            {view === 'login' ? 'Sign in to continue' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            {view === 'login'
              ? 'Sign in once, then we will continue the action you just selected.'
              : 'Create an account, then we will continue without losing your search.'}
          </p>
        </div>

        <form aria-busy={isSubmitting} className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              {errorMessage}
            </div>
          )}

          {view === 'register' && (
            <Input
              autoComplete="name"
              id="search-register-full-name"
              label="Full name"
              leftIcon={<UserRound className="h-4 w-4" />}
              placeholder="Your full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          )}

          <Input
            ref={emailInputRef}
            autoComplete="email"
            id="search-login-email"
            label="Email"
            leftIcon={<Mail className="h-4 w-4" />}
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Input
            autoComplete="current-password"
            id="search-login-password"
            label="Password"
            leftIcon={<LockKeyhole className="h-4 w-4" />}
            placeholder="Enter your password"
            rightIcon={
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="pointer-events-auto cursor-pointer text-ink-muted transition hover:text-ink-primary"
                type="button"
                onClick={() => setShowPassword((currentValue) => !currentValue)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {view === 'register' && (
            <Input
              autoComplete="new-password"
              id="search-register-confirm-password"
              label="Confirm password"
              leftIcon={<LockKeyhole className="h-4 w-4" />}
              placeholder="Enter your password again"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          )}

          <Button
            fullWidth
            className="!bg-ink-primary hover:!bg-slate-800"
            loading={isSubmitting}
            size="lg"
            type="submit"
          >
            {view === 'login' ? 'Sign in and continue' : 'Create account and continue'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-secondary">
          {view === 'login' ? 'New to VisualSearch?' : 'Already have an account?'}{' '}
          <button
            className="cursor-pointer font-semibold text-accent-700 hover:underline"
            type="button"
            onClick={() => {
              setView((currentView) => (currentView === 'login' ? 'register' : 'login'))
              setErrorMessage(undefined)
            }}
          >
            {view === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  )
}

function validateForm({
  view,
  fullName,
  email,
  password,
  confirmPassword,
}: {
  view: 'login' | 'register'
  fullName: string
  email: string
  password: string
  confirmPassword: string
}) {
  if (view === 'register' && !fullName.trim()) {
    return 'Enter your full name.'
  }

  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.'
  }

  if (!password) {
    return 'Enter your password.'
  }

  if (view === 'register') {
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return 'Use at least 8 characters with an uppercase letter, number, and special character.'
    }

    if (password !== confirmPassword) {
      return 'The password confirmation does not match.'
    }
  }

  return undefined
}
