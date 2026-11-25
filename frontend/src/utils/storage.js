import { INITIAL_COURSES, INITIAL_TEACHERS } from './initialData';

const STORAGE_KEYS = {
    TEACHERS: 'utp_teachers',
    ROOMS: 'utp_rooms',
    COURSES: 'utp_courses',
    CONSTRAINTS: 'utp_constraints',
    SCHEDULE: 'utp_schedule',
    STUDENTS: 'utp_students',
    SCHEDULE_ROOMS: 'utp_schedule_rooms'
};

// Inicializar estudiantes por cuatrimestre con valores por defecto (cuatrimestres activos ITIID)
const getDefaultStudents = () => {
    const students = {};
    for (let i = 1; i <= 10; i++) {
        students[i] = 0;
    }
    students[1] = 32;
    students[4] = 32;
    students[7] = 32;
    return students;
};

// Enlaza teacher_id desde INITIAL_TEACHERS.assignedCourses cuando no se ha guardado aún en localStorage
const getInitialCoursesWithTeachers = () => {
    const teacherByCourse = {};
    INITIAL_TEACHERS.forEach((t) => {
        (t.assignedCourses || []).forEach((cid) => {
            teacherByCourse[cid] = t.id;
        });
    });
    return INITIAL_COURSES.map((c) => ({
        ...c,
        teacher_id: c.teacher_id || teacherByCourse[c.id] || null,
    }));
};

export const storage = {
    getTeachers: () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.TEACHERS);
            return stored ? JSON.parse(stored) : INITIAL_TEACHERS;
        } catch (e) {
            console.error("Error parsing teachers from storage", e);
            return INITIAL_TEACHERS;
        }
    },
    setTeachers: (data) => localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(data)),

    getRooms: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]'),
    setRooms: (data) => localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(data)),

    getCourses: () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.COURSES);
            return stored ? JSON.parse(stored) : getInitialCoursesWithTeachers();
        } catch (e) {
            console.error("Error parsing courses from storage", e);
            return getInitialCoursesWithTeachers();
        }
    },
    setCourses: (data) => localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(data)),

    getConstraints: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.CONSTRAINTS) || '[]'),
    setConstraints: (data) => localStorage.setItem(STORAGE_KEYS.CONSTRAINTS, JSON.stringify(data)),

    getSchedule: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE) || 'null'),
    setSchedule: (data) => localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(data)),

    getStudents: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENTS) || JSON.stringify(getDefaultStudents())),
    setStudents: (data) => localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(data)),

    getScheduleRooms: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE_ROOMS) || '[]'),
    setScheduleRooms: (data) => localStorage.setItem(STORAGE_KEYS.SCHEDULE_ROOMS, JSON.stringify(data)),
};
