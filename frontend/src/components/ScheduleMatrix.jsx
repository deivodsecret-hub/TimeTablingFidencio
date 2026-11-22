import React, { useMemo } from 'react';

const ScheduleMatrix = ({ schedule, courses, teachers, rooms }) => {
    // Generate adjacency matrix data
    const matrixData = useMemo(() => {
        if (!schedule || schedule.length === 0) {
            return { matrix: [], entities: [], connections: [] };
        }

        // Get unique entities from schedule
        const courseIds = [...new Set(schedule.map(s => s.course_id))];
        const entities = courseIds.map(id => {
            const course = courses.find(c => c.id === id);
            const teacher = teachers.find(t => t.id === course?.teacher_id);
            const teacherName = teacher ? teacher.name : "Sin Profesor";

            return {
                id,
                name: `${teacherName} - ${course?.name || `Curso ${id}`}`,
                teacherId: course?.teacher_id,
                type: 'course'
            };
        });

        // Build connections list
        const connections = [];
        schedule.forEach(item => {
            const course = courses.find(c => c.id === item.course_id);
            const teacher = teachers.find(t => t.id === course?.teacher_id);
            const room = rooms.find(r => r.id === item.room_id);

            connections.push({
                courseId: item.course_id,
                courseName: course?.name || `Curso ${item.course_id}`,
                teacherId: course?.teacher_id,
                teacherName: teacher?.name || 'Sin profesor',
                roomId: item.room_id,
                roomName: room?.name || `Grupo ${item.room_id}`,
                slot: item.start_slot
            });
        });

        // Build adjacency matrix (course vs course sharing same teacher/room/slot)
        const matrix = [];
        for (let i = 0; i < entities.length; i++) {
            const row = [];
            for (let j = 0; j < entities.length; j++) {
                if (i === j) {
                    row.push({ value: 0, type: 'self' });
                } else {
                    const course1Conns = connections.filter(c => c.courseId === entities[i].id);
                    const course2Conns = connections.filter(c => c.courseId === entities[j].id);

                    let sharedTeacher = false;
                    let sharedRoom = false;

                    course1Conns.forEach(c1 => {
                        course2Conns.forEach(c2 => {
                            if (c1.teacherId && c1.teacherId === c2.teacherId) sharedTeacher = true;
                            if (c1.roomId === c2.roomId) sharedRoom = true;
                        });
                    });

                    let value = 0;
                    let type = 'none';
                    if (sharedTeacher && sharedRoom) {
                        value = 3;
                        type = 'both';
                    } else if (sharedTeacher) {
                        value = 2;
                        type = 'teacher';
                    } else if (sharedRoom) {
                        value = 1;
                        type = 'room';
                    }

                    row.push({ value, type });
                }
            }
            matrix.push(row);
        }

        return { matrix, entities, connections };
    }, [schedule, courses, teachers, rooms]);

    const getCellColor = (type) => {
        switch (type) {
            case 'self': return 'bg-gray-300';
            case 'both': return 'bg-purple-500';
            case 'teacher': return 'bg-emerald-400';
            case 'room': return 'bg-amber-400';
            default: return 'bg-gray-50';
        }
    };

    if (!schedule || schedule.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
                No hay datos de horario para visualizar la matriz.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Leyenda de la Matriz de Adyacencia</h4>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-gray-300"></div>
                        <span className="text-sm text-gray-600">Diagonal (mismo curso)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-emerald-400"></div>
                        <span className="text-sm text-gray-600">Comparten Profesor</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-amber-400"></div>
                        <span className="text-sm text-gray-600">Comparten Grupo</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-purple-500"></div>
                        <span className="text-sm text-gray-600">Comparten Ambos</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-gray-50 border"></div>
                        <span className="text-sm text-gray-600">Sin relación</span>
                    </div>
                </div>
            </div>

            {/* Matrix */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-x-auto">
                <h4 className="font-semibold text-gray-800 mb-4">Matriz de Adyacencia de Cursos</h4>
                <div className="inline-block min-w-full">
                    <table className="border-collapse">
                        <thead>
                            <tr>
                                <th className="p-2 text-xs font-medium text-gray-500 border border-gray-200 bg-gray-50 sticky left-0 z-10">
                                    Curso
                                </th>
                                {matrixData.entities.map((entity, idx) => (
                                    <th
                                        key={idx}
                                        className="p-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50 max-w-[150px] truncate"
                                        title={entity.name}
                                    >
                                        {entity.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrixData.matrix.map((row, i) => (
                                <tr key={i}>
                                    <td
                                        className="p-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50 sticky left-0 z-10 max-w-[200px] truncate"
                                        title={matrixData.entities[i].name}
                                    >
                                        {matrixData.entities[i].name}
                                    </td>
                                    {row.map((cell, j) => (
                                        <td
                                            key={j}
                                            className={`w-8 h-8 border border-gray-200 ${getCellColor(cell.type)}`}
                                            title={`${matrixData.entities[i].name} - ${matrixData.entities[j].name}: ${cell.type}`}
                                        >
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Connections Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-800 mb-4">Lista de Conexiones</h4>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">Curso</th>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">Profesor</th>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">Grupo</th>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">Slot</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrixData.connections.map((conn, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-2 text-gray-800">{conn.courseName}</td>
                                    <td className="px-4 py-2 text-gray-600">{conn.teacherName}</td>
                                    <td className="px-4 py-2 text-gray-600">{conn.roomName}</td>
                                    <td className="px-4 py-2 text-gray-500">{conn.slot}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Estadísticas de la Matriz</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-blue-600">
                            {matrixData.entities.length}
                        </div>
                        <div className="text-xs text-gray-600">Cursos Únicos</div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-emerald-600">
                            {matrixData.matrix.flat().filter(c => c.type === 'teacher').length}
                        </div>
                        <div className="text-xs text-gray-600">Pares con Mismo Profesor</div>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-amber-600">
                            {matrixData.matrix.flat().filter(c => c.type === 'room').length}
                        </div>
                        <div className="text-xs text-gray-600">Pares en Mismo Grupo</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-purple-600">
                            {matrixData.connections.length}
                        </div>
                        <div className="text-xs text-gray-600">Total Asignaciones</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleMatrix;
