
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  FileText, 
  Download, 
  RefreshCcw,
  Lightbulb,
  Users,
  Briefcase,
  Search
} from 'lucide-react';
import { generateAttendanceReport, generateCatechistReport } from '../services/geminiService';
import { 
  Student, 
  User, 
  Group, 
  calculateStudentRate, 
  calculateCatechistRate, 
  ParishEvent, 
  getTodayStr, 
  getAcademicYearRange,
  AttendanceStatus
} from '../types';

interface ReportsProps {
  students: Student[];
  currentUser: User;
  groups: Group[];
  classDays: string[];
  users: User[];
  events: ParishEvent[];
}

const Reports: React.FC<ReportsProps> = ({ students, currentUser, groups, classDays, users, events }) => {
  const [reportType, setReportType] = useState<'students' | 'catechists'>('students');
  const [report, setReport] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    currentUser.role === 'coordinator' ? 'all' : currentUser.assignedGroupId || 'all'
  );

  const today = getTodayStr();
  const { start, end } = getAcademicYearRange(today);
  
  // All relevant past dates for this academic year
  const pastClassDays = useMemo(() => 
    classDays.filter(d => d >= start && d <= end && d <= today).sort(), 
    [classDays, start, end, today]
  );
  
  const pastEvents = useMemo(() => 
    events.filter(e => e.date >= start && e.date <= end && e.date <= today).sort((a, b) => a.date.localeCompare(b.date)),
    [events, start, end, today]
  );

  const filteredStudents = useMemo(() => {
    if (selectedGroupId === 'all') return students;
    return students.filter(s => s.groupId === selectedGroupId);
  }, [students, selectedGroupId]);

  const filteredCatechists = useMemo(() => {
    return users.filter(u => u.role === 'catechist');
  }, [users]);

  // Helper to remove accents and replace commas to avoid CSV breakage
  const sanitize = (str: string) => {
    if (!str) return "";
    return str
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/,/g, ";")             // Replace commas with semicolons
      .trim();
  };

  const getStatusLabel = (status?: AttendanceStatus) => {
    if (status === 'present') return "P";
    if (status === 'late') return "T";
    return "A";
  };

  const handleDownloadCSV = () => {
    let headers = "";
    let rows = "";
    const filename = reportType === 'students' 
      ? `asistencia_catecumenos_${today}.csv` 
      : `asistencia_catequistas_${today}.csv`;

    if (reportType === 'students') {
      // Dynamic Headers: Basic Info + (Date Cat, Date Mass) for each past class day
      const dateHeaders = pastClassDays.map(d => `${sanitize(d)} (Cat),${sanitize(d)} (Misa)`).join(',');
      headers = `Nombre,Grupo,Colegio,Asistencia Real %,${dateHeaders}\n`;
      
      rows = filteredStudents.map(s => {
        const rate = calculateStudentRate(s, classDays);
        const groupName = groups.find(g => g.id === s.groupId)?.name || 'Sin Grupo';
        
        const dateValues = pastClassDays.map(d => {
          const record = s.attendanceHistory.find(h => h.date === d);
          return `${getStatusLabel(record?.catechism)},${getStatusLabel(record?.mass)}`;
        }).join(',');
        
        return `${sanitize(s.name)},${sanitize(groupName)},${sanitize(s.school)},${rate}%,${dateValues}`;
      }).join('\n');
    } else {
      // Dynamic Headers for Catechists: Basic Info + (Date Cat, Date Mass) for classes + (Date Event) for events
      const classDateHeaders = pastClassDays.map(d => `${sanitize(d)} (Cat),${sanitize(d)} (Misa)`).join(',');
      const eventDateHeaders = pastEvents.map(e => `${sanitize(e.date)} (${sanitize(e.title)})`).join(',');
      
      headers = `Nombre,Grupo,Asistencia Total %,Email,${classDateHeaders}${eventDateHeaders ? ',' + eventDateHeaders : ''}\n`;
      
      rows = filteredCatechists.map(c => {
        const rate = calculateCatechistRate(c, classDays, events);
        const groupName = groups.find(g => g.id === c.assignedGroupId)?.name || 'Sin Grupo';
        
        const classDateValues = pastClassDays.map(d => {
          const record = c.attendanceHistory?.find(h => h.date === d && h.type === 'class');
          return `${getStatusLabel(record?.catechism)},${getStatusLabel(record?.mass)}`;
        }).join(',');

        const eventDateValues = pastEvents.map(e => {
          const record = c.attendanceHistory?.find(h => h.refId === e.id && h.type === 'event');
          return getStatusLabel(record?.status);
        }).join(',');
        
        return `${sanitize(c.name)},${sanitize(groupName)},${rate}%,${sanitize(c.email)},${classDateValues}${eventDateValues ? ',' + eventDateValues : ''}`;
      }).join('\n');
    }

    const csvContent = headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      let data;
      if (reportType === 'students') {
        data = await generateAttendanceReport(filteredStudents);
      } else {
        data = await generateCatechistReport(filteredCatechists, classDays, events);
      }
      setReport(data);
    } catch (error) {
      console.error(error);
      alert("Error al generar el informe con IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex gap-4 items-center">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            {reportType === 'students' ? <Users size={24} /> : <Briefcase size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Analítica Parroquial</h2>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => { setReportType('students'); setReport(null); }}
                className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${reportType === 'students' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                Catecúmenos
              </button>
              {currentUser.role === 'coordinator' && (
                <button 
                  onClick={() => { setReportType('catechists'); setReport(null); }}
                  className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${reportType === 'catechists' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  Equipo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {reportType === 'students' && currentUser.role === 'coordinator' && (
            <div className="relative">
              <select 
                className="appearance-none pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={selectedGroupId}
                onChange={(e) => { setSelectedGroupId(e.target.value); setReport(null); }}
              >
                <option value="all">Todos los Niños</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <Search size={14} />
              </div>
            </div>
          )}
          
          <button 
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold rounded-xl transition-all text-sm shadow-sm"
          >
            <Download size={18} />
            Descargar CSV
          </button>

          <button 
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 text-sm"
          >
            {isGenerating ? <RefreshCcw size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isGenerating ? 'Analizando...' : 'Generar Informe IA'}
          </button>
        </div>
      </div>

      {report ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <FileText size={120} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6 border-b pb-4 relative z-10">
                <FileText className="text-indigo-600" size={20} />
                Evaluación Pastoral {reportType === 'students' ? 'de Catecúmenos' : 'del Equipo'}
              </h3>
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap relative z-10">{report.summary}</p>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                <Lightbulb className="text-amber-500" size={20} />
                Recomendaciones Estratégicas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.recommendations.map((rec: string, i: number) => (
                  <div key={i} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-4 hover:border-indigo-100 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">{i + 1}</div>
                    <p className="text-sm text-slate-700 leading-snug">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="bg-indigo-700 p-6 rounded-2xl text-white shadow-xl">
              <h4 className="font-bold text-lg mb-2">Sobre este informe</h4>
              <p className="text-indigo-100 text-sm leading-relaxed mb-4">
                Este análisis ha sido generado utilizando inteligencia artificial avanzada para identificar patrones de asistencia que podrían pasar desapercibidos.
              </p>
              <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                <p className="text-xs italic">
                  "Formar personas libres, cristianas y con criterios responsables."
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200 py-32 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-indigo-50 text-indigo-200 rounded-full flex items-center justify-center mb-6">
            <Sparkles size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-800">Análisis con Inteligencia Artificial</h3>
          <p className="text-slate-500 mt-2 max-w-md">Pulsa el botón para generar un informe pastoral basado en los datos actuales o descarga el CSV para gestión manual.</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
