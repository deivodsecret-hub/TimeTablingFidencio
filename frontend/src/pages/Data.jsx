import React, { useState } from 'react';
import { storage, getCourseTeacherIds, getInitialCoursesWithTeachers, getDefaultStudents, getEneAbrStudents } from '../utils/storage';
import { INITIAL_COURSES, INITIAL_TEACHERS } from '../utils/initialData';
import { Plus, Trash2, Edit2, X, RefreshCw, Users } from 'lucide-react';
import AvailabilityGrid from '../components/AvailabilityGrid';
import Swal from 'sweetalert2';

const formatQuarter = (q) => (Number(q) === 0 ? 'Inmersión' : `${q}° Cuatrimestre`);
const formatQuarterShort = (q) => (Number(q) === 0 ? 'Inmersión' : `${q}° C`);

const syncTeachersAssignedCourses = (teachersList, coursesList) =>
    teachersList.map((t) => ({
        ...t,
        assignedCourses: coursesList
            .filter((c) => getCourseTeacherIds(c, teachersList).includes(t.id))
            .map((c) => c.id),
    }));

const Data = () => {
    const [activeTab, setActiveTab] = useState('teachers');
    const [teachers, setTeachers] = useState(() => storage.getTeachers());
    const [courses, setCourses] = useState(() => storage.getCourses());
    const [students, setStudents] = useState(() => storage.getStudents());

    // Cuatrimestres disponibles: 0 = Inmersión + 1° a 10°
    const cuatrimestres = Array.from({ length: 11 }, (_, i) => i);

    // Form states
    const [newTeacher, setNewTeacher] = useState({ name: '', role: 'PA', assignedCourses: [], availability: {} });
    const [newCourse, setNewCourse] = useState({ name: '', cuatrimestre: '', weekly_sessions: '', teacher_ids: [] });
    const [courseSearch, setCourseSearch] = useState('');
    const [showNewCourseTeachers, setShowNewCourseTeachers] = useState(false);

    // Edit states
    const [editingTeacher, setEditingTeacher] = useState(null);
    const [editingCourse, setEditingCourse] = useState(null);

    // Modal visibility states
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [showCourseModal, setShowCourseModal] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false);

    const persistTeachersAndCourses = (nextTeachers, nextCourses) => {
        const syncedTeachers = syncTeachersAssignedCourses(nextTeachers, nextCourses);
        storage.setCourses(nextCourses);
        setCourses(nextCourses);
        storage.setTeachers(syncedTeachers);
        setTeachers(syncedTeachers);
    };

    // Función para generar el siguiente ID automáticamente
    const getNextId = (items) => {
        if (items.length === 0) return 1;
        const maxId = Math.max(...items.map(item => item.id));
        return maxId + 1;
    };

    // Guardar cambios en alumnos por cuatrimestre
    const handleStudentChange = (cuatrimestre, value) => {
        const newStudents = { ...students, [cuatrimestre]: parseInt(value) || 0 };
        setStudents(newStudents);
        storage.setStudents(newStudents);
    };

    // Validation functions
    const validateTeacher = (teacher, isEdit = false) => {
        if (!teacher.name || !teacher.name.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Campos Requeridos',
                text: 'El nombre es obligatorio'
            });
            return false;
        }

        const duplicateName = teachers.find(t =>
            t.name.toLowerCase().trim() === teacher.name.toLowerCase().trim() &&
            (!isEdit || t.id !== teacher.id)
        );
        if (duplicateName) {
            Swal.fire({
                icon: 'error',
                title: 'Nombre Duplicado',
                text: `Ya existe un profesor con el nombre "${teacher.name}"`
            });
            return false;
        }

        return true;
    };

    const validateCourse = (course) => {
        if (!course.name || course.cuatrimestre === '' || course.cuatrimestre === null || !course.weekly_sessions) {
            Swal.fire({
                icon: 'error',
                title: 'Campos Requeridos',
                text: 'Nombre, cuatrimestre y sesiones por semana son obligatorios'
            });
            return false;
        }

        const cuatrimestre = parseInt(course.cuatrimestre, 10);
        if (cuatrimestre < 0 || cuatrimestre > 10 || isNaN(cuatrimestre)) {
            Swal.fire({
                icon: 'error',
                title: 'Cuatrimestre Inválido',
                text: 'Selecciona Inmersión o un cuatrimestre entre 1 y 10'
            });
            return false;
        }

        const weeklySessions = parseInt(course.weekly_sessions, 10);
        if (weeklySessions <= 0 || isNaN(weeklySessions)) {
            Swal.fire({
                icon: 'error',
                title: 'Sesiones Semanales Inválidas',
                text: 'Las sesiones por semana deben ser mayor a 0'
            });
            return false;
        }

        return true;
    };

    const handleAddTeacher = () => {
        if (!validateTeacher(newTeacher, false)) return;

        const newId = getNextId(teachers);
        const teacher = {
            ...newTeacher,
            id: newId,
            name: newTeacher.name.trim(),
            availability: newTeacher.availability || {}
        };

        // Agregar este profesor a teacher_ids sin borrar los demás profesores que ya imparten esa materia
        const updatedCourses = courses.map(c => {
            const currentIds = getCourseTeacherIds(c, teachers);
            if (newTeacher.assignedCourses.includes(c.id)) {
                const nextIds = currentIds.includes(newId) ? currentIds : [...currentIds, newId];
                return { ...c, teacher_ids: nextIds, teacher_id: nextIds[0] || null };
            }
            return { ...c, teacher_ids: currentIds, teacher_id: currentIds[0] || null };
        });

        const updatedTeachers = [...teachers, teacher];
        persistTeachersAndCourses(updatedTeachers, updatedCourses);

        setNewTeacher({ name: '', role: 'PA', assignedCourses: [], availability: {} });

        Swal.fire({
            icon: 'success',
            title: '¡Profesor Agregado!',
            text: `El profesor "${teacher.name}" ha sido agregado exitosamente`,
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleAddCourse = () => {
        if (!validateCourse(newCourse, false)) return;

        const newId = getNextId(courses);
        const selectedIds = (newCourse.teacher_ids || []).map((id) => parseInt(id, 10)).filter(Boolean);
        const updatedCourses = [...courses, {
            id: newId,
            name: newCourse.name.trim(),
            cuatrimestre: parseInt(newCourse.cuatrimestre, 10),
            weekly_sessions: parseInt(newCourse.weekly_sessions, 10),
            teacher_ids: selectedIds,
            teacher_id: selectedIds[0] || null
        }];
        persistTeachersAndCourses(teachers, updatedCourses);
        setNewCourse({ name: '', cuatrimestre: '', weekly_sessions: '', teacher_ids: [] });
        setShowNewCourseTeachers(false);

        Swal.fire({
            icon: 'success',
            title: '¡Materia Agregada!',
            text: `La materia "${newCourse.name}" ha sido agregada exitosamente`,
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleDelete = async (type, id) => {
        let itemName = '';
        let itemType = '';

        if (type === 'teachers') {
            const teacher = teachers.find(t => t.id === id);
            itemName = teacher?.name || 'este profesor';
            itemType = 'Profesor';
        } else if (type === 'courses') {
            const course = courses.find(c => c.id === id);
            itemName = course?.name || 'esta materia';
            itemType = 'Materia';
        }

        const result = await Swal.fire({
            title: '¿Estás seguro?',
            text: `Se eliminará ${itemType.toLowerCase()}: "${itemName}"`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        if (type === 'teachers') {
            const updatedTeachers = teachers.filter(t => t.id !== id);
            const updatedCourses = courses.map(c => {
                const nextIds = getCourseTeacherIds(c, teachers).filter(tid => tid !== id);
                const nextGroupTeachers = Array.isArray(c.group_teachers)
                    ? c.group_teachers.filter(tid => tid !== id)
                    : undefined;
                return {
                    ...c,
                    teacher_ids: nextIds,
                    teacher_id: nextIds[0] || null,
                    ...(nextGroupTeachers ? { group_teachers: nextGroupTeachers } : {})
                };
            });
            persistTeachersAndCourses(updatedTeachers, updatedCourses);
        } else if (type === 'courses') {
            const updatedCourses = courses.filter(c => c.id !== id);
            persistTeachersAndCourses(teachers, updatedCourses);
        }

        Swal.fire({
            icon: 'success',
            title: '¡Eliminado!',
            text: `${itemType} "${itemName}" ha sido eliminado exitosamente`,
            timer: 2000,
            showConfirmButton: false
        });
    };

    // Edit handlers for teachers
    const handleEditTeacher = (teacher) => {
        const assignedCourseIds = courses
            .filter(c => getCourseTeacherIds(c, teachers).includes(teacher.id))
            .map(c => c.id);

        setEditingTeacher({
            ...teacher,
            assignedCourses: assignedCourseIds,
            availability: teacher.availability || {}
        });
        setShowTeacherModal(true);
    };

    const handleSaveTeacher = () => {
        if (!validateTeacher(editingTeacher, true)) return;

        const updatedTeachers = teachers.map(t => t.id === editingTeacher.id ? {
            ...editingTeacher,
            name: editingTeacher.name.trim(),
        } : t);

        // Actualizar la membresía de este profesor en cada materia preservando a los demás profesores
        const updatedCourses = courses.map(c => {
            const currentIds = getCourseTeacherIds(c, teachers);
            const wantsCourse = editingTeacher.assignedCourses.includes(c.id);
            let nextIds = currentIds;
            if (wantsCourse && !currentIds.includes(editingTeacher.id)) {
                nextIds = [...currentIds, editingTeacher.id];
            } else if (!wantsCourse && currentIds.includes(editingTeacher.id)) {
                nextIds = currentIds.filter(tid => tid !== editingTeacher.id);
            }
            const nextGroupTeachers = Array.isArray(c.group_teachers)
                ? c.group_teachers.filter(tid => nextIds.includes(parseInt(tid, 10)))
                : undefined;
            return {
                ...c,
                teacher_ids: nextIds,
                teacher_id: nextIds[0] || null,
                ...(nextGroupTeachers !== undefined ? { group_teachers: nextGroupTeachers } : {})
            };
        });

        persistTeachersAndCourses(updatedTeachers, updatedCourses);
        setEditingTeacher(null);
        setShowTeacherModal(false);

        Swal.fire({
            icon: 'success',
            title: '¡Profesor Actualizado!',
            text: 'Los cambios han sido guardados exitosamente',
            timer: 2000,
            showConfirmButton: false
        });
    };

    // Edit handlers for courses (con soporte de múltiples profesores por materia)
    const handleEditCourse = (course) => {
        setEditingCourse({
            ...course,
            teacher_ids: getCourseTeacherIds(course, teachers),
        });
        setShowCourseModal(true);
    };

    const handleSaveCourse = () => {
        if (!validateCourse(editingCourse, true)) return;

        const nextTeacherIds = (editingCourse.teacher_ids || [])
            .map(id => parseInt(id, 10))
            .filter(Boolean);

        const updatedCourses = courses.map(c => {
            if (c.id !== editingCourse.id) return c;
            const nextGroupTeachers = Array.isArray(editingCourse.group_teachers)
                ? editingCourse.group_teachers.filter(tid => nextTeacherIds.includes(parseInt(tid, 10)))
                : undefined;
            return {
                ...editingCourse,
                name: editingCourse.name.trim(),
                teacher_ids: nextTeacherIds,
                teacher_id: nextTeacherIds[0] || null,
                ...(nextGroupTeachers !== undefined ? { group_teachers: nextGroupTeachers } : {}),
                cuatrimestre: parseInt(editingCourse.cuatrimestre, 10),
                weekly_sessions: parseInt(editingCourse.weekly_sessions, 10)
            };
        });

        persistTeachersAndCourses(teachers, updatedCourses);
        setEditingCourse(null);
        setShowCourseModal(false);

        Swal.fire({
            icon: 'success',
            title: '¡Materia Actualizada!',
            text: 'Profesores y configuración guardados exitosamente',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleCancelEdit = () => {
        setEditingTeacher(null);
        setEditingCourse(null);
        setShowTeacherModal(false);
        setShowCourseModal(false);
    };

    const handleResetCourses = async () => {
        const result = await Swal.fire({
            title: '¿Cargar materias predefinidas Sep–Dic 2026?',
            text: 'Esto restaurará el catálogo oficial ITIID con sus profesores asignados por materia.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, cargar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        const resetCourses = getInitialCoursesWithTeachers();
        persistTeachersAndCourses(teachers, resetCourses);

        Swal.fire({
            icon: 'success',
            title: '¡Materias Cargadas!',
            text: 'Se han cargado las materias predefinidas del plan ITIID Sep–Dic 2026',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleResetTeachers = async () => {
        const result = await Swal.fire({
            title: '¿Cargar profesores y asignaciones Sep–Dic 2026?',
            text: 'Esto cargará los 32 docentes oficiales (FTC, Asignatura e Inglés) y sus materias asignadas.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, cargar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        const resetCourses = getInitialCoursesWithTeachers();
        persistTeachersAndCourses(INITIAL_TEACHERS, resetCourses);

        Swal.fire({
            icon: 'success',
            title: '¡Profesores Cargados!',
            text: 'Se han cargado los profesores oficiales Sep–Dic 2026 y sus materias',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const teacherById = Object.fromEntries(teachers.map(t => [t.id, t]));
    const filteredCoursesForAssign = courses.filter(c =>
        !courseSearch.trim() ||
        c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
        formatQuarter(c.cuatrimestre).toLowerCase().includes(courseSearch.toLowerCase())
    );

    const renderOtherTeachersHint = (course, excludeTeacherId = null) => {
        const otherNames = getCourseTeacherIds(course, teachers)
            .filter(tid => tid !== excludeTeacherId)
            .map(tid => teacherById[tid]?.name)
            .filter(Boolean);
        if (otherNames.length === 0) return null;
        return (
            <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                Compartida con: {otherNames.join(', ')}
            </span>
        );
    };

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Gestión de Datos</h2>

            <div className="flex space-x-4 mb-6 border-b">
                {['teachers', 'courses', 'students'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 px-4 capitalize font-medium ${activeTab === tab
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tab === 'teachers' ? `Profesores (${teachers.length})` : tab === 'courses' ? `Materias (${courses.length})` : 'Alumnos'}
                    </button>
                ))}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                {activeTab === 'teachers' && (
                    <div>
                        {/* Add Teacher Form */}
                        <div className="mb-6 space-y-4">
                            <div className="flex gap-3 flex-wrap">
                                <input
                                    type="text" placeholder="Nombre del profesor" className="border p-2 rounded flex-1 min-w-[220px]"
                                    value={newTeacher.name} onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                />
                                <select
                                    className="border p-2 rounded"
                                    value={newTeacher.role || 'PA'}
                                    onChange={e => setNewTeacher({ ...newTeacher, role: e.target.value })}
                                >
                                    <option value="FTC">Tiempo Completo (FTC)</option>
                                    <option value="PA">Asignatura (PA)</option>
                                    <option value="Inglés">Inglés</option>
                                </select>
                                <button onClick={handleAddTeacher} className="bg-blue-500 text-white px-4 py-2 rounded flex items-center hover:bg-blue-600">
                                    <Plus size={18} className="mr-2" /> Agregar Profesor
                                </button>
                                <button
                                    onClick={handleResetTeachers}
                                    className="bg-gray-500 text-white px-4 py-2 rounded flex items-center hover:bg-gray-600"
                                    title="Restaurar catálogo Sep–Dic 2026"
                                >
                                    <RefreshCw size={18} className="mr-2" /> Predefinidos Sep–Dic 2026
                                </button>
                            </div>

                            {/* Subjects Input — Todas las materias pueden tener 1 o varios profesores */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Materias que imparte <span className="text-gray-400 font-normal">(una materia puede tener varios profesores para cubrir distintos grupos)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Filtrar materia..."
                                        className="border px-2.5 py-1 rounded text-xs w-52"
                                        value={courseSearch}
                                        onChange={e => setCourseSearch(e.target.value)}
                                    />
                                </div>
                                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                                    {filteredCoursesForAssign.length === 0 ? (
                                        <p className="text-gray-500 text-sm italic">No se encontraron materias con ese filtro.</p>
                                    ) : (
                                        filteredCoursesForAssign.map(course => (
                                            <div key={course.id} className="flex items-center mb-2 last:mb-0 flex-wrap">
                                                <input
                                                    type="checkbox"
                                                    id={`new-course-${course.id}`}
                                                    checked={newTeacher.assignedCourses?.includes(course.id)}
                                                    onChange={(e) => {
                                                        const current = newTeacher.assignedCourses || [];
                                                        if (e.target.checked) {
                                                            setNewTeacher({ ...newTeacher, assignedCourses: [...current, course.id] });
                                                        } else {
                                                            setNewTeacher({ ...newTeacher, assignedCourses: current.filter(id => id !== course.id) });
                                                        }
                                                    }}
                                                    className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <label htmlFor={`new-course-${course.id}`} className="text-sm text-gray-700 cursor-pointer select-none">
                                                    {course.name} <span className="text-gray-400 text-xs">({formatQuarterShort(course.cuatrimestre)})</span>
                                                </label>
                                                {renderOtherTeachersHint(course)}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Availability Grid */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowAvailability(!showAvailability)}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                                >
                                    {showAvailability ? 'Ocultar Disponibilidad' : 'Configurar Disponibilidad'}
                                </button>
                                {showAvailability && (
                                    <div className="mt-2">
                                        <AvailabilityGrid
                                            availability={newTeacher.availability}
                                            onChange={(availability) => setNewTeacher({ ...newTeacher, availability })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-2">ID</th>
                                    <th className="pb-2">Nombre</th>
                                    <th className="pb-2">Materias Asignadas</th>
                                    <th className="pb-2">Disponibilidad</th>
                                    <th className="pb-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teachers.map(t => {
                                    const teacherCourses = courses.filter(c => getCourseTeacherIds(c, teachers).includes(t.id));
                                    return (
                                        <tr key={t.id} className="border-b last:border-0">
                                            <td className="py-3 text-gray-500">{t.id}</td>
                                            <td className="py-3">
                                                <div className="font-medium text-gray-800">{t.name}</div>
                                                {(t.role || t.window) && (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {t.role && (
                                                            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${t.role === 'FTC'
                                                                ? 'bg-indigo-100 text-indigo-700'
                                                                : t.role === 'Inglés'
                                                                ? 'bg-sky-100 text-sky-700'
                                                                : 'bg-amber-100 text-amber-800'
                                                                }`}>
                                                                {t.role}
                                                            </span>
                                                        )}
                                                        {t.window && <span className="text-xs text-gray-400">{t.window}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {teacherCourses.length > 0 ? (
                                                        teacherCourses.map(course => (
                                                            <span key={course.id} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                                                {course.name} <span className="text-blue-500">({formatQuarterShort(course.cuatrimestre)})</span>
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">Sin materias asignadas</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <div className="text-xs text-gray-600">
                                                    {Object.keys(t.availability || {}).length > 0 ? (
                                                        <span className="text-green-600">✓ Configurado</span>
                                                    ) : (
                                                        <span className="text-gray-400">Sin configurar</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditTeacher(t)} className="text-blue-500 hover:text-blue-700" title="Editar profesor y sus materias">
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button onClick={() => handleDelete('teachers', t.id)} className="text-red-500 hover:text-red-700" title="Eliminar profesor">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'students' && (
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Alumnos por Cuatrimestre</h3>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = getEneAbrStudents();
                                        setStudents(next);
                                        storage.setStudents(next);
                                    }}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors"
                                    title="Cargar grupos del periodo Ene–Abr (1°, 2°, 4°, 5°, 8°)"
                                >
                                    Cargar Ene–Abr 2027
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = getDefaultStudents();
                                        setStudents(next);
                                        storage.setStudents(next);
                                    }}
                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold transition-colors"
                                >
                                    Cargar Sep–Dic 2026
                                </button>
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6">Ingresa la cantidad de alumnos registrados en cada cuatrimestre (incluyendo Inmersión). El sistema calcula los grupos automáticamente (35 alumnos por grupo) y reparte grupos entre los profesores asignados a cada materia.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {cuatrimestres.map(cuatrimestre => {
                                const count = students[cuatrimestre] || 0;
                                const groups = count > 0 ? Math.ceil(count / 35) : 0;
                                return (
                                    <div key={cuatrimestre} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {formatQuarter(cuatrimestre)}
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="border p-2 rounded w-full text-center text-lg font-semibold"
                                            value={count}
                                            onChange={e => handleStudentChange(cuatrimestre, e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500 mt-1 text-center">
                                            alumnos {groups > 0 ? `(${groups} ${groups === 1 ? 'grupo' : 'grupos'})` : ''}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-blue-800">Total de Alumnos:</span>
                                <span className="text-2xl font-bold text-blue-600">
                                    {Object.values(students).reduce((sum, val) => sum + (parseInt(val) || 0), 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'courses' && (
                    <div>
                        <div className="mb-6 space-y-3">
                            <div className="flex gap-3 flex-wrap">
                                <input
                                    type="text" placeholder="Nombre de la Materia" className="border p-2 rounded flex-1 min-w-[220px]"
                                    value={newCourse.name} onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                />
                                <select
                                    className="border p-2 rounded"
                                    value={newCourse.cuatrimestre}
                                    onChange={e => setNewCourse({ ...newCourse, cuatrimestre: e.target.value })}
                                >
                                    <option value="">Cuatrimestre</option>
                                    {cuatrimestres.map(c => (
                                        <option key={c} value={c}>
                                            {formatQuarter(c)}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="number" placeholder="Sesiones/sem" className="border p-2 rounded w-36"
                                    value={newCourse.weekly_sessions} onChange={e => setNewCourse({ ...newCourse, weekly_sessions: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewCourseTeachers(!showNewCourseTeachers)}
                                    className="border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 rounded flex items-center text-sm font-medium hover:bg-blue-100"
                                >
                                    <Users size={16} className="mr-1.5" />
                                    Profesores ({newCourse.teacher_ids?.length || 0})
                                </button>
                                <button onClick={handleAddCourse} className="bg-blue-500 text-white px-4 py-2 rounded flex items-center hover:bg-blue-600">
                                    <Plus size={18} className="mr-2" /> Agregar
                                </button>
                                <button
                                    onClick={handleResetCourses}
                                    className="bg-gray-500 text-white px-4 py-2 rounded flex items-center hover:bg-gray-600"
                                    title="Cargar materias predefinidas"
                                >
                                    <RefreshCw size={18} className="mr-2" /> Predefinidas
                                </button>
                            </div>

                            {showNewCourseTeachers && (
                                <div className="border rounded-lg p-3 bg-gray-50 max-h-44 overflow-y-auto">
                                    <p className="text-xs text-gray-500 mb-2 font-medium">Selecciona uno o más profesores que imparten esta materia:</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {teachers.map(t => (
                                            <label key={t.id} className="flex items-center text-sm text-gray-700 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                                                    checked={newCourse.teacher_ids?.includes(t.id)}
                                                    onChange={e => {
                                                        const cur = newCourse.teacher_ids || [];
                                                        setNewCourse({
                                                            ...newCourse,
                                                            teacher_ids: e.target.checked
                                                                ? [...cur, t.id]
                                                                : cur.filter(id => id !== t.id)
                                                        });
                                                    }}
                                                />
                                                <span className="truncate">{t.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-2">ID</th>
                                    <th className="pb-2">Materia</th>
                                    <th className="pb-2">Cuatrimestre</th>
                                    <th className="pb-2">Profesores Asignados</th>
                                    <th className="pb-2">Sesiones/Semana</th>
                                    <th className="pb-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(courses) && courses.map(c => {
                                    const assignedIds = getCourseTeacherIds(c, teachers);
                                    return (
                                        <tr key={c.id} className="border-b last:border-0">
                                            <td className="py-3 text-gray-500">{c.id}</td>
                                            <td className="py-3 font-medium text-gray-800">{c.name}</td>
                                            <td className="py-3">
                                                <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-medium">
                                                    {formatQuarter(c.cuatrimestre)}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    {assignedIds.length > 0 ? (
                                                        assignedIds.map(tid => (
                                                            <span key={tid} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-xs">
                                                                {teacherById[tid]?.name || `Prof. ${tid}`}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">Sin asignar</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditCourse(c)}
                                                        className="text-xs text-blue-600 hover:underline ml-1"
                                                        title="Agregar o cambiar profesores de esta materia"
                                                    >
                                                        + Profe
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-3 text-sm">{c.weekly_sessions || c.duration || 1} sesiones</td>
                                            <td className="py-3">
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditCourse(c)} className="text-blue-500 hover:text-blue-700" title="Editar materia y profesores">
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button onClick={() => handleDelete('courses', c.id)} className="text-red-500 hover:text-red-700" title="Eliminar materia">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Edición de Profesor */}
            <Modal isOpen={showTeacherModal} onClose={handleCancelEdit} title="Editar Profesor">
                {editingTeacher && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    className="border p-2 rounded w-full"
                                    value={editingTeacher.name}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                                <select
                                    className="border p-2 rounded w-full"
                                    value={editingTeacher.role || 'PA'}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, role: e.target.value })}
                                >
                                    <option value="FTC">Tiempo Completo (FTC)</option>
                                    <option value="PA">Asignatura (PA)</option>
                                    <option value="Inglés">Inglés</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Materias que imparte <span className="text-xs text-gray-400 font-normal">(puedes compartir materias entre varios profesores)</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setEditingTeacher({ ...editingTeacher, assignedCourses: [] })}
                                    className="text-xs text-red-600 hover:underline font-medium"
                                >
                                    Quitar todas (sin clases este cuatri)
                                </button>
                            </div>
                            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                                {Array.isArray(courses) && courses.map(course => (
                                    <div key={course.id} className="flex items-center mb-2 last:mb-0 flex-wrap">
                                        <input
                                            type="checkbox"
                                            id={`edit-course-${course.id}`}
                                            checked={editingTeacher.assignedCourses?.includes(course.id)}
                                            onChange={(e) => {
                                                const current = editingTeacher.assignedCourses || [];
                                                if (e.target.checked) {
                                                    setEditingTeacher({ ...editingTeacher, assignedCourses: [...current, course.id] });
                                                } else {
                                                    setEditingTeacher({ ...editingTeacher, assignedCourses: current.filter(id => id !== course.id) });
                                                }
                                            }}
                                            className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <label htmlFor={`edit-course-${course.id}`} className="text-sm text-gray-700 cursor-pointer select-none">
                                            {course.name} <span className="text-gray-400 text-xs">({formatQuarterShort(course.cuatrimestre)})</span>
                                        </label>
                                        {renderOtherTeachersHint(course, editingTeacher.id)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Disponibilidad</label>
                            <AvailabilityGrid
                                availability={editingTeacher.availability}
                                onChange={(availability) => setEditingTeacher({ ...editingTeacher, availability })}
                            />
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <button
                                onClick={handleSaveTeacher}
                                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 flex-1"
                            >
                                Guardar Cambios
                            </button>
                            <button
                                onClick={handleCancelEdit}
                                className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal de Edición de Materia (Soporta 1 o múltiples profesores) */}
            <Modal isOpen={showCourseModal} onClose={handleCancelEdit} title="Editar Materia y Profesores">
                {editingCourse && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Materia</label>
                            <input
                                type="text"
                                className="border p-2 rounded w-full"
                                value={editingCourse.name}
                                onChange={e => setEditingCourse({ ...editingCourse, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cuatrimestre</label>
                                <select
                                    className="border p-2 rounded w-full"
                                    value={editingCourse.cuatrimestre}
                                    onChange={e => setEditingCourse({ ...editingCourse, cuatrimestre: e.target.value })}
                                >
                                    <option value="">Seleccionar Cuatrimestre</option>
                                    {cuatrimestres.map(c => (
                                        <option key={c} value={c}>
                                            {formatQuarter(c)}
                                        </option>
                                    ))}
                                </select>
                                {editingCourse.cuatrimestre !== '' && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Alumnos registrados: {students[editingCourse.cuatrimestre] || 0}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sesiones por Semana</label>
                                <input
                                    type="number"
                                    className="border p-2 rounded w-full"
                                    value={editingCourse.weekly_sessions || editingCourse.duration || ''}
                                    onChange={e => setEditingCourse({ ...editingCourse, weekly_sessions: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Profesores asignados a esta materia <span className="text-xs text-gray-400 font-normal">(marca uno o más profesores; se repartirán automáticamente por grupo)</span>
                            </label>
                            <div className="border rounded-lg p-3 max-h-56 overflow-y-auto bg-gray-50 space-y-1.5">
                                {teachers.map(t => {
                                    const isChecked = (editingCourse.teacher_ids || []).includes(t.id);
                                    return (
                                        <label key={t.id} className="flex items-center justify-between text-sm text-gray-700 cursor-pointer hover:bg-white px-2 py-1 rounded">
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="mr-2.5 h-4 w-4 text-blue-600 rounded border-gray-300"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                        const cur = editingCourse.teacher_ids || [];
                                                        setEditingCourse({
                                                            ...editingCourse,
                                                            teacher_ids: e.target.checked
                                                                ? [...cur, t.id]
                                                                : cur.filter(id => id !== t.id)
                                                        });
                                                    }}
                                                />
                                                <span>{t.name}</span>
                                            </div>
                                            {t.role && (
                                                <span className="text-[11px] text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                                                    {t.role}
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <button
                                onClick={handleSaveCourse}
                                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 flex-1"
                            >
                                Guardar Cambios
                            </button>
                            <button
                                onClick={handleCancelEdit}
                                className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

// Componente Modal reutilizable
const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Data;
