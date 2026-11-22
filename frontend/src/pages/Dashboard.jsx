import React, { useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { Users, BookOpen, GraduationCap, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1'];

const StatCard = ({ title, value, subtitle, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h3 className="text-3xl font-bold mt-2 text-gray-800">{value}</h3>
                <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
            </div>
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon size={24} className="text-white" />
            </div>
        </div>
    </div>
);

const Dashboard = () => {
    const [stats, setStats] = useState({
        teachers: 0,
        courses: 0,
        students: 0
    });
    const [studentsByQuarter, setStudentsByQuarter] = useState([]);
    const [coursesByQuarter, setCoursesByQuarter] = useState([]);

    useEffect(() => {
        const students = storage.getStudents();
        const courses = storage.getCourses();

        // Calculate total students
        const totalStudents = Object.values(students).reduce((sum, val) => sum + (parseInt(val) || 0), 0);

        setStats({
            teachers: storage.getTeachers().length,
            courses: courses.length,
            students: totalStudents
        });

        // Prepare data for students chart
        const studentData = [];
        for (let i = 1; i <= 10; i++) {
            if (students[i] && students[i] > 0) {
                studentData.push({
                    name: `${i}° C`,
                    alumnos: students[i] || 0
                });
            }
        }
        setStudentsByQuarter(studentData);

        // Prepare data for courses pie chart
        const courseCounts = {};
        courses.forEach(course => {
            const q = course.cuatrimestre;
            courseCounts[q] = (courseCounts[q] || 0) + 1;
        });

        const courseData = Object.entries(courseCounts).map(([q, count]) => ({
            name: `${q}° Cuatrimestre`,
            value: count
        }));
        setCoursesByQuarter(courseData);
    }, []);

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Vista General</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <StatCard
                    title="Materias"
                    value={stats.courses}
                    subtitle="activas"
                    icon={BookOpen}
                    color="bg-blue-500"
                />
                <StatCard
                    title="Profesores"
                    value={stats.teachers}
                    subtitle="registrados"
                    icon={Users}
                    color="bg-green-500"
                />
                <StatCard
                    title="Alumnos"
                    value={stats.students}
                    subtitle="total registrado"
                    icon={GraduationCap}
                    color="bg-purple-500"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Students Bar Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Alumnos por Cuatrimestre</h3>
                    {studentsByQuarter.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={studentsByQuarter} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                    formatter={(value) => [`${value} alumnos`, 'Cantidad']}
                                />
                                <Bar dataKey="alumnos" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-gray-400">
                            <p>No hay datos de alumnos registrados</p>
                        </div>
                    )}
                </div>

                {/* Courses Pie Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Materias por Cuatrimestre</h3>
                    {coursesByQuarter.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={coursesByQuarter}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, value }) => `${value}`}
                                    labelLine={false}
                                >
                                    {coursesByQuarter.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                    formatter={(value) => [`${value} materias`, 'Cantidad']}
                                />
                                <Legend
                                    layout="vertical"
                                    align="right"
                                    verticalAlign="middle"
                                    wrapperStyle={{ fontSize: '12px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-gray-400">
                            <p>No hay materias registradas</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Alertas Recientes</h3>
                <div className="space-y-3">
                    <div className="flex items-center p-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-100">
                        <AlertTriangle size={20} className="mr-3" />
                        <span>Bienvenido al sistema. Asegúrese de registrar todos los datos antes de generar el horario.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
