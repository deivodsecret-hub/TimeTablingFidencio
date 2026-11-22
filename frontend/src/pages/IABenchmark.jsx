import React, { useState, useEffect } from 'react';
import {
    Trophy,
    Play,
    Loader,
    ShieldCheck,
    CheckCircle2,
    AlertTriangle,
    FileSpreadsheet,
    EyeOff,
    ClipboardCheck,
    HelpCircle,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { callIAAction, iaStorage, buildInstanceFromOriginalStorage } from '../utils/iaStorage';

const INITIAL_CHECKLIST_ITEMS = [
    { id: 'c1', label: 'Horarios finales de al menos un periodo cerrado, para comparar con el horario manual.' },
    { id: 'c2', label: 'Catálogo de aulas y laboratorios: capacidad, equipamiento y qué programas los comparten.' },
    { id: 'c3', label: 'Docentes compartidos con otros programas y sus horas ya asignadas.' },
    { id: 'c4', label: 'Bloques horarios permitidos, recesos y reglas de operación.' },
    { id: 'c5', label: 'Ejemplos de preferencias docentes en texto (reales anonimizadas o redactadas para el curso).' },
    { id: 'c6', label: 'Validador, modelo CP-SAT base y plantillas Excel probados con ITC-2007.' },
    { id: 'c7', label: 'Grupo, periodo y número de estudiantes del curso.' },
];

const ETHICAL_RISKS = [
    {
        risk: 'Exposición de datos personales a LLM externos',
        impact: 'Alto',
        mitigation: 'Anonimización obligatoria (Docente_01, Aula_01) antes de enviar prompts fuera de la red local o usar Ollama local.',
    },
    {
        risk: 'Delegación total de decisiones institucionales a un LLM',
        impact: 'Crítico',
        mitigation: 'Regla de diseño estricta: el motor formal (CP-SAT) asigna y el Validador Común aprueba; el LLM nunca decide asignaciones solo.',
    },
    {
        risk: 'Sesgos ocultos en la ponderación de horarios',
        impact: 'Medio',
        mitigation: 'Transparencia mediante Escenarios explícitos (A: Estudiantes, B: Docentes, C: Equilibrio) elegidos por la coordinación académica.',
    },
    {
        risk: 'Uso de disponibilidades reales sin consentimiento',
        impact: 'Alto',
        mitigation: 'Solicitar autorización formal a la dirección del programa ITIID y restringir el dataset real al alcance académico del curso.',
    },
    {
        risk: 'Interpretación errónea de preferencias escritas (Falsos Positivos)',
        impact: 'Medio',
        mitigation: 'Revisión humana obligatoria ("human-in-the-loop") en el módulo R5 antes de inyectar restricciones al optimizador.',
    },
];

const IABenchmark = () => {
    const [activeTab, setActiveTab] = useState('benchmark'); // benchmark | ethics
    const [instanceKey, setInstanceKey] = useState('I2');
    const [scenario, setScenario] = useState('C');
    const [agRuns, setAgRuns] = useState(10);
    const [loading, setLoading] = useState(false);

    const [benchmark, setBenchmark] = useState(iaStorage.getBenchmark());
    const [f1Eval, setF1Eval] = useState(iaStorage.getF1Eval());
    const [anonMap, setAnonMap] = useState(null);
    const [checklist, setChecklist] = useState(iaStorage.getChecklist());

    useEffect(() => {
        setF1Eval(iaStorage.getF1Eval());
    }, []);

    const handleRunBenchmark = async () => {
        setLoading(true);
        try {
            let inst;
            if (instanceKey === 'ORIGINAL') {
                inst = buildInstanceFromOriginalStorage();
            } else {
                const loaded = await callIAAction({ action: 'instance', instance_id: instanceKey });
                inst = loaded.instance;
            }
            const res = await callIAAction({
                action: 'benchmark',
                instance: inst,
                scenario,
                ag_runs: agRuns,
                time_limit_sec: 5.0,
                llm_config: iaStorage.getLLMConfig(),
            });
            setBenchmark(res);
            iaStorage.setBenchmark(res);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error ejecutando comparativa', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleExportComparisonExcel = () => {
        if (!benchmark?.leaderboard) return;
        const rows = benchmark.leaderboard.map((r) => ({
            Posicion: r.rank,
            Metodo: r.method,
            Rol: r.role,
            Factible: r.validation.feasible ? 'SI' : 'NO',
            Violaciones_Duras: r.validation.hard_violations.total,
            Penalizacion_Blanda: r.validation.soft_penalty,
            Horas_Muertas_Alumnos: r.validation.soft_metrics.student_gaps,
            Huecos_Docentes: r.validation.soft_metrics.teacher_gaps,
            Pref_Cumplidas_Pct: r.validation.soft_metrics.preferences_met_pct,
            Tiempo_ms: r.elapsed_ms,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Comparativa_Metodos');
        XLSX.writeFile(wb, `Comparativa_IA_${benchmark.scenario || 'C'}.xlsx`);
    };

    const handleTestAnonymizer = async () => {
        try {
            const orig = buildInstanceFromOriginalStorage();
            const res = await callIAAction({ action: 'anonymize', instance: orig });
            setAnonMap(res.mapping);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error anonimizando', text: err.message });
        }
    };

    const toggleCheck = (id) => {
        const next = { ...checklist, [id]: !checklist[id] };
        setChecklist(next);
        iaStorage.setChecklist(next);
    };

    const leaderboard = benchmark?.leaderboard || [];
    const chartData = leaderboard.map((r) => ({
        name:
            r.method_id === 'cpsat'
                ? 'CP-SAT'
                : r.method_id === 'genetic'
                ? 'Genético'
                : r.method_id === 'local_search'
                ? 'Búsq. Local'
                : r.method_id === 'manual'
                ? 'Manual'
                : r.method_id === 'llm_direct'
                ? 'LLM Directo'
                : 'LLM + Valid.',
        duras: r.validation.hard_violations.total,
        blanda: r.validation.soft_penalty,
        alumnos: r.validation.soft_metrics.student_gaps,
        docentes: r.validation.soft_metrics.teacher_gaps,
        ms: r.elapsed_ms,
    }));

    const llmDirectRow = leaderboard.find((r) => r.method_id === 'llm_direct');
    const bestRow = leaderboard[0];

    return (
        <div className="p-8 space-y-6">
            {/* Title */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Comparativa de Métodos, Preguntas Guía y Ética</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Evalúa todos los métodos bajo la misma instancia y el mismo Validador Oficial (P1–P4) y documenta los controles éticos.
                    </p>
                </div>
                {benchmark && activeTab === 'benchmark' && (
                    <button
                        onClick={handleExportComparisonExcel}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium"
                    >
                        <FileSpreadsheet size={16} />
                        Exportar Tabla (Excel)
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 gap-2">
                <button
                    onClick={() => setActiveTab('benchmark')}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'benchmark'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Trophy size={17} />
                    Tabla de Posiciones y Preguntas Guía (P1–P4)
                </button>
                <button
                    onClick={() => setActiveTab('ethics')}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'ethics'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <ShieldCheck size={17} />
                    Riesgos Éticos, Anonimización y Checklist
                </button>
            </div>

            {activeTab === 'benchmark' && (
                <div className="space-y-6">
                    {/* Controls */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-end justify-between gap-4">
                        <div className="flex flex-wrap gap-4 flex-1">
                            <div className="min-w-[230px]">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Instancia a Evaluar</label>
                                <select
                                    value={instanceKey}
                                    onChange={(e) => setInstanceKey(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="I2">I2 — ITIID 7° Cuatrimestre (con Manual)</option>
                                    <option value="I1">I1 — Benchmark Público ITC-2007</option>
                                    <option value="I3">I3 — ITIID Completo + Compartidos</option>
                                    <option value="ORIGINAL">Datos Actuales de mi Sistema (UPV)</option>
                                </select>
                            </div>
                            <div className="min-w-[200px]">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Escenario de Evaluación</label>
                                <select
                                    value={scenario}
                                    onChange={(e) => setScenario(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="A">Escenario A (Estudiantes)</option>
                                    <option value="B">Escenario B (Docentes)</option>
                                    <option value="C">Escenario C (Equilibrio)</option>
                                </select>
                            </div>
                            <div className="w-28">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Corridas AG</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={agRuns}
                                    onChange={(e) => setAgRuns(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleRunBenchmark}
                            disabled={loading}
                            className={`px-6 py-2.5 rounded-lg text-white font-medium text-sm flex items-center gap-2 ${
                                loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {loading ? <Loader className="animate-spin" size={17} /> : <Play size={17} />}
                            {loading ? 'Comparando todos los métodos...' : 'Ejecutar Comparativa Completa'}
                        </button>
                    </div>

                    {leaderboard.length > 0 ? (
                        <>
                            {/* Leaderboard Table */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-800">
                                        Tabla de Posiciones — {benchmark.instance_name} (Escenario {benchmark.scenario})
                                    </h3>
                                    <span className="text-xs text-gray-500">
                                        Regla oficial: 1.º cero violaciones duras · 2.º menor penalización blanda
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="p-3 border text-center w-14">#</th>
                                                <th className="p-3 border text-left">Método</th>
                                                <th className="p-3 border text-center">Rol</th>
                                                <th className="p-3 border text-center">Factibilidad</th>
                                                <th className="p-3 border text-center">Violaciones Duras</th>
                                                <th className="p-3 border text-center">Penalización Blanda</th>
                                                <th className="p-3 border text-center">Horas Muertas (Alum.)</th>
                                                <th className="p-3 border text-center">Huecos (Doc.)</th>
                                                <th className="p-3 border text-center">% Pref.</th>
                                                <th className="p-3 border text-center">Tiempo (ms)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leaderboard.map((row) => {
                                                const v = row.validation;
                                                return (
                                                    <tr key={row.method_id} className={row.rank === 1 ? 'bg-blue-50/50' : ''}>
                                                        <td className="p-3 border text-center font-bold text-gray-800">
                                                            {row.rank === 1 ? '🥇 1' : row.rank === 2 ? '🥈 2' : row.rank === 3 ? '🥉 3' : row.rank}
                                                        </td>
                                                        <td className="p-3 border font-semibold text-gray-800">{row.method}</td>
                                                        <td className="p-3 border text-center text-xs text-gray-600">{row.role}</td>
                                                        <td className="p-3 border text-center">
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                                    v.feasible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                }`}
                                                            >
                                                                {v.feasible ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                                                                {v.feasible ? 'Válido' : 'Inválido'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 border text-center font-bold text-gray-800">
                                                            {v.hard_violations.total}
                                                        </td>
                                                        <td className="p-3 border text-center font-bold text-blue-700">
                                                            {v.soft_penalty}
                                                        </td>
                                                        <td className="p-3 border text-center">{v.soft_metrics.student_gaps}</td>
                                                        <td className="p-3 border text-center">{v.soft_metrics.teacher_gaps}</td>
                                                        <td className="p-3 border text-center">{v.soft_metrics.preferences_met_pct}%</td>
                                                        <td className="p-3 border text-center text-gray-600">{row.elapsed_ms}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Charts (same Recharts aesthetic as Dashboard.jsx) */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Violaciones Duras vs Penalización Blanda</h3>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                                            <Bar dataKey="duras" name="Violaciones Duras" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="blanda" name="Penalización Blanda" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Horas Muertas (Alumnos) vs Huecos (Docentes)</h3>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                                            <Bar dataKey="alumnos" name="Horas Muertas Alumnos" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="docentes" name="Huecos Docentes" fill="#10B981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Preguntas Guía P1 - P4 */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <HelpCircle size={20} className="text-blue-600" />
                                    <h3 className="text-lg font-bold text-gray-800">Respuestas con Datos a las Preguntas Guía (Informe Final)</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="font-bold text-gray-800 mb-1">P1. ¿Un LLM puede generar por sí solo un horario válido?</div>
                                        <p className="text-gray-600 text-xs leading-relaxed">
                                            {llmDirectRow
                                                ? `No. El validador detectó ${llmDirectRow.validation.hard_violations.total} violaciones duras en el horario generado directo por LLM (traslapes y disponibilidad), confirmando que debe usarse un motor formal.`
                                                : 'Ejecuta la comparativa para registrar las violaciones duras del LLM directo.'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="font-bold text-gray-800 mb-1">P2. ¿Qué tan bien convierte un LLM preferencias en restricciones?</div>
                                        <p className="text-gray-600 text-xs leading-relaxed">
                                            {f1Eval
                                                ? `Sobre el dataset anotado (10 casos): Precisión ${(f1Eval.overall.precision * 100).toFixed(1)}%, Recall ${(f1Eval.overall.recall * 100).toFixed(1)}%, F1 ${(f1Eval.overall.f1 * 100).toFixed(1)}% (siempre con revisión humana antes de optimizar).`
                                                : 'Ve a "Asistente LLM → Evaluar Dataset Anotado (P2)" para calcular Precisión, Recall y F1.'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="font-bold text-gray-800 mb-1">P3. ¿Qué método da mejores horarios: CP-SAT, AG o Búsqueda Local?</div>
                                        <p className="text-gray-600 text-xs leading-relaxed">
                                            {bestRow
                                                ? `Ganador en ${benchmark.instance_name}: ${bestRow.method} con ${bestRow.validation.hard_violations.total} violaciones duras, penalización blanda de ${bestRow.validation.soft_penalty}, ${bestRow.validation.soft_metrics.student_gaps} horas muertas estudiantiles en ${bestRow.elapsed_ms} ms.`
                                                : 'Ejecuta la comparativa para medir los tres métodos.'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="font-bold text-gray-800 mb-1">P4. ¿Las explicaciones del LLM ayudan a entender los conflictos?</div>
                                        <p className="text-gray-600 text-xs leading-relaxed">
                                            El módulo R6 traduce las métricas crudas del validador en diagnósticos en español y permite a la coordinación solicitar cambios (I4) sin tocar código ni romper el resto del horario.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
                            Haz clic en <strong>"Ejecutar Comparativa Completa"</strong> para correr CP-SAT, Algoritmo Genético (10 corridas), Búsqueda Local, Horario Manual y LLM Directo bajo el mismo Validador Oficial.
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'ethics' && (
                <div className="space-y-6">
                    {/* Ethical Risks Matrix */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">
                            Riesgos Éticos: Datos Personales e IA en Decisiones Institucionales
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="p-3 border text-left">Riesgo Identificado</th>
                                        <th className="p-3 border text-center w-24">Impacto</th>
                                        <th className="p-3 border text-left">Control Técnico / Mitigación Implementada</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ETHICAL_RISKS.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="p-3 border font-semibold text-gray-800">{item.risk}</td>
                                            <td className="p-3 border text-center">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        item.impact === 'Crítico'
                                                            ? 'bg-red-100 text-red-700'
                                                            : item.impact === 'Alto'
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}
                                                >
                                                    {item.impact}
                                                </span>
                                            </td>
                                            <td className="p-3 border text-gray-600">{item.mitigation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Live Anonymizer Preview */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <EyeOff size={18} className="text-blue-600" />
                                    Verificador de Anonimización
                                </h3>
                                <button
                                    onClick={handleTestAnonymizer}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
                                >
                                    Probar con mis Docentes
                                </button>
                            </div>
                            <p className="text-xs text-gray-500">
                                Antes de compartir datos o consultar cualquier API externa de LLM, el sistema sustituye nombres reales por identificadores neutros.
                            </p>
                            {anonMap ? (
                                <div className="max-h-56 overflow-y-auto border rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="p-2 border-b text-left">Nombre Real (Local)</th>
                                                <th className="p-2 border-b text-left">Alias Enviado al LLM</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(anonMap.teachers || {}).slice(0, 12).map(([real, alias]) => (
                                                <tr key={real} className="border-b">
                                                    <td className="p-2 text-gray-700">{real}</td>
                                                    <td className="p-2 font-mono text-green-700 font-semibold">{alias}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-lg border border-dashed">
                                    Haz clic en "Probar con mis Docentes" para auditar la tabla de anonimización en vivo.
                                </div>
                            )}
                        </div>

                        {/* PDF Checklist */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <ClipboardCheck size={18} className="text-emerald-600" />
                                Checklist del Kit Común (Requisitos del PDF)
                            </h3>
                            <div className="space-y-2">
                                {INITIAL_CHECKLIST_ITEMS.map((item) => (
                                    <label
                                        key={item.id}
                                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={Boolean(checklist[item.id])}
                                            onChange={() => toggleCheck(item.id)}
                                            className="mt-0.5"
                                        />
                                        <span className={checklist[item.id] ? 'line-through text-gray-400' : ''}>
                                            {item.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IABenchmark;
