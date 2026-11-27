export const TIME_SLOTS = [
    "07:00 - 07:55",
    "07:55 - 08:50",
    "08:50 - 09:45",
    "09:45 - 10:40",
    "10:40 - 11:10 (Receso)",
    "11:10 - 12:05",
    "12:05 - 13:00",
    "13:00 - 13:55",
    "13:55 - 14:00 (Receso)",
    "14:00 - 14:55",
    "14:55 - 15:50",
    "15:50 - 16:45",
    "16:45 - 17:40",
    "17:40 - 18:00 (Receso)",
    "18:00 - 18:55",
    "18:55 - 19:50",
    "19:50 - 20:45"
];

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const createAvailability = (daySlots) => {
    const availability = {};
    DAYS.forEach((day) => {
        availability[day] = {};
        const slots = Array.isArray(daySlots) ? daySlots : (daySlots[day] || []);
        slots.forEach((slotIndex) => {
            if (TIME_SLOTS[slotIndex] && !TIME_SLOTS[slotIndex].includes('Receso')) {
                availability[day][TIME_SLOTS[slotIndex]] = true;
            }
        });
    });
    return availability;
};

// ============================================================================
// PROFESORES OFICIALES ITIID SEP–DIC 2026 (FTC, Asignatura y Franjas de Inglés)
// ============================================================================
export const INITIAL_TEACHERS = [
    // --- Profesores de Tiempo Completo (FTC) ---
    {
        id: 1,
        name: "Dr. Héctor H. Avilés Arriaga (Avilés)",
        role: "FTC",
        window: "08:00 - 16:00",
        assignedCourses: [7, 101, 21, 41, 9],
        availability: createAvailability([1, 2, 3, 5, 6, 7, 9, 10]),
    },
    {
        id: 2,
        name: "Dr. Said Polanco Martagón (Said)",
        role: "FTC",
        window: "07:00 - 15:00",
        assignedCourses: [20, 103, 40, 54],
        availability: createAvailability([0, 1, 2, 3, 5, 6, 7, 9]),
    },
    {
        id: 3,
        name: "Dr. Marco A. Nuño Maganda (Marco)",
        role: "FTC",
        window: "07:50 - 15:50",
        assignedCourses: [27, 104, 31],
        availability: createAvailability([1, 2, 3, 5, 6, 7, 9, 10]),
    },
    {
        id: 4,
        name: "Dr. Jorge A. Hernández Almazán (Jorge)",
        role: "FTC",
        window: "09:00 - 17:00",
        assignedCourses: [60, 39, 43, 107, 46],
        availability: createAvailability([2, 3, 5, 6, 7, 9, 10, 11]),
    },
    {
        id: 5,
        name: "Dr. Hiram Herrera Rivas (Hiram)",
        role: "FTC",
        window: "09:30 - 17:30",
        assignedCourses: [4, 101, 43, 11, 50],
        availability: createAvailability([2, 3, 5, 6, 7, 9, 10, 11, 12]),
    },
    {
        id: 6,
        name: "Dr. José Fidencio López Luna (Fide)",
        role: "FTC",
        window: "07:00 - 15:00",
        assignedCourses: [40, 47, 35],
        availability: createAvailability([0, 1, 2, 3, 5, 6, 7, 9]),
    },

    // --- Profesores de Asignatura (PA) ---
    {
        id: 7,
        name: "Humberto",
        role: "PA",
        window: "07:00 - 08:50",
        assignedCourses: [25],
        availability: createAvailability([0, 1]),
    },
    {
        id: 8,
        name: "Israel Pulido P. (Israel)",
        role: "PA",
        window: "07:00 - 09:00",
        assignedCourses: [4, 43, 14, 45, 52],
        availability: createAvailability([0, 1, 12, 14, 15, 16]),
    },
    {
        id: 9,
        name: "Arturo Mascorro (Mascorro)",
        role: "PA",
        window: "07:00 - 08:50",
        assignedCourses: [5, 6, 55],
        availability: createAvailability([0, 1, 12, 14, 15]),
    },
    {
        id: 10,
        name: "Luis Roberto Flores (Roberto)",
        role: "PA",
        window: "07:00 - 10:40",
        assignedCourses: [6, 28, 42, 107, 48],
        availability: createAvailability([0, 1, 2, 3, 12, 14, 15]),
    },
    {
        id: 11,
        name: "Ernesto",
        role: "PA",
        window: "Variado",
        assignedCourses: [61, 7, 18, 34],
        availability: createAvailability([0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12]),
    },
    {
        id: 12,
        name: "Diego",
        role: "PA",
        window: "09:45 - 15:00",
        assignedCourses: [26, 28, 13],
        availability: createAvailability([3, 5, 6, 7, 9]),
    },
    {
        id: 13,
        name: "Christan",
        role: "PA",
        window: "07:55 - 14:00",
        assignedCourses: [3, 101, 10, 12],
        availability: createAvailability([1, 2, 3, 5, 6, 7]),
    },
    {
        id: 14,
        name: "Alberto García (Alberto)",
        role: "PA",
        window: "08:50 - 14:00",
        assignedCourses: [25, 26, 42, 32],
        availability: createAvailability([2, 3, 5, 6, 7, 9, 10]),
    },
    {
        id: 15,
        name: "Gloria",
        role: "PA",
        window: "07:00 - 08:50",
        assignedCourses: [24],
        availability: createAvailability([0, 1]),
    },
    {
        id: 16,
        name: "Lidia",
        role: "PA",
        window: "07:00 - 09:00",
        assignedCourses: [6, 41],
        availability: createAvailability([0, 1]),
    },
    {
        id: 17,
        name: "Hugo",
        role: "PA",
        window: "07:00 - 15:00",
        assignedCourses: [19, 27, 33, 49, 56],
        availability: createAvailability([0, 1, 2, 3, 5, 6, 7, 9]),
    },
    {
        id: 18,
        name: "Emanuel",
        role: "PA",
        window: "08:00 - 16:00",
        assignedCourses: [5, 17, 24, 104],
        availability: createAvailability([1, 2, 3, 5, 6, 7, 9, 10]),
    },
    {
        id: 19,
        name: "Alejandro",
        role: "PA",
        window: "11:10 - 14:00",
        assignedCourses: [2, 23, 30],
        availability: createAvailability([5, 6, 7]),
    },
    {
        id: 20,
        name: "Jameth",
        role: "PA",
        window: "07:00 - 10:40",
        assignedCourses: [23, 38, 53],
        availability: createAvailability([0, 1, 2, 3]),
    },
    {
        id: 21,
        name: "Gerardo",
        role: "PA",
        window: "08:50 - 12:05",
        assignedCourses: [16, 57],
        availability: createAvailability([2, 3, 5]),
    },
    {
        id: 22,
        name: "Iris",
        role: "PA",
        window: "07:00 - 10:40",
        assignedCourses: [38],
        availability: createAvailability([0, 1, 2, 3]),
    },
    {
        id: 23,
        name: "Profesor Pendiente",
        role: "PA",
        window: "08:50 - 15:50",
        assignedCourses: [64, 2, 23, 104],
        availability: createAvailability([2, 3, 5, 6, 7, 9, 10]),
    },
    {
        id: 24,
        name: "Mtro. Ramiro Martínez Jaramillo",
        role: "PA",
        window: "14:00 - 17:40",
        assignedCourses: [63],
        availability: createAvailability([9, 10, 11, 12]),
    },
    {
        id: 25,
        name: "Badillo (Comp. IM)",
        role: "PA",
        window: "14:00 - 17:40",
        assignedCourses: [62],
        availability: createAvailability([9, 10, 11, 12]),
    },

    // --- Profesores de Franjas de Inglés (Sep–Dic 2026) ---
    {
        id: 26,
        name: "Carlos (Inglés)",
        role: "Inglés",
        window: "07:55 - 08:50",
        assignedCourses: [1, 8],
        availability: createAvailability([0, 1, 2]),
    },
    {
        id: 27,
        name: "Mtro. Miguel (Inglés)",
        role: "Inglés",
        window: "07:55 - 09:45",
        assignedCourses: [1, 22],
        availability: createAvailability([1, 2, 3]),
    },
    {
        id: 28,
        name: "Prado (Inglés)",
        role: "Inglés",
        window: "08:50 - 09:45",
        assignedCourses: [22, 29],
        availability: createAvailability([2, 3]),
    },
    {
        id: 29,
        name: "Claudia (Inglés)",
        role: "Inglés",
        window: "09:45 - 10:40",
        assignedCourses: [37, 44],
        availability: createAvailability([3, 5]),
    },
    {
        id: 30,
        name: "Pablo (Inglés)",
        role: "Inglés",
        window: "09:45 - 10:40",
        assignedCourses: [37, 51],
        availability: createAvailability([3, 5]),
    },
    {
        id: 31,
        name: "Jonathan (Inglés)",
        role: "Inglés",
        window: "13:00 - 13:55",
        assignedCourses: [59],
        availability: createAvailability([7, 9]),
    },
    {
        id: 32,
        name: "Mtra. Ericka (Inglés)",
        role: "Inglés",
        window: "15:50 - 16:45",
        assignedCourses: [15],
        availability: createAvailability([10, 11, 12]),
    },
];

// ============================================================================
// CATÁLOGO DE MATERIAS ITIID CON SOPORTE MULTI-PROFESOR (teacher_ids)
// ============================================================================
export const INITIAL_COURSES = [
    // Inmersión (Cuatrimestre 0)
    { id: 59, name: "Inglés Inmersión", cuatrimestre: 0, weekly_sessions: 5, teacher_ids: [31], teacher_id: 31 },
    { id: 60, name: "Algoritmos y Programación", cuatrimestre: 0, weekly_sessions: 5, teacher_ids: [4], teacher_id: 4 },
    { id: 61, name: "Desarrollo Habilidades para Aprender", cuatrimestre: 0, weekly_sessions: 5, teacher_ids: [11], teacher_id: 11 },
    { id: 62, name: "Trigonometría y Geometría Analítica", cuatrimestre: 0, weekly_sessions: 5, teacher_ids: [25], teacher_id: 25 },
    { id: 63, name: "Aritmética y Álgebra", cuatrimestre: 0, weekly_sessions: 5, teacher_ids: [24], teacher_id: 24 },
    { id: 64, name: "Tutoría Inmersión", cuatrimestre: 0, weekly_sessions: 1, teacher_ids: [23], teacher_id: 23 },

    // 1er Cuatrimestre (1-1, 1-2, 1-3)
    { id: 1, name: "Inglés I", cuatrimestre: 1, weekly_sessions: 5, teacher_ids: [26, 27], group_teachers: [26, 26, 27], teacher_id: 26 },
    { id: 2, name: "Desarrollo Humano y Valores", cuatrimestre: 1, weekly_sessions: 4, teacher_ids: [19, 23], group_teachers: [19, 23, 19], teacher_id: 19 },
    { id: 3, name: "Fundamentos Matemáticos", cuatrimestre: 1, weekly_sessions: 7, teacher_ids: [13], teacher_id: 13 },
    { id: 4, name: "Fundamentos de Redes", cuatrimestre: 1, weekly_sessions: 4, teacher_ids: [5, 8], group_teachers: [5, 8, 5], teacher_id: 5 },
    { id: 5, name: "Física", cuatrimestre: 1, weekly_sessions: 6, teacher_ids: [9, 18], group_teachers: [9, 18, 18], teacher_id: 9 },
    { id: 6, name: "Fundamentos de Programación", cuatrimestre: 1, weekly_sessions: 4, teacher_ids: [16, 10, 9], group_teachers: [16, 10, 9], teacher_id: 16 },
    { id: 7, name: "Comunicación y Habilidades Digitales", cuatrimestre: 1, weekly_sessions: 5, teacher_ids: [11, 1], group_teachers: [11, 1, 1], teacher_id: 11 },
    { id: 101, name: "Tutoría I", cuatrimestre: 1, weekly_sessions: 1, teacher_ids: [13, 1, 5], group_teachers: [13, 1, 5], teacher_id: 13 },

    // 2do Cuatrimestre (2-1, 2-2, 2-3 en Ene–Abr)
    { id: 8, name: "Inglés II", cuatrimestre: 2, weekly_sessions: 5, teacher_ids: [26, 27, 31], group_teachers: [26, 27, 31], teacher_id: 26 },
    { id: 9, name: "Habilidades Socioemocionales y Manejo de Conflictos", cuatrimestre: 2, weekly_sessions: 4, teacher_ids: [1, 20, 22], group_teachers: [1, 20, 22], teacher_id: 1 },
    { id: 10, name: "Cálculo Diferencial", cuatrimestre: 2, weekly_sessions: 6, teacher_ids: [13, 18, 24], group_teachers: [13, 18, 24], teacher_id: 13 },
    { id: 11, name: "Conmutación y Enrutamiento de Redes", cuatrimestre: 2, weekly_sessions: 5, teacher_ids: [5, 8, 2], group_teachers: [5, 8, 2], teacher_id: 5 },
    { id: 12, name: "Probabilidad y Estadística", cuatrimestre: 2, weekly_sessions: 5, teacher_ids: [13, 15, 25], group_teachers: [13, 15, 25], teacher_id: 13 },
    { id: 13, name: "Programación Estructurada", cuatrimestre: 2, weekly_sessions: 5, teacher_ids: [12, 10, 16], group_teachers: [12, 10, 16], teacher_id: 12 },
    { id: 14, name: "Sistemas Operativos", cuatrimestre: 2, weekly_sessions: 5, teacher_ids: [23, 3, 11], group_teachers: [23, 3, 11], teacher_id: 23 },

    // 3er Cuatrimestre (3-1)
    { id: 15, name: "Inglés III", cuatrimestre: 3, weekly_sessions: 5, teacher_ids: [32], teacher_id: 32 },
    { id: 16, name: "Desarrollo del Pensamiento y Toma de Decisiones", cuatrimestre: 3, weekly_sessions: 4, teacher_ids: [21], teacher_id: 21 },
    { id: 17, name: "Cálculo Integral", cuatrimestre: 3, weekly_sessions: 4, teacher_ids: [18], teacher_id: 18 },
    { id: 18, name: "Tópicos de Calidad para el Diseño de Software", cuatrimestre: 3, weekly_sessions: 6, teacher_ids: [11], teacher_id: 11 },
    { id: 19, name: "Bases de Datos", cuatrimestre: 3, weekly_sessions: 5, teacher_ids: [17], teacher_id: 17 },
    { id: 20, name: "Programación Orientada a Objetos", cuatrimestre: 3, weekly_sessions: 7, teacher_ids: [2], teacher_id: 2 },
    { id: 21, name: "Proyecto Integrador I", cuatrimestre: 3, weekly_sessions: 4, teacher_ids: [1], teacher_id: 1 },
    { id: 103, name: "Tutoría III", cuatrimestre: 3, weekly_sessions: 1, teacher_ids: [2], teacher_id: 2 },

    // 4to Cuatrimestre (4-1, 4-2, 4-3)
    { id: 22, name: "Inglés IV", cuatrimestre: 4, weekly_sessions: 5, teacher_ids: [28, 27], group_teachers: [28, 27, 27], teacher_id: 28 },
    { id: 23, name: "Ética Profesional", cuatrimestre: 4, weekly_sessions: 4, teacher_ids: [19, 20, 23], group_teachers: [19, 20, 23], teacher_id: 19 },
    { id: 24, name: "Cálculo de Varias Variables", cuatrimestre: 4, weekly_sessions: 5, teacher_ids: [18, 15], group_teachers: [18, 15, 15], teacher_id: 18 },
    { id: 25, name: "Aplicaciones Web", cuatrimestre: 4, weekly_sessions: 5, teacher_ids: [14, 7], group_teachers: [14, 7, 7], teacher_id: 14 },
    { id: 26, name: "Estructura de Datos", cuatrimestre: 4, weekly_sessions: 5, teacher_ids: [12, 14], group_teachers: [12, 14, 14], teacher_id: 12 },
    { id: 27, name: "Desarrollo de Aplicaciones Móviles", cuatrimestre: 4, weekly_sessions: 6, teacher_ids: [17, 3], group_teachers: [17, 3, 3], teacher_id: 17 },
    { id: 28, name: "Análisis y Diseño de Software", cuatrimestre: 4, weekly_sessions: 5, teacher_ids: [10, 12], group_teachers: [10, 12, 12], teacher_id: 10 },
    { id: 104, name: "Tutoría IV", cuatrimestre: 4, weekly_sessions: 1, teacher_ids: [18, 3, 23], group_teachers: [18, 3, 23], teacher_id: 18 },

    // 5to Cuatrimestre (5-1, 5-2, 5-3 en Ene–Abr)
    { id: 29, name: "Inglés V", cuatrimestre: 5, weekly_sessions: 5, teacher_ids: [28, 27, 32], group_teachers: [28, 27, 32], teacher_id: 28 },
    { id: 30, name: "Liderazgo de Equipos de Alto Desempeño", cuatrimestre: 5, weekly_sessions: 4, teacher_ids: [19, 21, 23], group_teachers: [19, 21, 23], teacher_id: 19 },
    { id: 31, name: "Ecuaciones Diferenciales", cuatrimestre: 5, weekly_sessions: 5, teacher_ids: [3, 18, 24], group_teachers: [3, 18, 24], teacher_id: 3 },
    { id: 32, name: "Aplicaciones Web Orientadas a Servicios", cuatrimestre: 5, weekly_sessions: 6, teacher_ids: [14, 7, 23], group_teachers: [14, 7, 23], teacher_id: 14 },
    { id: 33, name: "Bases de Datos Avanzadas", cuatrimestre: 5, weekly_sessions: 5, teacher_ids: [17, 12, 14], group_teachers: [17, 12, 14], teacher_id: 17 },
    { id: 34, name: "Estándares y Métricas para el Desarrollo de Software", cuatrimestre: 5, weekly_sessions: 6, teacher_ids: [11, 4, 1], group_teachers: [11, 4, 1], teacher_id: 11 },
    { id: 35, name: "Proyecto Integrador II", cuatrimestre: 5, weekly_sessions: 4, teacher_ids: [6, 2, 1], group_teachers: [6, 2, 1], teacher_id: 6 },

    // 6to Cuatrimestre
    { id: 36, name: "Estadía Técnico Superior Universitario", cuatrimestre: 6, weekly_sessions: 40, teacher_ids: [], teacher_id: null },

    // 7mo Cuatrimestre (7-1, 7-2)
    { id: 37, name: "Inglés VI", cuatrimestre: 7, weekly_sessions: 5, teacher_ids: [29, 30], group_teachers: [29, 30], teacher_id: 29 },
    { id: 38, name: "Habilidades Gerenciales", cuatrimestre: 7, weekly_sessions: 4, teacher_ids: [20, 22], group_teachers: [20, 22], teacher_id: 20 },
    { id: 39, name: "Formulación de Proyectos de Tecnología", cuatrimestre: 7, weekly_sessions: 4, teacher_ids: [4], group_teachers: [4, 4], teacher_id: 4 },
    { id: 40, name: "Fundamentos de Inteligencia Artificial", cuatrimestre: 7, weekly_sessions: 6, teacher_ids: [2, 6], group_teachers: [2, 6], teacher_id: 2 },
    { id: 41, name: "Ética y Legislación en Tecnologías de la Información", cuatrimestre: 7, weekly_sessions: 4, teacher_ids: [1, 16], group_teachers: [1, 16], teacher_id: 1 },
    { id: 42, name: "Bases de Datos en la Nube", cuatrimestre: 7, weekly_sessions: 6, teacher_ids: [14, 10], group_teachers: [14, 10], teacher_id: 14 },
    { id: 43, name: "Seguridad Informática", cuatrimestre: 7, weekly_sessions: 6, teacher_ids: [8, 5, 4], group_teachers: [8, 5], teacher_id: 8 },
    { id: 107, name: "Tutoría VII", cuatrimestre: 7, weekly_sessions: 1, teacher_ids: [4, 10], group_teachers: [4, 10], teacher_id: 4 },

    // 8vo Cuatrimestre (8-1, 8-2 en Ene–Abr)
    { id: 44, name: "Inglés VII", cuatrimestre: 8, weekly_sessions: 5, teacher_ids: [29, 30], group_teachers: [29, 30], teacher_id: 29 },
    { id: 45, name: "Electrónica Digital", cuatrimestre: 8, weekly_sessions: 5, teacher_ids: [8, 3], group_teachers: [8, 3], teacher_id: 8 },
    { id: 46, name: "Gestión de Proyectos de Tecnología", cuatrimestre: 8, weekly_sessions: 4, teacher_ids: [4, 20], group_teachers: [4, 20], teacher_id: 4 },
    { id: 47, name: "Programación para Inteligencia Artificial", cuatrimestre: 8, weekly_sessions: 5, teacher_ids: [6, 2], group_teachers: [6, 2], teacher_id: 6 },
    { id: 48, name: "Administración de Servidores", cuatrimestre: 8, weekly_sessions: 5, teacher_ids: [10, 11], group_teachers: [10, 11], teacher_id: 10 },
    { id: 49, name: "Optativa II — Programación Móvil Avanzada", cuatrimestre: 8, weekly_sessions: 6, teacher_ids: [17, 14], group_teachers: [17, 14], teacher_id: 17 },
    { id: 50, name: "Informática Forense", cuatrimestre: 8, weekly_sessions: 5, teacher_ids: [5, 4], group_teachers: [5, 4], teacher_id: 5 },

    // 9no Cuatrimestre
    { id: 51, name: "Inglés VIII", cuatrimestre: 9, weekly_sessions: 5, teacher_ids: [30], teacher_id: 30 },
    { id: 52, name: "Internet de las Cosas", cuatrimestre: 9, weekly_sessions: 5, teacher_ids: [8], teacher_id: 8 },
    { id: 53, name: "Evaluación de Proyectos de Tecnología", cuatrimestre: 9, weekly_sessions: 4, teacher_ids: [20], teacher_id: 20 },
    { id: 54, name: "Ciencia de Datos", cuatrimestre: 9, weekly_sessions: 6, teacher_ids: [2], teacher_id: 2 },
    { id: 55, name: "Tecnologías Disruptivas", cuatrimestre: 9, weekly_sessions: 5, teacher_ids: [9], teacher_id: 9 },
    { id: 56, name: "Optativa III", cuatrimestre: 9, weekly_sessions: 6, teacher_ids: [17], teacher_id: 17 },
    { id: 57, name: "Proyecto Integrador III", cuatrimestre: 9, weekly_sessions: 4, teacher_ids: [21], teacher_id: 21 },

    // 10mo Cuatrimestre
    { id: 58, name: "Estadía Ingeniería", cuatrimestre: 10, weekly_sessions: 40, teacher_ids: [], teacher_id: null },
];
