import React, { useState, useEffect, useRef } from 'react';
import {
    Play,
    Loader,
    FileSpreadsheet,
    FileText,
    Upload,
    Download,
    CheckCircle2,
    AlertTriangle,
    Cpu,
    RefreshCw,
    Sliders,
    Layers,
    Users,
    Building2,
    Table2,
    ShieldCheck,
    Plus,
    X,
    Clock,
    Calendar,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { TIME_SLOTS } from '../utils/initialData';
import {
    DAYS,
    callIAAction,
    iaStorage,
    buildInstanceFromOriginalStorage,
    downloadBase64File,
    exportIAPDF,
} from '../utils/iaStorage';

const StatCard = ({ title, value, subtitle, icon, color }) => {
    const IconComp = icon;
    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium">{title}</p>
                    <h3 className="text-2xl font-bold mt-1 text-gray-800">{value}</h3>
                    <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
                </div>
                <div className={`p-3 rounded-lg ${color}`}>
                    <IconComp size={22} className="text-white" />
                </div>
            </div>
        </div>
    );
};

const IAOptimizer = () => {
    const [sourceKey, setSourceKey] = useState('ITIID_2026'); // ITIID_2026 | ORIGINAL | I1 | I2 | I3 | I4 | EXCEL
    const [instance, setInstance] = useState(null);
    const [method, setMethod] = useState('cpsat'); // cpsat | genetic | local_search
    const [scenario, setScenario] = useState('C'); // A | B | C
    const [cpsatTime, setCpsatTime] = useState(15); // 6 | 15 | 30 segundos
    const [agRuns, setAgRuns] = useState(10);
    const [restarts, setRestarts] = useState(5);

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(iaStorage.getLastRun());
    const [excelWarnings, setExcelWarnings] = useState([]);
    const [viewTab, setViewTab] = useState('sabana'); // sabana | teachers_sabana | group | teacher | room
    const [selectedEntity, setSelectedEntity] = useState('');
    const [showJson, setShowJson] = useState(false);

    // I4 Rescheduling controls (dinámico: profesor + múltiples días + horas específicas + cola de bloqueos)
    const TEACHABLE_SLOTS = TIME_SLOTS.map((label, idx) => ({ label, idx })).filter(
        ({ label }) => !label.includes('Receso')
    );
    const ALL_HOUR_INDICES = TEACHABLE_SLOTS.map(({ idx }) => idx);
    const MORNING_HOUR_INDICES = TEACHABLE_SLOTS.filter(({ idx }) => idx <= 7).map(({ idx }) => idx);
    const AFTERNOON_HOUR_INDICES = TEACHABLE_SLOTS.filter(({ idx }) => idx >= 9).map(({ idx }) => idx);

    const [changeTeacherId, setChangeTeacherId] = useState('');
    const [changeDays, setChangeDays] = useState([2]); // Selección múltiple dinámica (0=Lun..4=Vie)
    const [changeHourMode, setChangeHourMode] = useState('all'); // all | morning | afternoon | custom | exclude_course | no_quarter
    const [changeHours, setChangeHours] = useState([0, 1, 2, 3]); // Bloques específicos cuando mode === 'custom'
    const [changeCourseId, setChangeCourseId] = useState(''); // Materia a quitar cuando mode === 'exclude_course'
    const [changeRules, setChangeRules] = useState([]); // Cola dinámica de múltiples bloqueos / exclusiones

    const toggleChangeDay = (dayIdx) => {
        setChangeDays((prev) =>
            prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort((a, b) => a - b)
        );
    };

    const toggleChangeHour = (hourIdx) => {
        setChangeHours((prev) =>
            prev.includes(hourIdx) ? prev.filter((h) => h !== hourIdx) : [...prev, hourIdx].sort((a, b) => a - b)
        );
    };

    const getSelectedHours = () => {
        if (changeHourMode === 'morning') return MORNING_HOUR_INDICES;
        if (changeHourMode === 'afternoon') return AFTERNOON_HOUR_INDICES;
        if (changeHourMode === 'custom') return changeHours;
        return ALL_HOUR_INDICES;
    };

    const formatHoursSummary = (mode, hrs) => {
        if (mode === 'all' || hrs.length === ALL_HOUR_INDICES.length) return 'Todo el día';
        if (mode === 'morning') return 'Matutino (07:00–13:55)';
        if (mode === 'afternoon') return 'Vespertino (14:00–20:45)';
        if (hrs.length <= 3) return hrs.map((h) => TIME_SLOTS[h]?.split(' ')[0] || h).join(', ');
        return `${hrs.length} bloques (${TIME_SLOTS[hrs[0]]?.split(' ')[0]}…${TIME_SLOTS[hrs[hrs.length - 1]]?.split(' - ')[1] || ''})`;
    };

    const getTeacherAssignedCourses = (tidVal) => {
        const tid = parseInt(tidVal, 10);
        if (!tid || !instance?.courses) return [];
        return instance.courses.filter((c) => parseInt(c.teacher_id, 10) === tid);
    };

    const handleAddChangeRule = () => {
        if (!changeTeacherId) {
            Swal.fire({ icon: 'warning', title: 'Selecciona un profesor', text: 'Elige primero al docente.' });
            return;
        }
        const tid = parseInt(changeTeacherId, 10);
        const teacherObj = (instance?.teachers || []).find((t) => parseInt(t.id, 10) === tid);
        const teacherName = teacherObj?.name || `Docente ${tid}`;

        if (changeHourMode === 'no_quarter') {
            setChangeRules((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-${Math.random()}`,
                    kind: 'no_quarter',
                    teacherId: tid,
                    teacherName,
                },
            ]);
            return;
        }

        if (changeHourMode === 'exclude_course') {
            const assigned = getTeacherAssignedCourses(tid);
            const targetCid = parseInt(changeCourseId || assigned[0]?.id || 0, 10);
            const courseObj = assigned.find((c) => parseInt(c.id, 10) === targetCid);
            if (!courseObj) {
                Swal.fire({
                    icon: 'info',
                    title: 'Sin materias asignadas',
                    text: `${teacherName} ya no tiene materias asignadas en esta instancia.`,
                });
                return;
            }
            const roomObj = (instance?.rooms || []).find((r) => parseInt(r.group_id || r.id, 10) === parseInt(courseObj.group_id, 10));
            setChangeRules((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-${Math.random()}`,
                    kind: 'exclude_course',
                    teacherId: tid,
                    teacherName,
                    courseId: parseInt(courseObj.id, 10),
                    courseName: courseObj.name,
                    groupLabel: roomObj?.name || `Grupo ${courseObj.group_id}`,
                },
            ]);
            return;
        }

        const hrs = getSelectedHours();
        if (changeDays.length === 0 || hrs.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Faltan días u horas',
                text: 'Marca al menos un día y un bloque horario para bloquear.',
            });
            return;
        }
        setChangeRules((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random()}`,
                kind: 'slots',
                teacherId: tid,
                teacherName,
                days: [...changeDays],
                hours: [...hrs],
                mode: changeHourMode,
            },
        ]);
    };

    const handleRemoveChangeRule = (ruleId) => {
        setChangeRules((prev) => prev.filter((r) => r.id !== ruleId));
    };

    const fileInputRef = useRef(null);

    useEffect(() => {
        const saved = iaStorage.getActiveInstance();
        if (saved && saved.id === 'ORIGINAL') {
            const origInst = buildInstanceFromOriginalStorage();
            setInstance(origInst);
            setSourceKey('ORIGINAL');
            iaStorage.setActiveInstance(origInst);
            if (origInst.teachers?.length > 0) setChangeTeacherId(String(origInst.teachers[0].id));
            if (origInst.rooms?.length > 0) setSelectedEntity(String(origInst.rooms[0].id));
            return;
        }
        const isFreshItiid = saved && saved.id === 'ITIID_2026' && saved.manual_schedule && saved.rooms?.[0]?.allowed_hours;
        const isStaleEneAbr = saved && saved.id === 'ITIID_ENE_ABR_2027' && saved.rooms?.some((r) => String(r.name || '').includes('(ex '));
        if (saved && (saved.id !== 'ITIID_2026' || isFreshItiid) && !isStaleEneAbr) {
            setInstance(saved);
            setSourceKey(saved.id || 'ITIID_2026');
            if (saved.teachers?.length > 0) {
                setChangeTeacherId(String(saved.change_teacher_id || saved.teachers[0].id));
            }
            if (saved.rooms?.length > 0) {
                setSelectedEntity(String(saved.rooms[0].id));
            }
        } else {
            const targetId = isStaleEneAbr ? 'ITIID_ENE_ABR_2027' : 'ITIID_2026';
            callIAAction({ action: 'instance', instance_id: targetId })
                .then((data) => {
                    const loaded = data.instance;
                    setInstance(loaded);
                    setSourceKey(targetId);
                    iaStorage.setActiveInstance(loaded);
                    if (loaded.rooms?.length > 0) setSelectedEntity(String(loaded.rooms[0].id));
                    if (loaded.teachers?.length > 0) setChangeTeacherId(String(loaded.teachers[0].id));
                })
                .catch(() => {
                    const origInst = buildInstanceFromOriginalStorage();
                    setInstance(origInst);
                    setSourceKey('ORIGINAL');
                    iaStorage.setActiveInstance(origInst);
                    if (origInst.rooms.length > 0) setSelectedEntity(String(origInst.rooms[0].id));
                    if (origInst.teachers.length > 0) setChangeTeacherId(String(origInst.teachers[0].id));
                });
        }
    }, []);

    const loadSource = async (key) => {
        setSourceKey(key);
        setExcelWarnings([]);
        // Clear previous instance schedule to prevent mismatched IDs across instances
        setResult((prev) => (prev && prev.instance_id === key ? prev : null));
        if (key === 'ORIGINAL') {
            const origInst = buildInstanceFromOriginalStorage();
            setInstance(origInst);
            iaStorage.setActiveInstance(origInst);
            if (viewTab === 'teacher') {
                setSelectedEntity(origInst.teachers[0] ? String(origInst.teachers[0].id) : '');
            } else if (origInst.rooms.length > 0) {
                setSelectedEntity(String(origInst.rooms[0].id));
            }
            if (origInst.teachers.length > 0) setChangeTeacherId(String(origInst.teachers[0].id));
            return;
        }
        setLoading(true);
        try {
            const data = await callIAAction({ action: 'instance', instance_id: key });
            const loaded = data.instance;
            const approvedPrefs = iaStorage.getPreferences().filter((p) => p.approved !== false);
            if (approvedPrefs.length > 0) {
                loaded.preferences = [...(loaded.preferences || []), ...approvedPrefs];
            }
            setInstance(loaded);
            iaStorage.setActiveInstance(loaded);
            if (viewTab === 'teacher') {
                setSelectedEntity(loaded.teachers?.[0] ? String(loaded.teachers[0].id) : '');
            } else if (loaded.rooms?.length > 0) {
                setSelectedEntity(String(loaded.rooms[0].id));
            }
            if (loaded.teachers?.length > 0) {
                setChangeTeacherId(String(loaded.change_teacher_id || loaded.teachers[0].id));
            }
            setChangeRules([]);
            if (loaded.change_day !== undefined) setChangeDays([loaded.change_day]);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error cargando instancia', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleRunSolver = async () => {
        if (!instance) return;
        setLoading(true);
        try {
            let runInstance = instance;
            if (sourceKey === 'ORIGINAL') {
                const fresh = buildInstanceFromOriginalStorage();
                const mergedExcluded = [
                    ...new Set([...(fresh.excluded_teachers || []), ...(instance.excluded_teachers || [])]),
                ];
                runInstance = {
                    ...fresh,
                    excluded_teachers: mergedExcluded,
                    teacher_course_exclusions: instance.teacher_course_exclusions || [],
                };
                setInstance(runInstance);
            }
            const payload = {
                action: 'solve',
                method,
                scenario,
                instance: runInstance,
                runs: agRuns,
                restarts,
                time_limit_sec: method === 'cpsat' ? cpsatTime : 6.0,
                llm_config: method === 'llm_local' ? iaStorage.getLLMConfig() : undefined,
                with_validator_retry: method === 'llm_local',
            };
            const res = await callIAAction(payload);
            if (res.warning) {
                Swal.fire({ icon: 'info', title: 'Aviso del modelo local', text: res.warning });
            }
            const enriched = { ...res, instance_id: runInstance.id, instance_name: runInstance.name, scenario };
            const activeInst = res.patched_instance || runInstance;
            if (res.patched_instance) {
                setInstance(res.patched_instance);
            }
            setResult(enriched);
            iaStorage.setLastRun(enriched);
            iaStorage.setActiveInstance(activeInst);
            if (viewTab === 'teacher') {
                const cMap = Object.fromEntries((activeInst.courses || []).map((c) => [c.id, c]));
                const firstTid = (res.schedule || []).map((it) => cMap[it.course_id]?.teacher_id).find(Boolean);
                if (firstTid) setSelectedEntity(String(firstTid));
            } else if (activeInst.rooms?.length > 0) {
                setSelectedEntity(String(activeInst.rooms[0].id));
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error ejecutando motor IA', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleLoadManualExcel = async () => {
        if (!instance?.manual_schedule) return;
        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'validate',
                instance,
                schedule: instance.manual_schedule,
                scenario,
            });
            const enriched = {
                method: 'Horario Oficial del Excel (Manual)',
                method_id: 'manual',
                elapsed_ms: 1.0,
                schedule: instance.manual_schedule,
                validation: res.validation,
                instance_id: instance.id,
                instance_name: instance.name,
                scenario,
            };
            setResult(enriched);
            iaStorage.setLastRun(enriched);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error validando horario del Excel', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleRescheduleI4 = async () => {
        if (!instance) return;
        let rulesToApply = changeRules;
        if (rulesToApply.length === 0) {
            if (!changeTeacherId) {
                Swal.fire({ icon: 'warning', title: 'Selecciona un profesor', text: 'Elige primero al docente.' });
                return;
            }
            const tid = parseInt(changeTeacherId, 10);
            const teacherObj = (instance?.teachers || []).find((t) => parseInt(t.id, 10) === tid);
            const teacherName = teacherObj?.name || `Docente ${tid}`;

            if (changeHourMode === 'no_quarter') {
                rulesToApply = [{ id: 'direct', kind: 'no_quarter', teacherId: tid, teacherName }];
            } else if (changeHourMode === 'exclude_course') {
                const assigned = getTeacherAssignedCourses(tid);
                const targetCid = parseInt(changeCourseId || assigned[0]?.id || 0, 10);
                const courseObj = assigned.find((c) => parseInt(c.id, 10) === targetCid);
                if (!courseObj) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Sin materias asignadas',
                        text: `${teacherName} ya no tiene materias asignadas en esta instancia.`,
                    });
                    return;
                }
                const roomObj = (instance?.rooms || []).find((r) => parseInt(r.group_id || r.id, 10) === parseInt(courseObj.group_id, 10));
                rulesToApply = [
                    {
                        id: 'direct',
                        kind: 'exclude_course',
                        teacherId: tid,
                        teacherName,
                        courseId: parseInt(courseObj.id, 10),
                        courseName: courseObj.name,
                        groupLabel: roomObj?.name || `Grupo ${courseObj.group_id}`,
                    },
                ];
            } else {
                const hrs = getSelectedHours();
                if (changeDays.length === 0 || hrs.length === 0) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Selección incompleta',
                        text: 'Elige un profesor, al menos un día y al menos una hora para bloquear.',
                    });
                    return;
                }
                rulesToApply = [
                    {
                        id: 'direct',
                        kind: 'slots',
                        teacherId: tid,
                        teacherName,
                        days: [...changeDays],
                        hours: [...hrs],
                        mode: changeHourMode,
                    },
                ];
            }
        }

        const seen = new Set();
        const newConstraints = [];
        const excludeTeachers = [];
        const excludeCourseAssignments = [];
        rulesToApply.forEach((rule) => {
            if (rule.kind === 'no_quarter') {
                if (!excludeTeachers.includes(rule.teacherId)) excludeTeachers.push(rule.teacherId);
            } else if (rule.kind === 'exclude_course') {
                excludeCourseAssignments.push({
                    teacher_id: rule.teacherId,
                    course_id: rule.courseId,
                });
            } else {
                (rule.days || []).forEach((d) => {
                    (rule.hours || []).forEach((h) => {
                        const slotId = d * TIME_SLOTS.length + h;
                        const key = `${rule.teacherId}_${slotId}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            newConstraints.push({ teacher_id: rule.teacherId, slot_id: slotId });
                        }
                    });
                });
            }
        });

        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'reschedule',
                instance,
                scenario,
                new_constraints: newConstraints,
                exclude_teachers: excludeTeachers,
                exclude_course_assignments: excludeCourseAssignments,
                time_limit_sec: Math.max(10.0, cpsatTime),
                original_schedule: result?.instance_id === instance.id ? result.schedule : instance.manual_schedule || null,
            });
            const summaryLabel =
                rulesToApply.length === 1
                    ? rulesToApply[0].kind === 'no_quarter'
                        ? `${rulesToApply[0].teacherName} · Sin clases este cuatri`
                        : rulesToApply[0].kind === 'exclude_course'
                            ? `${rulesToApply[0].teacherName} · Sin ${rulesToApply[0].courseName}`
                            : `${rulesToApply[0].days.map((d) => DAYS[d].slice(0, 3)).join(', ')} · ${formatHoursSummary(rulesToApply[0].mode, rulesToApply[0].hours)}`
                    : `${rulesToApply.length} reglas aplicadas`;
            const enriched = {
                ...res,
                method: `CP-SAT Reprogramación I4 (${summaryLabel})`,
                instance_id: instance.id,
                instance_name: instance.name,
                scenario,
            };
            setResult(enriched);
            iaStorage.setLastRun(enriched);
            if (res.patched_instance) {
                setInstance(res.patched_instance);
                iaStorage.setActiveInstance(res.patched_instance);
            }
            setChangeRules([]);
            setChangeCourseId('');
            const stab = res.validation?.stability;
            const reassList = res.reassigned_teachers || [];
            const unassList = res.unassigned_courses || [];
            const reassMsg = reassList.length > 0
                ? ` Reasignadas ${reassList.length}: ${reassList.map((r) => `${r.course_name} (${r.from_teacher_name} → ${r.to_teacher_name})`).join('; ')}.`
                : '';
            const unassMsg = unassList.length > 0
                ? ` Sin suplente disponible (quedan «Por asignar»): ${unassList.map((u) => u.course_name).join(', ')}.`
                : '';
            Swal.fire({
                icon: res.validation?.feasible ? 'success' : 'warning',
                title: 'Reprogramación I4 Completada',
                text: (stab
                    ? `Sesiones movidas: ${stab.moved_sessions} de ${stab.total_sessions} (${stab.unchanged_pct}% intacto).`
                    : 'Horario recalculado.') + reassMsg + unassMsg,
            });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error en reprogramación', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const res = await callIAAction({ action: 'excel_template' });
            downloadBase64File(res.file_b64, res.filename);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        }
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const b64 = String(reader.result).split(',')[1];
                    const res = await callIAAction({
                        action: 'excel_import',
                        file_b64: b64,
                        filename: file.name,
                    });
                    setSourceKey('EXCEL');
                    setResult(null);
                    setInstance(res.instance);
                    iaStorage.setActiveInstance(res.instance);
                    setExcelWarnings(res.warnings || []);
                    setChangeRules([]);
                    if (res.instance.rooms?.length > 0) setSelectedEntity(String(res.instance.rooms[0].id));
                    if (res.instance.teachers?.length > 0) setChangeTeacherId(String(res.instance.teachers[0].id));
                    Swal.fire({
                        icon: res.warnings?.length ? 'warning' : 'success',
                        title: 'Excel Importado (pandas / openpyxl)',
                        text: `Cargadas ${res.instance.courses.length} materias, ${res.instance.teachers.length} docentes y ${res.instance.rooms.length} aulas.${res.warnings?.length ? ` (${res.warnings.length} avisos de faltantes)` : ''}`,
                    });
                } catch (err) {
                    Swal.fire({ icon: 'error', title: 'Error importando Excel', text: err.message });
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsDataURL(file);
        } catch {
            setLoading(false);
        } finally {
            e.target.value = '';
        }
    };

    const handleExportPythonExcel = async () => {
        if (!instance || !activeResult?.schedule) return;
        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'excel_export',
                instance,
                schedule: activeResult.schedule,
                validation: activeResult.validation,
                scenario,
            });
            downloadBase64File(res.file_b64, res.filename);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error exportando Excel', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Ensure displayed result strictly matches active instance
    const activeResult = result && (!result.instance_id || result.instance_id === instance?.id) ? result : null;

    // Helpers for rendering timetable grids
    const coursesById = Object.fromEntries((instance?.courses || []).map((c) => [c.id, c]));
    const teachersById = Object.fromEntries((instance?.teachers || []).map((t) => [t.id, t]));
    const roomsById = Object.fromEntries((instance?.rooms || []).map((r) => [r.id, r]));

    const usedTeacherIds = [
        ...new Set((activeResult?.schedule || []).map((it) => coursesById[it.course_id]?.teacher_id).filter(Boolean)),
    ];

    const handleSwitchViewTab = (tab) => {
        setViewTab(tab);
        if (tab === 'teacher') {
            if (usedTeacherIds.length > 0) setSelectedEntity(String(usedTeacherIds[0]));
        } else if (tab === 'group' || tab === 'room') {
            if (instance?.rooms?.length > 0) setSelectedEntity(String(instance.rooms[0].id));
        }
    };

    const val = activeResult?.validation;
    const hv = val?.hard_violations || {};
    const sm = val?.soft_metrics || {};

    // Match official UPV Excel rows: omit 13:55-14:00 micro-break (idx 8) and hide empty evening rows (18:00+) unless used
    const hasEveningClasses = (activeResult?.schedule || []).some((it) => it.start_slot % TIME_SLOTS.length >= 14);
    const visibleTimeSlots = TIME_SLOTS.map((label, idx) => ({ label, idx })).filter(
        ({ idx }) => idx !== 8 && (hasEveningClasses || idx <= 13)
    );

    return (
        <div className="p-8 space-y-6">
            {/* Header Row */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Optimizador IA (Python + OR-Tools)</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Motores CP-SAT (R2), Algoritmo Genético (R3), Búsqueda Local MRV + Hill Climbing (R4) y Validador Común sobre tus datos o instancias oficiales.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                        <Download size={16} />
                        Plantilla Excel
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
                    >
                        <Upload size={16} />
                        Importar Excel
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportExcel}
                        className="hidden"
                    />
                    {instance?.manual_schedule && (
                        <button
                            onClick={handleLoadManualExcel}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                            title="Muestra y valida el horario exacto armado en tu Excel"
                        >
                            <Table2 size={16} />
                            Ver Horario Excel
                        </button>
                    )}
                    <button
                        onClick={handleRunSolver}
                        disabled={loading || !instance}
                        className={`px-6 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 transition-colors ${
                            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <Play size={18} />}
                        {loading ? 'Optimizando...' : 'Ejecutar Motor IA'}
                    </button>
                </div>
            </div>

            {/* Configuration Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Data Source / Instance */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Instancia / Fuente de Datos (R1)
                        </label>
                        <select
                            value={sourceKey}
                            onChange={(e) => loadSource(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="ITIID_2026">ITIID Sep–Dic 2026 (Excel Oficial UPV — 10 Grupos)</option>
                            <option value="ITIID_ENE_ABR_2027">ITIID Ene–Abr 2027 (1°, 2°, 4°, 5°, 8° — 10 Grupos)</option>
                            <option value="ORIGINAL">Datos de mi sistema original (UPV)</option>
                            <option value="I1">I1 — Benchmark Público ITC-2007</option>
                            <option value="I2">I2 — ITIID 7° Cuatrimestre (con ref. manual)</option>
                            <option value="I3">I3 — ITIID Completo + Recursos Compartidos</option>
                            <option value="I4">I4 — Escenario de Cambio (Docente sin Mié)</option>
                            {sourceKey === 'EXCEL' && <option value="EXCEL">Excel Importado (pandas/openpyxl)</option>}
                        </select>
                    </div>

                    {/* Method Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Motor de Optimización (Python)
                        </label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="cpsat">OR-Tools CP-SAT (R2 — Motor Principal)</option>
                            <option value="genetic">Algoritmo Genético (R3 — Multi-corrida)</option>
                            <option value="local_search">Búsqueda Local (R4 — MRV + Hill Climbing)</option>
                            <option value="llm_local">LLM Local (Ollama — Directo + 1 Ronda Validador)</option>
                        </select>
                    </div>

                    {/* Scenario Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Escenario de Pesos (Criterios Blandos)
                        </label>
                        <select
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="A">Escenario A — Prioriza Estudiantes (menos horas muertas)</option>
                            <option value="B">Escenario B — Prioriza Docentes (menos huecos y preferencias)</option>
                            <option value="C">Escenario C — Equilibrio Estudiantes / Docentes</option>
                        </select>
                    </div>
                </div>

                {/* Extra params row */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100 text-sm">
                    <div className="flex flex-wrap items-center gap-4 text-gray-600">
                        <span>
                            <strong>Docentes:</strong> {instance?.teachers?.length || 0}
                        </span>
                        <span>
                            <strong>Materias:</strong> {instance?.courses?.length || 0}
                        </span>
                        <span>
                            <strong>Grupos/Aulas:</strong> {instance?.rooms?.length || 0}
                        </span>
                        <span>
                            <strong>Recursos Compartidos Bloqueados:</strong> {instance?.blocked_slots?.length || 0}
                        </span>
                        <span>
                            <strong>Preferencias Blandas (R5):</strong> {instance?.preferences?.length || 0}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {method === 'cpsat' && (
                            <label className="flex items-center gap-2 text-gray-700">
                                Calidad CP-SAT:
                                <select
                                    value={cpsatTime}
                                    onChange={(e) => setCpsatTime(parseInt(e.target.value, 10))}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                                >
                                    <option value={6}>6 s (Rápido)</option>
                                    <option value={15}>15 s (Recomendado)</option>
                                    <option value={30}>30 s (Máxima calidad)</option>
                                </select>
                            </label>
                        )}
                        {method === 'genetic' && (
                            <label className="flex items-center gap-2 text-gray-700">
                                Corridas AG:
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={agRuns}
                                    onChange={(e) => setAgRuns(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-center"
                                />
                            </label>
                        )}
                        {method === 'local_search' && (
                            <label className="flex items-center gap-2 text-gray-700">
                                Reinicios HC:
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={restarts}
                                    onChange={(e) => setRestarts(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-center"
                                />
                            </label>
                        )}
                        <button
                            onClick={() => setShowJson(!showJson)}
                            className="text-blue-600 hover:underline text-xs font-medium"
                        >
                            {showJson ? 'Ocultar JSON común' : 'Ver JSON común'}
                        </button>
                    </div>
                </div>

                {instance?.description && (
                    <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-xs border border-blue-100 space-y-1">
                        <div>
                            <strong>{instance.name}:</strong> {instance.description}
                        </div>
                        {(sourceKey === 'ITIID_2026' || sourceKey === 'ITIID_ENE_ABR_2027') && (
                            <div className="text-blue-700">
                                <strong>Nota:</strong> Para usar tus ediciones de la pestaña <em>Datos</em>, elige arriba{' '}
                                <em>«Datos de mi sistema original (UPV)»</em>; para quitar una materia o docente aquí, usa el panel{' '}
                                <em>Reprogramación Dinámica</em> abajo.
                            </div>
                        )}
                    </div>
                )}

                {excelWarnings.length > 0 && (
                    <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg text-xs border border-yellow-200 space-y-1">
                        <div className="font-semibold">Avisos de revisión de faltantes (R1):</div>
                        {excelWarnings.map((w, i) => (
                            <div key={i}>• {w}</div>
                        ))}
                    </div>
                )}

                {showJson && instance && (
                    <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg max-h-56 overflow-auto">
                        {JSON.stringify(
                            {
                                id: instance.id,
                                name: instance.name,
                                teachers_count: instance.teachers?.length,
                                rooms: instance.rooms,
                                courses_sample: (instance.courses || []).slice(0, 4),
                                blocked_slots: instance.blocked_slots,
                                preferences: instance.preferences,
                            },
                            null,
                            2
                        )}
                    </pre>
                )}

                {/* I4 Dynamic Multi-Day, Hours & Teacher/Course Exclusion Panel */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm text-gray-800">
                            <RefreshCw size={16} className="text-purple-600" />
                            <span className="font-semibold">Reprogramación Dinámica (I4 — Días, Horas y Materias):</span>
                            <span className="text-gray-500 text-xs">
                                Bloquea días/horas, quita una materia a un docente o sácalo del cuatrimestre (reasignación automática).
                            </span>
                        </div>
                        <button
                            onClick={handleRescheduleI4}
                            disabled={loading || !instance}
                            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {changeRules.length > 0
                                ? `Reprogramar CP-SAT (${changeRules.length} ${changeRules.length === 1 ? 'regla' : 'reglas'})`
                                : 'Reprogramar CP-SAT'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                        {/* Teacher */}
                        <div className="lg:col-span-3">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Profesor</label>
                            <select
                                value={changeTeacherId}
                                onChange={(e) => {
                                    setChangeTeacherId(e.target.value);
                                    setChangeCourseId('');
                                }}
                                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                            >
                                {(instance?.teachers || []).map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Change Mode / Action */}
                        <div className="lg:col-span-3">
                            <label className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                                <Clock size={12} /> Tipo de cambio / bloqueo
                            </label>
                            <select
                                value={changeHourMode}
                                onChange={(e) => setChangeHourMode(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                            >
                                <option value="all">Bloquear todo el día</option>
                                <option value="morning">Bloquear Matutino (07:00 – 13:55)</option>
                                <option value="afternoon">Bloquear Vespertino (14:00 – 20:45)</option>
                                <option value="custom">Bloquear horas específicas</option>
                                <option value="exclude_course">No quiere dar una materia</option>
                                <option value="no_quarter">No da clases este cuatrimestre</option>
                            </select>
                        </div>

                        {/* Dynamic middle column: Days OR Subject OR Quarter notice */}
                        {changeHourMode === 'exclude_course' ? (
                            <div className="lg:col-span-4">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                    Materia que NO impartirá
                                </label>
                                {(() => {
                                    const assigned = getTeacherAssignedCourses(changeTeacherId);
                                    if (assigned.length === 0) {
                                        return (
                                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                Este docente no tiene materias asignadas actualmente.
                                            </div>
                                        );
                                    }
                                    return (
                                        <select
                                            value={changeCourseId || String(assigned[0].id)}
                                            onChange={(e) => setChangeCourseId(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                                        >
                                            {assigned.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} — {roomsById[c.group_id]?.name || `Grupo ${c.group_id}`}
                                                </option>
                                            ))}
                                        </select>
                                    );
                                })()}
                            </div>
                        ) : changeHourMode === 'no_quarter' ? (
                            <div className="lg:col-span-4">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Alcance</label>
                                <div className="text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                                    Quita todas sus materias ({getTeacherAssignedCourses(changeTeacherId).length}) y las reasigna a docentes suplentes (o «Por asignar»).
                                </div>
                            </div>
                        ) : (
                            <div className="lg:col-span-4">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                        <Calendar size={12} /> Días (elige 1 o más)
                                    </label>
                                    <div className="flex gap-2 text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => setChangeDays([0, 1, 2, 3, 4])}
                                            className="text-blue-600 hover:underline"
                                        >
                                            Todos
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChangeDays([])}
                                            className="text-gray-500 hover:underline"
                                        >
                                            Limpiar
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DAYS.map((d, idx) => {
                                        const active = changeDays.includes(idx);
                                        return (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => toggleChangeDay(idx)}
                                                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                                    active
                                                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-purple-50'
                                                }`}
                                            >
                                                {d.slice(0, 3)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Add to dynamic queue */}
                        <div className="lg:col-span-2 lg:pt-5">
                            <button
                                type="button"
                                onClick={handleAddChangeRule}
                                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-lg text-xs font-semibold transition-colors"
                                title="Permite combinar distintos profesores, días, horas y exclusiones antes de reprogramar"
                            >
                                <Plus size={14} />
                                Agregar regla
                            </button>
                        </div>
                    </div>

                    {/* Specific Hours Pill Picker (when custom mode is selected) */}
                    {changeHourMode === 'custom' && (
                        <div className="pt-2 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-gray-600">
                                    Marca los bloques horarios que NO puede impartir ({changeHours.length} seleccionados):
                                </span>
                                <div className="flex gap-2 text-[11px]">
                                    <button
                                        type="button"
                                        onClick={() => setChangeHours(ALL_HOUR_INDICES)}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Todas
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setChangeHours([])}
                                        className="text-gray-500 hover:underline"
                                    >
                                        Ninguna
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {TEACHABLE_SLOTS.map(({ label, idx }) => {
                                    const active = changeHours.includes(idx);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => toggleChangeHour(idx)}
                                            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                                                active
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Dynamic Queue of Added Blocks */}
                    {changeRules.length > 0 && (
                        <div className="pt-2 border-t border-gray-200 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-gray-600">
                                <span className="font-semibold">Bloqueos acumulados para reprogramar:</span>
                                <button
                                    type="button"
                                    onClick={() => setChangeRules([])}
                                    className="text-red-500 hover:underline text-[11px]"
                                >
                                    Vaciar lista
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {changeRules.map((rule) => (
                                    <span
                                        key={rule.id}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 border border-purple-200 text-xs"
                                    >
                                        <strong>{rule.teacherName}</strong>
                                        {rule.kind === 'no_quarter' ? (
                                            <span className="text-red-700 font-medium">· Sin clases este cuatrimestre</span>
                                        ) : rule.kind === 'exclude_course' ? (
                                            <span className="text-amber-800">· Sin {rule.courseName} ({rule.groupLabel})</span>
                                        ) : (
                                            <>
                                                <span>· {(rule.days || []).map((d) => DAYS[d].slice(0, 3)).join(', ')}</span>
                                                <span className="text-purple-700">({formatHoursSummary(rule.mode, rule.hours)})</span>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveChangeRule(rule.id)}
                                            className="hover:text-red-600 ml-0.5"
                                            title="Quitar bloqueo"
                                        >
                                            <X size={13} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Official Validator KPIs */}
            {val && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        <StatCard
                            title="Validador Oficial (Duras)"
                            value={val.feasible ? 'FACTIBLE (0)' : `${hv.total} Violaciones`}
                            subtitle={val.feasible ? 'Cumple todas las reglas duras' : `Doc:${hv.teacher_conflict} Grp:${hv.group_conflict} Aula:${(hv.room_conflict ?? 0) + (hv.room_assignment ?? 0)} Disp:${hv.availability} Lím. docente:${hv.teacher_daily_limit ?? 0} Hrs:${hv.missing_hours}`}
                            icon={val.feasible ? CheckCircle2 : AlertTriangle}
                            color={val.feasible ? 'bg-green-500' : 'bg-red-500'}
                        />
                        <StatCard
                            title="Penalización Blanda"
                            value={val.soft_penalty}
                            subtitle={val.scenario_name}
                            icon={Sliders}
                            color="bg-blue-500"
                        />
                        <StatCard
                            title="Huecos (Alumnos / Docentes)"
                            value={`${sm.student_gaps} / ${sm.teacher_gaps}`}
                            subtitle={`Preferencias cumplidas: ${sm.preferences_met_pct}%`}
                            icon={ShieldCheck}
                            color="bg-purple-500"
                        />
                        <StatCard
                            title={val.stability ? 'Estabilidad (I4)' : 'Tiempo de Cómputo'}
                            value={val.stability ? `${val.stability.moved_sessions} movidas` : `${activeResult.elapsed_ms} ms`}
                            subtitle={val.stability ? `${val.stability.unchanged_pct}% sin cambios (${activeResult.elapsed_ms} ms)` : activeResult.method}
                            icon={Cpu}
                            color="bg-amber-500"
                        />
                    </div>

                    {/* AG Multi-run summary if applicable */}
                    {activeResult.runs_stats && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4 text-sm">
                            <span className="font-semibold text-gray-800">
                                Resumen Algoritmo Genético ({activeResult.runs_stats.runs} corridas):
                            </span>
                            <div className="flex flex-wrap gap-6 text-gray-600">
                                <span>Mejor blanda: <strong>{activeResult.runs_stats.best_soft}</strong></span>
                                <span>Media blanda: <strong>{activeResult.runs_stats.avg_soft}</strong></span>
                                <span>Desv. estándar: <strong>{activeResult.runs_stats.std_soft}</strong></span>
                                <span>Media duras: <strong>{activeResult.runs_stats.avg_hard}</strong></span>
                            </div>
                        </div>
                    )}

                    {/* Export & View Controls */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-600 mr-1">Vista:</span>
                            {[
                                { id: 'sabana', label: 'Sábana General (Excel)', icon: Table2 },
                                { id: 'teachers_sabana', label: 'Sábana Docentes (Excel)', icon: Users },
                                { id: 'group', label: 'Por Grupo', icon: Layers },
                                { id: 'teacher', label: 'Por Docente', icon: Users },
                                { id: 'room', label: 'Por Aula', icon: Building2 },
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => handleSwitchViewTab(t.id)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        viewTab === t.id
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <t.icon size={16} />
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={handleExportPythonExcel}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium"
                                title="Exporta libro completo con openpyxl (Sábana, Grupo, Docente, Aula, Validador)"
                            >
                                <FileSpreadsheet size={16} />
                                Excel Completo (R1)
                            </button>
                            <button
                                onClick={() => exportIAPDF(instance, activeResult.schedule, val, viewTab === 'teachers_sabana' ? 'teacher' : viewTab)}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-400 text-white rounded-lg hover:bg-rose-500 text-sm font-medium"
                            >
                                <FileText size={16} />
                                PDF ({viewTab === 'sabana' ? 'Sábana' : viewTab === 'teacher' || viewTab === 'teachers_sabana' ? 'Docentes' : viewTab === 'room' ? 'Aulas' : 'Grupos'})
                            </button>
                        </div>
                    </div>

                    {/* Timetable Viewer */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        {viewTab === 'sabana' ? (
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                    <span>
                                        Formato oficial UPV (grupos lado a lado con días <strong>L · M · Mi · J · V</strong>). Desliza horizontalmente para ver todos los grupos.
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-200 inline-block" /> Clase asignada</span>
                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-100 border border-sky-300 inline-block" /> Franja de Inglés / Compartido</span>
                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" /> Receso</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[620px] border border-gray-200 rounded-lg">
                                    <table className="border-collapse text-[11px] min-w-max">
                                        <thead className="sticky top-0 z-20">
                                            <tr>
                                                <th
                                                    rowSpan={2}
                                                    className="sticky left-0 z-30 bg-slate-700 text-white p-2 border border-slate-600 text-center min-w-[96px]"
                                                >
                                                    Hora
                                                </th>
                                                {(instance?.rooms || []).map((room) => (
                                                    <th
                                                        key={room.id}
                                                        colSpan={5}
                                                        className="bg-blue-700 text-white px-2 py-2 border border-blue-600 text-center font-bold tracking-wide"
                                                    >
                                                        {room.name}
                                                    </th>
                                                ))}
                                            </tr>
                                            <tr>
                                                {(instance?.rooms || []).map((room) =>
                                                    ['L', 'M', 'Mi', 'J', 'V'].map((dl, di) => (
                                                        <th
                                                            key={`${room.id}-${di}`}
                                                            className="bg-blue-50 text-blue-900 px-1.5 py-1 border border-gray-300 text-center font-semibold min-w-[98px]"
                                                        >
                                                            {dl}
                                                        </th>
                                                    ))
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleTimeSlots.map(({ label: hourLabel, idx: hIdx }) => {
                                                const isBreak = hourLabel.includes('Receso');
                                                const palette = [
                                                    'bg-blue-50 text-blue-900 border-blue-200',
                                                    'bg-emerald-50 text-emerald-900 border-emerald-200',
                                                    'bg-purple-50 text-purple-900 border-purple-200',
                                                    'bg-indigo-50 text-indigo-900 border-indigo-200',
                                                    'bg-teal-50 text-teal-900 border-teal-200',
                                                    'bg-rose-50 text-rose-900 border-rose-200',
                                                ];
                                                return (
                                                    <tr key={hourLabel} className={isBreak ? 'bg-amber-50' : ''}>
                                                        <td
                                                            className={`sticky left-0 z-10 p-1.5 border border-gray-300 font-semibold whitespace-nowrap text-center ${
                                                                isBreak ? 'bg-amber-100 text-amber-800' : 'bg-gray-50 text-gray-700'
                                                            }`}
                                                        >
                                                            {isBreak ? 'Receso' : hourLabel}
                                                        </td>
                                                        {(instance?.rooms || []).map((room) =>
                                                            [0, 1, 2, 3, 4].map((dIdx) => {
                                                                if (isBreak) {
                                                                    return (
                                                                        <td
                                                                            key={`${room.id}-${dIdx}`}
                                                                            className="p-1 border border-amber-200 text-center text-[10px] font-semibold text-amber-700 bg-amber-50"
                                                                        >
                                                                            Receso
                                                                        </td>
                                                                    );
                                                                }
                                                                const slot = dIdx * TIME_SLOTS.length + hIdx;
                                                                const matches = (activeResult.schedule || []).filter(
                                                                    (it) => it.room_id === room.id && it.start_slot === slot
                                                                );
                                                                const blk = (instance?.blocked_slots || []).find(
                                                                    (b) => b.type !== 'teacher' && b.room_id === room.id && b.slot_id === slot
                                                                );
                                                                return (
                                                                    <td
                                                                        key={`${room.id}-${dIdx}`}
                                                                        className="p-1 border border-gray-200 align-top text-center max-w-[115px]"
                                                                    >
                                                                        {matches.length > 0 ? (
                                                                            matches.map((m, mi) => {
                                                                                const c = coursesById[m.course_id] || {};
                                                                                const t = teachersById[c.teacher_id] || {};
                                                                                const colorCls =
                                                                                    matches.length > 1
                                                                                        ? 'bg-red-100 text-red-900 border-red-300'
                                                                                        : palette[(c.teacher_id || m.course_id) % palette.length];
                                                                                return (
                                                                                    <div
                                                                                        key={mi}
                                                                                        className={`p-1 rounded border leading-tight ${colorCls}`}
                                                                                    >
                                                                                        <div className="font-bold text-[10px] break-words">
                                                                                            {c.name || m.course_id}
                                                                                        </div>
                                                                                        <div className="text-[10px] opacity-80 mt-0.5">
                                                                                            {t.name || 'Sin docente'}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        ) : blk ? (
                                                                            <div className="p-1 rounded bg-sky-100 text-sky-900 border border-sky-300 leading-tight">
                                                                                <div className="font-bold text-[10px]">
                                                                                    {blk.subject || 'INGLÉS'}
                                                                                </div>
                                                                                <div className="text-[10px] italic">
                                                                                    {blk.teacher || blk.reason}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-gray-300">-</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : viewTab === 'teachers_sabana' ? (
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                    <span>
                                        Formato oficial UPV por docente (Hoja 4 del Excel): ventana de disponibilidad y grupo asignado por día (<strong>MI/DC</strong> = Posgrado compartido).
                                    </span>
                                </div>
                                <div className="overflow-x-auto max-h-[620px] border border-gray-200 rounded-lg">
                                    <table className="border-collapse text-[11px] min-w-max">
                                        <thead className="sticky top-0 z-20">
                                            <tr>
                                                <th
                                                    rowSpan={3}
                                                    className="sticky left-0 z-30 bg-slate-700 text-white p-2 border border-slate-600 text-center min-w-[92px]"
                                                >
                                                    Hora
                                                </th>
                                                {usedTeacherIds.map((tid) => {
                                                    const t = teachersById[tid] || { name: `Docente ${tid}` };
                                                    return (
                                                        <th
                                                            key={tid}
                                                            colSpan={5}
                                                            className="bg-slate-700 text-white px-2 py-1.5 border border-slate-600 text-center font-bold"
                                                        >
                                                            {t.name}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                            <tr>
                                                {usedTeacherIds.map((tid) => {
                                                    const t = teachersById[tid] || {};
                                                    return (
                                                        <th
                                                            key={`w-${tid}`}
                                                            colSpan={5}
                                                            className="bg-slate-100 text-slate-600 px-2 py-1 border border-gray-300 text-center text-[10px] font-medium"
                                                        >
                                                            {t.window || 'Disponibilidad registrada'}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                            <tr>
                                                {usedTeacherIds.map((tid) =>
                                                    ['L', 'M', 'Mi', 'J', 'V'].map((dl, di) => (
                                                        <th
                                                            key={`d-${tid}-${di}`}
                                                            className="bg-blue-50 text-blue-900 px-1 py-1 border border-gray-300 text-center font-semibold min-w-[46px]"
                                                        >
                                                            {dl}
                                                        </th>
                                                    ))
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleTimeSlots.map(({ label: hourLabel, idx: hIdx }) => {
                                                const isBreak = hourLabel.includes('Receso');
                                                return (
                                                    <tr key={hourLabel} className={isBreak ? 'bg-amber-50' : ''}>
                                                        <td
                                                            className={`sticky left-0 z-10 p-1.5 border border-gray-300 font-semibold whitespace-nowrap text-center ${
                                                                isBreak ? 'bg-amber-100 text-amber-800' : 'bg-gray-50 text-gray-700'
                                                            }`}
                                                        >
                                                            {isBreak ? 'Receso' : hourLabel}
                                                        </td>
                                                        {usedTeacherIds.map((tid) =>
                                                            [0, 1, 2, 3, 4].map((dIdx) => {
                                                                if (isBreak) {
                                                                    return (
                                                                        <td key={`${tid}-${dIdx}`} className="p-1 border border-amber-200 bg-amber-50" />
                                                                    );
                                                                }
                                                                const slot = dIdx * TIME_SLOTS.length + hIdx;
                                                                const matches = (activeResult.schedule || []).filter(
                                                                    (it) =>
                                                                        it.start_slot === slot &&
                                                                        coursesById[it.course_id]?.teacher_id === tid
                                                                );
                                                                const blk = (instance?.blocked_slots || []).find(
                                                                    (b) => b.type === 'teacher' && b.teacher_id === tid && b.slot_id === slot
                                                                );
                                                                return (
                                                                    <td key={`${tid}-${dIdx}`} className="p-1 border border-gray-200 text-center">
                                                                        {matches.length > 0 ? (
                                                                            <span
                                                                                className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                                                                    matches.length > 1
                                                                                        ? 'bg-red-100 text-red-800'
                                                                                        : 'bg-blue-100 text-blue-800'
                                                                                }`}
                                                                                title={matches.map((m) => coursesById[m.course_id]?.name).join(' / ')}
                                                                            >
                                                                                {matches
                                                                                    .map((m) => roomsById[m.room_id]?.code || roomsById[m.room_id]?.name || m.room_id)
                                                                                    .join('/')}
                                                                            </span>
                                                                        ) : blk ? (
                                                                            <span
                                                                                className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px] bg-purple-100 text-purple-800"
                                                                                title={blk.reason}
                                                                            >
                                                                                {blk.posgrado_code || 'COMP'}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-gray-200">·</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div>
                                {/* Entity Picker */}
                                <div className="flex items-center gap-3 mb-4">
                                    <label className="text-sm font-medium text-gray-700">
                                        {viewTab === 'teacher' ? 'Seleccionar Docente:' : viewTab === 'room' ? 'Seleccionar Aula:' : 'Seleccionar Grupo:'}
                                    </label>
                                    <select
                                        value={selectedEntity}
                                        onChange={(e) => setSelectedEntity(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                                    >
                                        {viewTab === 'teacher'
                                            ? usedTeacherIds.map((tid) => (
                                                  <option key={tid} value={tid}>
                                                      {teachersById[tid]?.name || `Docente ${tid}`}
                                                  </option>
                                              ))
                                            : (instance?.rooms || []).map((r) => (
                                                  <option key={r.id} value={r.id}>
                                                      {r.name}
                                                  </option>
                                              ))}
                                    </select>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-gray-50">
                                                <th className="p-3 border text-left font-semibold text-gray-700 w-36">Hora</th>
                                                {DAYS.map((day) => (
                                                    <th key={day} className="p-3 border text-center font-semibold text-gray-700">
                                                        {day}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleTimeSlots.map(({ label: hourLabel, idx: hIdx }) => {
                                                const isBreak = hourLabel.includes('Receso');
                                                return (
                                                    <tr key={hourLabel} className={isBreak ? 'bg-amber-50' : ''}>
                                                        <td className="p-2.5 border font-medium text-gray-700 whitespace-nowrap text-xs">
                                                            {hourLabel}
                                                        </td>
                                                        {DAYS.map((day, dIdx) => {
                                                            if (isBreak) {
                                                                return (
                                                                    <td key={day} className="p-2 border text-center text-xs font-semibold text-amber-700">
                                                                        RECESO
                                                                    </td>
                                                                );
                                                            }
                                                            const slot = dIdx * TIME_SLOTS.length + hIdx;
                                                            const entId = parseInt(selectedEntity, 10);
                                                            const blocked = (instance?.blocked_slots || []).find(
                                                                (b) =>
                                                                    b.slot_id === slot &&
                                                                    ((viewTab === 'teacher' && b.type === 'teacher' && b.teacher_id === entId) ||
                                                                        (viewTab !== 'teacher' && b.type !== 'teacher' && b.room_id === entId))
                                                            );
                                                            const matches = (activeResult.schedule || []).filter((it) => {
                                                                if (it.start_slot !== slot) return false;
                                                                if (viewTab === 'teacher') {
                                                                    return coursesById[it.course_id]?.teacher_id === entId;
                                                                }
                                                                return it.room_id === entId;
                                                            });

                                                            return (
                                                                <td key={day} className="p-2 border align-top text-center">
                                                                    {blocked && matches.length === 0 && (
                                                                        <div className="bg-gray-100 text-gray-500 text-xs p-1.5 rounded border border-dashed border-gray-300">
                                                                            Ocupado otro programa
                                                                        </div>
                                                                    )}
                                                                    {matches.map((m, mi) => {
                                                                        const c = coursesById[m.course_id] || {};
                                                                        const sub =
                                                                            viewTab === 'teacher'
                                                                                ? roomsById[m.room_id]?.name || `Aula ${m.room_id}`
                                                                                : teachersById[c.teacher_id]?.name || 'Sin docente';
                                                                        return (
                                                                            <div
                                                                                key={mi}
                                                                                className={`p-2 rounded-lg text-xs mb-1 ${
                                                                                    matches.length > 1
                                                                                        ? 'bg-red-50 text-red-800 border border-red-200'
                                                                                        : 'bg-blue-50 text-blue-800 border border-blue-100'
                                                                                }`}
                                                                            >
                                                                                <div className="font-semibold">{c.name || m.course_id}</div>
                                                                                <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    {!blocked && matches.length === 0 && (
                                                                        <span className="text-gray-300 text-xs">-</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!val && !loading && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
                    Selecciona una instancia (o tus datos actuales) y haz clic en <strong>"Ejecutar Motor IA"</strong> para generar y validar el horario con Python.
                </div>
            )}
        </div>
    );
};

export default IAOptimizer;
