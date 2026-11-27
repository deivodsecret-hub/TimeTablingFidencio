import { storage, getCourseTeacherIds, pickTeacherForCourseGroup, isTeacherUnavailable } from './storage';
import { TIME_SLOTS } from './initialData';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = 'http://localhost:3001/api/ia/action';

const IA_KEYS = {
    LLM_CONFIG: 'utp_ia_llm_config',
    PREFERENCES: 'utp_ia_preferences',
    LAST_RUN: 'utp_ia_last_run',
    BENCHMARK: 'utp_ia_benchmark',
    F1_EVAL: 'utp_ia_f1_eval',
    CHECKLIST: 'utp_ia_checklist',
    ACTIVE_INSTANCE: 'utp_ia_active_instance',
};

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const DEFAULT_LLM_CONFIG = {
    provider: 'ollama', // 100% local con Ollama (sin APIs externas)
    model: 'qwen2.5:3b',
    base_url: 'http://127.0.0.1:11434',
};

export async function callIAAction(payload) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error || 'Error comunicando con el motor IA');
    }
    return data;
}

export const iaStorage = {
    getLLMConfig: () => {
        try {
            const stored = JSON.parse(localStorage.getItem(IA_KEYS.LLM_CONFIG) || '{}');
            const cleanUrl =
                stored.base_url && (stored.base_url.includes('127.0.0.1') || stored.base_url.includes('localhost'))
                    ? stored.base_url
                    : DEFAULT_LLM_CONFIG.base_url;
            return {
                provider: 'ollama',
                model: stored.model && !stored.model.includes('gemini') && !stored.model.includes('gpt-')
                    ? stored.model
                    : DEFAULT_LLM_CONFIG.model,
                base_url: cleanUrl,
            };
        } catch {
            return DEFAULT_LLM_CONFIG;
        }
    },
    setLLMConfig: (cfg) =>
        localStorage.setItem(
            IA_KEYS.LLM_CONFIG,
            JSON.stringify({
                provider: 'ollama',
                model: cfg?.model || DEFAULT_LLM_CONFIG.model,
                base_url: cfg?.base_url || DEFAULT_LLM_CONFIG.base_url,
            })
        ),

    getPreferences: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.PREFERENCES) || '[]');
        } catch {
            return [];
        }
    },
    setPreferences: (prefs) => localStorage.setItem(IA_KEYS.PREFERENCES, JSON.stringify(prefs)),

    getLastRun: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.LAST_RUN) || 'null');
        } catch {
            return null;
        }
    },
    setLastRun: (run) => localStorage.setItem(IA_KEYS.LAST_RUN, JSON.stringify(run)),

    getBenchmark: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.BENCHMARK) || 'null');
        } catch {
            return null;
        }
    },
    setBenchmark: (b) => localStorage.setItem(IA_KEYS.BENCHMARK, JSON.stringify(b)),

    getF1Eval: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.F1_EVAL) || 'null');
        } catch {
            return null;
        }
    },
    setF1Eval: (e) => localStorage.setItem(IA_KEYS.F1_EVAL, JSON.stringify(e)),

    getChecklist: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.CHECKLIST) || '{}');
        } catch {
            return {};
        }
    },
    setChecklist: (c) => localStorage.setItem(IA_KEYS.CHECKLIST, JSON.stringify(c)),

    getActiveInstance: () => {
        try {
            return JSON.parse(localStorage.getItem(IA_KEYS.ACTIVE_INSTANCE) || 'null');
        } catch {
            return null;
        }
    },
    setActiveInstance: (inst) => localStorage.setItem(IA_KEYS.ACTIVE_INSTANCE, JSON.stringify(inst)),
};

/**
 * Reads live data from the ORIGINAL project's storage.js without mutating it.
 */
export function buildInstanceFromOriginalStorage() {
    const teachers = storage.getTeachers();
    const allCourses = storage.getCourses();
    const studentsByQuarter = storage.getStudents();
    const constraints = storage.getConstraints();
    const approvedPrefs = iaStorage.getPreferences().filter((p) => p.approved !== false);

    const teacherMap = Object.fromEntries(teachers.map((t) => [parseInt(t.id, 10), t]));
    const excludedTeachers = teachers
        .filter((t) => isTeacherUnavailable(t))
        .map((t) => parseInt(t.id, 10))
        .filter(Boolean);

    const GROUP_CAPACITY = 35;
    let usedFallbackStudents = false;
    const activeStudents = { ...studentsByQuarter };
    const totalStudents = Object.values(activeStudents).reduce((s, v) => s + (parseInt(v) || 0), 0);

    // If user hasn't entered students in Datos yet, use 7th quarter (30 students) as live preview
    if (totalStudents === 0) {
        activeStudents[7] = 30;
        usedFallbackStudents = true;
    }

    const rooms = [];
    const expandedCourses = [];
    const assignedLoad = {};

    for (let q = 0; q <= 10; q++) {
        const count = parseInt(activeStudents[q]) || 0;
        if (count <= 0) continue;
        const numGroups = Math.ceil(count / GROUP_CAPACITY);
        // Skip 40-hour Estadía blocks only if exceeding regular classroom slots; keep standard courses
        const quarterCourses = allCourses.filter(
            (c) => parseInt(c.cuatrimestre, 10) === q && (parseInt(c.weekly_sessions) || 1) <= 15
        );

        for (let i = 0; i < numGroups; i++) {
            const groupIndex = i + 1;
            const groupId = q === 0 ? (90 + groupIndex) : (q * 100 + groupIndex);
            const groupName = q === 0
                ? (numGroups === 1 ? 'Inmersión' : `Inm-${groupIndex}`)
                : `${q}-${groupIndex}`;

            rooms.push({
                id: groupId,
                name: q === 0 ? groupName : `Grupo ${groupName}`,
                capacity: GROUP_CAPACITY,
                group_id: groupId,
                type: 'aula',
                shift: q === 0 || q === 3 ? 'vespertino' : 'matutino',
            });

            quarterCourses.forEach((course) => {
                const candidateIds = getCourseTeacherIds(course, teachers).filter(
                    (tid) => !isTeacherUnavailable(teacherMap[tid])
                );
                const resolvedTeacher = pickTeacherForCourseGroup(course, i, teachers, assignedLoad) || 0;
                const sessions = parseInt(course.weekly_sessions || 1, 10);
                if (resolvedTeacher) {
                    assignedLoad[resolvedTeacher] = (assignedLoad[resolvedTeacher] || 0) + sessions;
                }
                expandedCourses.push({
                    ...course,
                    original_id: course.id,
                    id: course.id * 1000 + groupId,
                    group_id: groupId,
                    teacher_id: resolvedTeacher,
                    teacher_ids: candidateIds,
                    students: Math.min(GROUP_CAPACITY, Math.ceil(count / numGroups)),
                });
            });
        }
    }

    return {
        id: 'ORIGINAL',
        name: usedFallbackStudents
            ? 'Datos del Sistema Original (Vista previa 7° Cuatrimestre)'
            : 'Datos Actuales del Sistema Original (UPV)',
        description: usedFallbackStudents
            ? 'No había alumnos registrados en Datos; se tomó 7° cuatrimestre (30 alumnos) con tus profesores y materias originales.'
            : `Instancia generada en vivo desde tus datos de LocalStorage (${rooms.length} grupos, ${expandedCourses.length} materias, ${teachers.length} docentes).`,
        usedFallbackStudents,
        teachers,
        rooms,
        courses: expandedCourses,
        constraints,
        excluded_teachers: excludedTeachers,
        blocked_slots: [],
        preferences: approvedPrefs,
        manual_schedule: storage.getSchedule() || null,
    };
}

export function downloadBase64File(b64, filename, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const byteChars = atob(b64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNums)], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * Exports PDF reports matching original Schedule.jsx style:
 * mode: 'sabana' | 'group' | 'teacher' | 'room'
 */
export function exportIAPDF(instance, schedule, validation, mode = 'sabana') {
    if (!instance || !schedule || schedule.length === 0) return;

    const coursesById = Object.fromEntries((instance.courses || []).map((c) => [c.id, c]));
    const teachersById = Object.fromEntries((instance.teachers || []).map((t) => [t.id, t]));
    const roomsById = Object.fromEntries((instance.rooms || []).map((r) => [r.id, r]));

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageW = doc.internal.pageSize.width;

    if (mode === 'sabana') {
        // Horizontal UPV Sábana General (groups side-by-side in clean landscape pairs per page, including Franjas de Inglés)
        const roomsList = instance.rooms || [];
        const dayShorts = ['L', 'M', 'Mi', 'J', 'V'];
        const GROUPS_PER_PAGE = 2;

        for (let offset = 0; offset < roomsList.length; offset += GROUPS_PER_PAGE) {
            if (offset > 0) doc.addPage();
            const chunk = roomsList.slice(offset, offset + GROUPS_PER_PAGE);

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('SÁBANA GENERAL DE HORARIOS — ITIID (FORMATO UPV)', pageW / 2, 12, { align: 'center' });
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const subtitle = `${instance.name || 'ITIID'} | Factible: ${validation?.feasible ? 'SÍ (0 duras)' : `NO (${validation?.hard_violations?.total || 0} duras)`} | Penalización Blanda: ${validation?.soft_penalty ?? '-'} | Hoja ${Math.floor(offset / GROUPS_PER_PAGE) + 1}/${Math.ceil(roomsList.length / GROUPS_PER_PAGE)}`;
            doc.text(subtitle, pageW / 2, 18, { align: 'center' });

            const headRow1 = [{ content: 'Hora', rowSpan: 2, styles: { valign: 'middle', fillColor: [51, 65, 85] } }];
            const headRow2 = [];
            chunk.forEach((r) => {
                headRow1.push({ content: r.name, colSpan: 5, styles: { halign: 'center', fillColor: [29, 78, 216] } });
                dayShorts.forEach((ds) => headRow2.push({ content: ds, styles: { halign: 'center', fillColor: [219, 234, 254], textColor: [30, 58, 138] } }));
            });

            const hasEvening = schedule.some((it) => it.start_slot % TIME_SLOTS.length >= 14);
            const visSlots = TIME_SLOTS.map((hourLabel, hIdx) => ({ hourLabel, hIdx })).filter(
                ({ hIdx }) => hIdx !== 8 && (hasEvening || hIdx <= 13)
            );
            const bodyRows = visSlots.map(({ hourLabel, hIdx }) => {
                const isBreak = hourLabel.includes('Receso');
                const row = [{ content: isBreak ? 'Receso' : hourLabel, styles: { fontStyle: 'bold', fillColor: isBreak ? [254, 243, 199] : [248, 250, 252] } }];
                chunk.forEach((r) => {
                    for (let dIdx = 0; dIdx < 5; dIdx++) {
                        if (isBreak) {
                            row.push({ content: 'Receso', styles: { fillColor: [254, 243, 199], textColor: [146, 64, 14] } });
                            continue;
                        }
                        const slot = dIdx * TIME_SLOTS.length + hIdx;
                        const matches = schedule.filter((it) => it.room_id === r.id && it.start_slot === slot);
                        const blk = (instance.blocked_slots || []).find((b) => b.type !== 'teacher' && b.room_id === r.id && b.slot_id === slot);
                        if (matches.length > 0) {
                            const txt = matches
                                .map((m) => {
                                    const c = coursesById[m.course_id] || {};
                                    const t = teachersById[c.teacher_id] || {};
                                    return `${c.name || m.course_id}\n${t.name || ''}`;
                                })
                                .join('\n---\n');
                            row.push({ content: txt, styles: { fillColor: [239, 246, 255] } });
                        } else if (blk) {
                            row.push({ content: `${blk.subject || 'INGLÉS'}\n${blk.teacher || blk.reason || ''}`, styles: { fillColor: [224, 242, 254], textColor: [3, 105, 161] } });
                        } else {
                            row.push({ content: '-' });
                        }
                    }
                });
                return row;
            });

            autoTable(doc, {
                head: [headRow1, headRow2],
                body: bodyRows,
                startY: 22,
                theme: 'grid',
                styles: { fontSize: 6.2, cellPadding: 1.2, halign: 'center', valign: 'middle', overflow: 'linebreak' },
                columnStyles: { 0: { cellWidth: 22 } },
            });
        }
        doc.save('Sabana_General_ITIID.pdf');
        return;
    }

    // Build grid pages for 'group', 'teacher', or 'room'
    let entities = [];
    if (mode === 'group' || mode === 'room') {
        entities = (instance.rooms || []).map((r) => ({ id: r.id, label: r.name }));
    } else if (mode === 'teacher') {
        const usedIds = [...new Set(schedule.map((it) => coursesById[it.course_id]?.teacher_id).filter(Boolean))];
        entities = usedIds.map((tid) => ({ id: tid, label: teachersById[tid]?.name || `Docente ${tid}` }));
    }

    entities.forEach((ent, idx) => {
        if (idx > 0) doc.addPage();
        const titlePrefix = mode === 'teacher' ? 'DOCENTE' : mode === 'room' ? 'AULA' : 'GRUPO';
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`HORARIO POR ${titlePrefix} — ITIID`, pageW / 2, 14, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`${titlePrefix}: ${ent.label}`, pageW / 2, 21, { align: 'center' });

        const tableData = TIME_SLOTS.map((hourLabel, hIdx) => {
            const isBreak = hourLabel.includes('Receso');
            const row = [hourLabel];
            DAYS.forEach((_, dIdx) => {
                if (isBreak) {
                    row.push('RECESO');
                    return;
                }
                const slot = dIdx * TIME_SLOTS.length + hIdx;
                const matches = schedule.filter((it) => {
                    if (it.start_slot !== slot) return false;
                    if (mode === 'teacher') return coursesById[it.course_id]?.teacher_id === ent.id;
                    return it.room_id === ent.id;
                });
                if (matches.length === 0) {
                    row.push('-');
                } else {
                    row.push(
                        matches
                            .map((m) => {
                                const c = coursesById[m.course_id] || {};
                                const extra =
                                    mode === 'teacher'
                                        ? roomsById[m.room_id]?.name || `Aula ${m.room_id}`
                                        : teachersById[c.teacher_id]?.name || 'Sin docente';
                                return `${c.name || m.course_id}\n${extra}`;
                            })
                            .join('\n---\n')
                    );
                }
            });
            return row;
        });

        autoTable(doc, {
            head: [['Hora', ...DAYS]],
            body: tableData,
            startY: 26,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center', valign: 'middle' },
            columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' } },
            alternateRowStyles: { fillColor: [248, 250, 252] },
        });
    });

    const fname = mode === 'teacher' ? 'Horarios_Por_Docente.pdf' : mode === 'room' ? 'Horarios_Por_Aula.pdf' : 'Horarios_Por_Grupo.pdf';
    doc.save(fname);
}
