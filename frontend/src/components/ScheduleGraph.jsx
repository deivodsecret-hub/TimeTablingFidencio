import React, { useMemo, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const ScheduleGraph = ({ schedule, courses, teachers, rooms }) => {
    const graphRef = useRef();

    // Generate graph data from schedule
    const graphData = useMemo(() => {
        if (!schedule || schedule.length === 0) {
            return { nodes: [], links: [] };
        }

        const nodes = [];
        const links = [];
        const nodeIds = new Set();

        // Helper to add node if not exists
        const addNode = (id, label, type, color) => {
            if (!nodeIds.has(id)) {
                nodeIds.add(id);
                nodes.push({ id, label, type, color });
            }
        };

        // Add nodes and links from schedule
        schedule.forEach(item => {
            const course = courses.find(c => c.id === item.course_id);
            const teacher = teachers.find(t => t.id === course?.teacher_id);
            const room = rooms.find(r => r.id === item.room_id);

            // Course node
            const courseId = `course_${item.course_id}`;
            addNode(courseId, course?.name || `Curso ${item.course_id}`, 'course', '#3B82F6');

            // Teacher node
            if (teacher) {
                const teacherId = `teacher_${teacher.id}`;
                addNode(teacherId, teacher.name, 'teacher', '#10B981');
                // Link course -> teacher
                links.push({
                    source: courseId,
                    target: teacherId,
                    type: 'teaches'
                });
            }

            // Room/Group node
            if (room) {
                const roomId = `room_${room.id}`;
                addNode(roomId, `Grupo ${room.name}`, 'room', '#F59E0B');
                // Link course -> room
                links.push({
                    source: courseId,
                    target: roomId,
                    type: 'assigned_to'
                });
            }

            // Time slot node
            const slotId = `slot_${item.start_slot}`;
            const day = Math.floor(item.start_slot / 14);
            const hour = item.start_slot % 14;
            const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
            const slotLabel = `${days[day]} H${hour + 1}`;
            addNode(slotId, slotLabel, 'slot', '#6B7280');

            // Link course -> slot
            links.push({
                source: courseId,
                target: slotId,
                type: 'scheduled_at'
            });
        });

        return { nodes, links };
    }, [schedule, courses, teachers, rooms]);

    // Center graph on mount
    useEffect(() => {
        if (graphRef.current) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 50);
            }, 500);
        }
    }, [graphData]);

    const nodeCanvasObject = (node, ctx, globalScale) => {
        const label = node.label;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw node circle
        const radius = node.type === 'course' ? 8 : 6;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#374151';
        ctx.fillText(label, node.x, node.y + radius + fontSize);
    };

    if (!schedule || schedule.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
                No hay datos de horario para visualizar el grafo.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Leyenda del Grafo</h4>
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                        <span className="text-sm text-gray-600">Cursos</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
                        <span className="text-sm text-gray-600">Profesores</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                        <span className="text-sm text-gray-600">Grupos</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-gray-500"></div>
                        <span className="text-sm text-gray-600">Slots de Tiempo</span>
                    </div>
                </div>
            </div>

            {/* Graph Container */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '600px' }}>
                <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeCanvasObject={nodeCanvasObject}
                    nodePointerAreaPaint={(node, color, ctx) => {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();
                    }}
                    linkColor={() => '#E5E7EB'}
                    linkWidth={1}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={1}
                    backgroundColor="#ffffff"
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                    enableNodeDrag={true}
                />
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Estadísticas del Grafo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-blue-600">
                            {graphData.nodes.filter(n => n.type === 'course').length}
                        </div>
                        <div className="text-xs text-gray-600">Cursos</div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-emerald-600">
                            {graphData.nodes.filter(n => n.type === 'teacher').length}
                        </div>
                        <div className="text-xs text-gray-600">Profesores</div>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-amber-600">
                            {graphData.nodes.filter(n => n.type === 'room').length}
                        </div>
                        <div className="text-xs text-gray-600">Grupos</div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-600">
                            {graphData.links.length}
                        </div>
                        <div className="text-xs text-gray-600">Conexiones</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleGraph;
