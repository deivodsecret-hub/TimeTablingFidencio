import { INITIAL_COURSES, INITIAL_TEACHERS } from './initialData';

const CATALOG_VERSION = 'sep_dic_2026_v4';

const STORAGE_KEYS = {
    VERSION: 'utp_catalog_version',
    TEACHERS: 'utp_teachers',
    ROOMS: 'utp_rooms',
    COURSES: 'utp_courses',
    CONSTRAINTS: 'utp_constraints',
    SCHEDULE: 'utp_schedule',
    STUDENTS: 'utp_students',
    SCHEDULE_ROOMS: 'utp_schedule_rooms',
    SCHEDULE_COURSES: 'utp_schedule_courses'
};

// Matrícula activa ITIID Sep–Dic 2026 (Inmersión, 1-1..1-3, 3-1, 4-1..4-3, 7-1..7-2)
export const getDefaultStudents = () => {
    const students = {};
    for (let i = 0; i <= 10; i++) {
        students[i] = 0;
    }
    students[0] = 30; // Inmersión (1 grupo)
    students[1] = 96; // 1° C (3 grupos: 1-1, 1-2, 1-3)
    students[3] = 30; // 3° C (1 grupo: 3-1)
    students[4] = 98; // 4° C (3 grupos: 4-1, 4-2, 4-3)
    students[7] = 64; // 7° C (2 grupos: 7-1, 7-2)
    return students;
};

// Periodo Ene–Abr 2027 (1-1, 2-1..2-3, 4-1, 5-1..5-3, 8-1..8-2)
export const getEneAbrStudents = () => {
    const students = {};
    for (let i = 0; i <= 10; i++) {
        students[i] = 0;
    }
    students[1] = 30; // 1° C (1 grupo: 1-1)
    students[2] = 96; // 2° C (3 grupos: 2-1, 2-2, 2-3)
    students[4] = 30; // 4° C (1 grupo: 4-1)
    students[5] = 98; // 5° C (3 grupos: 5-1, 5-2, 5-3)
    students[8] = 64; // 8° C (2 grupos: 8-1, 8-2)
    return students;
};

/**
 * Obtiene la lista ordenada y sin duplicados de IDs de profesores que imparten una materia.
 */
export function getCourseTeacherIds(course, teachers = []) {
    if (!course) return [];
    const ids = [];
    if (Array.isArray(course.teacher_ids)) {
        course.teacher_ids.forEach((id) => {
            const n = parseInt(id, 10);
            if (n > 0 && !ids.includes(n)) ids.push(n);
        });
    }
    if (course.teacher_id) {
        const primary = parseInt(course.teacher_id, 10);
        if (primary > 0 && !ids.includes(primary)) ids.unshift(primary);
    }
    if (ids.length === 0 && Array.isArray(teachers)) {
        teachers.forEach((t) => {
            if (Array.isArray(t.assignedCourses) && t.assignedCourses.includes(course.id)) {
                const tid = parseInt(t.id, 10);
                if (tid > 0 && !ids.includes(tid)) ids.push(tid);
            }
        });
    }
    return ids;
}

/**
 * Cuenta cuántos bloques semanales tiene habilitados un profesor (o 70 si no configuró matriz).
 */
export function countAvailableSlots(teacher) {
    if (!teacher) return 0;
    if (teacher.active === false || teacher.no_classes === true) return 0;
    if (!teacher.availability || typeof teacher.availability !== 'object') return 70;
    let configured = false;
    let total = 0;
    Object.values(teacher.availability).forEach((dayObj) => {
        if (dayObj && typeof dayObj === 'object') {
            Object.values(dayObj).forEach((val) => {
                if (typeof val === 'boolean') {
                    configured = true;
                    if (val) total += 1;
                }
            });
        }
    });
    return configured ? total : 70;
}

export function isTeacherUnavailable(teacher) {
    return !teacher || teacher.active === false || teacher.no_classes === true || countAvailableSlots(teacher) === 0;
}

/**
 * Asigna el profesor óptimo de una materia para el grupo `groupIndex` (0, 1, 2...),
 * respetando `group_teachers` solo cuando sigue activo y con disponibilidad real.
 */
export function pickTeacherForCourseGroup(course, groupIndex, teachers = [], assignedLoad = {}) {
    const tIds = getCourseTeacherIds(course, teachers);
    if (tIds.length === 0) return 0;

    const teacherMap = Object.fromEntries((teachers || []).map((t) => [parseInt(t.id, 10), t]));
    const activeIds = tIds.filter((tid) => !isTeacherUnavailable(teacherMap[tid]));
    if (activeIds.length === 0) return 0;

    const sessions = parseInt(course.weekly_sessions || course.duration || 1, 10);
    if (activeIds.length === 1) {
        const onlyId = activeIds[0];
        return countAvailableSlots(teacherMap[onlyId]) >= sessions ? onlyId : 0;
    }

    if (Array.isArray(course.group_teachers) && course.group_teachers[groupIndex]) {
        const preferred = parseInt(course.group_teachers[groupIndex], 10);
        if (activeIds.includes(preferred)) {
            const prefFree = countAvailableSlots(teacherMap[preferred]) - (assignedLoad[preferred] || 0);
            if (prefFree >= sessions) return preferred;
        }
    }

    // Priorizar el docente disponible con holgura suficiente
    const rrCandidate = activeIds[groupIndex % activeIds.length];
    const rrFree = countAvailableSlots(teacherMap[rrCandidate]) - (assignedLoad[rrCandidate] || 0);
    if (rrFree >= sessions) return rrCandidate;

    let bestId = 0;
    let bestSlack = -Infinity;
    activeIds.forEach((tid) => {
        const cap = countAvailableSlots(teacherMap[tid]);
        if (cap < sessions) return;
        const slack = cap - (assignedLoad[tid] || 0);
        if (slack > bestSlack) {
            bestSlack = slack;
            bestId = tid;
        }
    });
    return bestId;
}

export const getInitialCoursesWithTeachers = () => {
    return INITIAL_COURSES.map((c) => {
        const tIds = getCourseTeacherIds(c, INITIAL_TEACHERS);
        return {
            ...c,
            teacher_ids: tIds,
            teacher_id: tIds[0] || null,
        };
    });
};

function ensureCatalogMigrated() {
    try {
        const currentVer = localStorage.getItem(STORAGE_KEYS.VERSION);
        if (currentVer !== CATALOG_VERSION) {
            localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(INITIAL_TEACHERS));
            localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(getInitialCoursesWithTeachers()));
            localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(getDefaultStudents()));
            localStorage.setItem(STORAGE_KEYS.VERSION, CATALOG_VERSION);
        }
    } catch (e) {
        console.error('Error migrating catalog version', e);
    }
}

export const storage = {
    getTeachers: () => {
        ensureCatalogMigrated();
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.TEACHERS);
            return stored ? JSON.parse(stored) : INITIAL_TEACHERS;
        } catch (e) {
            console.error("Error parsing teachers from storage", e);
            return INITIAL_TEACHERS;
        }
    },
    setTeachers: (data) => {
        ensureCatalogMigrated();
        localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(data));
    },

    getRooms: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]'),
    setRooms: (data) => localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(data)),

    getCourses: () => {
        ensureCatalogMigrated();
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.COURSES);
            const parsed = stored ? JSON.parse(stored) : getInitialCoursesWithTeachers();
            const teachers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEACHERS) || 'null') || INITIAL_TEACHERS;
            return parsed.map((c) => {
                const tIds = getCourseTeacherIds(c, teachers);
                return { ...c, teacher_ids: tIds, teacher_id: tIds[0] || null };
            });
        } catch (e) {
            console.error("Error parsing courses from storage", e);
            return getInitialCoursesWithTeachers();
        }
    },
    setCourses: (data) => {
        ensureCatalogMigrated();
        const normalized = (data || []).map((c) => {
            const tIds = getCourseTeacherIds(c);
            return { ...c, teacher_ids: tIds, teacher_id: tIds[0] || null };
        });
        localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(normalized));
    },

    getConstraints: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.CONSTRAINTS) || '[]'),
    setConstraints: (data) => localStorage.setItem(STORAGE_KEYS.CONSTRAINTS, JSON.stringify(data)),

    getSchedule: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE) || 'null'),
    setSchedule: (data) => localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(data)),

    getStudents: () => {
        ensureCatalogMigrated();
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENTS) || JSON.stringify(getDefaultStudents()));
    },
    setStudents: (data) => {
        ensureCatalogMigrated();
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(data));
    },

    getScheduleRooms: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE_ROOMS) || '[]'),
    setScheduleRooms: (data) => localStorage.setItem(STORAGE_KEYS.SCHEDULE_ROOMS, JSON.stringify(data)),

    getScheduleCourses: () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULE_COURSES) || 'null'),
    setScheduleCourses: (data) => localStorage.setItem(STORAGE_KEYS.SCHEDULE_COURSES, JSON.stringify(data)),
};
