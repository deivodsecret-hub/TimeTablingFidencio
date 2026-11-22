import React from 'react';
import { TIME_SLOTS } from '../utils/initialData';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const HOURS = TIME_SLOTS;

const AvailabilityGrid = ({ availability, onChange, disabled = false }) => {
    const toggleSlot = (day, hour) => {
        if (disabled) return;

        const newAvailability = { ...availability };
        if (!newAvailability[day]) {
            newAvailability[day] = {};
        }
        newAvailability[day][hour] = !newAvailability[day]?.[hour];
        onChange(newAvailability);
    };

    const isSlotSelected = (day, hour) => {
        return availability?.[day]?.[hour] || false;
    };

    return (
        <div className="border rounded-lg p-4 bg-gray-50">
            <div className="text-sm font-medium text-gray-700 mb-3">Horario de Disponibilidad</div>
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="border border-gray-300 bg-gray-100 p-2 text-xs font-medium text-gray-600 sticky left-0 z-10">Hora</th>
                            {DAYS.map(day => (
                                <th key={day} className="border border-gray-300 bg-gray-100 p-2 text-xs font-medium text-gray-600">
                                    {day.substring(0, 3)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {HOURS.map(hour => {
                            const isBreak = hour.includes('(Receso)');
                            return (
                                <tr key={hour} className={isBreak ? 'bg-gray-100' : ''}>
                                    <td className="border border-gray-300 bg-gray-100 p-2 text-xs font-medium text-gray-600 sticky left-0 z-10">
                                        {hour}
                                    </td>
                                    {DAYS.map(day => (
                                        <td key={`${day}-${hour}`} className={`border border-gray-300 p-0 ${isBreak ? 'bg-gray-200' : ''}`}>
                                            {!isBreak && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSlot(day, hour)}
                                                    disabled={disabled}
                                                    className={`w-full h-8 transition-colors ${isSlotSelected(day, hour)
                                                        ? 'bg-green-500 hover:bg-green-600'
                                                        : 'bg-white hover:bg-gray-100'
                                                        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                                    title={`${day} ${hour}`}
                                                />
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="mt-2 text-xs text-gray-500">
                Click en las celdas para marcar/desmarcar disponibilidad
            </div>
        </div>
    );
};

export default AvailabilityGrid;
