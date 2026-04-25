"use client";

import { useState, useRef, useEffect } from "react";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtDisplay(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isSame(a: string, b: string) { return a === b; }
function isBetween(d: string, from: string, to: string) { return d >= from && d <= to; }

export default function DatePicker({
  label,
  value,
  onChange,
  otherValue,
  isFrom,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  otherValue: string;
  isFrom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.split("-")[0]) : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.split("-")[1]) - 1 : new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { day: number; iso: string; other: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const pm = viewMonth === 0 ? 11 : viewMonth - 1;
    const py = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, iso: toIso(py, pm, d), other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: toIso(viewYear, viewMonth, d), other: false });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, iso: toIso(ny, nm, d), other: true });
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }
  function selectDay(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  const rangeFrom = isFrom ? value : otherValue;
  const rangeTo = isFrom ? otherValue : value;

  return (
    <div ref={ref} className="relative lg:col-span-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[rgba(243,237,253,0.5)]">{label}</div>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-left text-xs outline-none transition focus:border-[#7868f4]"
      >
        <span className={value ? "text-white" : "text-[rgba(243,237,253,0.5)]"}>
          {value ? fmtDisplay(value) : "DD/MM/YY"}
        </span>
        <span className="text-[rgba(200,202,254,0.4)] text-sm">&#9776;</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-[1.25rem] border border-[rgba(200,202,254,0.18)] bg-[rgba(31,8,67,0.95)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          style={{ background: "linear-gradient(180deg, rgba(31,8,67,0.97), rgba(10,4,34,0.97))" }}
        >
          {/* Gradient border */}
          <div className="pointer-events-none absolute inset-0 rounded-[1.25rem]" style={{
            padding: "1px",
            background: "linear-gradient(135deg, rgba(255,168,205,0.25), rgba(120,104,244,0.18))",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor" as const,
            maskComposite: "exclude" as const,
          }} />

          {/* Header */}
          <div className="relative mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">{MONTHS[viewMonth]} {viewYear}</span>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 text-sm text-[#c8cafe] transition hover:border-[#ffa8cd] hover:text-[#ffa8cd]">&#8249;</button>
              <button onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 text-sm text-[#c8cafe] transition hover:border-[#ffa8cd] hover:text-[#ffa8cd]">&#8250;</button>
            </div>
          </div>

          {/* Day names */}
          <div className="relative mb-1 grid grid-cols-7 gap-0.5 text-center">
            {DAYS.map((d) => (
              <div key={d} className="py-1 text-[10px] font-semibold uppercase text-[rgba(243,237,253,0.4)]">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="relative grid grid-cols-7 gap-0.5 text-center">
            {cells.map((c, i) => {
              const isSelected = isSame(c.iso, value);
              const isToday = isSame(c.iso, todayIso);
              const inRange = rangeFrom && rangeTo && isBetween(c.iso, rangeFrom, rangeTo);
              return (
                <button
                  key={i}
                  onClick={() => selectDay(c.iso)}
                  className={[
                    "rounded-lg py-2 text-xs transition",
                    c.other ? "text-[rgba(200,202,254,0.25)]" : "text-[#c8cafe]",
                    isSelected ? "bg-[#ffa8cd] font-bold text-[#0b051d]" : "",
                    !isSelected && inRange ? "bg-[rgba(255,168,205,0.15)] text-[#ffa8cd]" : "",
                    !isSelected && isToday ? "border border-[#7868f4] text-white" : "",
                    !isSelected && !inRange && !c.other ? "hover:bg-[rgba(120,104,244,0.2)] hover:text-white" : "",
                    "cursor-pointer",
                  ].filter(Boolean).join(" ")}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="relative mt-3 flex justify-between border-t border-[rgba(200,202,254,0.1)] pt-2.5">
            <button onClick={() => { onChange(""); setOpen(false); }} className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#c8cafe] transition hover:bg-[rgba(200,202,254,0.1)] hover:text-white">Clear</button>
            <button onClick={() => { selectDay(todayIso); }} className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#ffa8cd] transition hover:bg-[rgba(255,168,205,0.1)]">Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
