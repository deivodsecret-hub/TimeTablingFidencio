import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { TIME_SLOTS } from '../utils/initialData';
import { Play, Loader, Download, FileSpreadsheet, FileText, Table2, Network, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ScheduleGraph from '../components/ScheduleGraph';
import ScheduleMatrix from '../components/ScheduleMatrix';

const Schedule = () => {
    const [loading, setLoading] = useState(false);
    const [schedule, setSchedule] = useState(storage.getSchedule());
    const [error, setError] = useState(null);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [viewMode, setViewMode] = useState('schedule'); // 'schedule', 'matrix', 'graph'

    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const hours = TIME_SLOTS;

    useEffect(() => {
        const initialCourses = storage.getCourses();
        const initialStudents = storage.getStudents();
        const initialTeachers = storage.getTeachers();

        setTeachers(initialTeachers);

        try {
            const { virtualRooms, expandedCourses } = generateVirtualGroups(initialStudents, initialCourses);
            setRooms(virtualRooms);
            setCourses(expandedCourses);
        } catch {
            setCourses(initialCourses);
            setRooms([]);
        }

        const savedSchedule = storage.getSchedule();
        if (savedSchedule) {
            setSchedule(savedSchedule);
        }
    }, []);

    useEffect(() => {
        if (rooms.length > 0 && !selectedRoom) {
            setSelectedRoom(rooms[0]?.id);
        }
    }, [rooms, selectedRoom]);

    const generateVirtualGroups = (studentsByQuarter, allCourses) => {
        const virtualRooms = [];
        const expandedCourses = [];
        const GROUP_CAPACITY = 35;

        for (let q = 1; q <= 10; q++) {
            const studentCount = studentsByQuarter[q] || 0;
            if (studentCount === 0) continue;

            const numGroups = Math.ceil(studentCount / GROUP_CAPACITY);
            const quarterCourses = allCourses.filter(c => parseInt(c.cuatrimestre) === q);

            for (let i = 0; i < numGroups; i++) {
                const groupIndex = i + 1;
                const groupId = (q * 100) + groupIndex;
                const groupName = `${q}-${groupIndex}`;

                virtualRooms.push({
                    id: groupId,
                    name: groupName,
                    capacity: GROUP_CAPACITY,
                    group_id: groupId
                });

                quarterCourses.forEach(course => {
                    expandedCourses.push({
                        ...course,
                        group_id: groupId,
                        id: course.id * 1000 + groupId
                    });
                });
            }
        }

        return { virtualRooms, expandedCourses };
    };

    const generateSchedule = async () => {
        setLoading(true);
        setError(null);

        try {
            const studentsByQuarter = storage.getStudents();
            const allCourses = storage.getCourses();

            const { virtualRooms, expandedCourses } = generateVirtualGroups(studentsByQuarter, allCourses);

            if (virtualRooms.length === 0) {
                throw new Error("No hay alumnos registrados. Ve a la sección 'Datos' y registra alumnos en 'Alumnos'.");
            }

            const data = {
                teachers: storage.getTeachers(),
                rooms: virtualRooms,
                courses: expandedCourses,
                constraints: storage.getConstraints()
            };

            const response = await fetch('http://localhost:3001/api/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok || result.error || !Array.isArray(result.schedule)) {
                throw new Error(result.error || 'El servidor no devolvió un horario válido.');
            }

            storage.setSchedule(result.schedule);
            storage.setScheduleRooms(virtualRooms);
            setSchedule(result.schedule);
            setRooms(virtualRooms);
            setCourses(expandedCourses);
            setSelectedRoom(virtualRooms[0].id);
        } catch (err) {
            console.error(err);
            setError(err.message || "Error connecting to server.");
        } finally {
            setLoading(false);
        }
    };

    const getCellData = (roomId, dayIndex, hourIndex) => {
        if (!schedule) return null;

        const currentSlot = dayIndex * hours.length + hourIndex;
        const item = schedule.find(s => s.start_slot === currentSlot && s.room_id === roomId);
        if (!item) return null;

        const course = courses.find(c => c.id === item.course_id);
        if (item.room_id !== roomId) return null;

        const teacher = teachers.find(t => t.id === course?.teacher_id);
        const room = rooms.find(r => r.id === roomId);

        return {
            course: course?.name || `Curso ${item.course_id}`,
            teacher: teacher?.name || 'Sin profesor',
            room: room?.name || `Aula ${roomId}`,
            students: course?.students || 0,
            weekly_sessions: course?.weekly_sessions || course?.duration || 1
        };
    };

    const getScheduleByRoom = (roomId) => {
        if (!schedule) return [];
        return schedule.filter(s => s.room_id === roomId);
    };

    const getSelectedRoomName = () => {
        const room = rooms.find(r => r.id === selectedRoom);
        return room?.name || 'Grupo';
    };

    const exportToXLSX = () => {
        if (!schedule || !selectedRoom) return;

        const room = rooms.find(r => r.id === selectedRoom);
        const roomName = room?.name || `Grupo_${selectedRoom}`;
        // Sanitize filename: replace special characters
        const safeRoomName = roomName.replace(/[^a-zA-Z0-9]/g, '_');

        const wsData = [
            ['HORARIO DE CLASES'],
            [`Grupo: ${roomName}`],
            [''],
            ['Hora', ...days]
        ];

        hours.forEach((hour, hourIndex) => {
            const row = [hour];
            days.forEach((day, dayIndex) => {
                const cellData = getCellData(selectedRoom, dayIndex, hourIndex);
                if (cellData) {
                    row.push(`${cellData.course}\n${cellData.teacher}`);
                } else {
                    row.push('-');
                }
            });
            wsData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 15 },
            { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Horario');
        XLSX.writeFile(wb, `Horario_${safeRoomName}.xlsx`);
    };

    const exportToPDF = () => {
        if (!schedule || !selectedRoom) {
            console.log('PDF Export: No schedule or selectedRoom');
            return;
        }

        try {
            const room = rooms.find(r => r.id === selectedRoom);
            const roomName = room?.name || `Grupo ${selectedRoom}`;
            // Sanitize filename: replace special characters
            const safeRoomName = roomName.replace(/[^a-zA-Z0-9]/g, '_');

            console.log('Creating PDF document...');
            const doc = new jsPDF('landscape', 'mm', 'a4');

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('HORARIO DE CLASES', doc.internal.pageSize.width / 2, 15, { align: 'center' });

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Grupo: ${roomName}`, doc.internal.pageSize.width / 2, 23, { align: 'center' });

            const tableData = hours.map((hour, hourIndex) => {
                const row = [hour];
                days.forEach((day, dayIndex) => {
                    const cellData = getCellData(selectedRoom, dayIndex, hourIndex);
                    if (cellData) {
                        row.push(`${cellData.course}\n${cellData.teacher}`);
                    } else {
                        row.push('-');
                    }
                });
                return row;
            });

            console.log('Adding table to PDF...', tableData.length, 'rows');
            autoTable(doc, {
                head: [['Hora', ...days]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: {
                    fillColor: [71, 85, 105],
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                    halign: 'center',
                    valign: 'middle'
                },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold' }
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245]
                }
            });

            console.log('Saving PDF as:', `Horario_${safeRoomName}.pdf`);
            doc.save(`Horario_${safeRoomName}.pdf`);
            console.log('PDF saved successfully');
        } catch (error) {
            console.error('Error exporting PDF:', error);
            alert('Error al exportar PDF: ' + error.message);
        }
    };

    const exportAllToXLSX = () => {
        if (!schedule) return;

        const wb = XLSX.utils.book_new();

        rooms.forEach(room => {
            const wsData = [
                ['HORARIO DE CLASES'],
                [`Grupo: ${room.name}`],
                [''],
                ['Hora', ...days]
            ];

            hours.forEach((hour, hourIndex) => {
                const row = [hour];
                days.forEach((day, dayIndex) => {
                    const cellData = getCellData(room.id, dayIndex, hourIndex);
                    if (cellData) {
                        row.push(`${cellData.course}\n${cellData.teacher}`);
                    } else {
                        row.push('-');
                    }
                });
                wsData.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 15 },
                { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
            ];

            // Sanitize sheet name: replace special characters
            const safeSheetName = room.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        });

        XLSX.writeFile(wb, 'Horarios_Todos_Grupos.xlsx');
    };

    const exportAllToPDF = () => {
        if (!schedule) return;

        const doc = new jsPDF('landscape', 'mm', 'a4');
        let isFirstPage = true;

        rooms.forEach(room => {
            if (!isFirstPage) {
                doc.addPage();
            }
            isFirstPage = false;

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('HORARIO DE CLASES', doc.internal.pageSize.width / 2, 15, { align: 'center' });

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Grupo: ${room.name}`, doc.internal.pageSize.width / 2, 23, { align: 'center' });

            const tableData = hours.map((hour, hourIndex) => {
                const row = [hour];
                days.forEach((day, dayIndex) => {
                    const cellData = getCellData(room.id, dayIndex, hourIndex);
                    if (cellData) {
                        row.push(`${cellData.course}\n${cellData.teacher}`);
                    } else {
                        row.push('-');
                    }
                });
                return row;
            });

            autoTable(doc, {
                head: [['Hora', ...days]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: {
                    fillColor: [71, 85, 105],
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                    halign: 'center',
                    valign: 'middle'
                },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold' }
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245]
                }
            });
        });

        doc.save('Horarios_Todos_Grupos.pdf');
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Horarios Generados</h2>
                <button
                    onClick={generateSchedule}
                    disabled={loading}
                    className={`px-6 py-3 rounded-lg text-white font-medium flex items-center ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {loading ? <Loader className="animate-spin mr-2" /> : <Play className="mr-2" />}
                    {loading ? 'Generando...' : 'Generar Horario'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
                    {error}
                </div>
            )}

            {!schedule && !loading && (
                <div className="text-center py-20 text-gray-500">
                    No hay horario generado. Haz clic en "Generar Horario" para comenzar.
                </div>
            )}

            {schedule && (
                <div className="space-y-6">
                    {/* Controls Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4">
                            <label className="font-medium text-gray-700">Seleccionar Grupo:</label>
                            <select
                                value={selectedRoom || ''}
                                onChange={(e) => setSelectedRoom(parseInt(e.target.value))}
                                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>
                                        {room.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <div className="flex gap-2 border-r pr-4 mr-2">
                                <button
                                    onClick={exportToXLSX}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                >
                                    <FileSpreadsheet size={18} />
                                    Excel
                                </button>
                                <button
                                    onClick={exportToPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-400 text-white rounded-lg hover:bg-rose-500 transition-colors"
                                >
                                    <FileText size={18} />
                                    PDF
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={exportAllToXLSX}
                                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                                    title="Exportar todos los grupos"
                                >
                                    <Download size={18} />
                                    Todos (Excel)
                                </button>
                                <button
                                    onClick={exportAllToPDF}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
                                    title="Exportar todos los grupos"
                                >
                                    <Download size={18} />
                                    Todos (PDF)
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-medium text-gray-600 mr-2">Vista:</span>
                            <button
                                onClick={() => setViewMode('schedule')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'schedule'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <CalendarDays size={18} />
                                Horario
                            </button>
                            <button
                                onClick={() => setViewMode('matrix')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'matrix'
                                    ? 'bg-purple-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <Table2 size={18} />
                                Matriz
                            </button>
                            <button
                                onClick={() => setViewMode('graph')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'graph'
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <Network size={18} />
                                Grafo
                            </button>
                        </div>
                    </div>

                    {/* Conditional View Rendering */}
                    {viewMode === 'schedule' && (
                        <>
                            {/* Group Info Header */}
                            <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 rounded-t-xl">
                                <h3 className="text-xl font-bold text-center">HORARIO DE CLASES</h3>
                                <p className="text-center text-slate-300">Grupo: {getSelectedRoomName()}</p>
                            </div>

                            {/* Schedule Table */}
                            <div className="bg-white rounded-b-xl shadow-sm border border-gray-100 overflow-x-auto -mt-6">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="border border-slate-500 px-4 py-3 text-sm font-semibold">Hora</th>
                                            {days.map(day => (
                                                <th key={day} className="border border-slate-500 px-4 py-3 text-sm font-semibold">
                                                    {day}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hours.map((hour, hourIndex) => {
                                            const isBreak = hour.includes('(Receso)');
                                            return (
                                                <tr key={hourIndex} className={isBreak ? 'bg-gray-200' : (hourIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white')}>
                                                    <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                                                        {hour}
                                                    </td>
                                                    {isBreak ? (
                                                        <td colSpan={days.length} className="border border-gray-300 px-2 py-2 text-xs text-center font-bold text-gray-500 tracking-wider">
                                                            RECESO
                                                        </td>
                                                    ) : (
                                                        days.map((day, dayIndex) => {
                                                            const cellData = getCellData(selectedRoom, dayIndex, hourIndex);
                                                            return (
                                                                <td
                                                                    key={dayIndex}
                                                                    className={`border border-gray-300 px-2 py-2 text-xs text-center ${cellData ? 'bg-blue-50' : ''}`}
                                                                >
                                                                    {cellData ? (
                                                                        <div className="space-y-1">
                                                                            <div className="font-semibold text-gray-800">
                                                                                {cellData.course}
                                                                            </div>
                                                                            <div className="text-gray-600">
                                                                                {cellData.teacher}
                                                                            </div>
                                                                            <div className="text-gray-400 text-xs">
                                                                                {cellData.room}
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

                            {/* Course Summary */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h4 className="font-semibold text-gray-800 mb-4">Resumen de Materias - {getSelectedRoomName()}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {(() => {
                                        const roomSchedule = getScheduleByRoom(selectedRoom);
                                        const uniqueCourses = [...new Set(roomSchedule.map(s => s.course_id))];
                                        return uniqueCourses.map(courseId => {
                                            const course = courses.find(c => c.id === courseId);
                                            const teacher = teachers.find(t => t.id === course?.teacher_id);
                                            const sessionsCount = roomSchedule.filter(s => s.course_id === courseId).length;
                                            return (
                                                <div key={courseId} className="bg-gray-50 p-4 rounded-lg">
                                                    <div className="font-medium text-gray-800">{course?.name || `Curso ${courseId}`}</div>
                                                    <div className="text-sm text-gray-600">{teacher?.name || 'Sin profesor'}</div>
                                                    <div className="text-xs text-gray-400 mt-1">{sessionsCount} sesión(es) por semana</div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </>
                    )}

                    {viewMode === 'matrix' && (
                        <ScheduleMatrix
                            schedule={schedule}
                            courses={courses}
                            teachers={teachers}
                            rooms={rooms}
                        />
                    )}

                    {viewMode === 'graph' && (
                        <ScheduleGraph
                            schedule={schedule}
                            courses={courses}
                            teachers={teachers}
                            rooms={rooms}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default Schedule;
