# Sistema Inteligente para la Generación de Horarios — ITIID (UPV)

Aplicación web para la generación, validación, comparación y análisis de horarios universitarios del programa **ITIID** (Universidad Politécnica de Victoria).

Conserva íntegra la base original del sistema (**Inicio**, **Datos**, **Horarios**) y agrega en la barra lateral (**Inteligencia Artificial**) los módulos requeridos para **Fundamentos de Inteligencia Artificial (7.º cuatrimestre)**: motores formales en Python, validador común, asistente LLM (R5/R6), comparativa de métodos y controles éticos.

> **Regla de diseño central:** las asignaciones de clase las decide un motor de optimización y las audita un validador común; el LLM **nunca** decide un horario por sí solo. El LLM traduce preferencias en español a restricciones revisadas por una persona, explica conflictos y traduce solicitudes de cambio.

---

## Arquitectura del Sistema

```text
university_time_tabbling_problem_ed-main/
├── backend/              # Solver original en C++ (backtracking)
├── backend_ia/           # Motor de IA en Python (OR-Tools, AG, Búsqueda Local, Validador, Excel, LLM)
│   ├── cli.py            # Punto de entrada JSON (stdin/stdout) conectado a Express
│   ├── validator.py      # Validador Común (árbitro oficial de violaciones duras y blandas)
│   ├── solvers.py        # R2 CP-SAT (OR-Tools), R3 Algoritmo Genético, R4 Búsqueda Local (MRV + Hill Climbing)
│   ├── instances.py      # Instancias I1 (ITC-2007), I2, I3, I4 y anonimizador
│   ├── excel_io.py       # R1 Importación/exportación Excel con pandas y openpyxl
│   └── llm_service.py    # R5 Extractor (+ métricas F1), R6 Explicador/Cambios y prueba P1
├── server/               # API Node.js + Express (puerto 3001)
│   └── server.js         # /api/solve (original) y /api/ia/action (puente hacia backend_ia)
├── frontend/             # Interfaz React + Vite + Tailwind CSS + Recharts (puerto 5173)
│   └── src/pages/
│       ├── Dashboard.jsx     # Inicio (original)
│       ├── Data.jsx          # Datos: docentes, materias, alumnos y disponibilidad (original)
│       ├── Schedule.jsx      # Horarios (original)
│       ├── IAOptimizer.jsx   # Optimizador IA (R1, R2, R3, R4 + Validador + I4 + Excel/PDF)
│       ├── IALLM.jsx         # Asistente LLM (R5 Extractor/F1, R6 Explicador/Cambios, Prueba P1)
│       └── IABenchmark.jsx   # Comparativa P1-P4, Tabla de Posiciones, Ética y Checklist
└── run_project.bat       # Lanzador rápido en Windows
```

---

## Módulos de la Aplicación

### Sección Original (intacta)
1. **Inicio (`/`)**: Resumen general de materias, profesores y alumnos con gráficas por cuatrimestre.
2. **Datos (`/data`)**: Gestión de profesores (incluyendo matriz de disponibilidad horaria), materias y alumnos por cuatrimestre almacenados en `localStorage`.
3. **Horarios (`/schedule`)**: Generador original con visualización en horario, matriz y grafo, además de exportación a Excel y PDF.

### Sección Inteligencia Artificial (nueva en el Sidebar)
4. **Optimizador IA (`/ia-optimizer`)**:
   - **Fuentes de datos (R1)**: permite cargar la instancia oficial **`ITIID Sep–Dic 2026` (Excel UPV — 10 grupos, 25 docentes, Franjas de Inglés fijas y Posgrado MI/DC)**, tus datos actuales del sistema (`localStorage`), las instancias del curso (**I1 ITC-2007**, **I2 ITIID 7.º con horario manual**, **I3 ITIID completo con recursos compartidos bloqueados**, **I4 escenario de cambio**), o **importar/descargar plantillas Excel (`.xlsx`)** validadas con `pandas` y `openpyxl`.
   - **Motores Python + LLM Local**:
     - **OR-Tools CP-SAT (R2)**: optimización exacta con desigualdades booleanas lineales para huecos y *warm-start* (`AddHint`), ponderada según **Escenario A** (prioriza estudiantes), **Escenario B** (prioriza docentes) o **Escenario C** (equilibrio).
     - **Algoritmo Genético (R3)**: representación por sesiones, selección por torneo, cruce uniforme, mutación, reparación y ejecución multi-corrida (1 a 10 corridas por instancia con media y desviación estándar).
     - **Búsqueda Local (R4)**: fase constructiva con heurística **MRV** (menor dominio restante) + **Hill Climbing con reinicios aleatorios** y reparación de conflictos.
     - **LLM Local (Ollama)**: ejecuta el modelo local instalado en tu PC (`qwen2.5:3b` con GPU/CPU) directo + 1 ronda del validador para comparar contra los motores formales.
   - **Reprogramación (I4)**: bloquea un día a un docente y vuelve a resolver con CP-SAT penalizando cambios para mover el mínimo número de sesiones (**métrica de estabilidad**).
   - **Validador Común**: audita todo horario y reporta violaciones duras por tipo (docente, grupo, aula, disponibilidad/recesos/recursos compartidos, horas faltantes) y métricas blandas (horas muertas de alumnos, huecos docentes, jornadas >6h, reparto semanal, desbalance y % de preferencias).
   - **Vistas y exportación (Formato Oficial UPV)**: visualización en la página y exportación en **Excel (`openpyxl`)** y **PDF** con **Sábana General (Excel)** horizontal lado a lado (`L · M · Mi · J · V` por grupo, `Receso` y Franjas de Inglés), **Sábana Docentes (Excel)** con ventanas horarias y códigos `MI`/`DC`, además de vistas individuales **Por Grupo**, **Por Docente** y **Por Aula**.

5. **Asistente LLM (`/ia-llm`)**:
   - **100% IA Local con Ollama (Sin APIs externas)**: inicia y conecta automáticamente con **Ollama local** en `http://127.0.0.1:11434` usando el modelo local instalado (`qwen2.5:3b` acelerado en GPU/CPU), sin requerir claves API ni conexión a servicios en la nube.
   - **Anonimización automática**: sustituye nombres reales de docentes y aulas (`Docente_01`, `Aula_01`) antes de enviar datos a proveedores externos.
   - **R5 — Extractor de Preferencias (P2)**: convierte texto en español a restricciones JSON con casillas de **revisión humana** antes de aplicarlas al optimizador. Incluye evaluador automático contra dataset anotado (10 casos) con **Precisión, Recall y F1 globales y por tipo de restricción**.
   - **R6 — Explicador y Cambios (P4 / I4)**: explica en español los conflictos del último horario validado, propone ajustes y traduce pedidos de cambio en lenguaje natural (ej. *"Docente_04 ya no puede los miércoles"*) a restricciones que disparan reprogramación mínima con CP-SAT.
   - **Prueba P1 — LLM Directo vs Validador**: solicita un horario directo al LLM (sin y con 1 ronda de retroalimentación del validador) para demostrar empíricamente sus violaciones duras frente a los motores formales.

6. **Comparativa y Ética (`/ia-benchmark`)**:
   - **Tabla de Posiciones (P3)**: ejecuta y compara sobre la misma instancia y con el mismo Validador Común: *Horario Manual (I2)*, *OR-Tools CP-SAT*, *Algoritmo Genético (10 corridas)*, *Búsqueda Local*, *LLM Directo* y *LLM Directo + Validador*. Ordena primero por `0` violaciones duras y luego por menor penalización blanda.
   - **Gráficas y Preguntas Guía (P1–P4)**: gráficas comparativas en Recharts, exportación de la tabla a Excel y síntesis automática de respuestas para el informe final.
   - **Ética y Checklist**: matriz de riesgos éticos (datos personales, anonimización, supervisión humana, sesgos de pesos y autorización institucional), verificador de anonimización en vivo y checklist interactivo del kit común.

---

## Requisitos e Instalación

### Prerrequisitos
- **Node.js** (v18 o superior; probado en v26 LTS)
- **Python** (3.11 o 3.12)
- **Ollama** (opcional para modelo local en GPU/CPU; recomendado `qwen2.5:3b` con `ollama pull qwen2.5:3b`)

### Instalación en una PC nueva (después de descomprimir el ZIP)
1. Instalar dependencias de Python (para `backend_ia/`):
   ```bash
   pip install ortools openpyxl pandas requests
   ```
2. (Opcional — Modelo de IA Local con Ollama):
   ```bash
   winget install Ollama.Ollama
   ollama pull qwen2.5:3b
   ```
3. Instalar dependencias del servidor Node.js:
   ```bash
   cd server
   npm install
   ```
4. Instalar dependencias del frontend React/Vite:
   ```bash
   cd ../frontend
   npm install
   ```

---

## Ejecución

### Opción 1 — Rápida en Windows
Haz doble clic en **`run_project.bat`** en la raíz del proyecto. Esto iniciará automáticamente:
- Ollama local (`http://127.0.0.1:11434`) si está instalado
- Backend Express + puente Python en `http://localhost:3001`
- Frontend Vite/React en `http://localhost:5173` (se abre en el navegador)

### Opción 2 — Manual en 2 terminales
Terminal 1 (servidor):
```bash
cd server
npm start
```
Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```
Luego abre `http://localhost:5173` en tu navegador.

---

## Flujo Sugerido para Demostración en Clase
1. Abre **Optimizador IA**, elige **I2 (ITIID 7.º)** o tus **Datos originales**, corre **OR-Tools CP-SAT** en Escenarios **A**, **B** y **C** y muestra el **Validador Oficial** + la **Sábana General** en Excel/PDF.
2. En **Asistente LLM**:
   - Pestaña **R5**: extrae preferencias en español, apruébalas manualmente y corre **Evaluar Dataset Anotado (P2)** para mostrar Precisión/Recall/F1.
   - Pestaña **R6**: traduce un cambio (*"Docente_04 ya no puede los miércoles"*) y ejecuta reprogramación mínima (**I4**).
   - Pestaña **Prueba P1**: demuestra cuántas violaciones duras comete el LLM directo.
3. En **Comparativa y Ética**: corre **Ejecutar Comparativa Completa** sobre **I2** para mostrar la **Tabla de Posiciones**, las gráficas comparativas, las respuestas **P1–P4** y el **Verificador de Anonimización**.
