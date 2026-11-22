import React, { useState, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import { INITIAL_COURSES, INITIAL_TEACHERS } from '../utils/initialData';
import { Plus, Trash2, Edit2, X, RefreshCw } from 'lucide-react';
import AvailabilityGrid from '../components/AvailabilityGrid';
import Swal from 'sweetalert2';

const Data = () => {
    const [activeTab, setActiveTab] = useState('teachers');
    const [teachers, setTeachers] = useState([]);
    const [courses, setCourses] = useState([]);
    const [students, setStudents] = useState({});

    // Cuatrimestres disponibles
    const cuatrimestres = Array.from({ length: 10 }, (_, i) => i + 1);

    // Form states
    const [newTeacher, setNewTeacher] = useState({ name: '', assignedCourses: [], availability: {} });
    const [newCourse, setNewCourse] = useState({ name: '', cuatrimestre: '', weekly_sessions: '', teacher_id: null });

    // Edit states
    const [editingTeacher, setEditingTeacher] = useState(null);
    const [editingCourse, setEditingCourse] = useState(null);

    // Modal visibility states
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [showCourseModal, setShowCourseModal] = useState(false);
    const [showAvailability, setShowAvailability] = useState(false);

    // Subject input state
    const [subjectInput, setSubjectInput] = useState('');

    // Ref for subject input to maintain focus
    const subjectInputRef = useRef(null);

    // Función para generar el siguiente ID automáticamente
    const getNextId = (items) => {
        if (items.length === 0) return 1;
        const maxId = Math.max(...items.map(item => item.id));
        return maxId + 1;
    };

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        setTeachers(storage.getTeachers());
        setCourses(storage.getCourses());
        setStudents(storage.getStudents());
    };

    // Guardar cambios en alumnos por cuatrimestre
    const handleStudentChange = (cuatrimestre, value) => {
        const newStudents = { ...students, [cuatrimestre]: parseInt(value) || 0 };
        setStudents(newStudents);
        storage.setStudents(newStudents);
    };

    // Validation functions
    const validateTeacher = (teacher, isEdit = false) => {
        // Required fields
        if (!teacher.name) {
            Swal.fire({
                icon: 'error',
                title: 'Campos Requeridos',
                text: 'El nombre es obligatorio'
            });
            return false;
        }

        // Check duplicate name (case-insensitive)
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

    const validateRoom = (room, isEdit = false) => {
        // Required fields
        if (!room.name || !room.capacity) {
            Swal.fire({
                icon: 'error',
                title: 'Campos Requeridos',
                text: 'El nombre y capacidad son obligatorios'
            });
            return false;
        }

        // Validate capacity is positive
        const capacity = parseInt(room.capacity);
        if (capacity <= 0 || isNaN(capacity)) {
            Swal.fire({
                icon: 'error',
                title: 'Capacidad Inválida',
                text: 'La capacidad debe ser un número positivo'
            });
            return false;
        }

        // Check duplicate name (case-insensitive)
        const duplicateName = rooms.find(r =>
            r.name.toLowerCase().trim() === room.name.toLowerCase().trim() &&
            (!isEdit || r.id !== room.id)
        );
        if (duplicateName) {
            Swal.fire({
                icon: 'error',
                title: 'Nombre Duplicado',
                text: `Ya existe un aula con el nombre "${room.name}"`
            });
            return false;
        }

        return true;
    };

    const validateCourse = (course, isEdit = false) => {
        // Required fields
        if (!course.name || !course.cuatrimestre || !course.weekly_sessions) {
            Swal.fire({
                icon: 'error',
                title: 'Campos Requeridos',
                text: 'Todos los campos son obligatorios'
            });
            return false;
        }

        // Validate cuatrimestre is valid
        const cuatrimestre = parseInt(course.cuatrimestre);
        if (cuatrimestre < 1 || cuatrimestre > 10 || isNaN(cuatrimestre)) {
            Swal.fire({
                icon: 'error',
                title: 'Cuatrimestre Inválido',
                text: 'El cuatrimestre debe estar entre 1 y 10'
            });
            return false;
        }

        // Validate weekly_sessions is positive
        const weeklySessions = parseInt(course.weekly_sessions);
        if (weeklySessions <= 0 || isNaN(weeklySessions)) {
            Swal.fire({
                icon: 'error',
                title: 'Sesiones Semanales Inválidas',
                text: 'Las sesiones por semana deben ser mayor a 0'
            });
            return false;
        }

        // Validate not more than 5 sessions per week (Mon-Fri)
        if (weeklySessions > 5) {
            Swal.fire({
                icon: 'warning',
                title: 'Muchas Sesiones',
                text: `${weeklySessions} sesiones por semana puede ser difícil de distribuir (máx recomendado: 5)`,
                confirmButtonText: 'Continuar de todos modos'
            });
        }

        return true;
    };

    const handleAddTeacher = () => {
        if (!validateTeacher(newTeacher, false)) return;

        const newId = getNextId(teachers);
        const teacher = {
            ...newTeacher,
            id: newId,
            availability: newTeacher.availability || {}
        };

        // Update courses with new teacher assignment
        const updatedCourses = courses.map(c => {
            if (newTeacher.assignedCourses.includes(c.id)) {
                return { ...c, teacher_id: newId };
            }
            return c;
        });

        const updatedTeachers = [...teachers, teacher];

        storage.setTeachers(updatedTeachers);
        setTeachers(updatedTeachers);
        storage.setCourses(updatedCourses);
        setCourses(updatedCourses);

        setNewTeacher({ name: '', assignedCourses: [], availability: {} });

        Swal.fire({
            icon: 'success',
            title: '¡Profesor Agregado!',
            text: `El profesor "${newTeacher.name}" ha sido agregado exitosamente`,
            timer: 2000,
            showConfirmButton: false
        });
    };


    const handleAddCourse = () => {
        if (!validateCourse(newCourse, false)) return;

        const newId = getNextId(courses);
        const updated = [...courses, {
            ...newCourse,
            id: newId,
            cuatrimestre: parseInt(newCourse.cuatrimestre),
            weekly_sessions: parseInt(newCourse.weekly_sessions),
            teacher_id: null // Initially no teacher assigned
        }];
        storage.setCourses(updated);
        setCourses(updated);
        setNewCourse({ name: '', cuatrimestre: '', weekly_sessions: '', teacher_id: null });

        Swal.fire({
            icon: 'success',
            title: '¡Materia Agregada!',
            text: `La materia "${newCourse.name}" ha sido agregada exitosamente`,
            timer: 2000,
            showConfirmButton: false
        });
    };

    // Handle teacher selection in course form
    const handleTeacherSelect = (teacherId, isEditing = false) => {
        const teacher = teachers.find(t => t.id === parseInt(teacherId));
        if (isEditing && editingCourse) {
            setEditingCourse({ ...editingCourse, teacher_id: teacherId });
        } else {
            setNewCourse({ ...newCourse, teacher_id: teacherId });
        }
        // Teacher data is now available through the teacher object if needed
    };

    const handleDelete = async (type, id) => {
        let itemName = '';
        let itemType = '';

        if (type === 'teachers') {
            const teacher = teachers.find(t => t.id === id);
            itemName = teacher?.name || 'este profesor';
            itemType = 'Profesor';
        } else if (type === 'rooms') {
            const room = rooms.find(r => r.id === id);
            itemName = room?.name || 'esta aula';
            itemType = 'Aula';
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
            const updated = teachers.filter(t => t.id !== id);

            // Also unassign any courses assigned to this teacher
            const updatedCourses = courses.map(c => {
                if (c.teacher_id === id) {
                    return { ...c, teacher_id: null };
                }
                return c;
            });

            storage.setTeachers(updated);
            setTeachers(updated);

            storage.setCourses(updatedCourses);
            setCourses(updatedCourses);
        } else if (type === 'rooms') {
        } else if (type === 'courses') {
            const updated = courses.filter(c => c.id !== id);
            storage.setCourses(updated);
            setCourses(updated);
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
        // Find courses currently assigned to this teacher
        const assignedCourseIds = courses
            .filter(c => c.teacher_id === teacher.id)
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

        // Update teacher
        const updatedTeachers = teachers.map(t => t.id === editingTeacher.id ? {
            ...editingTeacher,
            // Remove assignedCourses from the teacher object itself as it's derived
            assignedCourses: undefined
        } : t);

        // Update courses
        const updatedCourses = courses.map(c => {
            // If course is in the new assigned list -> assign to this teacher
            if (editingTeacher.assignedCourses.includes(c.id)) {
                return { ...c, teacher_id: editingTeacher.id };
            }
            // If course WAS assigned to this teacher but is NOT anymore -> unassign
            if (c.teacher_id === editingTeacher.id && !editingTeacher.assignedCourses.includes(c.id)) {
                return { ...c, teacher_id: null };
            }
            return c;
        });

        storage.setTeachers(updatedTeachers);
        setTeachers(updatedTeachers);
        storage.setCourses(updatedCourses);
        setCourses(updatedCourses);

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


    // Edit handlers for courses
    const handleEditCourse = (course) => {
        setEditingCourse({ ...course });
        setShowCourseModal(true);
    };

    const handleSaveCourse = () => {
        if (!validateCourse(editingCourse, true)) return;

        const updated = courses.map(c => c.id === editingCourse.id ? {
            ...editingCourse,
            teacher_id: parseInt(editingCourse.teacher_id),
            room_id: parseInt(editingCourse.room_id),
            cuatrimestre: parseInt(editingCourse.cuatrimestre),
            weekly_sessions: parseInt(editingCourse.weekly_sessions)
        } : c);
        storage.setCourses(updated);
        setCourses(updated);
        setEditingCourse(null);
        setShowCourseModal(false);

        Swal.fire({
            icon: 'success',
            title: '¡Materia Actualizada!',
            text: 'Los cambios han sido guardados exitosamente',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleCancelEdit = () => {
        setEditingTeacher(null);
        setEditingCourse(null);
        setShowTeacherModal(false);
        setShowCourseModal(false);
        setSubjectInput('');
    };

    const handleResetCourses = async () => {
        const result = await Swal.fire({
            title: '¿Cargar materias predefinidas?',
            text: 'Esto reemplazará todas las materias actuales con las materias predefinidas del plan de estudios.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, cargar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        // Create a map of current course assignments (course_id -> teacher_id)
        const currentAssignments = {};
        courses.forEach(course => {
            if (course.teacher_id) {
                currentAssignments[course.id] = course.teacher_id;
            }
        });

        // Reset courses to initial data but preserve existing teacher assignments
        const updatedCourses = INITIAL_COURSES.map(course => ({
            ...course,
            teacher_id: currentAssignments[course.id] || course.teacher_id || null
        }));

        storage.setCourses(updatedCourses);
        setCourses(updatedCourses);

        Swal.fire({
            icon: 'success',
            title: '¡Materias Cargadas!',
            text: 'Se han cargado las materias predefinidas del plan de estudios',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleResetTeachers = async () => {
        const result = await Swal.fire({
            title: '¿Cargar profesores predefinidos?',
            text: 'Esto reemplazará todos los profesores actuales con los profesores predefinidos.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, cargar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        // Reset teachers to initial data
        storage.setTeachers(INITIAL_TEACHERS);
        setTeachers(INITIAL_TEACHERS);

        // Update courses with teacher assignments from initial teachers
        const updatedCourses = courses.map(course => {
            const assignedTeacher = INITIAL_TEACHERS.find(t =>
                t.assignedCourses && t.assignedCourses.includes(course.id)
            );
            return {
                ...course,
                teacher_id: assignedTeacher ? assignedTeacher.id : null
            };
        });
        storage.setCourses(updatedCourses);
        setCourses(updatedCourses);

        Swal.fire({
            icon: 'success',
            title: '¡Profesores Cargados!',
            text: 'Se han cargado los profesores predefinidos',
            timer: 2000,
            showConfirmButton: false
        });
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
                        {tab === 'teachers' ? 'Profesores' : tab === 'courses' ? 'Materias' : 'Alumnos'}
                    </button>
                ))}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                {activeTab === 'teachers' && (
                    <div>
                        {/* Add Teacher Form */}
                        <div className="mb-6 space-y-4">
                            <div className="flex gap-4">
                                <input
                                    type="text" placeholder="Nombre" className="border p-2 rounded flex-1"
                                    value={newTeacher.name} onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                />
                                <button onClick={handleAddTeacher} className="bg-blue-500 text-white px-4 py-2 rounded flex items-center hover:bg-blue-600">
                                    <Plus size={18} className="mr-2" /> Agregar
                                </button>
                                <button
                                    onClick={handleResetTeachers}
                                    className="bg-gray-500 text-white px-4 py-2 rounded flex items-center hover:bg-gray-600"
                                    title="Cargar profesores predefinidos"
                                >
                                    <RefreshCw size={18} className="mr-2" /> Predefinidos
                                </button>
                            </div>

                            {/* Subjects Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Materias Asignadas</label>
                                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                                    {Array.isArray(courses) && courses.filter(c => !c.teacher_id).length === 0 ? (
                                        <p className="text-gray-500 text-sm italic">No hay materias disponibles para asignar.</p>
                                    ) : (
                                        Array.isArray(courses) && courses.filter(c => !c.teacher_id).map(course => (
                                            <div key={course.id} className="flex items-center mb-2 last:mb-0">
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
                                                    {course.name} <span className="text-gray-400 text-xs">({course.cuatrimestre}° C)</span>
                                                </label>
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
                                    <th className="pb-2">Materias</th>
                                    <th className="pb-2">Disponibilidad</th>
                                    <th className="pb-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teachers.map(t => (
                                    <tr key={t.id} className="border-b last:border-0">
                                        <td className="py-3">{t.id}</td>
                                        <td className="py-3">{t.name}</td>
                                        <td className="py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {Array.isArray(courses) && courses.filter(c => c.teacher_id === t.id).length > 0 ? (
                                                    courses.filter(c => c.teacher_id === t.id).map(course => (
                                                        <span key={course.id} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                                            {course.name}
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
                                                <button onClick={() => handleEditTeacher(t)} className="text-blue-500 hover:text-blue-700">
                                                    <Edit2 size={18} />
                                                </button>
                                                <button onClick={() => handleDelete('teachers', t.id)} className="text-red-500 hover:text-red-700">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}


                {activeTab === 'students' && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Alumnos por Cuatrimestre</h3>
                        <p className="text-gray-600 mb-6">Ingresa la cantidad de alumnos registrados en cada cuatrimestre. Esta información se utilizará para generar los horarios.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            {cuatrimestres.map(cuatrimestre => (
                                <div key={cuatrimestre} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Cuatrimestre {cuatrimestre}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="border p-2 rounded w-full text-center text-lg font-semibold"
                                        value={students[cuatrimestre] || 0}
                                        onChange={e => handleStudentChange(cuatrimestre, e.target.value)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1 text-center">alumnos</p>
                                </div>
                            ))}
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
                        <div className="flex gap-4 mb-6 flex-wrap">
                            <input
                                type="text" placeholder="Nombre de la Materia" className="border p-2 rounded flex-1"
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
                                        {c}° Cuatrimestre
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number" placeholder="Sesiones/semana" className="border p-2 rounded w-32"
                                value={newCourse.weekly_sessions} onChange={e => setNewCourse({ ...newCourse, weekly_sessions: e.target.value })}
                            />
                            <button onClick={handleAddCourse} className="bg-blue-500 text-white px-4 py-2 rounded flex items-center">
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
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-2">ID</th>
                                    <th className="pb-2">Materia</th>
                                    <th className="pb-2">Cuatrimestre</th>
                                    <th className="pb-2">Sesiones/Semana</th>
                                    <th className="pb-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(courses) && courses.map(c => (
                                    <tr key={c.id} className="border-b last:border-0">
                                        <td className="py-3">{c.id}</td>
                                        <td className="py-3 font-medium">{c.name}</td>
                                        <td className="py-3">
                                            <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
                                                {c.cuatrimestre}° Cuatrimestre
                                            </span>
                                        </td>
                                        <td className="py-3">{c.weekly_sessions || c.duration || 1} sesiones</td>
                                        <td className="py-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEditCourse(c)} className="text-blue-500 hover:text-blue-700">
                                                    <Edit2 size={18} />
                                                </button>
                                                <button onClick={() => handleDelete('courses', c.id)} className="text-red-500 hover:text-red-700">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Edición de Profesor */}
            <Modal isOpen={showTeacherModal} onClose={handleCancelEdit} title="Editar Profesor">
                {editingTeacher && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                            <input
                                type="text"
                                className="border p-2 rounded w-full"
                                value={editingTeacher.name}
                                onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Materias</label>
                            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                                {Array.isArray(courses) && courses.filter(c => !c.teacher_id || c.teacher_id === editingTeacher.id).length === 0 ? (
                                    <p className="text-gray-500 text-sm italic">No hay materias disponibles para asignar.</p>
                                ) : (
                                    Array.isArray(courses) && courses.filter(c => !c.teacher_id || c.teacher_id === editingTeacher.id).map(course => (
                                        <div key={course.id} className="flex items-center mb-2 last:mb-0">
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
                                                {course.name} <span className="text-gray-400 text-xs">({course.cuatrimestre}° C)</span>
                                            </label>
                                        </div>
                                    ))
                                )}
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


            {/* Modal de Edición de Materia */}
            <Modal isOpen={showCourseModal} onClose={handleCancelEdit} title="Editar Materia">
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
                                        {c}° Cuatrimestre
                                    </option>
                                ))}
                            </select>
                            {editingCourse.cuatrimestre && (
                                <p className="text-sm text-gray-500 mt-1">
                                    Alumnos en este cuatrimestre: {students[editingCourse.cuatrimestre] || 0}
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
