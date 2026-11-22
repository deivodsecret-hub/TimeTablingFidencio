const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));

app.post('/api/solve', (req, res) => {
    const { teachers, rooms, courses, constraints } = req.body;

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

    if (constraints) {
        constraints.forEach(c => {
            inputString += `CONSTRAINT ${c.teacher_id} ${c.slot_id}\n`;
        });
    }

    inputString += "END\n";

    // Spawn C++ process
    const solverPath = path.join(__dirname, '../backend/solver.exe');
    const solver = spawn(solverPath);

    let stdoutData = "";
    let stderrData = "";

    solver.stdin.write(inputString);
    solver.stdin.end();

    solver.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    solver.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    solver.on('close', (code) => {
        if (code !== 0) {
            console.error(`Solver exited with code ${code}`);
            console.error(stderrData);
            return res.status(500).json({ error: "Solver failed", details: stderrData });
        }

        try {
            // The C++ output is already JSON
            const result = JSON.parse(stdoutData);
            res.json(result);
        } catch (e) {
            console.error("Failed to parse solver output:", stdoutData);
            res.status(500).json({ error: "Invalid output from solver", raw: stdoutData });
        }
    });
});

// --- Módulo IA (Python: CP-SAT, Genético, Búsqueda Local, Validador, Excel y LLM) ---
app.post('/api/ia/action', (req, res) => {
    const cliPath = path.join(__dirname, '../backend_ia/cli.py');
    const py = spawn('python', [cliPath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdoutData = '';
    let stderrData = '';

    py.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString('utf8');
    });

    py.stderr.on('data', (chunk) => {
        stderrData += chunk.toString('utf8');
    });

    py.on('error', (err) => {
        console.error('Failed to spawn Python IA backend:', err);
        res.status(500).json({ error: 'No se pudo iniciar Python (backend_ia)', details: err.message });
    });

    py.on('close', (code) => {
        if (code !== 0) {
            console.error(`Python IA exited with code ${code}:`, stderrData);
            try {
                const parsedErr = JSON.parse(stdoutData);
                return res.status(500).json({ error: parsedErr.error || 'Error en motor IA', details: stderrData });
            } catch (_) {
                return res.status(500).json({ error: 'Error en motor IA (Python)', details: stderrData });
            }
        }
        try {
            res.json(JSON.parse(stdoutData));
        } catch (e) {
            console.error('Invalid JSON from Python IA:', stdoutData);
            res.status(500).json({ error: 'Salida inválida del motor IA', raw: stdoutData.slice(0, 500) });
        }
    });

    py.stdin.write(JSON.stringify(req.body || {}));
    py.stdin.end();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
