// components/BirthdayPopup.tsx
import React, { useEffect, useMemo } from "react";
import { Cake, PartyPopper, X } from "lucide-react";
import { User } from "../types";

type BirthdayInfo = { id: string; name: string; age: number };

type Props = {
  currentUser: User;
  birthdays: BirthdayInfo[];
  onClose: () => void;
};

const BirthdayPopup: React.FC<Props> = ({ currentUser, birthdays, onClose }) => {
  const meIsBirthday = useMemo(
    () => birthdays.some(b => b.id === currentUser.id),
    [birthdays, currentUser.id]
  );

  const others = useMemo(
    () => birthdays.filter(b => b.id !== currentUser.id),
    [birthdays, currentUser.id]
  );

  const title = meIsBirthday ? "Hoy es tu día" : "Cumpleaños de hoy";

  const subtitle = useMemo(() => {
    if (meIsBirthday) {
      return `Muchas felicidades, ${currentUser.name || "catequista"}!`;
    }
    if (birthdays.length === 1) {
      const b = birthdays[0];
      return `Hoy ${b.name} cumple ${b.age}. No te olvides de felicitarle.`;
    }

    // 2 o más
    const names = birthdays.map(b => b.name).filter(Boolean);
    const namesText =
      names.length === 0
        ? "varias personas"
        : names.length === 2
          ? `${names[0]} y ${names[1]}`
          : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

    // edades “12, 13 y 14” (en el mismo orden)
    const ages = birthdays.map(b => b.age).filter(a => Number.isFinite(a));
    const agesText =
      ages.length === 0
        ? ""
        : ages.length === 1
          ? `${ages[0]}`
          : ages.length === 2
            ? `${ages[0]} y ${ages[1]}`
            : `${ages.slice(0, -1).join(", ")} y ${ages[ages.length - 1]}`;

    const verb = birthdays.length > 1 ? "cumplen" : "cumple";
    const agesPart = agesText ? ` ${verb}n ${agesText}` : ` ${verb}`;

    return `Hoy ${namesText}${agesPart}. No te olvides de felicitarles.`;
  }, [meIsBirthday, currentUser.name, birthdays]);

  const details = useMemo(() => {
    // Si el usuario cumple hoy, mostrar al usuario siempre en grande,
    // y opcionalmente otros cumpleañeros también si los hay
    if (meIsBirthday) {
      const me = birthdays.find(b => b.id === currentUser.id);
      const rest = others;

      return {
        primaryName: currentUser.name || "¡Felicidades!",
        primaryAge: me?.age,
        others: rest,
      };
    }

    // Si no cumple, lista normal
    return {
      primaryName: null as string | null,
      primaryAge: null as number | undefined,
      others: birthdays,
    };
  }, [meIsBirthday, birthdays, currentUser.id, currentUser.name, others]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100">
                {/* icon “bonito” */}
                {meIsBirthday ? <PartyPopper size={26} /> : <Cake size={26} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-slate-600 leading-snug">
                  {subtitle}
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
            {/* Destacado si el usuario cumple */}
            {details.primaryName && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                <p className="text-sm font-bold text-amber-900 uppercase tracking-widest">
                  Felicidades
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-xl sm:text-2xl font-extrabold text-slate-900 truncate">
                    {details.primaryName}
                  </p>
                  {typeof details.primaryAge === "number" && (
                    <span className="shrink-0 px-3 py-1.5 rounded-full bg-white border border-amber-200 text-amber-900 font-bold text-sm">
                      {details.primaryAge} años
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Que tengas un día precioso. Gracias por tu servicio.
                </p>
              </div>
            )}

            {/* Lista de cumpleañeros (otros o todos) */}
            {details.others.length > 0 && (
              <div className={details.primaryName ? "mt-5" : ""}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                  {meIsBirthday ? "También cumplen hoy" : "Cumpleañeros"}
                </p>

                <div className="space-y-2">
                  {details.others.map(b => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {b.name || "Sin nombre"}
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
              </div>
            )}

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

export default BirthdayPopup;