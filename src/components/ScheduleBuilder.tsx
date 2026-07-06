import React, { useState, useRef, useEffect } from 'react';
import { toast } from '../lib/toast';
import { 
  Calendar, Clock, Download, Plus, Trash2, Edit2, Check, RefreshCw, FileCode,
  Sparkles, HelpCircle, ChevronRight, ChevronLeft, ArrowRight, Layers, AlertCircle,
  Briefcase, CheckCircle2, Sliders, ToggleLeft, ToggleRight, ListTodo
} from 'lucide-react';

export interface ScheduleTask {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  duration: number; // Days
  progress: number; // 0-100
  predecessors: string[]; // IDs
  assignedTo?: string;
  color?: string; // Tailwind bg color class
}

const TEMPLATES = {
  signalling: {
    name: 'Rail Signalling Bid & Engineering Review (8 Phases)',
    tasks: [
      { id: 't1', name: 'RFT Specifications & Scope Breakdown', startDate: '2026-07-01', duration: 10, progress: 100, predecessors: [], assignedTo: 'Tom Castellano', color: 'bg-blue-500' },
      { id: 't2', name: 'Signal Site Inspection & Asset Audit', startDate: '2026-07-11', duration: 8, progress: 90, predecessors: ['t1'], assignedTo: 'Mei Lin Zhao', color: 'bg-indigo-500' },
      { id: 't3', name: 'Compliance & Gap Identification Report', startDate: '2026-07-15', duration: 7, progress: 60, predecessors: ['t1'], assignedTo: 'Priya Raman', color: 'bg-amber-500' },
      { id: 't4', name: 'First Draft Methodology & Technical Spec', startDate: '2026-07-23', duration: 12, progress: 40, predecessors: ['t2', 't3'], assignedTo: 'Ada Whitlock', color: 'bg-purple-500' },
      { id: 't5', name: 'Commercial Pricing & Subcontractor Quotations', startDate: '2026-07-30', duration: 14, progress: 15, predecessors: ['t3'], assignedTo: 'Henrik Solberg', color: 'bg-emerald-500' },
      { id: 't6', name: 'Safety Management Plan & RAMS Assurance', startDate: '2026-08-05', duration: 9, progress: 10, predecessors: ['t4'], assignedTo: 'Ada Whitlock', color: 'bg-rose-500' },
      { id: 't7', name: 'Technical Gate Review & Board Sign-off', startDate: '2026-08-16', duration: 5, progress: 0, predecessors: ['t5', 't6'], assignedTo: 'Tom Castellano', color: 'bg-slate-700' },
      { id: 't8', name: 'Final Bid Assembly & Electronic Tender Submission', startDate: '2026-08-21', duration: 4, progress: 0, predecessors: ['t7'], assignedTo: 'Priya Raman', color: 'bg-blue-600' }
    ]
  },
  civil: {
    name: 'Civil Highway Extension fast-track (7 Phases)',
    tasks: [
      { id: 'c1', name: 'Environmental Impact & Utility Survey', startDate: '2026-07-01', duration: 12, progress: 100, predecessors: [], assignedTo: 'Mei Lin Zhao', color: 'bg-emerald-500' },
      { id: 'c2', name: 'Earthworks & Soil Compaction Profiling', startDate: '2026-07-13', duration: 15, progress: 80, predecessors: ['c1'], assignedTo: 'Ada Whitlock', color: 'bg-amber-500' },
      { id: 'c3', name: 'Drainage Pipe & Water Reticulation Design', startDate: '2026-07-20', duration: 10, progress: 40, predecessors: ['c1'], assignedTo: 'Tom Castellano', color: 'bg-indigo-500' },
      { id: 'c4', name: 'Pavement Sub-base Construction', startDate: '2026-08-01', duration: 14, progress: 10, predecessors: ['c2', 'c3'], assignedTo: 'Mei Lin Zhao', color: 'bg-blue-500' },
      { id: 'c5', name: 'Asphalt Laying & Road Furniture Install', startDate: '2026-08-15', duration: 10, progress: 0, predecessors: ['c4'], assignedTo: 'Ada Whitlock', color: 'bg-purple-500' },
      { id: 'c6', name: 'Traffic Management Commissioning', startDate: '2026-08-25', duration: 6, progress: 0, predecessors: ['c5'], assignedTo: 'Mei Lin Zhao', color: 'bg-rose-500' },
      { id: 'c7', name: 'Client Final Inspections & Practical Completion', startDate: '2026-08-31', duration: 5, progress: 0, predecessors: ['c6'], assignedTo: 'Tom Castellano', color: 'bg-slate-700' }
    ]
  },
  refit: {
    name: 'Commercial Construction Building Refit (6 Phases)',
    tasks: [
      { id: 'r1', name: 'Site Demolition & Hazardous Material Clear', startDate: '2026-07-01', duration: 8, progress: 100, predecessors: [], assignedTo: 'Mei Lin Zhao', color: 'bg-rose-500' },
      { id: 'r2', name: 'Structural Partitioning & Metal Framing', startDate: '2026-07-09', duration: 10, progress: 75, predecessors: ['r1'], assignedTo: 'Ada Whitlock', color: 'bg-indigo-500' },
      { id: 'r3', name: 'Electrical Cat 6 Cabling & HVAC Rough-In', startDate: '2026-07-16', duration: 12, progress: 30, predecessors: ['r2'], assignedTo: 'Tom Castellano', color: 'bg-amber-500' },
      { id: 'r4', name: 'Drywall Plastering, Painting & Acoustic Ceilings', startDate: '2026-07-25', duration: 10, progress: 0, predecessors: ['r3'], assignedTo: 'Mei Lin Zhao', color: 'bg-blue-500' },
      { id: 'r5', name: 'Integrated Furniture, Fittings & Finishes', startDate: '2026-08-05', duration: 8, progress: 0, predecessors: ['r4'], assignedTo: 'Henrik Solberg', color: 'bg-emerald-500' },
      { id: 'r6', name: 'HVAC Testing & Occupancy Sign-off', startDate: '2026-08-13', duration: 4, progress: 0, predecessors: ['r5'], assignedTo: 'Tom Castellano', color: 'bg-slate-700' }
    ]
  }
};

const DEFAULT_START_DATE = '2026-07-01';

export default function ScheduleBuilder() {
  const [tasks, setTasks] = useState<ScheduleTask[]>(TEMPLATES.signalling.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCriticalPath, setShowCriticalPath] = useState<boolean>(true);
  const [timelineStart, setTimelineStart] = useState<string>(DEFAULT_START_DATE);
  
  // Custom prompt input for schedule generator
  const [promptText, setPromptText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [aiGeneratedSuccess, setAiGeneratedSuccess] = useState<boolean>(false);

  // Edit/Add Form States
  const [taskName, setTaskName] = useState<string>('');
  const [taskStart, setTaskStart] = useState<string>('');
  const [taskDur, setTaskDur] = useState<number>(5);
  const [taskProg, setTaskProg] = useState<number>(0);
  const [taskPred, setTaskPred] = useState<string[]>([]);
  const [taskOwner, setTaskOwner] = useState<string>('Tom Castellano');
  const [taskColor, setTaskColor] = useState<string>('bg-blue-500');

  // Drag state management
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [startX, setStartX] = useState<number>(0);
  const [initialStart, setInitialStart] = useState<string>('');
  const [initialDuration, setInitialDuration] = useState<number>(0);

  // Layout geometry calculations
  const cellWidth = 24; // Width in pixels of 1 day in the Gantt grid
  const rowHeight = 44; // Height of each row in px
  const timelineDays = 64; // Total days in Gantt view window

  // Calculate project baseline start
  const projectBaseDate = new Date(timelineStart);

  // Form helpers to select standard color classes
  const colorsList = [
    { class: 'bg-blue-500', name: 'Corporate Blue' },
    { class: 'bg-indigo-500', name: 'Deep Indigo' },
    { class: 'bg-purple-500', name: 'Royal Purple' },
    { class: 'bg-emerald-500', name: 'Eco Emerald' },
    { class: 'bg-amber-500', name: 'Vibrant Amber' },
    { class: 'bg-rose-500', name: 'Crimson Red' },
    { class: 'bg-slate-700', name: 'Slate Gray' },
  ];

  // Map dates to pixel offsets
  const dateToPixels = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffTime = d.getTime() - projectBaseDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.round(diffDays) * cellWidth;
  };

  // Map pixels to date strings
  const pixelsToDate = (px: number) => {
    const days = Math.round(px / cellWidth);
    const d = new Date(projectBaseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Generate date array for headers
  const getTimelineDaysArray = () => {
    const dates = [];
    const tempDate = new Date(projectBaseDate);
    for (let i = 0; i < timelineDays; i++) {
      dates.push(new Date(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
    }
    return dates;
  };

  const daysArray = getTimelineDaysArray();

  // Populate form with task details on click
  const selectTask = (task: ScheduleTask) => {
    setSelectedTaskId(task.id);
    setTaskName(task.name);
    setTaskStart(task.startDate);
    setTaskDur(task.duration);
    setTaskProg(task.progress);
    setTaskPred(task.predecessors);
    setTaskOwner(task.assignedTo || 'Tom Castellano');
    setTaskColor(task.color || 'bg-blue-500');
  };

  const handleUpdateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;

    setTasks(tasks.map(t => {
      if (t.id === selectedTaskId) {
        return {
          ...t,
          name: taskName,
          startDate: taskStart,
          duration: Number(taskDur),
          progress: Number(taskProg),
          predecessors: taskPred,
          assignedTo: taskOwner,
          color: taskColor
        };
      }
      return t;
    }));
  };

  const handleAddTask = () => {
    const newId = 't_added_' + Date.now();
    const newTask: ScheduleTask = {
      id: newId,
      name: 'New Custom Task',
      startDate: timelineStart,
      duration: 5,
      progress: 0,
      predecessors: [],
      assignedTo: 'Tom Castellano',
      color: 'bg-indigo-500'
    };
    setTasks([...tasks, newTask]);
    selectTask(newTask);
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id).map(t => ({
      ...t,
      predecessors: t.predecessors.filter(p => p !== id)
    })));
    if (selectedTaskId === id) {
      setSelectedTaskId(null);
    }
  };

  // Apply quick Template loading
  const loadTemplate = (key: 'signalling' | 'civil' | 'refit') => {
    const template = TEMPLATES[key];
    setTasks(template.tasks);
    setTimelineStart(template.tasks[0].startDate);
    setSelectedTaskId(null);
  };

  // Simulated AI Schedule draft generator
  const triggerAiGenerator = () => {
    if (!promptText.trim()) return;
    setIsGenerating(true);
    setAiGeneratedSuccess(false);

    // Simulate analysis of request and responsive template construction
    setTimeout(() => {
      const promptLower = promptText.toLowerCase();
      let genTasks: ScheduleTask[] = [];
      let baseDate = '2026-07-01';

      if (promptLower.includes('sewer') || promptLower.includes('water') || promptLower.includes('pipeline')) {
        genTasks = [
          { id: 'w1', name: 'Geotechnical Soil Core Sampling & Utility Mapping', startDate: '2026-07-01', duration: 10, progress: 100, predecessors: [], assignedTo: 'Mei Lin Zhao', color: 'bg-blue-500' },
          { id: 'w2', name: 'Excavation & Trench Shoring Systems Install', startDate: '2026-07-11', duration: 14, progress: 70, predecessors: ['w1'], assignedTo: 'Mei Lin Zhao', color: 'bg-indigo-500' },
          { id: 'w3', name: 'High-Density Polyethylene Pipeline Laying', startDate: '2026-07-22', duration: 15, progress: 30, predecessors: ['w2'], assignedTo: 'Ada Whitlock', color: 'bg-purple-500' },
          { id: 'w4', name: 'Hydrostatic Pressure & Welded Joint Audits', startDate: '2026-08-04', duration: 7, progress: 0, predecessors: ['w3'], assignedTo: 'Tom Castellano', color: 'bg-amber-500' },
          { id: 'w5', name: 'Trench Backfilling & Local Environmental Remediation', startDate: '2026-08-09', duration: 12, progress: 0, predecessors: ['w4'], assignedTo: 'Mei Lin Zhao', color: 'bg-emerald-500' },
          { id: 'w6', name: 'Council Certification & Practical Handover Approval', startDate: '2026-08-20', duration: 5, progress: 0, predecessors: ['w5'], assignedTo: 'Tom Castellano', color: 'bg-slate-700' }
        ];
      } else if (promptLower.includes('solar') || promptLower.includes('power') || promptLower.includes('energy')) {
        genTasks = [
          { id: 'p1', name: 'Solar Grid Interconnection Approval & Site Grading', startDate: '2026-07-01', duration: 12, progress: 100, predecessors: [], assignedTo: 'Tom Castellano', color: 'bg-emerald-500' },
          { id: 'p2', name: 'Concrete Foundation Piling for PV Racking Modules', startDate: '2026-07-12', duration: 14, progress: 85, predecessors: ['p1'], assignedTo: 'Mei Lin Zhao', color: 'bg-blue-500' },
          { id: 'p3', name: 'Silicon Photovoltaic Inverter & Bracket Mounting', startDate: '2026-07-23', duration: 16, progress: 40, predecessors: ['p2'], assignedTo: 'Ada Whitlock', color: 'bg-indigo-500' },
          { id: 'p4', name: 'Substation Transformer Cable Laying & Termination', startDate: '2026-08-05', duration: 10, progress: 0, predecessors: ['p3'], assignedTo: 'Ada Whitlock', color: 'bg-purple-500' },
          { id: 'p5', name: 'SCADA Communications & Grid Synchronization Testing', startDate: '2026-08-14', duration: 8, progress: 0, predecessors: ['p4'], assignedTo: 'Tom Castellano', color: 'bg-rose-500' },
          { id: 'p6', name: 'AEMO Operational Compliance & Full Load Energization', startDate: '2026-08-21', duration: 6, progress: 0, predecessors: ['p5'], assignedTo: 'Priya Raman', color: 'bg-slate-700' }
        ];
      } else {
        // Generic bespoke template
        genTasks = [
          { id: 'b1', name: 'Phase 1: Scope Parsing & Preliminary Layouts', startDate: '2026-07-01', duration: 8, progress: 100, predecessors: [], assignedTo: 'Tom Castellano', color: 'bg-blue-500' },
          { id: 'b2', name: 'Phase 2: Core Engineering & Risk Identification', startDate: '2026-07-08', duration: 12, progress: 75, predecessors: ['b1'], assignedTo: 'Ada Whitlock', color: 'bg-indigo-500' },
          { id: 'b3', name: 'Phase 3: Supplier Material Quotes & Subcontractor Prequal', startDate: '2026-07-15', duration: 10, progress: 40, predecessors: ['b1'], assignedTo: 'Henrik Solberg', color: 'bg-purple-500' },
          { id: 'b4', name: 'Phase 4: Cost Estimating & Work Breakdown Formulation', startDate: '2026-07-22', duration: 14, progress: 10, predecessors: ['b2', 'b3'], assignedTo: 'Tom Castellano', color: 'bg-amber-500' },
          { id: 'b5', name: 'Phase 5: Executive Review Board Bid Alignment', startDate: '2026-08-04', duration: 5, progress: 0, predecessors: ['b4'], assignedTo: 'Priya Raman', color: 'bg-rose-500' },
          { id: 'b6', name: 'Phase 6: Quality Control Audit & Submission Upload', startDate: '2026-08-08', duration: 4, progress: 0, predecessors: ['b5'], assignedTo: 'Mei Lin Zhao', color: 'bg-slate-700' }
        ];
      }

      setTasks(genTasks);
      setTimelineStart(baseDate);
      setIsGenerating(false);
      setAiGeneratedSuccess(true);
      setSelectedTaskId(null);
      // Fade out success indicator
      setTimeout(() => setAiGeneratedSuccess(false), 4000);
    }, 1500);
  };

  // Critical Path Computation Engine (Simplistic Forward/Backward pass simulation)
  // Calculates which tasks have zero float. In a simple predecessor link chain,
  // we trace the longest path of sequential dependency links.
  // ── Critical Path Method ──────────────────────────────────────────
  // Real CPM: forward pass (earliest start/finish per task, walking
  // dependency order), backward pass (latest start/finish, walking
  // backward from the project end), float = late start − early start.
  // Critical = zero float. This operates on the logical network
  // (durations + dependencies) rather than the currently-set calendar
  // dates, which is what CPM is supposed to answer: "structurally,
  // which tasks have no slack" — independent of how the schedule
  // happens to be arranged right now. (The previous version highlighted
  // whichever chain had the longest summed duration, which usually
  // looks similar but isn't the same thing and can pick the wrong chain
  // on diamond-shaped dependency graphs.)
  const computeCpm = () => {
    const byId: Record<string, ScheduleTask> = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const successorsMap: Record<string, string[]> = {};
    tasks.forEach((t) => {
      t.predecessors.forEach((pid) => {
        if (!byId[pid]) return; // ignore dangling predecessor ids
        (successorsMap[pid] ??= []).push(t.id);
      });
    });

    // Topological order via Kahn's algorithm — correct on any DAG (not
    // just simple chains) and terminates even if a cycle sneaks in
    // (falls back to appending remaining tasks rather than recursing
    // forever, which the old chain-builder could do on a cyclic edit).
    const inDegree: Record<string, number> = {};
    tasks.forEach((t) => { inDegree[t.id] = t.predecessors.filter((p) => byId[p]).length; });
    const queue = tasks.filter((t) => inDegree[t.id] === 0).map((t) => t.id);
    const order: string[] = [];
    const remaining = { ...inDegree };
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      (successorsMap[id] || []).forEach((nid) => {
        remaining[nid]--;
        if (remaining[nid] === 0) queue.push(nid);
      });
    }
    if (order.length < tasks.length) {
      tasks.forEach((t) => { if (!order.includes(t.id)) order.push(t.id); });
    }

    // Forward pass
    const earlyStart: Record<string, number> = {};
    const earlyFinish: Record<string, number> = {};
    order.forEach((id) => {
      const t = byId[id];
      const preds = t.predecessors.filter((p) => byId[p]);
      const es = preds.length ? Math.max(...preds.map((p) => earlyFinish[p] ?? 0)) : 0;
      earlyStart[id] = es;
      earlyFinish[id] = es + t.duration;
    });
    const projectDuration = tasks.length ? Math.max(...tasks.map((t) => earlyFinish[t.id] ?? 0)) : 0;

    // Backward pass
    const lateFinish: Record<string, number> = {};
    const lateStart: Record<string, number> = {};
    [...order].reverse().forEach((id) => {
      const succs = successorsMap[id] || [];
      const lf = succs.length ? Math.min(...succs.map((s) => lateStart[s] ?? projectDuration)) : projectDuration;
      lateFinish[id] = lf;
      lateStart[id] = lf - byId[id].duration;
    });

    const floatByTaskId: Record<string, number> = {};
    const criticalIds: string[] = [];
    tasks.forEach((t) => {
      const float = (lateStart[t.id] ?? 0) - (earlyStart[t.id] ?? 0);
      floatByTaskId[t.id] = float;
      if (float <= 0) criticalIds.push(t.id);
    });

    return { criticalIds, floatByTaskId, projectDuration };
  };

  const cpm = computeCpm();
  const criticalTaskIds = cpm.criticalIds;

  // ── Dependency-aware scheduling ───────────────────────────────────
  // UTC-safe date maths (avoids the off-by-one that new Date('YYYY-MM-DD')
  // can cause in negative-UTC timezones). ISO date strings compare
  // correctly with < / >, so we lean on that for "latest predecessor".
  const parseISO = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  const addDaysISO = (iso: string, n: number) =>
    new Date(parseISO(iso) + n * 86400000).toISOString().split('T')[0];
  const finishOf = (t: ScheduleTask) => addDaysISO(t.startDate, t.duration);

  // Latest finish across all tasks = project end date.
  const projectEnd = tasks.reduce(
    (max, t) => (finishOf(t) > max ? finishOf(t) : max),
    tasks[0] ? tasks[0].startDate : timelineStart,
  );

  // Push every task so it starts when its latest predecessor finishes
  // (finish-to-start, zero lag). Roots pin to the timeline base date.
  // Cycle-safe: relaxes over N passes and simply stops improving.
  const reflowToDependencies = () => {
    let next = tasks.map((t) => ({
      ...t,
      startDate: t.predecessors.length ? timelineStart : (t.startDate < timelineStart ? timelineStart : t.startDate),
    }));
    for (let pass = 0; pass < tasks.length; pass++) {
      const byId: Record<string, ScheduleTask> = Object.fromEntries(next.map((t) => [t.id, t]));
      next = next.map((t) => {
        if (!t.predecessors.length) return t;
        let start = timelineStart;
        t.predecessors.forEach((pid) => {
          const p = byId[pid];
          if (p) {
            const f = finishOf(p);
            if (f > start) start = f;
          }
        });
        return { ...t, startDate: start };
      });
    }
    setTasks(next);
    toast('Reflowed tasks to their dependencies.');
  };

  // Drag Handlers
  const handleGanttMouseDown = (taskId: string, type: 'move' | 'resize', clientX: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setIsDragging(true);
    setDragType(type);
    setDraggedTaskId(taskId);
    setStartX(clientX);
    setInitialStart(task.startDate);
    setInitialDuration(task.duration);
  };

  // Listen to mouse moving globally when dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || !draggedTaskId) return;

      const deltaX = e.clientX - startX;
      const daysDelta = Math.round(deltaX / cellWidth);

      if (dragType === 'move') {
        const d = new Date(initialStart);
        d.setDate(d.getDate() + daysDelta);
        const newStartStr = d.toISOString().split('T')[0];
        
        setTasks(prev => prev.map(t => {
          if (t.id === draggedTaskId) {
            return { ...t, startDate: newStartStr };
          }
          return t;
        }));
      } else if (dragType === 'resize') {
        const newDuration = Math.max(1, initialDuration + daysDelta);
        setTasks(prev => prev.map(t => {
          if (t.id === draggedTaskId) {
            return { ...t, duration: newDuration };
          }
          return t;
        }));
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragType(null);
        setDraggedTaskId(null);
        
        // If there's a selected task, synchronize the sidebar input values
        if (selectedTaskId) {
          const t = tasks.find(tsk => tsk.id === selectedTaskId);
          if (t) {
            setTaskStart(t.startDate);
            setTaskDur(t.duration);
          }
        }
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragType, draggedTaskId, startX, initialStart, initialDuration]);

  // MS PROJECT XML EXPORT
  const exportToMSProjectXML = () => {
    const p6tasks = tasks.map((t, idx) => {
      const startDateTime = `${t.startDate}T08:00:00`;
      // Calculate finish date
      const fDate = new Date(t.startDate);
      fDate.setDate(fDate.getDate() + t.duration);
      const finishDateTime = `${fDate.toISOString().split('T')[0]}T17:00:00`;
      
      const predXML = t.predecessors.map(pId => {
        const predIndex = tasks.findIndex(tsk => tsk.id === pId) + 1;
        return `
        <PredecessorLink>
          <PredecessorUID>${predIndex}</PredecessorUID>
          <Type>1</Type>
          <LinkLag>0</LinkLag>
        </PredecessorLink>`;
      }).join('');

      return `
    <Task>
      <UID>${idx + 1}</UID>
      <ID>${idx + 1}</ID>
      <Name>${t.name.replace(/&/g, '&amp;')}</Name>
      <Type>0</Type>
      <CreateDate>${new Date().toISOString()}</CreateDate>
      <Start>${startDateTime}</Start>
      <Finish>${finishDateTime}</Finish>
      <Duration>PT${t.duration * 8}H0M0S</Duration>
      <ManualStart>${startDateTime}</ManualStart>
      <ManualFinish>${finishDateTime}</ManualFinish>
      <PercentComplete>${t.progress}</PercentComplete>
      <ConstraintType>0</ConstraintType>
      <Notes>Imported into MS Project / P6 via CRSA bidding engine.</Notes>
      ${t.predecessors.length > 0 ? `<PredecessorLink>${predXML}</PredecessorLink>` : ''}
    </Task>`;
    }).join('');

    const xmlString = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Bid Plan Schedule</Name>
  <Title>Interactive Tender Timeline</Title>
  <StartDate>${timelineStart}T08:00:00</StartDate>
  <FinishDate>${timelineStart}T17:00:00</FinishDate>
  <Tasks>${p6tasks}
  </Tasks>
</Project>`;

    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CRSA_Bid_Schedule_MS_Project_Import.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // PRIMAVERA P6 COMPATIBLE CSV EXPORT
  const exportToP6CSV = () => {
    const headers = 'Activity ID,Activity Name,Original Duration,Remaining Duration,Activity Status,Start,Finish,Predecessors,Assigned Resource\n';
    
    const rows = tasks.map((t, idx) => {
      const actId = `A${1000 + idx * 10}`;
      const fDate = new Date(t.startDate);
      fDate.setDate(fDate.getDate() + t.duration);
      const finishDateStr = fDate.toISOString().split('T')[0];
      const status = t.progress === 100 ? 'Completed' : t.progress > 0 ? 'In Progress' : 'Not Started';
      
      const predIds = t.predecessors.map(pId => {
        const pIdx = tasks.findIndex(tsk => tsk.id === pId);
        return `A${1000 + pIdx * 10}`;
      }).join(';');

      return `"${actId}","${t.name.replace(/"/g, '""')}","${t.duration}","${Math.round(t.duration * (1 - t.progress / 100))}","${status}","${t.startDate}","${finishDateStr}","${predIds}","${t.assignedTo}"`;
    }).join('\n');

    const csvContent = headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CRSA_Primavera_P6_Schedule_Import.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Upper header section */}
      <div className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight flex items-center gap-2">
            <span>Critical Path & Interactive Schedule Builder</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase">P6/MSP Compliant</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Build interactive, click-and-drag Gantt schedules. Export directly into Primavera P6 (CSV/XER-ready) or MS Project (XML format).
          </p>
        </div>

        {/* Quick export actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportToMSProjectXML}
            className="text-xs font-semibold py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded shadow-2xs flex items-center gap-1.5 transition-all"
            title="Download formatted XML matching MS Project Schema"
          >
            <Download className="w-4 h-4 text-slate-400" /> Export MS Project (XML)
          </button>
          
          <button
            onClick={exportToP6CSV}
            className="text-xs font-semibold py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded shadow-2xs flex items-center gap-1.5 transition-all"
            title="Download Primavera P6 compliant CSV rates and steps matrix"
          >
            <FileCode className="w-4 h-4 text-emerald-600" /> Export Primavera P6 (CSV)
          </button>

          <button
            onClick={reflowToDependencies}
            className="text-xs font-semibold py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded shadow-2xs flex items-center gap-1.5 transition-all"
            title="Shift every task to start when its predecessors finish"
          >
            <RefreshCw className="w-4 h-4 text-indigo-500" /> Reflow dependencies
          </button>

          <button
            onClick={handleAddTask}
            className="text-xs font-semibold py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Task Row
          </button>
        </div>
      </div>

      {/* AI Schedule Generation & Quick Templates Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Templates selector */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-2xs flex flex-col justify-between space-y-3">
          <div>
            <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" /> Load Tender Base Schedule
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">Instantly seed the workspace with industry-specific sequence benchmarks.</p>
          </div>
          
          <div className="space-y-1.5">
            <button 
              onClick={() => loadTemplate('signalling')}
              className="w-full text-left text-xs font-semibold p-2 rounded-md border border-slate-150 hover:bg-slate-50/75 flex items-center justify-between text-slate-800 transition-colors"
            >
              <span>Rail Signalling Bid & Design</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button 
              onClick={() => loadTemplate('civil')}
              className="w-full text-left text-xs font-semibold p-2 rounded-md border border-slate-150 hover:bg-slate-50/75 flex items-center justify-between text-slate-800 transition-colors"
            >
              <span>Civil Road fast-track sequence</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button 
              onClick={() => loadTemplate('refit')}
              className="w-full text-left text-xs font-semibold p-2 rounded-md border border-slate-150 hover:bg-slate-50/75 flex items-center justify-between text-slate-800 transition-colors"
            >
              <span>Commercial Building Refit schedule</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* AI Schedule Copilot Prompt */}
        <div className="bg-slate-900 p-4 rounded-lg text-white lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" /> AI Schedule Synthesis Copilot
              </h4>
              <p className="text-[11px] text-slate-300 mt-1">
                Describe your project, bid constraints, or scope of works. The copilot automatically drafts sequence, durations, and predecessors.
              </p>
            </div>
            <span className="bg-indigo-500/20 text-indigo-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-indigo-400/20 uppercase tracking-widest">
              AI Engine
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              placeholder="e.g., Draft an 8-week solar farm PV rack install with inverter connections and commissioning..."
              className="flex-1 bg-white/10 hover:bg-white/15 border border-white/15 rounded text-xs px-3 py-2 text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={triggerAiGenerator}
              disabled={isGenerating || !promptText.trim()}
              className="text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white px-4 py-2 rounded flex items-center gap-1.5 shrink-0 transition-all shadow-sm"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Synthesizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Draft Schedule
                </>
              )}
            </button>
          </div>

          <p className="text-[9px] text-slate-400 font-mono mt-2">
            *Outputs standard P6 compatible linkages. Try mentioning "solar", "sewer pipe", or custom engineering scope.*
          </p>
        </div>

      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Gantt Interactive Area (Left 3 columns) */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
          
          {/* Gantt Area Headers & Controls */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-800">Timeline Base:</span>
              <input 
                type="date"
                value={timelineStart}
                onChange={e => setTimelineStart(e.target.value)}
                className="text-xs p-1 bg-white border border-slate-200 rounded font-mono font-semibold"
              />
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    const d = new Date(timelineStart);
                    d.setDate(d.getDate() - 7);
                    setTimelineStart(d.toISOString().split('T')[0]);
                  }}
                  className="p-1 hover:bg-slate-200 rounded text-slate-500"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">Weekly Shift</span>
                <button 
                  onClick={() => {
                    const d = new Date(timelineStart);
                    d.setDate(d.getDate() + 7);
                    setTimelineStart(d.toISOString().split('T')[0]);
                  }}
                  className="p-1 hover:bg-slate-200 rounded text-slate-500"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-slate-600 bg-white border border-slate-200 rounded px-2 py-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                Ends {new Date(parseISO(projectEnd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                <span className="text-slate-300">·</span>
                <span className="text-rose-600">{criticalTaskIds.length} critical</span>
              </span>

              {/* Critical Path Toggle */}
              <button 
                onClick={() => setShowCriticalPath(!showCriticalPath)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
              >
                {showCriticalPath ? (
                  <ToggleRight className="w-8 h-8 text-indigo-600 shrink-0" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-300 shrink-0" />
                )}
                <span>Highlight Critical Path</span>
              </button>

              <span className="hidden sm:inline text-[10px] text-slate-400 font-mono font-bold">
                DRAG BARS TO MOVE | DRAG EDGES TO RESIZE
              </span>
            </div>
          </div>

          {/* Interactive Gantt Interactive Canvas container */}
          <div className="overflow-x-auto select-none" style={{ minHeight: '340px' }}>
            <div className="relative" style={{ width: `${daysArray.length * cellWidth + 280}px` }}>
              
              {/* Left Column (Task Titles Panel) Header */}
              <div className="absolute left-0 top-0 w-[240px] bg-slate-50 border-r border-slate-200 font-mono font-bold text-[10px] uppercase text-slate-500 py-3.5 px-4 h-12 z-10 flex items-center">
                WBS Activity Description
              </div>

              {/* Weekly/Daily Timeline Header blocks */}
              <div className="ml-[240px] h-12 bg-slate-50 border-b border-slate-200 flex flex-col justify-between text-slate-600">
                {/* Weekly Block Labels */}
                <div className="flex border-b border-slate-150 h-6 items-center">
                  {Array.from({ length: Math.ceil(timelineDays / 7) }).map((_, wIdx) => {
                    const weekDate = new Date(projectBaseDate);
                    weekDate.setDate(weekDate.getDate() + wIdx * 7);
                    return (
                      <div 
                        key={wIdx} 
                        className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 border-r border-slate-150 pl-2 shrink-0 flex items-center"
                        style={{ width: `${cellWidth * 7}px` }}
                      >
                        Week {wIdx + 1} ({weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                      </div>
                    );
                  })}
                </div>
                
                {/* Daily grid tick marks */}
                <div className="flex h-6 items-center">
                  {daysArray.map((day, dIdx) => {
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div 
                        key={dIdx} 
                        className={`text-[8px] font-mono text-center shrink-0 border-r border-slate-150 h-full flex items-center justify-center ${isWeekend ? 'bg-slate-100 text-slate-400 font-bold' : 'text-slate-500 font-medium'}`}
                        style={{ width: `${cellWidth}px` }}
                        title={day.toISOString().split('T')[0]}
                      >
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gantt Row Items */}
              <div className="relative">
                {tasks.map((task, rowIdx) => {
                  const leftOffset = dateToPixels(task.startDate);
                  const barWidth = task.duration * cellWidth;
                  const isSelected = selectedTaskId === task.id;
                  const isCritical = showCriticalPath && criticalTaskIds.includes(task.id);

                  return (
                    <div 
                      key={task.id} 
                      className={`flex items-center h-[44px] hover:bg-slate-50/50 relative border-b border-slate-100 transition-colors ${isSelected ? 'bg-indigo-50/20' : ''}`}
                    >
                      {/* Left Title block */}
                      <div className="absolute left-0 w-[240px] border-r border-slate-200 bg-white/95 h-full z-10 px-4 flex flex-col justify-center gap-0.5 shadow-3xs">
                        <div className="flex items-center gap-1.5">
                          {isCritical && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Critical Path Task" />
                          )}
                          <span 
                            onClick={() => selectTask(task)}
                            className={`text-[11px] font-semibold cursor-pointer truncate hover:text-indigo-600 transition-colors ${isSelected ? 'text-indigo-700 font-bold' : 'text-slate-800'}`}
                            title={task.name}
                          >
                            {task.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                          <span>
                            D: {task.duration}d | {task.progress}%
                            {showCriticalPath && !isCritical && cpm.floatByTaskId[task.id] > 0 && (
                              <span className="text-emerald-600" title="Days this task can slip without delaying the project"> · {cpm.floatByTaskId[task.id]}d float</span>
                            )}
                          </span>
                          <span className="text-slate-500 font-sans font-medium">{task.assignedTo || 'Unassigned'}</span>
                        </div>
                      </div>

                      {/* Interactive SVG / Bar block on the grid area */}
                      <div className="ml-[240px] h-full w-full relative overflow-hidden">
                        
                        {/* Shaded Weekend Grid Background lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {daysArray.map((day, dayIdx) => {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                            return (
                              <div 
                                key={dayIdx} 
                                className={`h-full border-r border-slate-100/60 shrink-0 ${isWeekend ? 'bg-slate-50/70' : ''}`}
                                style={{ width: `${cellWidth}px` }}
                              />
                            );
                          })}
                        </div>

                        {/* Interactive Task Gantt Bar */}
                        <div 
                          className={`absolute top-2.5 h-5 rounded shadow-3xs cursor-grab flex items-center justify-between group transition-all select-none ${
                            isCritical 
                              ? 'bg-red-500 hover:bg-red-600 border border-red-400' 
                              : isSelected
                                ? 'bg-indigo-600 ring-2 ring-indigo-500/35 border border-indigo-400'
                                : `${task.color || 'bg-blue-500'} hover:opacity-90`
                          }`}
                          style={{ 
                            left: `${leftOffset}px`, 
                            width: `${barWidth}px` 
                          }}
                          onMouseDown={(e) => {
                            // Only trigger move if clicking the bar body, not resizing handle
                            if (e.target instanceof HTMLElement && e.target.classList.contains('resize-handle')) return;
                            handleGanttMouseDown(task.id, 'move', e.clientX);
                          }}
                          title={`Drag to shift. Starts: ${task.startDate}`}
                        >
                          {/* Left resize anchor */}
                          <div className="w-1 h-full cursor-col-resize rounded-l group-hover:bg-black/10 shrink-0" />

                          {/* Inner Label / Completion fill */}
                          <div className="flex-1 h-full relative overflow-hidden flex items-center px-1.5">
                            {/* Completion percent fill */}
                            <div 
                              className="absolute left-0 top-0 bottom-0 bg-black/15 pointer-events-none transition-all"
                              style={{ width: `${task.progress}%` }}
                            />
                            
                            {/* Text overlay */}
                            <span className="relative text-[9px] font-mono font-bold text-white tracking-wide truncate">
                              {task.progress > 0 && `${task.progress}%`}
                            </span>
                          </div>

                          {/* Right resize anchor handle */}
                          <div 
                            className="resize-handle w-2.5 h-full cursor-col-resize hover:bg-black/20 rounded-r flex items-center justify-center shrink-0 transition-colors"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleGanttMouseDown(task.id, 'resize', e.clientX);
                            }}
                            title="Drag edge to change duration"
                          >
                            <span className="w-0.5 h-2.5 bg-white/70 block rounded-full pointer-events-none" />
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Predecessor Link SVG overlay layer */}
              <svg className="absolute inset-0 pointer-events-none ml-[240px]" style={{ height: `${tasks.length * rowHeight + 48}px`, width: '100%' }}>
                {tasks.map((task, taskIdx) => {
                  return task.predecessors.map((predId, pLinkIdx) => {
                    const predTask = tasks.find(t => t.id === predId);
                    if (!predTask) return null;
                    const predIdx = tasks.findIndex(t => t.id === predId);
                    if (predIdx === -1) return null;

                    // Calculate point locations
                    const startX = dateToPixels(predTask.startDate) + (predTask.duration * cellWidth);
                    const startY = 12 + (predIdx * rowHeight) + (rowHeight / 2);
                    
                    const endX = dateToPixels(task.startDate);
                    const endY = 12 + (taskIdx * rowHeight) + (rowHeight / 2);

                    // Render bezier or straight segmented routing path
                    const pathD = `M ${startX} ${startY} L ${startX + 10} ${startY} L ${startX + 10} ${endY} L ${endX} ${endY}`;

                    return (
                      <g key={`${task.id}-${predId}-${pLinkIdx}`}>
                        <path 
                          d={pathD} 
                          fill="none" 
                          stroke={showCriticalPath && criticalTaskIds.includes(task.id) && criticalTaskIds.includes(predId) ? '#EF4444' : '#CBD5E1'} 
                          strokeWidth={showCriticalPath && criticalTaskIds.includes(task.id) && criticalTaskIds.includes(predId) ? 2 : 1.25} 
                          strokeDasharray={showCriticalPath && criticalTaskIds.includes(task.id) && criticalTaskIds.includes(predId) ? 'none' : '3, 3'}
                        />
                        <polygon 
                          points={`${endX},${endY} ${endX-5},${endY-3.5} ${endX-5},${endY+3.5}`} 
                          fill={showCriticalPath && criticalTaskIds.includes(task.id) && criticalTaskIds.includes(predId) ? '#EF4444' : '#94A3B8'}
                        />
                      </g>
                    );
                  });
                })}
              </svg>

            </div>
          </div>

          {/* Quick instructions Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-sans">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Active Phase
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Environmental / Regulatory
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Critical Path Sequence
              </span>
            </div>
            <span>Double click task titles or select to adjust metadata properties in detail form.</span>
          </div>

        </div>

        {/* Task Properties & Link Details panel (Right 1 column) */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col justify-between">
          
          {/* Section 1: Task Selection Details form */}
          <div>
            <div className="pb-3 border-b border-slate-150 flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-indigo-500" /> Activity properties
              </h3>
              {selectedTaskId && (
                <button 
                  onClick={() => handleDeleteTask(selectedTaskId)}
                  className="text-[10px] text-red-600 font-mono font-bold flex items-center gap-1 hover:bg-red-50 px-1.5 py-0.5 rounded"
                  title="Remove task"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>

            {selectedTaskId ? (
              <form onSubmit={handleUpdateTask} className="mt-4 space-y-4">
                {/* Task Name */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                    WBS Task Label
                  </label>
                  <input
                    type="text"
                    required
                    value={taskName}
                    onChange={e => setTaskName(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 border border-slate-250 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Date and duration */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                      Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={taskStart}
                      onChange={e => setTaskStart(e.target.value)}
                      className="w-full text-xs p-1.5 border border-slate-250 bg-white rounded font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                      Duration (Days)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={taskDur}
                      onChange={e => setTaskDur(Number(e.target.value))}
                      className="w-full text-xs p-1.5 border border-slate-250 bg-white rounded font-mono"
                    />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-sans font-semibold text-slate-500 uppercase">
                    <span>Task Progress</span>
                    <span className="font-mono text-indigo-600">{taskProg}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={taskProg}
                    onChange={e => setTaskProg(Number(e.target.value))}
                    className="w-full h-1 bg-slate-150 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                {/* Assigned resource */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                    Assigned Bid Specialist
                  </label>
                  <select
                    value={taskOwner}
                    onChange={e => setTaskOwner(e.target.value)}
                    className="w-full text-xs p-1.5 border border-slate-250 bg-white rounded"
                  >
                    <option value="Tom Castellano">Tom Castellano (Bid Director)</option>
                    <option value="Mei Lin Zhao">Mei Lin Zhao (Civil Lead)</option>
                    <option value="Ada Whitlock">Ada Whitlock (RAMS Engineer)</option>
                    <option value="Henrik Solberg">Henrik Solberg (Commercial Mgr)</option>
                    <option value="Priya Raman">Priya Raman (Admin)</option>
                  </select>
                </div>

                {/* Predecessors checkboxes */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                    Predecessor Dependencies
                  </label>
                  <div className="max-h-[110px] overflow-y-auto border border-slate-200 rounded p-2 space-y-1 bg-slate-50/50">
                    {tasks.filter(t => t.id !== selectedTaskId).map(t => {
                      const isLinked = taskPred.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center gap-2 cursor-pointer text-[10px] font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTaskPred([...taskPred, t.id]);
                              } else {
                                setTaskPred(taskPred.filter(p => p !== t.id));
                              }
                            }}
                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                          />
                          <span className="truncate" title={t.name}>{t.name}</span>
                        </label>
                      );
                    })}
                    {tasks.length <= 1 && (
                      <div className="text-[10px] text-slate-400 italic">No other tasks to link</div>
                    )}
                  </div>
                </div>

                {/* Style Color selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 uppercase">
                    Aesthetic Legend Category
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {colorsList.map(clr => (
                      <button
                        key={clr.class}
                        type="button"
                        onClick={() => setTaskColor(clr.class)}
                        className={`w-full h-5 rounded transition-all border ${clr.class} ${
                          taskColor === clr.class 
                            ? 'ring-2 ring-indigo-500 border-white scale-105 shadow-2xs' 
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        title={clr.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Save changes button */}
                <button
                  type="submit"
                  className="w-full text-xs font-semibold py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded shadow-sm flex items-center justify-center gap-1.5 transition-colors mt-2"
                >
                  <Check className="w-3.5 h-3.5" /> Save WBS Properties
                </button>
              </form>
            ) : (
              <div className="mt-8 text-center py-10 space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs font-semibold text-slate-600">No Activity Selected</div>
                <p className="text-[10px] text-slate-400 max-w-[190px] mx-auto">
                  Click any Gantt task bar or title link to inspect and modify properties.
                </p>
              </div>
            )}
          </div>

          {/* Section 2: MS Project / Primavera compliance alert */}
          <div className="mt-6 pt-4 border-t border-slate-150 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h5 className="text-[10px] font-mono font-bold text-slate-700 uppercase flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" /> MS Project & P6 Standard Compliance
            </h5>
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">
              Predecessor linkages utilize formal Finish-to-Start (FS) constraints. XML outputs conform to the Microsoft XML schema for standard WBS hierarchy parsing.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
