import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Calendar, Cpu, Bot, BarChart3 } from 'lucide-react';

const Sidebar = () => {
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    const navItems = [
        { path: '/', label: 'Inicio', icon: LayoutDashboard },
        { path: '/data', label: 'Datos', icon: Database },
        { path: '/schedule', label: 'Horarios', icon: Calendar },
    ];

    const iaNavItems = [
        { path: '/ia-optimizer', label: 'Optimizador IA', icon: Cpu },
        { path: '/ia-llm', label: 'Asistente LLM', icon: Bot },
        { path: '/ia-benchmark', label: 'Comparativa y Ética', icon: BarChart3 },
    ];

    return (
        <div className="w-64 bg-white h-screen shadow-md flex flex-col">
            <div className="p-6 border-b">
                <h1 className="text-2xl font-bold text-blue-600">UPV Horarios</h1>
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive(item.path)
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <item.icon size={20} />
                        <span className="font-medium">{item.label}</span>
                    </Link>
                ))}

                <div className="pt-4 mt-4 border-t border-gray-100">
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Inteligencia Artificial
                    </p>
                    <div className="space-y-2">
                        {iaNavItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive(item.path)
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <item.icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>
        </div>
    );
};

export default Sidebar;

