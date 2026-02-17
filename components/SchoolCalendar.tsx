import React, { useMemo, useState } from "react";

type Props = {
  classDays: string[]; // ["YYYY-MM-DD", ...]
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Evita problemas de zona horaria: parsea "YYYY-MM-DD" como fecha local (sin UTC shift)
function parseYmdToLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  // Validación básica (por si llega algo raro)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYmdLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

// Lunes=0 ... Domingo=6
function mondayFirstIndex(jsDay: number) {
  // JS: Domingo=0, Lunes=1 ... Sábado=6
  // Queremos: Lunes=0 ... Domingo=6
  return (jsDay + 6) % 7;
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

const SchoolCalendar: React.FC<Props> = ({ classDays }) => {
  // Mes visible (anclado al día 1 para estabilidad)
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));

  const classDaySet = useMemo(() => {
    const s = new Set<string>();
    for (const ymd of classDays ?? []) {
      // Normaliza por si viene con tiempo accidentalmente
      const only = String(ymd).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(only)) s.add(only);
    }
    return s;
  }, [classDays]);

  const monthLabel = useMemo(() => {
    // "febrero de 2026"
    return visibleMonth.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
  }, [visibleMonth]);

  const monthGrid = useMemo(() => {
    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(visibleMonth);

    const firstIdx = mondayFirstIndex(start.getDay()); // 0..6
    const totalDays = end.getDate();

    // Construye 6 filas x 7 columnas (42 celdas)
    const cells: Array<{ date: Date | null; ymd?: string; inMonth: boolean; isClassDay: boolean }> = [];

    // Celdas "vacías" antes del día 1
    for (let i = 0; i < firstIdx; i++) {
      cells.push({ date: null, inMonth: false, isClassDay: false });
    }

    // Días del mes
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(start.getFullYear(), start.getMonth(), day);
      const ymd = toYmdLocal(d);
      const isClassDay = classDaySet.has(ymd);
      cells.push({ date: d, ymd, inMonth: true, isClassDay });
    }

    // Relleno hasta 42
    while (cells.length < 42) {
      cells.push({ date: null, inMonth: false, isClassDay: false });
    }

    // Parte en semanas
    const weeks: typeof cells[] = [];
    for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [visibleMonth, classDaySet]);

  const monthClassDays = useMemo(() => {
    // Lista de días lectivos del mes visible para mostrar resumen
    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(visibleMonth);
    const startYmd = toYmdLocal(start);
    const endYmd = toYmdLocal(end);

    const list = Array.from(classDaySet)
      .filter((d) => d >= startYmd && d <= endYmd)
      .sort();

    return list;
  }, [visibleMonth, classDaySet]);

  const goPrev = () => setVisibleMonth((m) => addMonths(m, -1));
  const goNext = () => setVisibleMonth((m) => addMonths(m, +1));
  const goToday = () => setVisibleMonth(startOfMonth(new Date()));

  const todayYmd = useMemo(() => toYmdLocal(new Date()), []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 capitalize">{monthLabel}</h2>
            <p className="text-slate-500 text-sm">
              Días lectivos marcados por el coordinador.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
            >
              Mes anterior
            </button>
            <button
              type="button"
              onClick={goToday}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold transition-colors"
            >
              Ir a hoy
            </button>
            <button
              type="button"
              onClick={goNext}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
            >
              Mes siguiente
            </button>
          </div>
        </div>

        {/* Cabecera días semana */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center py-2"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Rejilla calendario (solo lectura: no botones por día) */}
        <div className="grid grid-rows-6 gap-2">
          {monthGrid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-2">
              {week.map((cell, ci) => {
                if (!cell.date) {
                  return (
                    <div
                      key={ci}
                      className="h-16 sm:h-20 rounded-2xl border border-slate-100 bg-slate-50"
                    />
                  );
                }

                const day = cell.date.getDate();
                const ymd = cell.ymd!;
                const isToday = ymd === todayYmd;

                const base =
                  "h-16 sm:h-20 rounded-2xl border p-2 flex flex-col justify-between select-none";
                const border = cell.isClassDay ? "border-emerald-200" : "border-slate-200";
                const bg = cell.isClassDay ? "bg-emerald-50" : "bg-white";
                const ring = isToday ? "ring-2 ring-indigo-300" : "";
                const dayColor = cell.isClassDay ? "text-emerald-900" : "text-slate-800";

                return (
                  <div key={ci} className={`${base} ${border} ${bg} ${ring}`}>
                    <div className={`text-sm font-bold ${dayColor}`}>{day}</div>

                    {/* Marcador discreto */}
                    <div className="flex items-center justify-end">
                      {cell.isClassDay ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                          Lectivo
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                          No lectivo
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Resumen del mes */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-slate-600">
            Total días lectivos este mes:{" "}
            <span className="font-bold text-slate-900">{monthClassDays.length}</span>
          </div>

          <div className="text-xs text-slate-500">
            Vista solo lectura. Solo un coordinador puede hacer cambios en el calendario en el menú <span className="font-semibold">Gestión de calendario</span>.
          </div>
        </div>
      </div>

      {/* Lista opcional (útil para móviles y ver fechas exactas) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Días lectivos del mes</h3>

        {monthClassDays.length === 0 ? (
          <div className="text-sm text-slate-500">No hay días lectivos marcados en este mes.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {monthClassDays.map((d) => {
              const dt = parseYmdToLocalDate(d);
              const label = dt
                ? dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
                : d;

              return (
                <span
                  key={d}
                  className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-full"
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolCalendar;