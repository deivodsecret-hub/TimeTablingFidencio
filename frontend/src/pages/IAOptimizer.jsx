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

const StatCard = ({ title, value, subtitle, icon: Icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h3 className="text-2xl font-bold mt-1 text-gray-800">{value}</h3>
                <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
            </div>
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon size={22} className="text-white" />
            </div>
        </div>
    </div>
);

const IAOptimizer = () => {
    const [sourceKey, setSourceKey] = useState('ORIGINAL'); // ORIGINAL | I1 | I2 | I3 | I4 | EXCEL
    const [instance, setInstance] = useState(null);
    const [method, setMethod] = useState('cpsat'); // cpsat | genetic | local_search
    const [scenario, setScenario] = useState('C'); // A | B | C
    const [agRuns, setAgRuns] = useState(10);
    const [restarts, setRestarts] = useState(5);

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(iaStorage.getLastRun());
    const [excelWarnings, setExcelWarnings] = useState([]);
    const [viewTab, setViewTab] = useState('group'); // sabana | group | teacher | room
    const [selectedEntity, setSelectedEntity] = useState('');
    const [showJson, setShowJson] = useState(false);

    // I4 Rescheduling controls
    const [changeTeacherId, setChangeTeacherId] = useState('');
    const [changeDay, setChangeDay] = useState(2); // Miércoles

    const fileInputRef = useRef(null);

    useEffect(() => {
        const saved = iaStorage.getActiveInstance();
        if (saved) {
            setInstance(saved);
            setSourceKey(saved.id || 'ORIGINAL');
        } else {
            loadSource('ORIGINAL');
        }
    }, []);

    useEffect(() => {
        if (!instance) return;
        const prefs = iaStorage.getPreferences().filter((p) => p.approved !== false);
        if (instance.teachers?.length > 0 && !changeTeacherId) {
            setChangeTeacherId(String(instance.change_teacher_id || instance.teachers[0].id));
        }
        if (instance.rooms?.length > 0 && viewTab !== 'teacher') {
            setSelectedEntity(String(instance.rooms[0].id));
        }
        // Keep active instance synced with any newly approved preferences
        if (prefs.length > 0 && (!instance.preferences || instance.preferences.length === 0)) {
            setInstance((prev) => (prev ? { ...prev, preferences: prefs } : prev));
        }
    }, [instance?.id]);

    const loadSource = async (key) => {
        setSourceKey(key);
        setExcelWarnings([]);
        if (key === 'ORIGINAL') {
            const origInst = buildInstanceFromOriginalStorage();
            setInstance(origInst);
            iaStorage.setActiveInstance(origInst);
            if (origInst.rooms.length > 0) setSelectedEntity(String(origInst.rooms[0].id));
            if (origInst.teachers.length > 0) setChangeTeacherId(String(origInst.teachers[0].id));
            return;
        }
        setLoading(true);
        try {
            const data = await callIAAction({ action: 'instance', instance_id: key });
            const loaded = data.instance;
            // Merge any user-approved R5 preferences if matching teacher IDs
            const approvedPrefs = iaStorage.getPreferences().filter((p) => p.approved !== false);
            if (approvedPrefs.length > 0) {
                loaded.preferences = [...(loaded.preferences || []), ...approvedPrefs];
            }
            setInstance(loaded);
            iaStorage.setActiveInstance(loaded);
            if (loaded.rooms?.length > 0) setSelectedEntity(String(loaded.rooms[0].id));
            if (loaded.teachers?.length > 0) {
                setChangeTeacherId(String(loaded.change_teacher_id || loaded.teachers[0].id));
            }
            if (loaded.change_day !== undefined) setChangeDay(loaded.change_day);
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
            const payload = {
                action: 'solve',
                method,
                scenario,
                instance,
                runs: agRuns,
                restarts,
                time_limit_sec: 6.0,
            };
            const res = await callIAAction(payload);
            const enriched = { ...res, instance_id: instance.id, instance_name: instance.name, scenario };
            setResult(enriched);
            iaStorage.setLastRun(enriched);
            iaStorage.setActiveInstance(instance);
            if (instance.rooms?.length > 0) {
                setSelectedEntity(String(instance.rooms[0].id));
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error ejecutando motor IA', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleRescheduleI4 = async () => {
        if (!instance || !changeTeacherId) return;
        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'reschedule',
                instance,
                scenario,
                teacher_id: parseInt(changeTeacherId, 10),
                day: parseInt(changeDay, 10),
                original_schedule: result?.instance_id === instance.id ? result.schedule : instance.manual_schedule || null,
            });
            const enriched = {
                ...res,
                method: `CP-SAT Reprogramación I4 (${DAYS[changeDay]})`,
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
            const stab = res.validation?.stability;
            Swal.fire({
                icon: res.validation?.feasible ? 'success' : 'warning',
                title: 'Reprogramación I4 Completada',
                text: stab
                    ? `Sesiones movidas: ${stab.moved_sessions} de ${stab.total_sessions} (${stab.unchanged_pct}% del horario intacto).`
                    : 'Horario recalculado con el nuevo bloqueo.',
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
                    setInstance(res.instance);
                    iaStorage.setActiveInstance(res.instance);
                    setExcelWarnings(res.warnings || []);
                    if (res.instance.rooms?.length > 0) setSelectedEntity(String(res.instance.rooms[0].id));
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
        } catch (err) {
            setLoading(false);
        } finally {
            e.target.value = '';
        }
    };

    const handleExportPythonExcel = async () => {
        if (!instance || !result?.schedule) return;
        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'excel_export',
                instance,
                schedule: result.schedule,
                validation: result.validation,
                scenario,
            });
            downloadBase64File(res.file_b64, res.filename);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error exportando Excel', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Helpers for rendering timetable grids
    const coursesById = Object.fromEntries((instance?.courses || []).map((c) => [c.id, c]));
    const teachersById = Object.fromEntries((instance?.teachers || []).map((t) => [t.id, t]));
    const roomsById = Object.fromEntries((instance?.rooms || []).map((r) => [r.id, r]));

    const usedTeacherIds = [
        ...new Set((result?.schedule || []).map((it) => coursesById[it.course_id]?.teacher_id).filter(Boolean)),
    ];

    const handleSwitchViewTab = (tab) => {
        setViewTab(tab);
        if (tab === 'teacher') {
            if (usedTeacherIds.length > 0) setSelectedEntity(String(usedTeacherIds[0]));
        } else if (tab === 'group' || tab === 'room') {
            if (instance?.rooms?.length > 0) setSelectedEntity(String(instance.rooms[0].id));
        }
    };

    const val = result?.validation;
    const hv = val?.hard_violations || {};
    const sm = val?.soft_metrics || {};

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
                    <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-xs border border-blue-100">
                        <strong>{instance.name}:</strong> {instance.description}
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

                {/* I4 Rescheduling Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                        <RefreshCw size={16} className="text-blue-600" />
                        <span className="font-semibold">Reprogramación (I4 — Estabilidad):</span>
                        <span>Bloquear día a docente y mover lo mínimo posible:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={changeTeacherId}
                            onChange={(e) => setChangeTeacherId(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                        >
                            {(instance?.teachers || []).map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={changeDay}
                            onChange={(e) => setChangeDay(parseInt(e.target.value, 10))}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                        >
                            {DAYS.map((d, idx) => (
                                <option key={d} value={idx}>
                                    No puede {d}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={handleRescheduleI4}
                            disabled={loading || !instance}
                            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Reprogramar CP-SAT
                        </button>
                    </div>
                </div>
            </div>

            {/* Official Validator KPIs */}
            {val && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        <StatCard
                            title="Validador Oficial (Duras)"
                            value={val.feasible ? 'FACTIBLE (0)' : `${hv.total} Violaciones`}
                            subtitle={val.feasible ? 'Cumple todas las reglas duras' : `Doc:${hv.teacher_conflict} Grp:${hv.group_conflict} Disp:${hv.availability} Hrs:${hv.missing_hours}`}
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
                            value={val.stability ? `${val.stability.moved_sessions} movidas` : `${result.elapsed_ms} ms`}
                            subtitle={val.stability ? `${val.stability.unchanged_pct}% sin cambios (${result.elapsed_ms} ms)` : result.method}
                            icon={Cpu}
                            color="bg-amber-500"
                        />
                    </div>

                    {/* AG Multi-run summary if applicable */}
                    {result.runs_stats && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4 text-sm">
                            <span className="font-semibold text-gray-800">
                                Resumen Algoritmo Genético ({result.runs_stats.runs} corridas):
                            </span>
                            <div className="flex flex-wrap gap-6 text-gray-600">
                                <span>Mejor blanda: <strong>{result.runs_stats.best_soft}</strong></span>
                                <span>Media blanda: <strong>{result.runs_stats.avg_soft}</strong></span>
                                <span>Desv. estándar: <strong>{result.runs_stats.std_soft}</strong></span>
                                <span>Media duras: <strong>{result.runs_stats.avg_hard}</strong></span>
                            </div>
                        </div>
                    )}

                    {/* Export & View Controls */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-600 mr-1">Vista:</span>
                            {[
                                { id: 'sabana', label: 'Sábana General ITIID', icon: Table2 },
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
                                onClick={() => exportIAPDF(instance, result.schedule, val, viewTab)}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-400 text-white rounded-lg hover:bg-rose-500 text-sm font-medium"
                            >
                                <FileText size={16} />
                                PDF ({viewTab === 'sabana' ? 'Sábana' : viewTab === 'teacher' ? 'Docentes' : viewTab === 'room' ? 'Aulas' : 'Grupos'})
                            </button>
                        </div>
                    </div>

                    {/* Timetable Viewer */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        {viewTab === 'sabana' ? (
                            <div className="overflow-x-auto max-h-[540px]">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="p-3 border font-semibold text-gray-700">Grupo / Aula</th>
                                            <th className="p-3 border font-semibold text-gray-700">Día</th>
                                            <th className="p-3 border font-semibold text-gray-700">Horario</th>
                                            <th className="p-3 border font-semibold text-gray-700">Materia</th>
                                            <th className="p-3 border font-semibold text-gray-700">Docente</th>
                                            <th className="p-3 border font-semibold text-gray-700 text-center">Cuat.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...(result.schedule || [])]
                                            .sort((a, b) => a.room_id - b.room_id || a.start_slot - b.start_slot)
                                            .map((it, idx) => {
                                                const c = coursesById[it.course_id] || {};
                                                const t = teachersById[c.teacher_id] || {};
                                                const r = roomsById[it.room_id] || {};
                                                const d = Math.floor(it.start_slot / TIME_SLOTS.length);
                                                const h = it.start_slot % TIME_SLOTS.length;
                                                return (
                                                    <tr key={idx} className="hover:bg-blue-50/40">
                                                        <td className="p-2.5 border font-medium text-gray-800">{r.name || it.room_id}</td>
                                                        <td className="p-2.5 border text-gray-600">{DAYS[d]}</td>
                                                        <td className="p-2.5 border text-gray-600 whitespace-nowrap">{TIME_SLOTS[h]}</td>
                                                        <td className="p-2.5 border font-medium text-blue-700">{c.name || it.course_id}</td>
                                                        <td className="p-2.5 border text-gray-700">{t.name || 'Sin docente'}</td>
                                                        <td className="p-2.5 border text-center text-gray-600">{c.cuatrimestre || '-'}°</td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
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
                                            {TIME_SLOTS.map((hourLabel, hIdx) => {
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
                                                            const matches = (result.schedule || []).filter((it) => {
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
