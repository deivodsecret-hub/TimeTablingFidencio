import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { User } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Data from './pages/Data';
import Schedule from './pages/Schedule';
import IAOptimizer from './pages/IAOptimizer';
import IALLM from './pages/IALLM';
import IABenchmark from './pages/IABenchmark';

function App() {
  return (
    <Router>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <header className="bg-white shadow-sm p-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800">Sistema de Horarios</h1>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600 font-medium">Admin</span>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                <User size={18} />
              </div>
            </div>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/data" element={<Data />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/ia-optimizer" element={<IAOptimizer />} />
              <Route path="/ia-llm" element={<IALLM />} />
              <Route path="/ia-benchmark" element={<IABenchmark />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
