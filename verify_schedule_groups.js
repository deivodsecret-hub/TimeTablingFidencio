const http = require('http');

// Emulate frontend logic
const students = { 3: 70 }; // 70 students in quarter 3 -> should produce 2 groups
const courses = [
    { id: 1, name: "Course1", cuatrimestre: 3, teacher_id: 1, weekly_sessions: 2 },
    { id: 2, name: "Course2", cuatrimestre: 3, teacher_id: 2, weekly_sessions: 2 }
];

// Generate groups logic (simplified from frontend)
const virtualRooms = [];
const expandedCourses = [];
const numGroups = Math.ceil(70 / 35); // 2

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

console.log("Sending data:", JSON.stringify(data, null, 2));

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/solve',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': JSON.stringify(data).length }
};

const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', responseData);
    });
});
req.write(JSON.stringify(data));
req.end();
