import React, { useState, useEffect } from 'react';
import {
    Bot,
    Sparkles,
    MessageSquareText,
    ShieldAlert,
    CheckCircle2,
    AlertTriangle,
    Loader,
    Send,
    ShieldCheck,
    Trash2,
    RefreshCw,
    BarChart2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Swal from 'sweetalert2';
import { callIAAction, iaStorage, buildInstanceFromOriginalStorage } from '../utils/iaStorage';

const SAMPLE_PREFS_TEXT = `Docente_01 prefiere no dar clases los viernes por la tarde.
Docente_02 solicita evitar clases a primera hora antes de las 8:50.
Docente_04 pide máximo 4 horas de clase al día y preferencia por turno matutino.
Docente_07 solicita evitar clases después de las 16:45.`;

const IALLM = () => {
    const [activeTab, setActiveTab] = useState('r5'); // r5 | r6 | p1
    const [llmConfig, setLlmConfig] = useState(iaStorage.getLLMConfig());
    const [ollamaStatus, setOllamaStatus] = useState({ checked: false, running: false, models: [], recommended: null });
    const [loading, setLoading] = useState(false);

    // R5 states
    const [prefText, setPrefText] = useState(SAMPLE_PREFS_TEXT);
    const [extracted, setExtracted] = useState([]);
    const [anonPreview, setAnonPreview] = useState('');
    const [savedPrefs, setSavedPrefs] = useState(iaStorage.getPreferences());
    const [f1Result, setF1Result] = useState(iaStorage.getF1Eval());

    // R6 states
    const [explanation, setExplanation] = useState(null);
    const [changeText, setChangeText] = useState('Docente_04 ya no puede impartir clases los miércoles.');
    const [changeResult, setChangeResult] = useState(null);

    // P1 states
    const [p1Direct, setP1Direct] = useState(null);
    const [p1Retry, setP1Retry] = useState(null);

    useEffect(() => {
        iaStorage.setLLMConfig(llmConfig);
    }, [llmConfig]);

    const checkOllama = async (silent = false) => {
        try {
            const st = await callIAAction({
                action: 'llm_status',
                llm_config: { base_url: llmConfig.base_url || 'http://localhost:11434' },
            });
            setOllamaStatus({ checked: true, ...st });
            if (st.running && st.recommended) {
                setLlmConfig((prev) => {
                    const shouldAutoEnable = prev.provider === 'offline' || prev.provider === 'ollama';
                    if (!shouldAutoEnable) return prev;
                    const validModel = st.models?.includes(prev.model) ? prev.model : st.recommended;
                    return {
                        ...prev,
                        provider: 'ollama',
                        base_url: st.base_url || 'http://localhost:11434',
                        model: validModel,
                    };
                });
            }
        } catch {
            setOllamaStatus({ checked: true, running: false, models: [], recommended: null });
            if (!silent) {
                Swal.fire({ icon: 'warning', title: 'Ollama no detectado', text: 'Verifica que el servidor local de Ollama esté activo en http://localhost:11434.' });
            }
        }
    };

    useEffect(() => {
        checkOllama(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getCurrentInstance = () => {
        return iaStorage.getActiveInstance() || buildInstanceFromOriginalStorage();
    };

    // --- R5 Handlers ---
    const handleExtract = async () => {
        if (!prefText.trim()) return;
        setLoading(true);
        try {
            const inst = getCurrentInstance();
            const res = await callIAAction({
                action: 'llm_extract',
                text: prefText,
                instance: inst,
                llm_config: llmConfig,
            });
            setExtracted((res.preferences || []).map((p) => ({ ...p, approved: true })));
            setAnonPreview(res.anonymized_text_sent || '');
            if (res.warning) {
                Swal.fire({ icon: 'info', title: 'Aviso del proveedor LLM', text: res.warning });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error en R5 Extractor', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleApproveAndSave = () => {
        const approved = extracted.filter((p) => p.approved);
        if (approved.length === 0) {
            Swal.fire({ icon: 'warning', title: 'Sin selección', text: 'Marca al menos una restricción revisada.' });
            return;
        }
        const merged = [...savedPrefs, ...approved];
        setSavedPrefs(merged);
        iaStorage.setPreferences(merged);
        // Also attach to active instance if present
        const active = iaStorage.getActiveInstance();
        if (active) {
            iaStorage.setActiveInstance({ ...active, preferences: merged });
        }
        Swal.fire({
            icon: 'success',
            title: 'Preferencias Aprobadas',
            text: `${approved.length} restricciones guardadas con revisión humana. Se aplicarán en el Optimizador IA.`,
            timer: 2200,
            showConfirmButton: false,
        });
    };

    const handleRemoveSavedPref = (idx) => {
        const next = savedPrefs.filter((_, i) => i !== idx);
        setSavedPrefs(next);
        iaStorage.setPreferences(next);
    };

    const handleEvaluateF1 = async () => {
        setLoading(true);
        try {
            const res = await callIAAction({ action: 'llm_eval_f1', llm_config: llmConfig });
            setF1Result(res);
            iaStorage.setF1Eval(res);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error evaluando F1', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // --- R6 Handlers ---
    const handleExplainLast = async () => {
        const lastRun = iaStorage.getLastRun();
        const targetVal = p1Direct?.validation && !lastRun ? p1Direct.validation : lastRun?.validation;
        if (!targetVal) {
            Swal.fire({
                icon: 'info',
                title: 'Sin horario para analizar',
                text: 'Primero ejecuta un horario en "Optimizador IA" o corre la prueba P1 en esta vista.',
            });
            return;
        }
        setLoading(true);
        try {
            const res = await callIAAction({
                action: 'llm_explain',
                validation: targetVal,
                instance: getCurrentInstance(),
                llm_config: llmConfig,
            });
            setExplanation(res);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error en R6 Explicador', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleTranslateAndReschedule = async () => {
        if (!changeText.trim()) return;
        setLoading(true);
        try {
            const inst = getCurrentInstance();
            const parsed = await callIAAction({
                action: 'llm_parse_change',
                text: changeText,
                instance: inst,
                llm_config: llmConfig,
            });
            if (!parsed.new_constraints || parsed.new_constraints.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No se detectó un bloqueo concreto',
                    text: 'Indica un docente y día o franja (ej. "Docente_04 ya no puede los miércoles").',
                });
                return;
            }
            const lastRun = iaStorage.getLastRun();
            const resc = await callIAAction({
                action: 'reschedule',
                instance: inst,
                scenario: lastRun?.scenario || 'C',
                new_constraints: parsed.new_constraints,
                original_schedule: lastRun?.instance_id === inst.id ? lastRun.schedule : inst.manual_schedule || null,
            });
            setChangeResult({ parsed, reschedule: resc });
            iaStorage.setLastRun({
                ...resc,
                method: 'CP-SAT Reprogramado vía R6 LLM',
                instance_id: inst.id,
                instance_name: inst.name,
                scenario: lastRun?.scenario || 'C',
            });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error procesando cambio', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    // --- P1 Handler ---
    const handleRunP1 = async () => {
        setLoading(true);
        try {
            const inst = getCurrentInstance();
            // Run sequentially so local Ollama GPU processes one prompt cleanly at a time
            const resDirect = await callIAAction({
                action: 'llm_direct_schedule',
                instance: inst,
                scenario: 'C',
                llm_config: llmConfig,
                with_validator_retry: false,
            });
            setP1Direct(resDirect);

            const resRetry = await callIAAction({
                action: 'llm_direct_schedule',
                instance: inst,
                scenario: 'C',
                llm_config: llmConfig,
                with_validator_retry: true,
            });
            setP1Retry(resRetry);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error en prueba P1', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 space-y-6">
            {/* Title */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Asistente LLM (R5 Extractor y R6 Explicador)</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Regla de diseño: el LLM nunca asigna clases solo; traduce preferencias en español (R5), explica conflictos (R6) y se audita con el Validador Común (P1).
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium">
                    <ShieldCheck size={16} />
                    Anonimización activa antes de APIs externas
                </div>
            </div>

            {/* LLM Provider Config Bar */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-xs">
                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${
                                ollamaStatus.running
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${ollamaStatus.running ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {ollamaStatus.running
                                ? `Ollama Local Activo (${ollamaStatus.models.length} modelo${ollamaStatus.models.length === 1 ? '' : 's'})`
                                : 'Ollama Local no detectado en :11434'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => checkOllama(false)}
                        className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                    >
                        <RefreshCw size={13} />
                        Detectar modelos locales
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Proveedor LLM</label>
                        <select
                            value={llmConfig.provider}
                            onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ollama">Ollama Local (GPU/CPU en tu PC)</option>
                            <option value="offline">Respaldo Offline (sin API Key)</option>
                            <option value="gemini">Google Gemini API</option>
                            <option value="openai">OpenAI / Groq / Compatible API</option>
                        </select>
                    </div>

                    {llmConfig.provider === 'ollama' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Modelo Local (Ollama)</label>
                            {ollamaStatus.models?.length > 0 ? (
                                <select
                                    value={llmConfig.model}
                                    onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                >
                                    {ollamaStatus.models.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={llmConfig.model}
                                    onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                                    placeholder="qwen2.5:3b"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                            )}
                        </div>
                    )}

                    {(llmConfig.provider === 'gemini' || llmConfig.provider === 'openai') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Modelo</label>
                            <input
                                type="text"
                                value={llmConfig.model}
                                onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                                placeholder={llmConfig.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    {(llmConfig.provider === 'gemini' || llmConfig.provider === 'openai') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">API Key (solo en tu navegador)</label>
                            <input
                                type="password"
                                value={llmConfig.api_key}
                                onChange={(e) => setLlmConfig({ ...llmConfig, api_key: e.target.value })}
                                placeholder="Pega tu API Key..."
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    {(llmConfig.provider === 'ollama' || llmConfig.provider === 'openai') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Endpoint URL</label>
                            <input
                                type="text"
                                value={llmConfig.base_url}
                                onChange={(e) => setLlmConfig({ ...llmConfig, base_url: e.target.value })}
                                placeholder={
                                    llmConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'
                                }
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    {llmConfig.provider === 'offline' && (
                        <div className="md:col-span-3 text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                            Modo <strong>Respaldo Offline</strong> activo: usa extractor NLP determinista en español y explicador estructurado. Cambia a <strong>Ollama Local, Gemini u OpenAI</strong> para usar un LLM real.
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs Navigation (same clean style as Data.jsx) */}
            <div className="flex border-b border-gray-200 gap-2">
                {[
                    { id: 'r5', label: 'R5: Extractor de Preferencias y F1 (P2)', icon: Sparkles },
                    { id: 'r6', label: 'R6: Explicador y Cambios (P4 / I4)', icon: MessageSquareText },
                    { id: 'p1', label: 'Prueba P1: LLM Directo vs Validador', icon: ShieldAlert },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <tab.icon size={17} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB 1: R5 EXTRACTOR + F1 */}
            {activeTab === 'r5' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Input card */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-800">Capturar Preferencias en Español</h3>
                                <button
                                    onClick={() => setPrefText(SAMPLE_PREFS_TEXT)}
                                    className="text-xs text-blue-600 hover:underline font-medium"
                                >
                                    Cargar ejemplos ITIID
                                </button>
                            </div>
                            <textarea
                                rows={6}
                                value={prefText}
                                onChange={(e) => setPrefText(e.target.value)}
                                placeholder="Escribe preferencias docentes en español (una por línea)..."
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleExtract}
                                disabled={loading}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader className="animate-spin" size={17} /> : <Bot size={17} />}
                                Extraer Restricciones JSON (R5)
                            </button>
                            {anonPreview && (
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
                                    <div className="font-semibold text-gray-700 mb-1">Texto anonimizado procesado:</div>
                                    <pre className="whitespace-pre-wrap">{anonPreview}</pre>
                                </div>
                            )}
                        </div>

                        {/* Human-in-the-loop review card */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-800">Revisión Humana antes del Motor</h3>
                                {extracted.length > 0 && (
                                    <button
                                        onClick={handleApproveAndSave}
                                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium"
                                    >
                                        Aprobar y Aplicar al Optimizador
                                    </button>
                                )}
                            </div>
                            {extracted.length === 0 ? (
                                <p className="text-sm text-gray-400 py-8 text-center">
                                    Extrae preferencias para revisar el JSON antes de pasarlo al motor de optimización.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {extracted.map((item, idx) => (
                                        <label
                                            key={idx}
                                            className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={item.approved}
                                                onChange={(e) => {
                                                    const copy = [...extracted];
                                                    copy[idx].approved = e.target.checked;
                                                    setExtracted(copy);
                                                }}
                                                className="mt-1"
                                            />
                                            <div className="text-xs space-y-0.5">
                                                <div className="font-semibold text-gray-800">
                                                    {item.teacher_name} — <span className="text-blue-600">{item.type}</span>{' '}
                                                    <span className={`px-1.5 py-0.5 rounded ${item.hard ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                                                        {item.hard ? 'Dura' : 'Blanda'}
                                                    </span>
                                                </div>
                                                <div className="text-gray-600">{item.description}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {savedPrefs.length > 0 && (
                                <div className="pt-3 border-t border-gray-100">
                                    <div className="text-xs font-semibold text-gray-700 mb-2">
                                        Preferencias aprobadas activas ({savedPrefs.length}):
                                    </div>
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                        {savedPrefs.map((p, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs bg-blue-50/60 px-3 py-1.5 rounded">
                                                <span>
                                                    <strong>{p.teacher_name}:</strong> {p.description} ({p.type})
                                                </span>
                                                <button onClick={() => handleRemoveSavedPref(idx)} className="text-red-500 hover:text-red-700">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* P2 Evaluation Card: Precision, Recall, F1 */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                        <div className="flex flex-wrap justify-between items-center gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Evaluación P2: Precisión, Recall y F1 por Tipo de Restricción</h3>
                                <p className="text-xs text-gray-500">
                                    Evalúa el extractor R5 contra 10 preferencias docentes anotadas manualmente (Ground Truth del equipo).
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {f1Result && (
                                    <button
                                        onClick={() => {
                                            setF1Result(null);
                                            iaStorage.setF1Eval(null);
                                        }}
                                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium"
                                    >
                                        Limpiar anterior
                                    </button>
                                )}
                                <button
                                    onClick={handleEvaluateF1}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
                                >
                                    {loading ? <Loader className="animate-spin" size={16} /> : <BarChart2 size={16} />}
                                    Evaluar Dataset Anotado (P2)
                                </button>
                            </div>
                        </div>

                        {f1Result && (
                            <div className="space-y-5">
                                {String(f1Result.provider_used || '').startsWith('offline') ? (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                                        <strong>Resultado guardado de Modo Respaldo Offline:</strong>{' '}
                                        {ollamaStatus.running
                                            ? `Ya tienes Ollama activo (${llmConfig.model}). Pulsa "Evaluar Dataset Anotado (P2)" para recalcular las métricas reales con tu modelo local.`
                                            : 'Estas métricas provienen del extractor local por reglas. Para las métricas P2 reales de tu informe, selecciona Ollama, Gemini u OpenAI arriba y vuelve a evaluar.'}
                                    </div>
                                ) : (
                                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                                        Evaluado con modelo real: <strong>{f1Result.provider_used}</strong>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                                        <div className="text-xs text-blue-700 font-medium">Precisión Global</div>
                                        <div className="text-2xl font-bold text-blue-900">{(f1Result.overall.precision * 100).toFixed(1)}%</div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                                        <div className="text-xs text-emerald-700 font-medium">Recall Global</div>
                                        <div className="text-2xl font-bold text-emerald-900">{(f1Result.overall.recall * 100).toFixed(1)}%</div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                                        <div className="text-xs text-purple-700 font-medium">F1-Score Global</div>
                                        <div className="text-2xl font-bold text-purple-900">{(f1Result.overall.f1 * 100).toFixed(1)}%</div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                                        <div className="text-xs text-gray-600 font-medium">Conteo TP / FP / FN</div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {f1Result.overall.tp} / {f1Result.overall.fp} / {f1Result.overall.fn}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="p-2.5 border text-left">Tipo de Restricción</th>
                                                    <th className="p-2.5 border text-center">TP</th>
                                                    <th className="p-2.5 border text-center">FP</th>
                                                    <th className="p-2.5 border text-center">FN</th>
                                                    <th className="p-2.5 border text-center">Precisión</th>
                                                    <th className="p-2.5 border text-center">Recall</th>
                                                    <th className="p-2.5 border text-center">F1</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {f1Result.by_type.map((row) => (
                                                    <tr key={row.type}>
                                                        <td className="p-2.5 border font-medium text-gray-800">{row.type}</td>
                                                        <td className="p-2.5 border text-center">{row.tp}</td>
                                                        <td className="p-2.5 border text-center">{row.fp}</td>
                                                        <td className="p-2.5 border text-center">{row.fn}</td>
                                                        <td className="p-2.5 border text-center">{(row.precision * 100).toFixed(0)}%</td>
                                                        <td className="p-2.5 border text-center">{(row.recall * 100).toFixed(0)}%</td>
                                                        <td className="p-2.5 border text-center font-bold text-blue-700">{(row.f1 * 100).toFixed(0)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={f1Result.by_type}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                                                <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                                                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                                <Bar dataKey="precision" name="Precisión" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="recall" name="Recall" fill="#10B981" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="f1" name="F1" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: R6 EXPLAINER & CHANGE REQUESTS */}
            {activeTab === 'r6' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Conflict Explainer (P4) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800">Explicación de Conflictos (P4)</h3>
                            <button
                                onClick={handleExplainLast}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                            >
                                {loading ? <Loader className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                                Explicar Último Horario
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Lee el reporte oficial del validador y redacta en español los conflictos duros, huecos blandos y ajustes sugeridos para coordinación académica.
                        </p>
                        {explanation ? (
                            <div className="space-y-2">
                                <div className="text-xs text-gray-400">Proveedor: {explanation.provider_used}</div>
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    {explanation.explanation}
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                Haz clic en "Explicar Último Horario" para generar el análisis de conflictos y ajustes.
                            </div>
                        )}
                    </div>

                    {/* Natural Language Change -> Reschedule I4 */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">Pedido de Cambio de Coordinación (I4)</h3>
                        <p className="text-xs text-gray-500">
                            Escribe un cambio de último minuto en español. El LLM (R6) lo traduce a restricción formal y vuelve a resolver con CP-SAT moviendo lo menos posible.
                        </p>
                        <textarea
                            rows={3}
                            value={changeText}
                            onChange={(e) => setChangeText(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={handleTranslateAndReschedule}
                            disabled={loading}
                            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader className="animate-spin" size={16} /> : <Send size={16} />}
                            Traducir Pedido y Reprogramar con CP-SAT
                        </button>

                        {changeResult && (
                            <div className="space-y-3 pt-2">
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-900">
                                    <strong>Restricción traducida por R6:</strong>{' '}
                                    {changeResult.parsed.parsed_preferences.map((p) => `${p.teacher_name} (${p.description})`).join(', ')} —{' '}
                                    {changeResult.parsed.new_constraints.length} bloques bloqueados.
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="p-3 bg-gray-50 rounded-lg border">
                                        <div className="text-xs text-gray-500">Factibilidad</div>
                                        <div className={`text-lg font-bold ${changeResult.reschedule.validation.feasible ? 'text-green-600' : 'text-red-600'}`}>
                                            {changeResult.reschedule.validation.feasible ? 'VÁLIDO' : 'CONFLICTOS'}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg border">
                                        <div className="text-xs text-gray-500">Sesiones Movidas</div>
                                        <div className="text-lg font-bold text-purple-700">
                                            {changeResult.reschedule.validation.stability?.moved_sessions ?? '-'}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg border">
                                        <div className="text-xs text-gray-500">Sin Cambios</div>
                                        <div className="text-lg font-bold text-blue-700">
                                            {changeResult.reschedule.validation.stability?.unchanged_pct ?? '-'}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: P1 DIRECT LLM VS VALIDATOR */}
            {activeTab === 'p1' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-5">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">
                                Pregunta P1: ¿Un LLM puede generar por sí solo un horario válido?
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Pide el horario directo al LLM (sin y con 1 ronda de retroalimentación del validador) y audita las violaciones duras reales (Alharbi, 2026).
                            </p>
                        </div>
                        <button
                            onClick={handleRunP1}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                            {loading ? <Loader className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                            Ejecutar Prueba P1
                        </button>
                    </div>

                    {p1Direct && p1Retry && (
                        <>
                            {String(p1Direct.provider_used || '').startsWith('offline') && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                                    <strong>Aviso (Modo Respaldo Offline):</strong> Resultado de demostración local. Para tu reporte P1 real, conecta arriba <strong>Gemini API, OpenAI/Groq u Ollama</strong> y vuelve a ejecutar.
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[
                                { title: 'LLM Directo (Sin corrección del validador)', data: p1Direct },
                                { title: 'LLM Directo + 1 Ronda de Corrección Validador', data: p1Retry },
                            ].map((box, idx) => {
                                const v = box.data.validation;
                                const hv = v.hard_violations;
                                return (
                                    <div key={idx} className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-gray-800 text-sm">{box.title}</h4>
                                            <span
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                                                    v.feasible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}
                                            >
                                                {v.feasible ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                                                {v.feasible ? 'Válido (0 duras)' : `${hv.total} Violaciones Duras`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px] text-gray-500">
                                            <span>Modelo: <strong>{box.data.provider_used}</strong></span>
                                            <span>Tiempo: <strong>{box.data.elapsed_ms ?? '-'} ms</strong> · Sesiones: <strong>{box.data.schedule?.length || 0}</strong></span>
                                        </div>
                                        {box.data.warning && (
                                            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                                {box.data.warning}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-white p-2.5 rounded border">Traslape Docente: <strong>{hv.teacher_conflict}</strong></div>
                                            <div className="bg-white p-2.5 rounded border">Traslape Grupo: <strong>{hv.group_conflict}</strong></div>
                                            <div className="bg-white p-2.5 rounded border">Disponibilidad/Receso: <strong>{hv.availability}</strong></div>
                                            <div className="bg-white p-2.5 rounded border">Horas Incompletas: <strong>{hv.missing_hours}</strong></div>
                                        </div>
                                        {v.conflicts_detail?.length > 0 && (
                                            <div className="text-xs text-red-700 bg-red-50 p-3 rounded border border-red-100 space-y-1 max-h-40 overflow-y-auto">
                                                <div className="font-semibold">Muestra de errores detectados por el Validador:</div>
                                                {v.conflicts_detail.slice(0, 6).map((c, ci) => (
                                                    <div key={ci}>• {c.message}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default IALLM;
