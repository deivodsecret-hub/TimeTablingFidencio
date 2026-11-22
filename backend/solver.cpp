#include <iostream>
#include <vector>
#include <string>
#include <map>
#include <fstream>
#include <sstream>
#include <algorithm>

using namespace std;

// --- Data Structures ---

struct Teacher {
    int id;
    string name;
    // Add constraints here (e.g., unavailable slots)
    vector<int> unavailable_slots; 
};

struct Room {
    int id;
    string name;
    int capacity;
    int group_id; // Added group_id (Quarter)
};

struct Course {
    int id;
    string name;
    int teacher_id;
    int students;
    int weekly_sessions; // number of 1-hour sessions per week
    int group_id; // Added group_id (Quarter)
};

struct Assignment {
    int course_id;
    int room_id;
    int start_slot;
};

// Global Data
vector<Teacher> teachers;
vector<Room> rooms;
vector<Course> courses;
vector<Assignment> schedule;

// Constants
const int SLOTS_PER_DAY = 17; // 14 slots + 3 breaks
const int DAYS = 5;
const int TOTAL_SLOTS = SLOTS_PER_DAY * DAYS;

// --- Simple JSON Parser Helper ---
// Note: This is a very basic parser tailored for this specific problem structure.
// For a production app, use nlohmann/json.

string get_json_value(string json, string key) {
    size_t pos = json.find("\"" + key + "\"");
    if (pos == string::npos) return "";
    pos = json.find(":", pos);
    size_t start = json.find_first_not_of(" \t\n\r", pos + 1);
    size_t end;
    if (json[start] == '"') {
        start++;
        end = json.find('"', start);
        return json.substr(start, end - start);
    } else {
        end = json.find_first_of(",}]", start);
        return json.substr(start, end - start);
    }
}

// Helper to parse arrays of objects is complex without a lib.
// We will assume the input format is strictly controlled by our Node.js server.
// Strategy: Read standard input line by line where each line is a specific data type
// OR rely on a simplified format passed by Node.js.
// DECISION: We will implement a "Simplified Protocol" reader.
// Node.js will convert JSON to:
// TEACHER id name
// ROOM id name capacity
// COURSE id name teacher_id students duration
// CONSTRAINT teacher_id slot_id
// END

void parse_input() {
    string type;
    while (cin >> type) {
        if (type == "TEACHER") {
            Teacher t;
            cin >> t.id >> t.name;
            teachers.push_back(t);
        } else if (type == "ROOM") {
            Room r;
            cin >> r.id >> r.name >> r.capacity >> r.group_id;
            rooms.push_back(r);
        } else if (type == "COURSE") {
            Course c;
            cin >> c.id >> c.name >> c.teacher_id >> c.students >> c.weekly_sessions >> c.group_id;
            courses.push_back(c);
        } else if (type == "CONSTRAINT") {
            int t_id, slot;
            cin >> t_id >> slot;
            for (auto& t : teachers) {
                if (t.id == t_id) {
                    t.unavailable_slots.push_back(slot);
                    break;
                }
            }
        } else if (type == "END") {
            break;
        }
    }
}

// --- Backtracking Solver ---

bool is_valid(int course_idx, int room_id, int start_slot) {
    const Course& course = courses[course_idx];
    
    // Check room capacity
    int room_capacity = 0;
    int room_group_id = -1;
    for(const auto& r : rooms) {
        if(r.id == room_id) {
            room_capacity = r.capacity;
            room_group_id = r.group_id;
        }
    }
    if (room_capacity < course.students) return false;

    // Check Group/Quarter Match
    if (course.group_id != room_group_id) return false;

    // Check time bounds (each session is 1 hour = 1 slot)
    int day = start_slot / SLOTS_PER_DAY;
    if (start_slot >= TOTAL_SLOTS) return false;

    // Check conflicts
    for (const auto& assign : schedule) {
        // Room conflict (each session is 1 slot)
        if (assign.room_id == room_id) {
            if (assign.start_slot == start_slot) {
                return false;
            }
        }
        
        // Teacher conflict (each session is 1 slot)
        int assigned_teacher = -1;
        for(const auto& c : courses) if(c.id == assign.course_id) assigned_teacher = c.teacher_id;
        
        if (assigned_teacher == course.teacher_id) {
            if (assign.start_slot == start_slot) {
                return false;
            }
        }
    }

    // Check Teacher Constraints (each session is 1 slot)
    for (const auto& t : teachers) {
        if (t.id == course.teacher_id) {
            for (int slot : t.unavailable_slots) {
                if (slot == start_slot) return false;
            }
        }
    }

    // NEW: Session Distribution Logic (Prevent clumping in one day)
    // Rule: Max sessions per day = ceil(weekly_sessions / 5.0)
    // e.g. 5 sessions -> max 1/day. 6 sessions -> max 2/day.
    int max_sessions_per_day = (course.weekly_sessions + 4) / 5;
    int sessions_on_day = 0;
    
    for (const auto& assign : schedule) {
        if (assign.course_id == course.id) {
            int assign_day = assign.start_slot / SLOTS_PER_DAY;
            if (assign_day == day) {
                sessions_on_day++;
            }
        }
    }

    if (sessions_on_day >= max_sessions_per_day) {
        return false;
    }

    return true;
}

// Track how many sessions have been assigned for each course
map<int, int> sessions_assigned;

bool solve(int course_idx, int session_num) {
    // If all courses have all their sessions assigned, we're done
    if (course_idx == courses.size()) return true;

    const Course& course = courses[course_idx];
    
    // If this course has all its sessions assigned, move to next course
    if (session_num >= course.weekly_sessions) {
        return solve(course_idx + 1, 0);
    }

    // Try to find a valid slot
    // Optimization: Iterate Horizontally (Hour by Hour across all days) 
    // instead of Vertically (filling Monday, then Tuesday...)
    // This ensures a more balanced schedule across the week.
    for (int hour = 0; hour < SLOTS_PER_DAY; hour++) {
        for (int day = 0; day < DAYS; day++) {
             int slot = day * SLOTS_PER_DAY + hour;

            // Skip Break Slots (indices 4, 8, 13 in each day)
            // (Note: hour 4, 8, 13 are the breaks)
            if (hour == 4 || hour == 8 || hour == 13) continue;

            // Get the room assigned to this course (from frontend)
            for (const auto& room : rooms) {
                if (is_valid(course_idx, room.id, slot)) {
                    schedule.push_back({course.id, room.id, slot});
                    if (solve(course_idx, session_num + 1)) return true;
                    schedule.pop_back();
                }
            }
        }
    }

    return false;
}

// --- Output ---

void print_schedule() {
    cout << "{\"schedule\": [";
    for (size_t i = 0; i < schedule.size(); ++i) {
        cout << "{\"course_id\": " << schedule[i].course_id 
             << ", \"room_id\": " << schedule[i].room_id 
             << ", \"start_slot\": " << schedule[i].start_slot << "}";
        if (i < schedule.size() - 1) cout << ",";
    }
    cout << "]}" << endl;
}

int main() {
    parse_input();
    if (solve(0, 0)) {
        print_schedule();
    } else {
        cout << "{\"error\": \"No solution found\"}" << endl;
    }
    return 0;
}
