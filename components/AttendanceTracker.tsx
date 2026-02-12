
import React, { useState } from 'react';
import { 
  Check, 
  X, 
  Mail, 
  Send,
  MoreVertical,
  Church,
  BookOpen,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { Student, getTodayStr, AttendanceStatus } from '../types';
import { draftParentEmail } from '../services/geminiService';

interface AttendanceTrackerProps {
  students: Student[];
  onUpdate: (id: string, type: 'catechism' | 'mass', status: AttendanceStatus) => void;
  classDays: string[];
  warningMessage?: string;
  warningType?: "no-group" | "no-students";
}

const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({ students, onUpdate, classDays, warningMessage, warningType }) => {
  const todayRaw = getTodayStr();
  const todayPretty = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const isClassDay = classDays.includes(todayRaw);
  
  const [draftingEmail, setDraftingEmail] = useState<string | null>(null);
  const [emailContent, setEmailContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleDraftEmail = async (student: Student) => {
    setDraftingEmail(student.id);
    const content = await draftParentEmail(student.name, new Date().toLocaleDateString());
    setEmailContent(content || '');
  };

  const sendEmail = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setDraftingEmail(null);
      alert('Email enviado correctamente');
    }, 1500);
  };

  const cycleStatus = (current: AttendanceStatus): AttendanceStatus => {
    if (current === 'absent') return 'present';
    if (current === 'present') return 'late';
    return 'absent';
  };

  const getStatusStyle = (status: AttendanceStatus, activeColor: string) => {
    if (status === 'present') return `${activeColor} text-white shadow-md`;
    if (status === 'late') return `bg-amber-100 text-amber-700 border-2 border-amber-400`;
    return 'bg-slate-100 text-slate-400 hover:bg-slate-200';
  };

  if (!isClassDay) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 lg:w-20 lg:h-20 bg-amber-100 text-amber-600 rounded-2xl lg:rounded-3xl flex items-center justify-center mb-6 shadow-sm">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Hoy no es día de clase</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">El registro de asistencia solo está disponible en días lectivos. Tan solo el coordinador/a puede modificar qué días son lectivos.</p>
        <p className="text-indigo-600 font-semibold mt-4 text-sm lg:text-base capitalize">{todayPretty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {warningMessage && (
        <div className="mb-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          <span className="font-bold">Aviso:</span> {warningMessage}
        </div>
      )}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-600 rounded-2xl p-6 lg:p-8 text-white flex items-center justify-between shadow-lg">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Church size={24} className="shrink-0" />
            Control Diario
          </h2>
          <p className="text-indigo-100 opacity-90 text-xs lg:text-sm mt-1 capitalize">{todayPretty}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="w-full overflow-x-hidden">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 lg:px-6 py-4 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest w-[40%] sm:w-[35%]">Alumno</th>
                <th className="px-1 lg:px-6 py-4 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Cat.</th>
                <th className="px-1 lg:px-6 py-4 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Misa</th>
                <th className="px-2 lg:px-6 py-4 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right w-10 sm:w-auto"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map(student => {
                const record = student.attendanceHistory.find(h => h.date === todayRaw);
                const statusCat = record?.catechism || 'absent';
                const statusMass = record?.mass || 'absent';
                
                const showAviso = statusCat === 'absent' || statusMass === 'absent';
                
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 lg:px-6 py-4">
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold overflow-hidden shrink-0 text-[10px] sm:text-sm">
                          {student.photo ? <img src={student.photo} className="w-full h-full object-cover" /> : student.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-[11px] sm:text-sm truncate">{student.name}</p>
                          <p className="hidden sm:block text-[10px] text-slate-500 truncate">{student.school}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1 lg:px-6 py-4">
                      <div className="flex justify-center">
                        <button 
                          onClick={() => onUpdate(student.id, 'catechism', cycleStatus(statusCat))}
                          className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all flex flex-col items-center gap-0.5 sm:gap-1 w-12 sm:w-24 ${getStatusStyle(statusCat, 'bg-indigo-600')}`}
                        >
                          {statusCat === 'late' ? <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          <span className="text-[7px] sm:text-[8px] font-bold uppercase">{statusCat === 'absent' ? 'NO' : statusCat === 'present' ? 'SÍ' : 'T'}</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-1 lg:px-6 py-4">
                      <div className="flex justify-center">
                        <button 
                          onClick={() => onUpdate(student.id, 'mass', cycleStatus(statusMass))}
                          className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-all flex flex-col items-center gap-0.5 sm:gap-1 w-12 sm:w-24 ${getStatusStyle(statusMass, 'bg-amber-500')}`}
                        >
                          {statusMass === 'late' ? <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Church className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          <span className="text-[7px] sm:text-[8px] font-bold uppercase">{statusMass === 'absent' ? 'NO' : statusMass === 'present' ? 'SÍ' : 'T'}</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-2 lg:px-6 py-4 text-right">
                      {showAviso && (
                        <button 
                          onClick={() => handleDraftEmail(student)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center"
                        >
                          <Mail size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {draftingEmail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-2"><Mail className="text-indigo-600" />Aviso Pastoral</h3>
              <button onClick={() => setDraftingEmail(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={24} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <textarea 
                className="w-full h-48 lg:h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
              />
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-3">
              <button onClick={() => setDraftingEmail(null)} className="order-2 sm:order-1 px-6 py-2 rounded-xl text-slate-600 font-bold text-sm">Cancelar</button>
              <button onClick={sendEmail} disabled={isSending} className="order-1 sm:order-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 text-sm">
                {isSending ? 'Enviando...' : 'Enviar Ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceTracker;
