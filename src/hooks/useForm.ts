import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { errMsg } from '../utils/format';

type Rules<T> = Partial<Record<keyof T, (v: any, all: T) => string | null | undefined>>;

/** Tiny form state helper: values, per-field errors, validation and a guarded submit. */
export function useForm<T extends Record<string, any>>(initial: T, rules: Rules<T> = {}) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues(v => ({ ...v, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const field = <K extends keyof T>(key: K) => ({
    value: values[key] == null ? '' : String(values[key]),
    onChangeText: (s: string) => set(key, s as T[K]),
    error: errors[key],
  });

  const validate = () => {
    const next: Partial<Record<keyof T, string>> = {};
    (Object.keys(rules) as (keyof T)[]).forEach(k => {
      const msg = rules[k]?.(values[k], values);
      if (msg) next[k] = msg;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (fn: (v: T) => Promise<unknown>, onDone?: () => void) => async () => {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      await fn(values);
      onDone?.();
    } catch (e) {
      Alert.alert('Could not save', errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, set, field, errors, setErrors, submitting, submit, validate };
}

export const required = (label: string) => (v: any) =>
  v === undefined || v === null || String(v).trim() === '' ? `${label} is required` : null;

export const numeric = (label: string, opts: { required?: boolean } = {}) => (v: any) => {
  if (v === undefined || v === null || String(v).trim() === '') return opts.required ? `${label} is required` : null;
  return Number.isFinite(Number(v)) ? null : `${label} must be a number`;
};

/** '' → undefined, otherwise Number(v) */
export const num = (v: any): number | undefined =>
  v === undefined || v === null || String(v).trim() === '' ? undefined : Number(v);

/** '' → undefined, otherwise trimmed string */
export const str = (v: any): string | undefined =>
  v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim();
