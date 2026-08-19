"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import "./currency-input.css";

export const parseBrazilianMoney = (input: string) => {
  const clean = String(input || "").replace(/[^\d,.-]/g, "");
  if (!clean || clean === "-") return "";
  const negative = clean.startsWith("-");
  const unsigned = clean.replace(/-/g, "");
  const comma = unsigned.lastIndexOf(","), dot = unsigned.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  let integer = separator >= 0 ? unsigned.slice(0, separator) : unsigned;
  let decimals = separator >= 0 ? unsigned.slice(separator + 1) : "";
  if (comma < 0 && dot >= 0 && decimals.length === 3) {
    integer = unsigned;
    decimals = "";
  }
  integer = integer.replace(/\D/g, "") || "0";
  decimals = decimals.replace(/\D/g, "").slice(0, 2);
  const value = `${negative ? "-" : ""}${Number(integer)}${decimals ? `.${decimals}` : ""}`;
  return Number.isFinite(Number(value)) ? value : "";
};

export const formatBrazilianMoney = (value: string | number) => {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
    : "0,00";
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "name"> & {
  value?: string | number;
  name?: string;
  onValueChange?: (value: string) => void;
};

export default function CurrencyInput({ value, name, onValueChange, className = "", ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(String(value || ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const current = controlled ? String(value || "") : internal;
  useEffect(() => { if (!focused) setDraft(formatBrazilianMoney(current)); }, [current, focused]);
  useEffect(() => { const form=inputRef.current?.form;if(!form||controlled)return;const reset=()=>setInternal("");form.addEventListener("reset",reset);return()=>form.removeEventListener("reset",reset); }, [controlled]);
  const shown = focused ? draft : formatBrazilianMoney(current);
  const size = shown.length > 17 ? "currency-tight" : shown.length > 12 ? "currency-compact" : "";
  return <><input {...props} ref={inputRef} type="text" inputMode="decimal" autoComplete="off" className={`currency-input ${size} ${className}`.trim()} value={shown}
    onFocus={e => { setFocused(true); setDraft(formatBrazilianMoney(current)); props.onFocus?.(e); }}
    onChange={e => { const parsed=parseBrazilianMoney(e.target.value);setDraft(e.target.value);if(controlled)onValueChange?.(parsed);else setInternal(parsed); }}
    onBlur={e => { setFocused(false); setDraft(formatBrazilianMoney(parseBrazilianMoney(e.target.value))); props.onBlur?.(e); }} />
    {name&&<input type="hidden" name={name} value={current}/>}</>;
}
