const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const cors = require('cors');

function ensureLocalOllama() {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 1500 }, (res) => {
        res.resume();
    });
    req.on('error', () => {
        const ollamaExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
        if (fs.existsSync(ollamaExe)) {
            const child = spawn(ollamaExe, ['serve'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' }
            });
            child.unref();
            console.log('Ollama local iniciado automáticamente en http://127.0.0.1:11434');
        }
    });
}
ensureLocalOllama();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const TIME_SLOTS = [
    '07:00 - 07:55', '07:55 - 08:50', '08:50 - 09:45', '09:45 - 10:40',
    '10:40 - 11:10 (Receso)', '11:10 - 12:05', '12:05 - 13:00', '13:00 - 13:55',
    '13:55 - 14:00 (Receso)', '14:00 - 14:55', '14:55 - 15:50', '15:50 - 16:45',
    '16:45 - 17:40', '17:40 - 18:00 (Receso)', '18:00 - 18:55', '18:55 - 19:50',
    '19:50 - 20:45'
];
const BREAK_HOURS = new Set([4, 8, 13]);

let activePythonJobs = 0;
const MAX_CONCURRENT_IA = 2;
const PYTHON_TIMEOUT_MS = 180000;
const CLASSIC_TIMEOUT_MS = 6000;

function runPythonIA(payload) {
    return new Promise((resolve, reject) => {
        if (activePythonJobs >= MAX_CONCURRENT_IA) {
            const err = new Error('Motor IA ocupado. Espera a que termine la ejecución actual e intenta de nuevo.');
            err.status = 429;
            return reject(err);
        }

        activePythonJobs += 1;
        const cliPath = path.join(__dirname, '../backend_ia/cli.py');
        const py = spawn('python', [cliPath], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdoutData = '';
        let stderrData = '';
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                py.kill();
                activePythonJobs = Math.max(0, activePythonJobs - 1);
                const err = new Error('Tiempo límite excedido en motor IA (180s).');
                err.status = 504;
                reject(err);
            }
        }, PYTHON_TIMEOUT_MS);

        const cleanup = () => {
            clearTimeout(timer);
            if (!finished) {
                finished = true;
                activePythonJobs = Math.max(0, activePythonJobs - 1);
            }
        };

        py.stdout.on('data', (chunk) => {
            stdoutData += chunk.toString('utf8');
        });

        py.stderr.on('data', (chunk) => {
            stderrData += chunk.toString('utf8');
        });

        py.on('error', (err) => {
            cleanup();
            err.status = 500;
            reject(new Error(`No se pudo iniciar Python (backend_ia): ${err.message}`));
        });

        py.on('close', (code) => {
            if (finished) return;
            cleanup();
            if (code !== 0) {
                console.error(`Python IA exited with code ${code}:`, stderrData);
                try {
                    const parsedErr = JSON.parse(stdoutData);
                    return reject(new Error(parsedErr.error || 'Error en motor IA'));
                } catch (_) {
                    return reject(new Error('Error en motor IA (Python)'));
                }
            }
            try {
                resolve(JSON.parse(stdoutData));
            } catch (_) {
                reject(new Error('Salida inválida del motor IA'));
            }
        });

        py.stdin.on('error', () => {});
        py.stdin.end(JSON.stringify(payload || {}));
    });
}

app.post('/api/solve', (req, res) => {
    const { teachers = [], rooms = [], courses = [], constraints = [] } = req.body || {};

    // Convert JSON to "Simplified Protocol" for C++
    let inputString = "";

    teachers.forEach(t => {
        inputString += `TEACHER ${t.id} ${t.name.replace(/\s+/g, '_')}\n`;
    });

    rooms.forEach(r => {
        // Pass group_id (default to 0 if not present)
        inputString += `ROOM ${r.id} ${r.name.replace(/\s+/g, '_')} ${r.capacity} ${r.group_id || 0}\n`;
    });

    courses.forEach(c => {
        // Pass group_id (cuatrimestre)
        inputString += `COURSE ${c.id} ${c.name.replace(/\s+/g, '_')} ${c.teacher_id || 0} ${c.students || 0} ${c.weekly_sessions || c.duration || 1} ${c.group_id || c.cuatrimestre || 0}\n`;
    });

    // Respect explicit constraints + teacher.availability matrix
    const seenConstraint = new Set();
    const pushConstraint = (tid, slot) => {
        const key = `${tid}_${slot}`;
        if (!seenConstraint.has(key)) {
            seenConstraint.add(key);
            inputString += `CONSTRAINT ${tid} ${slot}\n`;
        }
    };

    (constraints || []).forEach(c => pushConstraint(c.teacher_id, c.slot_id));

    teachers.forEach(t => {
        if (!t.availability || typeof t.availability !== 'object') return;
        let configured = false;
        const available = new Set();
        DAYS.forEach((dayName, dIdx) => {
            const dayObj = t.availability[dayName];
            if (!dayObj) return;
            TIME_SLOTS.forEach((slotLabel, hIdx) => {
                if (BREAK_HOURS.has(hIdx) || typeof dayObj[slotLabel] !== 'boolean') return;
                configured = true;
                if (dayObj[slotLabel]) available.add(dIdx * TIME_SLOTS.length + hIdx);
            });
        });
        if (configured) {
            for (let d = 0; d < DAYS.length; d++) {
                for (let h = 0; h < TIME_SLOTS.length; h++) {
                    if (!BREAK_HOURS.has(h)) {
                        const slot = d * TIME_SLOTS.length + h;
                        if (!available.has(slot)) pushConstraint(t.id, slot);
                    }
                }
            }
        }
    });

    inputString += "END\n";

    // Spawn C++ process
    const solverPath = path.join(__dirname, '../backend/solver.exe');
    const solver = spawn(solverPath);

    let stdoutData = "";
    let stderrData = "";
    let responded = false;
    const timer = setTimeout(() => {
        if (responded) return;
        console.warn(`Classic solver exceeded ${CLASSIC_TIMEOUT_MS}ms; switching to Python CP-SAT fallback.`);
        solver.kill();
        fallbackToPython();
    }, CLASSIC_TIMEOUT_MS);

    const fallbackToPython = async () => {
        if (responded) return;
        clearTimeout(timer);
        responded = true;
        try {
            const pyRes = await runPythonIA({
                action: 'solve',
                method: 'cpsat',
                scenario: 'C',
                time_limit_sec: 10.0,
                instance: { teachers, rooms, courses, constraints }
            });
            if (!pyRes.validation?.feasible || !Array.isArray(pyRes.schedule)) {
                const infeasible = pyRes.status?.startsWith('INFEASIBLE') ||
                    pyRes.status?.includes('(diagnóstico relajado)');
                return res.status(422).json({
                    error: infeasible
                        ? 'El motor de respaldo no encontró un horario que respete las restricciones.'
                        : 'El motor de respaldo no produjo un horario validado.'
                });
            }
            res.json({
                schedule: pyRes.schedule,
                courses: pyRes.patched_instance?.courses || courses,
                reassigned_teachers: pyRes.reassigned_teachers || [],
                unassigned_courses: pyRes.unassigned_courses || []
            });
        } catch (err) {
            res.status(err.status || 500).json({ error: 'Solver failed', details: err.message });
        }
    };

    solver.on('error', () => {
        fallbackToPython();
    });

    solver.stdin.on('error', () => {});
    solver.stdin.write(inputString);
    solver.stdin.end();

    solver.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    solver.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    solver.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        // Fallback transparently when MinGW DLLs are missing on Windows (0xC0000135)
        if (code === -1073741515 || code === 3221225781) {
            console.warn('solver.exe missing MinGW DLL (0xC0000135); using Python CP-SAT fallback.');
            return fallbackToPython();
        }
        if (code !== 0) {
            responded = true;
            console.error(`Solver exited with code ${code}`);
            console.error(stderrData);
            return res.status(500).json({ error: "Solver failed", details: stderrData });
        }

        try {
            const result = JSON.parse(stdoutData);
            if (result.error === 'No solution found') {
                const canReassign = courses.some((c) => !c.teacher_id || (Array.isArray(c.teacher_ids) && c.teacher_ids.length > 1));
                if (canReassign) {
                    return fallbackToPython();
                }
                responded = true;
                return res.status(422).json({ error: 'El motor clásico determinó que no hay un horario viable.' });
            }
            responded = true;
            if (!Array.isArray(result.schedule)) {
                return res.status(502).json({ error: 'El motor clásico devolvió un horario inválido.' });
            }
            res.json({ ...result, courses });
        } catch (e) {
            responded = true;
            console.error("Failed to parse solver output:", stdoutData);
            res.status(500).json({ error: "Invalid output from solver", raw: stdoutData });
        }
    });
});

// --- Módulo IA (Python: CP-SAT, Genético, Búsqueda Local, Validador, Excel y LLM) ---
app.post('/api/ia/action', async (req, res) => {
    try {
        const result = await runPythonIA(req.body || {});
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Error en motor IA' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
