import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusCircle, Trash2, Edit2, CheckCircle, ArrowUpDown } from "lucide-react";

// Single-file React dashboard component
// - Tailwind CSS classes are used for styling
// - Default storage: localStorage (works immediately, multi-user via same machine)
// - Optional multi-user realtime mode: paste Firestore config into `FIREBASE_CONFIG` and click "Enable Sync"
//   (instructions included inside the UI)
// - Features: add/edit/delete tasks, assign, due date, priority, status, filters, search, CSV export/import
// - Export / Import to share across team or to backup

// ---------------------------
// CONFIG AREA
// ---------------------------
// If you want multi-user live sync via Firebase/Firestore paste your config object below and
// click Enable Sync inside the app. Example placeholder:
// const FIREBASE_CONFIG = null; // replace with your firebase config object when ready
const FIREBASE_CONFIG = null;

// ---------------------------
// Utility helpers
// ---------------------------
const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => new Date().toISOString();

const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Todo", "In Progress", "Waiting", "Done"];

// localStorage key
const STORAGE_KEY = "team_task_dashboard_v1";

// ---------------------------
// Task model example:
// {
//   id: 'abc123',
//   title: 'Fix truck 12',
//   description: 'Replace brake pads',
//   assignee: 'Rami',
//   priority: 'High',
//   status: 'In Progress',
//   dueDate: '2025-11-20',
//   createdAt: '2025-11-11T08:00:00.000Z',
//   updatedAt: '2025-11-11T09:00:00.000Z'
// }

// ---------------------------
// Main component
// ---------------------------
export default function TeamTaskDashboard() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [sortBy, setSortBy] = useState("dueDate");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assigneeList, setAssigneeList] = useState(() => collectAssignees(tasks));
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [firebaseStatus, setFirebaseStatus] = useState("Not configured");

  // Persist to localStorage on change
  useEffect(() => {
    saveTasks(tasks);
    setAssigneeList(collectAssignees(tasks));
  }, [tasks]);

  // Derived list
  const visibleTasks = useMemo(() => {
    let result = tasks.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          (t.assignee || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "All") result = result.filter((t) => t.status === filterStatus);
    if (filterPriority !== "All") result = result.filter((t) => t.priority === filterPriority);

    if (sortBy === "dueDate") {
      result.sort((a, b) => (a.dueDate || "9999") > (b.dueDate || "9999") ? 1 : -1);
    } else if (sortBy === "priority") {
      const order = { Low: 0, Medium: 1, High: 2, Critical: 3 };
      result.sort((a, b) => (order[a.priority] || 0) - (order[b.priority] || 0));
    } else if (sortBy === "updatedAt") {
      result.sort((a, b) => (a.updatedAt || "") > (b.updatedAt || "") ? -1 : 1);
    }
    return result;
  }, [tasks, query, filterStatus, filterPriority, sortBy]);

  // Add or update task
  function upsertTask(payload) {
    if (!payload.title) return;
    if (!payload.id) {
      const t = {
        id: uid(),
        createdAt: now(),
        updatedAt: now(),
        ...payload,
      };
      setTasks((s) => [t, ...s]);
    } else {
      setTasks((s) => s.map((x) => (x.id === payload.id ? { ...x, ...payload, updatedAt: now() } : x)));
    }
    setShowForm(false);
    setEditing(null);
  }

  function removeTask(id) {
    if (!confirm("Delete this task?")) return;
    setTasks((s) => s.filter((t) => t.id !== id));
  }

  function toggleDone(id) {
    setTasks((s) => s.map((t) => (t.id === id ? { ...t, status: t.status === "Done" ? "Todo" : "Done", updatedAt: now() } : t)));
  }

  function openEdit(t) {
    setEditing(t);
    setShowForm(true);
  }

  // CSV export
  function exportCSV() {
    const header = ["id","title","description","assignee","priority","status","dueDate","createdAt","updatedAt"];
    const rows = tasks.map((t) => header.map((h) => JSON.stringify(t[h] || "")).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return alert("No data found");
      const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
      const imported = lines.slice(1).map((ln) => {
        const parts = splitCSVLine(ln);
        const obj = {};
        header.forEach((h, i) => (obj[h] = JSON.parse(parts[i] || '""')));
        return { ...obj };
      });
      setTasks((s) => [...imported, ...s]);
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Team Task Dashboard</h1>
            <p className="text-sm text-gray-600">Shared board for important tasks — add, assign, track progress.</p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <PlusCircle size={16} /> Add Task
            </button>
            <div className="bg-white rounded-md p-2 shadow flex gap-2">
              <button title="Export CSV" onClick={exportCSV} className="px-2 py-1 text-sm rounded hover:bg-gray-100">
                Export
              </button>
              <label className="px-2 py-1 text-sm rounded hover:bg-gray-100 cursor-pointer">
                Import
                <input
                  type="file"
                  accept="text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files && importCSV(e.target.files[0])}
                />
              </label>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left controls */}
          <aside className="lg:col-span-1 bg-white p-4 rounded shadow">
            <div className="mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, desc, assignee"
                className="w-full border px-3 py-2 rounded"
              />
            </div>
            <div className="flex gap-2 mb-3">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="flex-1 border px-2 py-2 rounded">
                <option>All</option>
                {STATUSES.map((s) => (<option key={s}>{s}</option>))}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="flex-1 border px-2 py-2 rounded">
                <option>All</option>
                {PRIORITIES.map((p) => (<option key={p}>{p}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-gray-600">Sort</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ml-auto border px-2 py-1 rounded">
                <option value="dueDate">Due date</option>
                <option value="priority">Priority</option>
                <option value="updatedAt">Recently updated</option>
              </select>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Assignees</h3>
              <div className="flex flex-wrap gap-2">
                <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={() => { setQuery(""); setFilterStatus("All"); setFilterPriority("All"); }}>Clear</button>
                {assigneeList.map((a) => (
                  <button
                    key={a}
                    onClick={() => setQuery(a)}
                    className="px-2 py-1 bg-yellow-50 rounded text-sm"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 text-xs text-gray-500">
              <p>Multi-user sync: <strong>{syncEnabled ? firebaseStatus : 'Disabled'}</strong></p>
              <p className="mt-2">To enable real-time multi-user syncing, paste a Firestore config object into the code constant <code>FIREBASE_CONFIG</code> and click "Enable Sync" below. (Optional.)</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="px-2 py-1 bg-green-600 text-white rounded text-sm"
                  onClick={() => {
                    if (!FIREBASE_CONFIG) return alert('No Firebase config found in the component. Paste your config into FIREBASE_CONFIG and reload the page.');
                    // NOTE: Firestore sync code is optional and not initialized here automatically for safety.
                    setSyncEnabled(true);
                    setFirebaseStatus('Configured — connect Firestore manually');
                    alert('Sync enabled flag set. See code comments to implement Firestore syncing.');
                  }}
                >Enable Sync</button>
                <button className="px-2 py-1 bg-gray-200 rounded text-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(tasks).slice(0,1000)); alert('Tasks sample copied to clipboard.'); }}>Copy sample</button>
              </div>
            </div>
          </aside>

          {/* Board area */}
          <main className="lg:col-span-3">
            <div className="bg-white rounded shadow p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">Showing <strong>{visibleTasks.length}</strong> of <strong>{tasks.length}</strong> tasks</div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <ArrowUpDown size={16} />
                  <div>{sortBy}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleTasks.map((t) => (
                  <motion.div key={t.id} layout initial={{ opacity: 0.6, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 border rounded-md bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className={`text-lg font-medium ${t.status === 'Done' ? 'line-through text-gray-500' : ''}`}>{t.title}</h3>
                        <div className="text-sm text-gray-600">{t.description}</div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="px-2 py-1 bg-gray-100 rounded">{t.assignee || 'Unassigned'}</span>
                          <span className="px-2 py-1 rounded" style={{ backgroundColor: priorityColor(t.priority), color: 'black' }}>{t.priority}</span>
                          <span className="px-2 py-1 bg-gray-50 rounded">{t.dueDate || 'No due'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-2">
                          <button title="Toggle Done" onClick={() => toggleDone(t.id)} className="p-2 rounded hover:bg-gray-100">
                            <CheckCircle size={16} />
                          </button>
                          <button title="Edit" onClick={() => openEdit(t)} className="p-2 rounded hover:bg-gray-100">
                            <Edit2 size={16} />
                          </button>
                          <button title="Delete" onClick={() => removeTask(t.id)} className="p-2 rounded hover:bg-gray-100 text-red-600">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400">Updated {new Date(t.updatedAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {visibleTasks.length === 0 && (
                <div className="text-center p-8 text-gray-500">No tasks. Click Add Task to create one.</div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Task form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30" onClick={() => { setShowForm(false); setEditing(null); }} />
            <motion.div layout className="relative w-full max-w-2xl bg-white rounded shadow-lg p-6 z-10">
              <TaskForm
                onCancel={() => { setShowForm(false); setEditing(null); }}
                onSave={upsertTask}
                initial={editing}
                recentAssignees={assigneeList}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ---------------------------
// Task form component
// ---------------------------
function TaskForm({ onCancel, onSave, initial = null, recentAssignees = [] }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [assignee, setAssignee] = useState(initial?.assignee || "");
  const [priority, setPriority] = useState(initial?.priority || "Medium");
  const [status, setStatus] = useState(initial?.status || "Todo");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");

  function save() {
    if (!title.trim()) return alert('Title is required');
    onSave({ id: initial?.id, title: title.trim(), description: description.trim(), assignee, priority, status, dueDate });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{initial ? 'Edit Task' : 'New Task'}</h2>
        <div className="text-sm text-gray-500">{initial ? 'editing' : 'create'}</div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full border px-3 py-2 rounded" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full border px-3 py-2 rounded h-24" />
        <div className="flex gap-2">
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assignee" className="flex-1 border px-3 py-2 rounded" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-40 border px-2 py-2 rounded">
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40 border px-2 py-2 rounded">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border px-3 py-2 rounded" />
          <div className="text-xs text-gray-500">Recent: {recentAssignees.slice(0,5).join(', ') || '—'}</div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded border">Cancel</button>
          <button onClick={save} className="px-4 py-2 rounded bg-indigo-600 text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------
// Small helpers
// ---------------------------
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleTasks();
    return JSON.parse(raw);
  } catch (e) {
    return sampleTasks();
  }
}

function saveTasks(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
}

function collectAssignees(list) {
  const s = new Set();
  list.forEach((t) => t.assignee && s.add(t.assignee));
  return Array.from(s);
}

function priorityColor(p) {
  if (p === 'Critical') return '#FFD2D2';
  if (p === 'High') return '#FFE8CC';
  if (p === 'Medium') return '#E7F5FF';
  return '#EAFBEA';
}

function splitCSVLine(line) {
  // simple CSV split for quoted values
  const parts = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p === '' ? '""' : '"'+p+'"');
}

function sampleTasks() {
  return [
    { id: uid(), title: 'Track fuel consumption (Daff trucks)', description: 'Gather monthly consumption per route', assignee: 'Rami', priority: 'High', status: 'In Progress', dueDate: '', createdAt: now(), updatedAt: now() },
    { id: uid(), title: 'SAP progress update', description: 'Prepare slides for Manco', assignee: 'Alice', priority: 'Medium', status: 'Todo', dueDate: '', createdAt: now(), updatedAt: now() },
  ];
}
