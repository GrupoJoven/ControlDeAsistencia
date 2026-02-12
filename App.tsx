
import { supabase } from "./src/lib/supabaseClient";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  BarChart3, 
  LogOut, 
  Mail, 
  Plus, 
  Search,
  CheckCircle2,
  User as UserIcon,
  Church,
  ShieldCheck,
  Settings,
  CalendarDays,
  Briefcase,
  Key,
  Menu,
  X
} from 'lucide-react';
import { Student, AttendanceRecord, User, Group, ParishEvent, getTodayStr, AttendanceStatus, CatechistAttendanceRecord } from './types';
import Dashboard from './components/Dashboard';
import AttendanceTracker from './components/AttendanceTracker';
import StudentList from './components/StudentList';
import Reports from './components/Reports';
import Login from './components/Login';
import GroupManager from './components/GroupManager';
import ClassDayManager from './components/ClassDayManager';
import CatechistManager from './components/CatechistManager';
import CatechistAttendance from './components/CatechistAttendance';


type View = 'dashboard' | 'attendance' | 'students' | 'coordinator-groups' | 'coordinator-edit-groups' | 'agenda' | 'reports' | 'class-days' | 'catechists' | 'catechist-attendance' | 'account' | 'my-account';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<ParishEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [classDays, setClassDays] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  type GroupCatechistLink = { group_id: string; profile_id: string };

  const [groupCatechistLinks, setGroupCatechistLinks] = useState<GroupCatechistLink[]>([]);

  // Para catequistas con varios grupos: cuál está “activo” en la UI
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);


  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, name, role, birth_date")
        .eq("id", sessionUser.id)
        .single();

      if (error || !profile) return;

      const appUser: User = {
        id: profile.id,
        name: profile.name ?? "",
        email: sessionUser.email ?? "",
        role: profile.role,
        birthDate: profile.birth_date ? String(profile.birth_date) : "",
      };

      setCurrentUser(appUser);
      await loadBaseData(appUser);
    };

    void boot();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
  
    if (error) {
      alert(error.message);
      return;
    }
  
    const userId = data.user?.id;
    if (!userId) {
      alert("Login correcto, pero no se pudo obtener el id del usuario.");
      return;
    }
  
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, role, birth_date")
      .eq("id", userId)
      .single();
  
    if (profileError) {
      alert(
        "Login correcto, pero no se pudo cargar el perfil: " +
          profileError.message
      );
      return;
    }
  
    const appUser: User = {
      id: profile.id,
      name: profile.name ?? "",
      email: data.user?.email ?? email,
      role: profile.role,
    };
  
    try {
      setCurrentUser(appUser);
      await loadBaseData(appUser);
      setCurrentView("dashboard");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Error cargando datos");
      setCurrentUser(null);
    }
  };


  const getUserGroupIds = (userId: string) =>
    groupCatechistLinks
      .filter(l => l.profile_id === userId)
      .map(l => l.group_id);


  const loadBaseData = async (user: User) => {
    const signMediaUrl = async (path?: string | null) => {
      if (!path) return "";
      const { data, error } = await supabase.storage
        .from("media")
        .createSignedUrl(path, 60 * 60); // 1 hora
      if (error || !data?.signedUrl) return "";
      return data.signedUrl;
    };

    // --- groups ---
    const { data: groupsData, error: groupsErr } = await supabase
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true });
    if (groupsErr) throw new Error("groups: " + groupsErr.message);

    const { data: linksData, error: linksErr } = await supabase
      .from("group_catechist")
      .select("group_id, profile_id");

    if (linksErr) throw new Error("group_catechist: " + linksErr.message);

    const links = (linksData ?? []) as GroupCatechistLink[];
    setGroupCatechistLinks(links);

    const groupsMapped: Group[] = (groupsData ?? []).map(g => ({
      id: g.id,
      name: g.name,
      catechistIds: [], // si luego lo quieres rellenar, lo hacemos con profiles
    }));
    setGroups(groupsMapped);

    const myGroupIds = links
      .filter(l => l.profile_id === user.id)
      .map(l => l.group_id);

    // si todavía no hay activeGroupId o ya no existe, elige el primero
    setActiveGroupId(prev => (prev && myGroupIds.includes(prev) ? prev : (myGroupIds[0] ?? null)));






    // --- profiles (users) ---
    const { data: profData, error: profErr } = await supabase
      .from("profiles")
      .select("id, name, email, role, birth_date, photo_path")
      .order("name", { ascending: true });
    if (profErr) throw new Error("profiles: " + profErr.message);

    const usersMapped: User[] = await Promise.all((profData ?? []).map(async (p: any) => ({
      id: p.id,
      name: p.name ?? "",
      email: p.email ?? "",
      role: p.role,
      birthDate: p.birth_date ? String(p.birth_date).slice(0, 10) : "",
      photo: await signMediaUrl(p.photo_path), // aquí va la URL firmada
      attendanceHistory: [],
    })));


    // Si NO eres coordinator, quédate solo con tu perfil (evita exponer datos innecesarios)
    const usersScoped = user.role === "coordinator"
      ? usersMapped
      : usersMapped.filter(u => u.id === user.id);

    // --- students ---
    const { data: studentsData, error: studentsErr } = await supabase
      .from("students")
      .select("id, name, email, parent_email, school, birth_date, group_id, photo_path");
    if (studentsErr) throw new Error("students: " + studentsErr.message);

    // --- student_attendance ---
    const { data: studAttData, error: studAttErr } = await supabase
      .from("student_attendance")
      .select("student_id, date, catechism, mass");
    if (studAttErr) throw new Error("student_attendance: " + studAttErr.message);

    const attendanceByStudent = new Map<string, AttendanceRecord[]>();
    for (const r of studAttData ?? []) {
      const rec: AttendanceRecord = {
        date: String(r.date),
        catechism: r.catechism as any,
        mass: r.mass as any,
      };
      const arr = attendanceByStudent.get(r.student_id) ?? [];
      arr.push(rec);
      attendanceByStudent.set(r.student_id, arr);
    }

    const studentsMapped: Student[] = await Promise.all((studentsData ?? []).map(async (s: any) => ({
      id: s.id,
      name: s.name,
      email: s.email ?? "",
      parentEmail: s.parent_email ?? "",
      school: s.school ?? "",
      birthDate: s.birth_date ? String(s.birth_date).slice(0, 10) : "",
      groupId: s.group_id ?? "",
      photo: await signMediaUrl(s.photo_path),
      attendanceHistory: attendanceByStudent.get(s.id) ?? [],
    })));

    setStudents(studentsMapped);

    // --- parish_events ---
    const { data: eventsData, error: eventsErr } = await supabase
      .from("parish_events")
      .select("id, title, date")
      .order("date", { ascending: true });
    if (eventsErr) throw new Error("parish_events: " + eventsErr.message);

    setEvents((eventsData ?? []).map(e => ({
      id: e.id,
      title: e.title,
      date: String(e.date),
    })));

    // --- class_days ---
    const { data: classDaysData, error: classDaysErr } = await supabase
      .from("class_days")
      .select("date")
      .order("date", { ascending: true });
    if (classDaysErr) throw new Error("class_days: " + classDaysErr.message);

    setClassDays((classDaysData ?? []).map(d => String(d.date)));

    // --- catechist_attendance (solo si coordinator, o para el propio usuario) ---
    const { data: catAttData, error: catAttErr } = await supabase
      .from("catechist_attendance")
      .select("profile_id, date, type, ref_id, catechism, mass, status, id");
    if (catAttErr) throw new Error("catechist_attendance: " + catAttErr.message);

    const catAttendanceByProfile = new Map<string, CatechistAttendanceRecord[]>();
    for (const r of catAttData ?? []) {
      const rec: CatechistAttendanceRecord = {
        date: String(r.date),
        type: r.type as any,
        refId: r.ref_id ?? undefined,
        status: (r.status as any) ?? undefined,
        catechism: (r.catechism as any) ?? undefined,
        mass: (r.mass as any) ?? undefined,
        // si tu tipo tiene status en event, lo ajustamos luego
      };
      const arr = catAttendanceByProfile.get(r.profile_id) ?? [];
      arr.push(rec);
      catAttendanceByProfile.set(r.profile_id, arr);
    }

    const usersWithAttendance = usersScoped.map(u => ({
      ...u,
      attendanceHistory: catAttendanceByProfile.get(u.id) ?? [],
    }));
    setUsers(usersWithAttendance);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setStudents([]);
    setGroups([]);
    setUsers([]);
    setEvents([]);
    setClassDays([]);
  };


  const navigateTo = (view: View) => {
    setCurrentView(view);
    setIsSidebarOpen(false);
    setSearchQuery(''); // Reset search when switching views
  };

  const isSearchView = ['students', 'coordinator-groups', 'catechists'].includes(currentView);

  const updateStudentAttendance = async (
    studentId: string,
    type: "catechism" | "mass",
    status: AttendanceStatus
  ) => {
    const today = getTodayStr();

    // 1) lee el estado actual local para no pisar el otro campo
    const s = students.find(x => x.id === studentId);
    const existing = s?.attendanceHistory?.find(h => h.date === today);

    const next = {
      student_id: studentId,
      date: today,
      catechism: type === "catechism" ? status : (existing?.catechism ?? "absent"),
      mass: type === "mass" ? status : (existing?.mass ?? "absent"),
    };

    const { error } = await supabase
      .from("student_attendance")
      .upsert(next, { onConflict: "student_id,date" });

    if (error) {
      alert("Error guardando asistencia: " + error.message);
      return;
    }

    // 2) actualiza estado local (optimista)
    setStudents(prev =>
      prev.map(st => {
        if (st.id !== studentId) return st;
        const history = [...(st.attendanceHistory ?? [])];
        const idx = history.findIndex(h => h.date === today);
        if (idx >= 0) history[idx] = { date: today, catechism: next.catechism as any, mass: next.mass as any };
        else history.push({ date: today, catechism: next.catechism as any, mass: next.mass as any });
        return { ...st, attendanceHistory: history };
      })
    );
  };


  const updateCatechistAttendance = async (
    profileId: string,
    type: "class" | "event",
    status: AttendanceStatus,
    refId?: string,
    subType?: "catechism" | "mass"
  ) => {
    const date = refId
      ? (events.find(e => e.id === refId)?.date || getTodayStr())
      : getTodayStr();

    const payload: any = {
      profile_id: profileId,
      date,
      type,
      ref_id: refId ?? null,
    };

    if (type === "event") {
      payload.status = status;
      payload.catechism = null;
      payload.mass = null;
    } else {
      payload.status = null;
      if (subType === "catechism") payload.catechism = status;
      if (subType === "mass") payload.mass = status;
    }

    const { error } = await supabase
      .from("catechist_attendance")
      .upsert(payload, { onConflict: "profile_id,date,type,ref_id" });

    if (error) {
      alert("Error guardando asistencia catequista: " + error.message);
      return;
    }

    // refresco simple (luego optimizamos si quieres)
    await loadBaseData(currentUser!);
  };


  const setUserGroups = async (userId: string, groupIds: string[]) => {
    const current = getUserGroupIds(userId);
    const next = Array.from(new Set(groupIds)); // dedup

    const toAdd = next.filter(gid => !current.includes(gid));
    const toRemove = current.filter(gid => !next.includes(gid));

    // 1) borrar
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("group_catechist")
        .delete()
        .eq("profile_id", userId)
        .in("group_id", toRemove);

      if (error) {
        alert("Error actualizando grupos (delete): " + error.message);
        return;
      }
    }

    // 2) insertar
    if (toAdd.length > 0) {
      const rows = toAdd.map(gid => ({ profile_id: userId, group_id: gid }));
      const { error } = await supabase
        .from("group_catechist")
        .insert(rows);

      if (error) {
        alert("Error actualizando grupos (insert): " + error.message);
        return;
      }
    }

    // 3) estado local (instantáneo)
    setGroupCatechistLinks(prev => {
      const kept = prev.filter(l => !(l.profile_id === userId && toRemove.includes(l.group_id)));
      const added = toAdd.map(gid => ({ profile_id: userId, group_id: gid }));
      return [...kept, ...added];
    });

    // 4) si el usuario editado es el currentUser y su activeGroupId ya no está, ajusta
    if (currentUser?.id === userId) {
      setActiveGroupId(prev => (prev && next.includes(prev) ? prev : (next[0] ?? null)));
    }
  };


  const updateStudent = async (updatedStudent: Student) => {
    // 1) actualizar datos del alumno (students)
    const payload = {
      name: updatedStudent.name,
      email: updatedStudent.email || null,
      parent_email: updatedStudent.parentEmail || null,
      school: updatedStudent.school || null,
      birth_date: updatedStudent.birthDate || null,
      group_id: updatedStudent.groupId || null,
      // ojo: photo si lo guardas en tabla; si NO tienes columna, no lo envíes
      // photo: updatedStudent.photo || null,
    };

    const { data: sData, error: sErr } = await supabase
      .from("students")
      .update(payload)
      .eq("id", updatedStudent.id)
      .select("id, name, email, parent_email, school, birth_date, group_id")
      .single();

    if (sErr) {
      alert("Error al actualizar catecúmeno: " + sErr.message);
      return;
    }

    // 2) persistir asistencia (student_attendance)
    //    pk compuesta (student_id, date) -> upsert ideal
    const rows = (updatedStudent.attendanceHistory ?? []).map(r => ({
      student_id: updatedStudent.id,
      date: r.date,
      catechism: r.catechism,
      mass: r.mass,
    }));

    if (rows.length > 0) {
      const { error: aErr } = await supabase
        .from("student_attendance")
        .upsert(rows, { onConflict: "student_id,date" });

      if (aErr) {
        alert("Alumno actualizado, pero error guardando asistencia: " + aErr.message);
        // seguimos, porque el alumno ya está actualizado
      }
    }

    // 3) reflejar en estado local (incluyendo tempHistory)
    setStudents(prev =>
      prev.map(s =>
        s.id === updatedStudent.id
          ? {
              ...s,
              name: sData.name,
              email: sData.email ?? "",
              parentEmail: sData.parent_email ?? "",
              school: sData.school ?? "",
              birthDate: sData.birth_date ? String(sData.birth_date) : "",
              groupId: sData.group_id ?? "",
              attendanceHistory: updatedStudent.attendanceHistory ?? [],
              photo: updatedStudent.photo, // solo si lo usas local; si lo migras, lo cambiamos
            }
          : s
      )
    );
  };


  const addStudent = async (newStudent: Student) => {
    const payload = {
      name: newStudent.name,
      email: newStudent.email || null,
      parent_email: newStudent.parentEmail || null,
      school: newStudent.school || null,
      birth_date: newStudent.birthDate || null,
      group_id: newStudent.groupId || null,
    };

    const { data, error } = await supabase
      .from("students")
      .insert(payload)
      .select("id, name, email, parent_email, school, birth_date, group_id")
      .single();

    if (error) {
      alert("Error al crear catecúmeno: " + error.message);
      return;
    }

    const created: Student = {
      id: data.id,
      name: data.name,
      email: data.email ?? "",
      parentEmail: data.parent_email ?? "",
      school: data.school ?? "",
      birthDate: data.birth_date ? String(data.birth_date) : "",
      groupId: data.group_id ?? "",
      attendanceHistory: [], // historial vive en student_attendance
    };

    setStudents(prev => [...prev, created]);
  };

  const removeStudent = async (id: string) => {
    const { error } = await supabase.from("students").delete().eq("id", id);

    if (error) {
      alert("Error al eliminar catecúmeno: " + error.message);
      return;
    }

    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const updateUser = async (updatedUser: User) => {
    const birth = updatedUser.birthDate?.slice(0, 10) || null;

    const payload = {
      name: updatedUser.name,
      birth_date: birth,
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", updatedUser.id)
      .select("id, birth_date");

    console.log("error", error);
    console.log("data", data);

    if (error) {
      alert("Error actualizando perfil: " + error.message);
      return;
    }

    console.log("update ok, retorno:", data); // puede ser null si RLS impide el select

    await loadBaseData(currentUser!);
  };


  const addUser = async (input: { name: string; email: string; password: string; birthDate?: string; groupIds: string[] }) => {
    const payload = {
      email: input.email,
      password: input.password,
      name: input.name,
      birth_date: input.birthDate ?? null,
      group_ids: input.groupIds ?? [],   // <-- CLAVE
    };

    const res = await supabase.functions.invoke("create-catechist", { body: payload });

    if (res.error) {
      let extra = "";
      const anyErr: any = res.error;

      if (anyErr?.context instanceof Response) {
        try {
          const txt = await anyErr.context.text();
          extra = txt ? ` | body: ${txt}` : "";
        } catch (e) {
          extra = ` | (no pude leer body: ${String(e)})`;
        }
      }

      alert(`Error creando catequista: ${res.error.name} - ${res.error.message}${extra}`);
      return;
    }

    const newUserId = (res.data as any)?.userId || (res.data as any)?.id;
    if (!newUserId) {
      alert("Usuario creado, pero no recibí su id desde create-catechist.");
      await loadBaseData(currentUser!);
      return;
    }

    // Ya no insertamos en group_catechist aquí: lo hace la Edge Function
    // Si la Edge devuelve warn, lo mostramos:
    const warn = (res.data as any)?.warn;
    if (warn) alert("Usuario creado con aviso: " + warn);

    await loadBaseData(currentUser!);
  };




  const removeUser = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: id },
    });

    if (error) {
      alert("Error eliminando catequista: " + (error.message ?? "unknown"));
      return;
    }

    await loadBaseData(currentUser!);
  };

  const updateGroup = async (updatedGroup: Group) => {
    const { data, error } = await supabase
      .from("groups")
      .update({ name: updatedGroup.name })
      .eq("id", updatedGroup.id)
      .select("id, name")
      .single();

    if (error) {
      alert("Error actualizando grupo: " + error.message);
      return;
    }

    setGroups(prev => prev.map(g => (g.id === data.id ? { ...g, name: data.name } : g)));
  };

  const addGroup = async (name: string) => {
    const { data, error } = await supabase
      .from("groups")
      .insert({ name })
      .select("id, name")
      .single();

    if (error) {
      alert("Error creando grupo: " + error.message);
      return;
    }

    setGroups(prev => [...prev, { id: data.id, name: data.name, catechistIds: [] }]);
  };


  const resetPassword = async (userId: string, newPassword: string) => {
    const { error } = await supabase.functions.invoke("reset-password", {
      body: { userId, newPassword },
    });

    if (error) {
      alert("Error reseteando contraseña: " + (error.message ?? "unknown"));
      return;
    }

    alert("Contraseña reseteada correctamente.");
  };


  const removeGroup = async (groupId: string) => {
    const { count, error: countErr } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId);

    if (countErr) {
      alert("Error comprobando alumnos del grupo: " + countErr.message);
      return;
    }

    if ((count ?? 0) > 0) {
      alert("No puedes eliminar este grupo porque tiene alumnos asignados. Muévelos antes a otro grupo.");
      return;
    }

    // borrar links
    const { error: linkErr } = await supabase
      .from("group_catechist")
      .delete()
      .eq("group_id", groupId);

    if (linkErr) {
      alert("Error desasignando catequistas del grupo: " + linkErr.message);
      return;
    }

    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) {
      alert("Error eliminando grupo: " + error.message);
      return;
    }

    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupCatechistLinks(prev => prev.filter(l => l.group_id !== groupId));
    setActiveGroupId(prev => (prev === groupId ? null : prev));
  };

  const myGroups = useMemo(() => {
    if (!currentUser) return [];
    const myIds = new Set(
      groupCatechistLinks
        .filter(l => l.profile_id === currentUser.id)
        .map(l => l.group_id)
    );
    return groups
      .filter(g => myIds.has(g.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [currentUser, groups, groupCatechistLinks]);

  const groupsWithCatechists = useMemo(() => {
    const byGroup = new Map<string, string[]>();

    for (const l of groupCatechistLinks) {
      const arr = byGroup.get(l.group_id) ?? [];
      arr.push(l.profile_id);
      byGroup.set(l.group_id, arr);
    }

    return groups.map(g => ({
      ...g,
      catechistIds: byGroup.get(g.id) ?? [],
    }));
  }, [groups, groupCatechistLinks]);


  const addEvent = async (event: { title: string; date: string }) => {
    const { data, error } = await supabase
      .from("parish_events")
      .insert({ title: event.title, date: event.date })
      .select("id, title, date")
      .single();

    if (error) {
      alert("Error al añadir evento: " + error.message);
      return;
    }

    setEvents(prev => [...prev, { id: data.id, title: data.title, date: String(data.date) }]);
  };

  const setCatechistInGroup = async (profileId: string, groupId: string, assign: boolean) => {
    if (assign) {
      const { error } = await supabase
        .from("group_catechist")
        .insert({ profile_id: profileId, group_id: groupId });

      if (error) {
        alert("Error asignando catequista: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("group_catechist")
        .delete()
        .eq("profile_id", profileId)
        .eq("group_id", groupId);

      if (error) {
        alert("Error desasignando catequista: " + error.message);
        return;
      }
    }

    await loadBaseData(currentUser!);
  };

  const removeEvent = async (id: string) => {
    const { error } = await supabase
      .from("parish_events")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Error al eliminar evento: " + error.message);
      return;
    }

    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const toggleClassDay = async (date: string) => {
    const exists = classDays.includes(date);

    if (!exists) {
      const { error } = await supabase
        .from("class_days")
        .insert({ date });

      if (error) {
        alert("Error al añadir día lectivo: " + error.message);
        return;
      }

      setClassDays(prev => [...prev, date].sort());
      return;
    }

    const { error } = await supabase
      .from("class_days")
      .delete()
      .eq("date", date);

    if (error) {
      alert("Error al quitar día lectivo: " + error.message);
      return;
    }

    setClassDays(prev => prev.filter(d => d !== date));
  };


  const myCatecumenos = useMemo(() => {
    if (!currentUser) return [];
    if (!activeGroupId) return [];

    return students
      .filter(s =>
        s.groupId === activeGroupId &&
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
  }, [students, currentUser, activeGroupId, searchQuery]);


  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
  }, [users, searchQuery]);


  const currentGroupName = useMemo(
    () => groups.find(g => g.id === activeGroupId)?.name || '',
    [activeGroupId, groups]
  );


  const hasAnyGroupAssigned = useMemo(() => {
    if (!currentUser) return false;
    return groupCatechistLinks.some(l => l.profile_id === currentUser.id);
  }, [currentUser, groupCatechistLinks]);

  const myGroupIds = useMemo(() => {
    if (!currentUser) return [];
    return groupCatechistLinks
      .filter(l => l.profile_id === currentUser.id)
      .map(l => l.group_id);
  }, [currentUser, groupCatechistLinks]);

  const activeGroupStudents = useMemo(() => {
    if (!activeGroupId) return [];
    return students.filter(s => s.groupId === activeGroupId);
  }, [students, activeGroupId]);

  const showNoGroupWarning = !!currentUser && !hasAnyGroupAssigned;
  const showNoStudentsWarning = !!currentUser && hasAnyGroupAssigned && !!activeGroupId && activeGroupStudents.length === 0;

  const warningMessage = useMemo(() => {
    if (showNoGroupWarning) {
      return "No tienes ningún grupo asignado. Contacta con el coordinador si crees que se trata de un error.";
    }
    if (showNoStudentsWarning) {
      const name = currentGroupName || "tu grupo";
      return `En tu grupo [${name}] no hay ningún niño/a asignado. Contacta con el coordinador si crees que se trata de un error.`;
    }
    return "";
  }, [showNoGroupWarning, showNoStudentsWarning, currentGroupName]);




  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 transform
        lg:translate-x-0 lg:static lg:inset-auto
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-indigo-700 font-bold text-xl leading-tight">
            <div className="p-2 bg-indigo-100 rounded-lg"><Church size={24} /></div>
            <div><p>San Pascual Baylón</p><p className="text-sm font-medium text-slate-400">Valencia</p></div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-6">
          <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">General</div>
          <button onClick={() => navigateTo('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><BarChart3 size={20} /><span className="font-medium text-sm">Resumen</span></button>

          <div className="mt-4 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mi Grupo</div>
          <button onClick={() => navigateTo('attendance')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'attendance' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><CheckCircle2 size={20} /><span className="font-medium text-sm">Pasar Lista</span></button>
          <button onClick={() => navigateTo('students')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'students' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Users size={20} /><span className="font-medium text-sm">Mis Catecúmenos</span></button>

          {currentUser.role === 'coordinator' && (
            <>
              <div className="mt-4 px-4 py-2 text-[10px] font-bold text-amber-600 uppercase tracking-widest">Coordinación</div>
              <button onClick={() => navigateTo('coordinator-groups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'coordinator-groups' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><ShieldCheck size={20} /><span className="font-medium text-sm">Todos los Niños</span></button>
              <button onClick={() => navigateTo('catechists')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'catechists' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><Briefcase size={20} /><span className="font-medium text-sm">Registro Catequistas</span></button>
              <button onClick={() => navigateTo('catechist-attendance')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'catechist-attendance' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><CheckCircle2 size={20} /><span className="font-medium text-sm">Asistencia Equipo</span></button>
              <button onClick={() => navigateTo('coordinator-edit-groups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'coordinator-edit-groups' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><Settings size={20} /><span className="font-medium text-sm">Editar Grupos</span></button>
              <button onClick={() => navigateTo('class-days')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'class-days' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><CalendarDays size={20} /><span className="font-medium text-sm">Calendario Escolar</span></button>
              <button onClick={() => navigateTo('agenda')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'agenda' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}><Calendar size={20} /><span className="font-medium text-sm">Gestión Agenda</span></button>
            </>
          )}

          <div className="mt-4 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Análisis</div>
          <button onClick={() => navigateTo('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'reports' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={20} /><span className="font-medium text-sm">Informes IA</span></button>
          
          <div className="mt-4 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta y Seguridad</div>
          <button onClick={() => navigateTo('account')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'account' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Key size={20} /><span className="font-medium text-sm">Seguridad</span></button>
          <button
            onClick={() => navigateTo('my-account')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'my-account'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <UserIcon size={20} />
            <span className="font-medium text-sm">Cuenta</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 overflow-hidden">
              {currentUser.photo ? <img src={currentUser.photo} className="w-full h-full object-cover" /> : <UserIcon size={18} />}
            </div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{currentUser.name}</p><p className="text-xs text-slate-500 truncate capitalize">{currentUser.role}</p></div>
            {/* Fix: removed invalid handleLogout attribute and moved onClick to the button */}
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto w-full">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 lg:px-8 py-3 lg:py-4 flex items-center justify-between min-h-[64px]">
          <div className="flex items-center gap-3 lg:gap-4 flex-1 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-[15px] sm:text-lg lg:text-xl font-semibold text-slate-800 leading-tight line-clamp-2 max-h-[3rem]">
              {currentView === 'dashboard' && 'Dashboard Parroquial'}
              {currentView === 'attendance' && 'Control de Asistencia'}
              {currentView === 'students' && (currentGroupName || 'Mis Catecúmenos')}
              {currentView === 'reports' && 'Informes pastorales con IA'}
              {currentView === 'coordinator-groups' && 'Gestión Integral de Niños'}
              {currentView === 'catechists' && 'Registro de Catequistas'}
              {currentView === 'catechist-attendance' && 'Asistencia del Equipo'}
              {currentView === 'coordinator-edit-groups' && 'Administración de Grupos'}
              {currentView === 'agenda' && 'Planificador de Eventos'}
              {currentView === 'class-days' && 'Calendario de Días Lectivos'}
              {currentView === 'account' && 'Seguridad de la Cuenta'}
              {currentView === 'my-account' && 'Mi Cuenta'}
            </h1>
            <div>
              {myGroups.length > 1 && (
                <select
                  className="px-3 py-2 bg-slate-100 rounded-xl text-sm"
                  value={activeGroupId ?? ""}
                  onChange={(e) => setActiveGroupId(e.target.value || null)}
                >
                  {myGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-4 ml-4">
            {isSearchView && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar..." className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500 w-48 lg:w-64 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            )}
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {isSearchView && (
            <div className="sm:hidden mb-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          )}

          {currentView === 'dashboard' && <Dashboard students={students} events={events} onManageAgenda={currentUser.role === 'coordinator' ? () => setCurrentView('agenda') : undefined} classDays={classDays} />}
          {currentView === 'attendance' && (
            <AttendanceTracker
              students={myCatecumenos}
              onUpdate={updateStudentAttendance}
              classDays={classDays}
              warningMessage={warningMessage}
              warningType={showNoGroupWarning ? "no-group" : showNoStudentsWarning ? "no-students" : undefined}
            />
          )}

          {currentView === 'students' && (
            <StudentList
              students={myCatecumenos}
              onUpdateStudent={(s) => void updateStudent(s)}
              groups={groups}
              canEditCenso={false}
              classDays={classDays}
              warningMessage={warningMessage}
              warningType={showNoGroupWarning ? "no-group" : showNoStudentsWarning ? "no-students" : undefined}
            />
          )}

          {currentView === 'coordinator-groups' && (
            <StudentList
              students={students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))}
              onUpdateStudent={(s) => void updateStudent(s)}
              canEditCenso={true}
              onAddStudent={(s) => void addStudent(s)}
              onRemoveStudent={(id) => void removeStudent(id)}
              groups={groups}
              classDays={classDays}
            />
          )}

          {currentView === 'catechists' && currentUser.role === 'coordinator' && (
            <CatechistManager
              users={users}
              filteredUsers={filteredUsers}
              onAddUser={(u) => addUser(u)}
              onRemoveUser={(id) => { void removeUser(id); }}
              onUpdateUser={updateUser}
              onSetUserGroups={(uid, gids) => setUserGroups(uid, gids)}
              getUserGroupIds={(uid) => getUserGroupIds(uid)}
              groups={groups}
              classDays={classDays}
              events={events}
              onResetPassword={(uid, pw) => resetPassword(uid, pw)}
            />
          )}

          {currentView === 'catechist-attendance' && currentUser.role === 'coordinator' && <CatechistAttendance users={users.filter(u => u.role === 'catechist' || u.role === 'coordinator')} events={events} classDays={classDays} onUpdate={updateCatechistAttendance} />}
          {currentView === 'coordinator-edit-groups' && (
            <GroupManager
              groups={groupsWithCatechists}
              students={students}
              users={users}
              onUpdateGroup={(g) => void updateGroup(g)}
              onUpdateStudent={(s) => void updateStudent(s)}
              onAssignCatechist={(uid, gid, assign) => void setCatechistInGroup(uid, gid, assign)}
            />
          )}

          {currentView === 'class-days' && currentUser.role === 'coordinator' && (
            <ClassDayManager
              classDays={classDays}
              onToggle={(d) => void toggleClassDay(d)}
            />
          )}
          {currentView === 'agenda' && currentUser.role === 'coordinator' && (
            <AgendaManager
              events={events}
              onAdd={(e) => void addEvent(e)}
              onRemove={(id) => void removeEvent(id)}
            />
          )}
          {currentView === 'reports' && <Reports students={students} currentUser={currentUser} groups={groups} classDays={classDays} users={users} events={events} />}
          {currentView === 'account' && <AccountSettings user={currentUser} onUpdate={updateUser} />}
          {currentView === 'my-account' && <MyAccount user={currentUser} groups={groups} activeGroupId={activeGroupId} />}

        </div>
      </main>
    </div>
  );
};

const AccountSettings: React.FC<{ user: User, onUpdate: (u: User) => void }> = ({ user, onUpdate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const handleUpdatePassword = async () => {
    if (!newPassword) {
      alert("Por favor introduce una nueva contraseña.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Las contraseñas no coinciden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      alert("No se pudo actualizar la contraseña: " + error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    alert("Contraseña actualizada con éxito.");
  };


  return (
    <div className="max-w-md mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Key size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Seguridad</h2>
            <p className="text-slate-500 text-sm">Cambia tu contraseña de acceso.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Nueva Contraseña</label>
            <input 
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Confirmar Contraseña</label>
            <input 
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            onClick={() => void handleUpdatePassword()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-all mt-4"
          >
            Actualizar Contraseña
          </button>

        </div>
      </div>
    </div>
  );
};

const MyAccount: React.FC<{ user: User; groups: Group[]; activeGroupId: string | null }> = ({ user, groups, activeGroupId }) => {
  const groupName =
    groups.find(g => g.id === activeGroupId)?.name ||
    (user.role === 'coordinator' ? 'Coordinación' : 'Sin grupo');

  const birth = user.birthDate ? String(user.birthDate).slice(0, 10) : '';

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <UserIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Cuenta</h2>
            <p className="text-slate-500 text-sm">Información de tu perfil.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">
              Nombre
            </label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800">
              {user.name || '-'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">
              Grupo asignado
            </label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800">
              {groupName}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">
              Correo
            </label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800">
              {user.email || '-'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">
              Fecha de nacimiento
            </label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800">
              {birth || 'No registrada'}
            </div>
          </div>

          <div className="mt-6 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            <span className="font-bold">Aviso:</span> Para cualquier cambio, por favor ponte en contacto con el coordinador de tu nivel.
          </div>
        </div>
      </div>
    </div>
  );
};


const AgendaManager: React.FC<{ events: ParishEvent[], onAdd: (e: ParishEvent) => void, onRemove: (id: string) => void }> = ({ events, onAdd, onRemove }) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const handleAdd = () => {
    if (!newTitle || !newDate) return;
    onAdd({ title: newTitle, date: newDate } as any);
    setNewTitle('');
    setNewDate('');
  };
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Añadir Nuevo Evento</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <input type="text" placeholder="Título" className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <input type="date" className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button onClick={handleAdd} className="w-full sm:w-auto p-2 bg-indigo-600 text-white rounded-xl flex items-center justify-center"><Plus size={24} /></button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-6 border-b border-slate-100"><h3 className="font-bold text-slate-800">Eventos Activos</h3></div><div className="divide-y divide-slate-100">{events.map(event => (<div key={event.id} className="p-4 flex items-center justify-between hover:bg-slate-50"><div className="flex items-center gap-4"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Calendar size={18} /></div><div><p className="font-semibold text-slate-900">{event.title}</p><p className="text-xs text-slate-500">{new Date(event.date).toLocaleDateString()}</p></div></div><button onClick={() => onRemove(event.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Plus size={18} className="rotate-45" /></button></div>))}</div></div>
    </div>
  );
};

export default App;
