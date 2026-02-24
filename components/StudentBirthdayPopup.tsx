// components/StudentBirthdayPopup.tsx
import React, { useEffect, useMemo } from "react";
import { Cake, PartyPopper, X } from "lucide-react";
import { User } from "../types";

type StudentBirthdayInfo = {
  student_id: string;
  student_name: string;
  age: number;
  group_id: string;
};

type Props = {
  currentUser: User;
  birthdays: StudentBirthdayInfo[];
  onClose: () => void;
};

const StudentBirthdayPopup: React.FC<Props> = ({ currentUser, birthdays, onClose }) => {
  const title = "Cumpleaños de hoy";

   const subtitle = useMemo(() => {
    if (!birthdays || birthdays.length === 0) return "";

    if (birthdays.length === 1) {
      const b = birthdays[0];
      const name = b.student_name || "un niño/a";
      const agePart = Number.isFinite(b.age) ? ` ${b.age} años` : "";
      return `Hoy ${name} cumple${agePart}. No te olvides de felicitarle.`;
    }

    const names = birthdays.map(b => b.student_name).filter(Boolean);
    const namesText =
      names.length === 0
        ? "varios niños/as"
        : names.length === 2
          ? `${names[0]} y ${names[1]}`
          : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

    const ages = birthdays.map(b => b.age).filter(a => Number.isFinite(a));
    const agesText =
      ages.length === 0
        ? ""
        : ages.length === 1
          ? `${ages[0]}`
          : ages.length === 2
            ? `${ages[0]} y ${ages[1]}`
            : `${ages.slice(0, -1).join(", ")} y ${ages[ages.length - 1]}`;

    const agesPart = agesText ? ` cumplen ${agesText} años` : " cumplen años";

    return `Hoy ${namesText}${agesPart}. No te olvides de felicitarles.`;
  }, [birthdays]);

  const list = useMemo(() => {
    return (birthdays ?? [])
      .slice()
      .sort((a, b) => (a.student_name || "").localeCompare(b.student_name || "", "es", { sensitivity: "base" }));
  }, [birthdays]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Si por lo que sea se renderiza con lista vacía, no pintamos nada (seguridad)
  if (!birthdays || birthdays.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* header */}
          <div className="p-6 sm:p-7 border-b border-slate-100 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                {/* icon */}
                {birthdays.length > 1 ? <PartyPopper size={26} /> : <Cake size={26} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-slate-600 leading-snug">
                  {subtitle}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Hola, {currentUser.name || "catequista"}.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {/* body */}
          <div className="p-6 sm:p-7">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Cumpleañeros
            </p>

            <div className="space-y-2">
              {list.map(b => (
                <div
                  key={b.student_id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {b.student_name || "Sin nombre"}
                    </p>
                    <p className="text-xs text-slate-500">
                      No te olvides de felicitarle.
                    </p>
                  </div>

                  {Number.isFinite(b.age) && (
                    <span className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 font-bold text-sm">
                      {b.age} años
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* footer */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentBirthdayPopup;