
import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  User as UserIcon, 
  Church, 
  BookOpen, 
  Clock, 
  X, 
  Check, 
  Filter 
} from 'lucide-react';
import { User, ParishEvent, AttendanceStatus, getTodayStr } from '../types';

interface CatechistAttendanceProps {
  users: User[];
  events: ParishEvent[];
  classDays: string[];
  onUpdate: (userId: string, type: 'class' | 'event', status: AttendanceStatus, refId?: string, subType?: 'catechism' | 'mass') => void;
}

const CatechistAttendance: React.FC<CatechistAttendanceProps> = ({ users, events, classDays, onUpdate }) => {
  const [mode, setMode] = useState<'class' | 'event'>('class');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const today = getTodayStr();
  const isClassDay = classDays.includes(today);

  const cycleStatus = (userId: string, type: 'class' | 'event', current: AttendanceStatus, refId?: string, subType?: 'catechism' | 'mass') => {
    let next: AttendanceStatus = 'absent';
    if (type === 'class') {
      if (current === 'absent') next = 'present';
      else if (current === 'present') next = 'late';
    } else {
      next = current === 'present' ? 'absent' : 'present';
    }
    onUpdate(userId, type, next, refId, subType);
  };

  const getStatusStyle = (status: AttendanceStatus, activeColor: string) => {
    if (status === 'present') return `${activeColor} text-white shadow-md`;
    if (status === 'late') return `bg-amber-100 text-amber-700 border-2 border-amber-400`;
    return 'bg-slate-100 text-slate-400 hover:bg-slate-200';
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-2 sm:gap-4">
          <button 
            onClick={() => setMode('class')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${mode === 'class' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
          >
            Días Lectivos
          </button>
          <button 
            onClick={() => setMode('event')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${mode === 'event' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
          >
            Eventos Agenda
          </button>
        </div>

        {mode === 'event' && (
          <select 
            className="w-full sm:w-auto px-4 py-2 border rounded-xl text-sm outline-none bg-slate-50 focus:ring-2 focus:ring-indigo-500"
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
          >
            <option value="">Selecciona evento...</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.title} ({e.date})</option>)}
          </select>
        )}
      </div>

      {mode === 'class' && !isClassDay && (
        <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-100">
          <Calendar size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold">Hoy no es día lectivo registrado</p>
          <p className="text-xs sm:text-sm">Registro habilitado solo en días lectivos.</p>
        </div>
      )}

      {(mode === 'class' && isClassDay) || (mode === 'event' && selectedEventId) ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-3 sm:px-6 py-4 text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest w-[40%] sm:w-[35%]">Catequista</th>
                {mode === 'class' ? (
                  <>
                    <th className="px-1 sm:px-6 py-4 text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Cat.</th>
                    <th className="px-1 sm:px-6 py-4 text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Misa</th>
                  </>
                ) : (
                  <th className="px-2 sm:px-6 py-4 text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Asistencia</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(user => {
                const record = mode === 'class' 
                  ? user.attendanceHistory?.find(h => h.date === today && h.type === 'class')
                  : user.attendanceHistory?.find(h => h.refId === selectedEventId && h.type === 'event');
                
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 sm:px-6 py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-indigo-700 overflow-hidden shrink-0 text-[10px] sm:text-base">
                          {user.photo ? <img src={user.photo} className="w-full h-full object-cover" /> : user.name[0]}
                        </div>
                        <span className="font-bold text-slate-800 text-[11px] sm:text-sm truncate">{user.name}</span>
                      </div>
                    </td>
                    {mode === 'class' ? (
                      <>
                        <td className="px-1 sm:px-6 py-4">
                          <div className="flex justify-center">
                            <button 
                              onClick={() => cycleStatus(user.id, 'class', record?.catechism || 'absent', undefined, 'catechism')}
                              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all flex flex-col items-center gap-0.5 sm:gap-1 w-12 sm:w-24 ${getStatusStyle(record?.catechism || 'absent', 'bg-indigo-600')}`}
                            >
                              {record?.catechism === 'late' ? <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                              <span className="text-[7px] sm:text-[8px] font-bold uppercase">{!record?.catechism || record?.catechism === 'absent' ? 'NO' : record.catechism === 'present' ? 'SÍ' : 'T'}</span>
                            </button>
                          </div>
                        </td>
                        <td className="px-1 sm:px-6 py-4">
                          <div className="flex justify-center">
                            <button 
                              onClick={() => cycleStatus(user.id, 'class', record?.mass || 'absent', undefined, 'mass')}
                              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all flex flex-col items-center gap-0.5 sm:gap-1 w-12 sm:w-24 ${getStatusStyle(record?.mass || 'absent', 'bg-amber-500')}`}
                            >
                              {record?.mass === 'late' ? <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Church className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                              <span className="text-[7px] sm:text-[8px] font-bold uppercase">{!record?.mass || record?.mass === 'absent' ? 'NO' : record.mass === 'present' ? 'SÍ' : 'T'}</span>
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td className="px-2 sm:px-6 py-4">
                        <div className="flex justify-center">
                          <button 
                            onClick={() => cycleStatus(user.id, 'event', record?.status || 'absent', selectedEventId)}
                            className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold flex items-center gap-1.5 sm:gap-2 transition-all ${record?.status === 'present' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                          >
                            {record?.status === 'present' ? <Check size={14}/> : <X size={14}/>}
                            {record?.status === 'present' ? 'ASISTIÓ' : <span className="hidden sm:inline">NO ASISTIÓ</span>}
                            {record?.status !== 'present' && <span className="sm:hidden">NO</span>}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : mode === 'event' && !selectedEventId && (
        <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-100">
          <Filter size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold">Selecciona un evento para pasar lista</p>
        </div>
      )}
    </div>
  );
};

export default CatechistAttendance;
