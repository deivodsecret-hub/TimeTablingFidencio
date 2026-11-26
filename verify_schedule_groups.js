const http = require('http');
const assert = require('node:assert/strict');

// Emulate frontend logic
const students = { 3: 70 }; // 70 students in quarter 3 -> should produce 2 groups
const courses = [
    { id: 1, name: "Course1", cuatrimestre: 3, teacher_id: 1, weekly_sessions: 2 },
    { id: 2, name: "Course2", cuatrimestre: 3, teacher_id: 2, weekly_sessions: 2 }
];

// Generate groups logic (simplified from frontend)
const virtualRooms = [];
const expandedCourses = [];
const numGroups = Math.ceil(students[3] / 35); // 2

for (let i = 1; i <= numGroups; i++) {
    const gid = 300 + i;
    virtualRooms.push({ id: gid, name: `3-${i}`, capacity: 35, group_id: gid });
    courses.forEach(c => {
        expandedCourses.push({ ...c, group_id: gid, id: c.id * 1000 + gid });
    });
}

const data = {
    teachers: [{ id: 1, name: "T1" }, { id: 2, name: "T2" }],
    rooms: virtualRooms,
    courses: expandedCourses,
    constraints: []
};

const body = JSON.stringify(data);
const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/solve',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
};

const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
        assert.equal(res.statusCode, 200, responseData);
        const { schedule } = JSON.parse(responseData);
        assert.ok(Array.isArray(schedule), responseData);
        assert.equal(schedule.length, 8);
        for (const course of expandedCourses) {
            const assignments = schedule.filter(item => item.course_id === course.id);
            assert.equal(assignments.length, course.weekly_sessions);
            assert.ok(assignments.every(item => item.room_id === course.group_id));
        }
        for (const teacher of data.teachers) {
            const courseIds = new Set(expandedCourses.filter(course => course.teacher_id === teacher.id).map(course => course.id));
            const slots = schedule.filter(item => courseIds.has(item.course_id)).map(item => item.start_slot);
            assert.equal(new Set(slots).size, slots.length);
        }
        console.log('Verificados dos grupos y ocho sesiones sin traslapes docentes.');
    });
});
req.setTimeout(35000, () => req.destroy(new Error('Tiempo de espera agotado')));
req.end(body);
