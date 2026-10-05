'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// MSG91 Widget configuration
// NOTE: tokenAuth is intentionally public - MSG91 designed it for client-side use
// (see https://msg91.com/help/sendotp/how-to-integrate-the-new-login-with-otp-widget)
// It appears in client-side HTML/JS by design, not a secret.
const WIDGET_ID = '366a656641323138343334330';
const TOKEN_AUTH = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN || '578356TMwotuew6ac349e9P1';

declare global {
  interface Window {
    initSendOTP?: (config: unknown) => void;
    sendOtp?: (identifier: string, onSuccess: (data: unknown) => void, onError: (error: unknown) => void) => void;
    verifyOtp?: (otp: string, onSuccess: (data: unknown) => void, onError: (error: unknown) => void) => void;
    retryOtp?: (channel: string | null, onSuccess: (data: unknown) => void, onError: (error: unknown) => void) => void;
  }
}

export interface Msg91WidgetState {
  loaded: boolean;
  initialized: boolean;
  error: string | null;
}

export function useMsg91Widget() {
  const [state, setState] = useState<Msg91WidgetState>({
    loaded: false,
    initialized: false,
    error: null,
  });
  const initAttempted = useRef(false);

  // Load MSG91 widget script
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (document.querySelector('script[data-msg91-widget]')) {
      setState(s => ({ ...s, loaded: true }));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://verify.msg91.com/otp-provider.js';
    script.setAttribute('data-msg91-widget', 'true');
    script.async = true;
    script.onload = () => {
      setState(s => ({ ...s, loaded: true }));
    };
    script.onerror = () => {
      setState(s => ({ ...s, error: 'Failed to load MSG91 widget' }));
    };
    document.head.appendChild(script);
  }, []);

  // Initialize widget once loaded
  useEffect(() => {
    if (!state.loaded || initAttempted.current) return;
    if (typeof window.initSendOTP !== 'function') {
      // Script loaded but initSendOTP not available yet, retry
      const timer = setTimeout(() => {
        if (typeof window.initSendOTP === 'function' && !initAttempted.current) {
          initAttempted.current = true;
          try {
            window.initSendOTP({
              widgetId: WIDGET_ID,
              tokenAuth: TOKEN_AUTH,
              exposeMethods: true,
              success: () => {},
              failure: () => {},
            });
            setState(s => ({ ...s, initialized: true }));
          } catch (e) {
            setState(s => ({ ...s, error: 'Widget init failed' }));
          }
        }
      }, 1000);
      return () => clearTimeout(timer);
    }

    initAttempted.current = true;
    try {
      window.initSendOTP({
        widgetId: WIDGET_ID,
        tokenAuth: TOKEN_AUTH,
        exposeMethods: true,
        success: () => {},
        failure: () => {},
      });
      setState(s => ({ ...s, initialized: true }));
    } catch (e) {
      setState(s => ({ ...s, error: 'Widget init failed' }));
    }
  }, [state.loaded]);

  const sendOtp = useCallback((phoneNumber: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof window.sendOtp !== 'function') {
        reject(new Error('MSG91 widget not ready'));
        return;
      }
      // Phone must include country code without +
      const identifier = phoneNumber.replace(/\D/g, '');
      window.sendOtp(
        identifier,
        (data: unknown) => resolve(),
        (error: unknown) => {
          // Capture the real MSG91 error
          const msg = typeof error === 'string' ? error : 
                     (error as any)?.message || 
                     (error as any)?.description ||
                     JSON.stringify(error);
          reject(new Error(`MSG91: ${msg}`));
        }
      );
    });
  }, []);

  const verifyOtp = useCallback((otp: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof window.verifyOtp !== 'function') {
        reject(new Error('MSG91 widget not ready'));
        return;
      }
      window.verifyOtp(
        otp,
        (data: unknown) => {
          // On success, MSG91 returns JWT access token
          const token = (data as { message?: string })?.message || (data as string);
          if (typeof token === 'string' && token) {
            resolve(token);
          } else {
            reject(new Error('Invalid verification response'));
          }
        },
        (error: unknown) => reject(new Error(typeof error === 'string' ? error : 'Invalid OTP'))
      );
    });
  }, []);

  const retryOtp = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof window.retryOtp !== 'function') {
        reject(new Error('MSG91 widget not ready'));
        return;
      }
      window.retryOtp(
        null,
        () => resolve(),
        (error: unknown) => reject(new Error('Failed to resend OTP'))
      );
    });
  }, []);

  return {
    ...state,
    sendOtp,
    verifyOtp,
    retryOtp,
    isReady: state.loaded && state.initialized && !state.error,
  };
}
