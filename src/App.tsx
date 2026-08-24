import React, { useEffect, useState } from "react";
import axios from "axios";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import {
  Dumbbell,
  Activity,
  User,
  ChevronLeft,
  Plus,
  Minus,
  Play,
  Square,
  History as HistoryIcon,
  Scale,
  X,
  Check,
  Trash2,
  Calendar,
  Clock,
  Weight,
  TrendingUp,
  AlertTriangle,
  Info,
  Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface SetData {
  weight: number;
  reps: number;
  completed: boolean;
}

interface LoggedExercise {
  name: string;
  category: string;
  sets: SetData[];
}

interface Workout {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  muscle_groups: string[];
  exercises: LoggedExercise[];
}

interface MeasurementDelta {
  current: number;
  diff: number;
  history: { id?: string; value: number; date: string }[];
}

interface Deltas {
  [key: string]: MeasurementDelta;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  exercises: string[];
}

// Telegram WebApp Setup
const tg = (window as any).Telegram?.WebApp;
const USER_ID = tg?.initDataUnsafe?.user?.id || 1;
const USER_NAME = tg?.initDataUnsafe?.user?.first_name || "Атлет";

export default function App() {
  // Navigation & Primary State
  const [tab, setTab] = useState<"home" | "library" | "body" | "history">("home");
  const [loading, setLoading] = useState(true);

  // Stats & Core DB Data
  const [stats, setStats] = useState({
    activity: [] as string[],
    last_workout: null as any,
    active_workout: null as Workout | null,
    total_30_days: 0
  });
  const [deltas, setDeltas] = useState<Deltas>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);

  // Modals / Confirmation
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: "start" | "finish";
    onConfirm: () => void;
  }>({ show: false, type: "start", onConfirm: () => {} });

  // Workout Builder States (When a workout is actively running)
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);
  const [isSelectingMuscles, setIsSelectingMuscles] = useState(false);
  
  // Exercise logging sub-states inside Active Workout
  const [loggingExercise, setLoggingExercise] = useState<{
    name: string;
    category: string;
  } | null>(null);
  const [historyViewMode, setHistoryViewMode] = useState<"list" | "chart">("list");
  const [currentSets, setCurrentSets] = useState<SetData[]>([
    { weight: 60, reps: 10, completed: false }
  ]);
  const [tempWeight, setTempWeight] = useState(60);
  const [tempReps, setTempReps] = useState(10);

  // Category Tab sub-states (Independent of workout)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [newExerciseName, setNewExerciseName] = useState("");

  // Measurements Tab sub-states
  const [inputMeasurements, setInputMeasurements] = useState<{ [key: string]: string }>({
    "Вес": "",
    "Талия": "",
    "Бицепс": "",
    "Грудь": ""
  });
  const [measurementMessage, setMeasurementMessage] = useState("");

  // History Detail view
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

  // Deletion modals
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    show: boolean;
    type: "workout" | "measurement";
    id: string;
    label: string;
  }>({ show: false, type: "workout", id: "", label: "" });

  // Live timer
  const [workoutDuration, setWorkoutDuration] = useState<string>("00:00");

  // Category Edit states
  const [editCategoriesMode, setEditCategoriesMode] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>("");
  const [newCatIcon, setNewCatIcon] = useState<string>("💪");

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await axios.post("/api/categories/create", {
        name: newCatName.trim(),
        icon: newCatIcon.trim()
      });
      setNewCatName("");
      setNewCatIcon("💪");
      loadData();
    } catch (err) {
      console.error("Failed to create category:", err);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await axios.post("/api/categories/delete", { categoryId });
      loadData();
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  // Init & Load Data
  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#050505");
    }
    loadData();
  }, []);

  // Update live timer while workout is active
  useEffect(() => {
    if (!activeWorkout || !activeWorkout.start_time) {
      setWorkoutDuration("00:00");
      return;
    }

    const updateTimer = () => {
      const start = new Date(activeWorkout.start_time).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, now - start);

      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      const formatted = hrs > 0 
        ? `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      setWorkoutDuration(formatted);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Execute confirmation deletion
  const executeDelete = async () => {
    const { id, type } = deleteConfirmModal;
    try {
      if (type === "workout") {
        await axios.delete(`/api/workouts/${id}`);
      } else {
        await axios.delete(`/api/measurements/${id}`);
      }
      setDeleteConfirmModal(prev => ({ ...prev, show: false }));
      loadData();
    } catch (err) {
      console.error("Deletion failed:", err);
    }
  };

  // Remove a set during an active workout session
  const handleRemoveActiveSet = async (exIdx: number, setIdx: number) => {
    if (!activeWorkout) return;
    
    const updatedExercises = [...activeWorkout.exercises];
    const targetEx = { ...updatedExercises[exIdx] };
    
    targetEx.sets = targetEx.sets.filter((_, idx) => idx !== setIdx);
    
    if (targetEx.sets.length === 0) {
      updatedExercises.splice(exIdx, 1);
    } else {
      updatedExercises[exIdx] = targetEx;
    }
    
    const updatedWorkout = {
      ...activeWorkout,
      exercises: updatedExercises
    };
    
    setActiveWorkout(updatedWorkout);
    
    try {
      await axios.post(`/api/workouts/save/${activeWorkout.id}`, {
        exercises: updatedExercises
      });
    } catch (err) {
      console.error("Failed to auto-save workout set removal:", err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, deltasRes, catsRes, historyRes] = await Promise.all([
        axios.get(`/api/user-stats/${USER_ID}`),
        axios.get(`/api/measurements/delta/${USER_ID}`),
        axios.get(`/api/categories`),
        axios.get(`/api/workouts/${USER_ID}`)
      ]);

      setStats(statsRes.data);
      setDeltas(deltasRes.data);
      setCategories(catsRes.data);
      setWorkoutHistory(historyRes.data);

      if (statsRes.data.active_workout) {
        setActiveWorkout(statsRes.data.active_workout);
      } else {
        setActiveWorkout(null);
      }
    } catch (err) {
      console.error("Error loading application data from backend:", err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Confirm Dialog Handlers
  const triggerStartConfirmation = () => {
    setIsSelectingMuscles(true);
  };

  const handleConfirmStartWorkout = () => {
    if (selectedMuscleGroups.length === 0) {
      alert("Выберите хотя бы одну группу мышц!");
      return;
    }
    setIsSelectingMuscles(false);
    setConfirmModal({
      show: true,
      type: "start",
      onConfirm: async () => {
        try {
          const res = await axios.post(`/api/workouts/start/${USER_ID}`, {
            muscleGroups: selectedMuscleGroups
          });
          setActiveWorkout(res.data);
          setConfirmModal(prev => ({ ...prev, show: false }));
          setTab("library"); // Jump directly to categories to select exercises
          loadData();
        } catch (err) {
          console.error("Failed to start workout:", err);
        }
      }
    });
  };

  const triggerFinishConfirmation = () => {
    setConfirmModal({
      show: true,
      type: "finish",
      onConfirm: async () => {
        if (!activeWorkout) return;
        try {
          const res = await axios.post(`/api/workouts/finish/${activeWorkout.id}`, {
            exercises: activeWorkout.exercises
          });
          setActiveWorkout(null);
          setSelectedMuscleGroups([]);
          setConfirmModal(prev => ({ ...prev, show: false }));
          setTab("home");
          loadData();
        } catch (err) {
          console.error("Failed to finish workout:", err);
        }
      }
    });
  };

  // 2. Active Workout Logging Actions
  const handleSelectExerciseToLog = (exerciseName: string, categoryName: string) => {
    setLoggingExercise({ name: exerciseName, category: categoryName });
    // Look up if this exercise was already added in current workout to restore sets, else start fresh
    const existing = activeWorkout?.exercises?.find(e => e.name === exerciseName);
    if (existing) {
      setCurrentSets([...existing.sets]);
      if (existing.sets.length > 0) {
        setTempWeight(existing.sets[existing.sets.length - 1].weight);
        setTempReps(existing.sets[existing.sets.length - 1].reps);
      }
    } else {
      setCurrentSets([{ weight: tempWeight, reps: tempReps, completed: false }]);
    }
  };

  const getExerciseHistory = (exerciseName: string) => {
    const historyList: { date: string; sets: { weight: number; reps: number }[] }[] = [];
    if (!workoutHistory) return historyList;
    
    const sorted = [...workoutHistory].sort((a, b) => {
      const dateA = new Date(a.end_time || a.start_time).getTime();
      const dateB = new Date(b.end_time || b.start_time).getTime();
      return dateB - dateA;
    });

    for (const workout of sorted) {
      if (!workout.exercises) continue;
      const found = workout.exercises.find(e => e.name === exerciseName);
      if (found && found.sets && found.sets.length > 0) {
        historyList.push({
          date: new Date(workout.end_time || workout.start_time).toLocaleDateString("ru", {
            month: "short",
            day: "numeric"
          }),
          sets: found.sets
        });
      }
      if (historyList.length >= 3) break;
    }
    return historyList;
  };

  const handleAddSetToCurrent = () => {
    const lastSet = currentSets[currentSets.length - 1] || { weight: tempWeight, reps: tempReps };
    setCurrentSets([
      ...currentSets,
      { weight: lastSet.weight, reps: lastSet.reps, completed: false }
    ]);
  };

  const handleRemoveSetFromCurrent = (index: number) => {
    if (currentSets.length <= 1) return;
    setCurrentSets(currentSets.filter((_, i) => i !== index));
  };

  const handleUpdateSetField = (index: number, field: "weight" | "reps", value: number) => {
    const updated = [...currentSets];
    if (field === "weight") {
      updated[index].weight = Math.max(0, value);
    } else {
      updated[index].reps = Math.max(0, value);
    }
    setCurrentSets(updated);
  };

  const handleToggleSetCompleted = (index: number) => {
    const updated = [...currentSets];
    updated[index].completed = !updated[index].completed;
    setCurrentSets(updated);
  };

  const handleSaveExerciseToWorkout = async () => {
    if (!activeWorkout || !loggingExercise) return;

    const updatedExercises = activeWorkout.exercises ? [...activeWorkout.exercises] : [];
    const existingIndex = updatedExercises.findIndex(e => e.name === loggingExercise.name);

    if (existingIndex >= 0) {
      updatedExercises[existingIndex].sets = currentSets;
    } else {
      updatedExercises.push({
        name: loggingExercise.name,
        category: loggingExercise.category,
        sets: currentSets
      });
    }

    // Optimistic client update
    const updatedWorkout = { ...activeWorkout, exercises: updatedExercises };
    setActiveWorkout(updatedWorkout);
    setLoggingExercise(null);

    // Save state to backend
    try {
      await axios.post(`/api/workouts/save/${activeWorkout.id}`, {
        exercises: updatedExercises
      });
    } catch (err) {
      console.error("Failed to save exercise state to server:", err);
    }
  };

  // 3. Category Tab: Add/Remove Exercises (Always Active!)
  const handleAddExerciseToCategory = async () => {
    if (!selectedCategory || !newExerciseName.trim()) return;
    try {
      const res = await axios.post("/api/categories/exercise", {
        categoryId: selectedCategory.id,
        exerciseName: newExerciseName.trim(),
        action: "add"
      });
      // Update local categories list
      setCategories(categories.map(c => c.id === selectedCategory.id ? { ...c, exercises: res.data.exercises } : c));
      setSelectedCategory({ ...selectedCategory, exercises: res.data.exercises });
      setNewExerciseName("");
    } catch (err) {
      console.error("Failed to add exercise:", err);
    }
  };

  const handleRemoveExerciseFromCategory = async (exerciseName: string) => {
    if (!selectedCategory) return;
    try {
      const res = await axios.post("/api/categories/exercise", {
        categoryId: selectedCategory.id,
        exerciseName: exerciseName,
        action: "remove"
      });
      setCategories(categories.map(c => c.id === selectedCategory.id ? { ...c, exercises: res.data.exercises } : c));
      setSelectedCategory({ ...selectedCategory, exercises: res.data.exercises });
    } catch (err) {
      console.error("Failed to remove exercise:", err);
    }
  };

  // 4. Measurements Tab: Save and Delta Display
  const handleSaveMeasurements = async (e: React.FormEvent) => {
    e.preventDefault();
    setMeasurementMessage("");
    let savedCount = 0;

    try {
      for (const [key, value] of Object.entries(inputMeasurements)) {
        const valStr = String(value).trim();
        if (valStr) {
          await axios.post("/api/measurements", {
            user_id: USER_ID,
            type_name: key,
            value: parseFloat(valStr)
          });
          savedCount++;
        }
      }

      if (savedCount > 0) {
        setMeasurementMessage("✅ Замеры успешно сохранены!");
        setInputMeasurements({ "Вес": "", "Талия": "", "Бицепс": "", "Грудь": "" });
        loadData(); // reload stats to update delta
      } else {
        setMeasurementMessage("⚠️ Введите хотя бы одно значение!");
      }
    } catch (err) {
      console.error("Failed to save measurements:", err);
      setMeasurementMessage("❌ Ошибка сохранения. Попробуйте еще раз.");
    }
  };

  const toggleMuscleGroupSelection = (muscle: string) => {
    if (selectedMuscleGroups.includes(muscle)) {
      setSelectedMuscleGroups(selectedMuscleGroups.filter(m => m !== muscle));
    } else {
      setSelectedMuscleGroups([...selectedMuscleGroups, muscle]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-center items-center p-6">
        <Dumbbell className="w-12 h-12 text-green-500 animate-bounce mb-4" />
        <p className="text-gray-400 font-medium">Загрузка данных атлета...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-28 font-sans antialiased selection:bg-green-500 selection:text-black">
      
      {/* HEADER */}
      <header className="p-6 border-b border-[#141414] bg-[#080808]/90 backdrop-blur-md sticky top-0 z-40 flex justify-between items-center">
        <div>
          <p className="text-gray-500 text-xs tracking-wider uppercase">Привет, {USER_NAME}! 👋</p>
          <h1 className="text-lg font-bold text-white mt-0.5">
            {activeWorkout 
              ? `🔥 Активна: ${activeWorkout.muscle_groups.join(" + ")}` 
              : "Готов к новым рекордам?"}
          </h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#121212] border border-[#222] flex items-center justify-center text-green-500 shadow-inner">
          <User className="w-5 h-5" />
        </div>
      </header>

      {/* VIEWPORT CONTROLLER */}
      <main className="max-w-md mx-auto p-5">
        
        {/* TAB 1: HOME */}
        {tab === "home" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* 30-Day Activity Heatmap Widget */}
            <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 tracking-wider uppercase">Активность за 30 дней</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Всего тренировок за период: <span className="text-green-400 font-bold">{stats.total_30_days}</span>
                  </p>
                </div>
                <div className="bg-green-500/10 text-green-400 text-xs px-2.5 py-1 rounded-full border border-green-500/20 font-bold flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span>30 дней</span>
                </div>
              </div>

              {/* Grid representation */}
              <div className="grid grid-cols-10 gap-2 justify-between py-2">
                {Array.from({ length: 30 }).map((_, index) => {
                  const hasWorkout = index < stats.total_30_days;
                  return (
                    <div
                      key={index}
                      className={`aspect-square rounded-md transition-all duration-300 ${
                        hasWorkout 
                          ? "bg-gradient-to-br from-green-400 to-green-600 shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
                          : "bg-[#161616] border border-[#222]"
                      }`}
                      title={hasWorkout ? "Тренировка выполнена!" : "День отдыха"}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-500 mt-3 pt-2 border-t border-[#161616]">
                <span>← 30 дней назад</span>
                <span>Сегодня</span>
              </div>
            </div>

            {/* Last Workout Card */}
            {stats.last_workout ? (
              <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 shadow-lg flex justify-between items-center hover:bg-[#0f0f0f] transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Прошлая тренировка</span>
                  <p className="text-base font-bold text-white">{stats.last_workout.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-green-400" /> {stats.last_workout.duration} мин</span>
                    <span className="flex items-center gap-1"><Weight className="w-3.5 h-3.5 text-green-400" /> {stats.last_workout.volume} кг объем</span>
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#121212] border border-[#222] flex items-center justify-center text-green-500">
                  <HistoryIcon className="w-6 h-6" />
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 text-center text-gray-400 space-y-2">
                <Info className="w-8 h-8 mx-auto text-gray-500" />
                <p className="text-xs">У вас еще нет завершенных тренировок. Самое время начать первую!</p>
              </div>
            )}

            {/* Workout Toggle Control (Requirement 3: Replacing Button logically) */}
            <div className="pt-2">
              {activeWorkout ? (
                <div className="space-y-4">
                  {/* Banner indicating active workout */}
                  <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex justify-between items-center text-sm text-green-400">
                    <div className="flex items-center gap-2">
                      <span className="animate-ping w-2 h-2 rounded-full bg-green-500 block shrink-0" />
                      <span>Идет тренировка: {activeWorkout.muscle_groups.join(" + ")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs bg-black/40 px-2.5 py-1 rounded-lg border border-green-500/20">
                      <Clock className="w-3.5 h-3.5 text-green-400" />
                      <span>{workoutDuration}</span>
                    </div>
                  </div>

                  <button
                    onClick={triggerFinishConfirmation}
                    className="w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white py-4 px-6 rounded-2xl font-bold text-md shadow-[0_4px_15px_rgba(239,68,68,0.3)] transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Square className="w-5 h-5 fill-white" />
                    <span>ЗАВЕРШИТЬ ТРЕНИРОВКУ</span>
                  </button>

                  {/* Active logged sets list with scroll and delete */}
                  <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-4 space-y-3 shadow-lg mt-2">
                    <div className="flex justify-between items-center border-b border-[#141414] pb-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Записанные подходы
                      </h4>
                      <span className="text-[10px] text-gray-500 font-mono">
                        Всего подходов: {activeWorkout.exercises?.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0) || 0}
                      </span>
                    </div>

                    {!activeWorkout.exercises || activeWorkout.exercises.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-xs italic">
                        Вы еще не записали подходов. Логируйте упражнения во 2-й вкладке «Категории»!
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        {(activeWorkout.exercises || []).map((ex, exIdx) => (
                          <div key={exIdx} className="bg-[#121212] border border-[#1c1c1c] rounded-xl p-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs text-white">{ex.name}</span>
                              <span className="text-[9px] text-gray-500 uppercase">{ex.category}</span>
                            </div>
                            <div className="space-y-1.5">
                              {ex.sets.map((set, setIdx) => (
                                <div key={setIdx} className="flex justify-between items-center bg-[#181818] px-2.5 py-1.5 rounded border border-[#242424] text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500 font-mono text-[9px]">Подход {setIdx + 1}:</span>
                                    <span className="font-bold text-white">{set.weight} кг</span>
                                    <span className="text-gray-400">×</span>
                                    <span className="font-bold text-white">{set.reps}</span>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveActiveSet(exIdx, setIdx)}
                                    className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                    title="Удалить подход"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={triggerStartConfirmation}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-4 px-6 rounded-2xl font-bold text-md shadow-[0_4px_15px_rgba(34,197,94,0.3)] transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>НАЧАТЬ ТРЕНИРОВКУ</span>
                </button>
              )}
            </div>

            {/* Muscle Group Selector Modal/Slide (Activated on Start Training click) */}
            <AnimatePresence>
              {isSelectingMuscles && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end justify-center"
                >
                  <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    className="bg-[#0b0b0b] border-t border-[#1a1a1a] rounded-t-[28px] w-full max-w-md p-6 space-y-6 overflow-y-auto max-h-[85vh]"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-bold text-white">Новая тренировка</h3>
                        <p className="text-xs text-gray-400 mt-1">Выберите группы мышц на сегодня</p>
                      </div>
                      <button 
                        onClick={() => {
                          setIsSelectingMuscles(false);
                          setSelectedMuscleGroups([]);
                        }}
                        className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {categories.map((cat) => {
                        const isSelected = selectedMuscleGroups.includes(cat.name);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => toggleMuscleGroupSelection(cat.name)}
                            className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                              isSelected 
                                ? "bg-green-500/10 border-green-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.15)]" 
                                : "bg-[#111] border-[#222] text-gray-300 hover:border-gray-700"
                            }`}
                          >
                            <span className="text-2xl">{cat.icon}</span>
                            <span className="text-sm font-semibold">{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={handleConfirmStartWorkout}
                      disabled={selectedMuscleGroups.length === 0}
                      className="w-full bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed hover:bg-green-600 text-black py-4 rounded-xl font-bold transition-all mt-4"
                    >
                      Далее ({selectedMuscleGroups.length})
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* TAB 2: MUSCLE CATEGORIES / EXERCISES (Independent tab editor!) */}
        {tab === "library" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">База упражнений</h2>
                <p className="text-xs text-gray-400 mt-0.5">Добавляйте и настраивайте упражнения</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedCategory === null && (
                  <button
                    onClick={() => {
                      setEditCategoriesMode(!editCategoriesMode);
                    }}
                    className={`p-2.5 rounded-xl border transition-all ${
                      editCategoriesMode 
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400" 
                        : "bg-[#0b0b0b] border-[#141414] text-gray-400 hover:text-white"
                    }`}
                    title="Редактировать категории"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {activeWorkout && (
                  <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-2.5 py-1 rounded-full font-bold">
                    Тренировка активна
                  </div>
                )}
              </div>
            </div>
 
            {selectedCategory === null ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="relative bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-2 group transition-all"
                    >
                      {editCategoriesMode && (
                        <button
                          onClick={() => {
                            if (confirm(`Вы действительно хотите безвозвратно удалить категорию "${cat.name}" и все упражнения внутри неё?`)) {
                              handleDeleteCategory(cat.id);
                            }
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all z-10"
                          title="Удалить категорию"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        disabled={editCategoriesMode}
                        onClick={() => setSelectedCategory(cat)}
                        className="w-full flex flex-col items-center justify-center space-y-2 focus:outline-none active:scale-[0.97] disabled:opacity-75"
                      >
                        <span className="text-3xl filter drop-shadow-[0_2px_8px_rgba(255,255,255,0.05)] transition-transform group-hover:scale-110">
                          {cat.icon}
                        </span>
                        <span className="text-sm font-semibold text-white">{cat.name}</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider block pt-1">
                          {(cat.exercises || []).length} упр.
                        </span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Create Custom Category Form (Only visible in edit categories mode!) */}
                {editCategoriesMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-4 space-y-3 shadow-xl"
                  >
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-[#141414] pb-2 text-left">
                      🆕 Добавить новую категорию
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Эмодзи (🦾)"
                        value={newCatIcon}
                        onChange={(e) => setNewCatIcon(e.target.value)}
                        className="bg-[#121212] border border-[#222] rounded-xl px-2 py-2.5 text-sm text-center w-1/4 text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-gray-600"
                      />
                      <input
                        type="text"
                        placeholder="Название (напр. Пресс)..."
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="bg-[#121212] border border-[#222] rounded-xl px-3 py-2.5 text-sm flex-1 text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-gray-600"
                      />
                      <button
                        onClick={handleCreateCategory}
                        className="bg-amber-500 hover:bg-amber-600 text-black px-4 rounded-xl font-bold flex items-center justify-center transition-all"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 space-y-6">
                {/* Back button header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#141414]">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Все группы</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selectedCategory.icon}</span>
                    <span className="font-bold text-sm">{selectedCategory.name}</span>
                  </div>
                </div>

                {/* Exercises list */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {!selectedCategory.exercises || selectedCategory.exercises.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-6">В этой категории еще нет упражнений</p>
                  ) : (
                    (selectedCategory.exercises || []).map((ex, index) => {
                      const isLogged = activeWorkout?.exercises?.some(e => e.name === ex) || false;
                      return (
                        <div
                          key={index}
                          className="bg-[#121212] border border-[#1c1c1c] p-3 rounded-xl flex items-center justify-between"
                        >
                          <span className="text-sm text-gray-200 font-medium">{ex}</span>
                          <div className="flex items-center gap-2">
                            {/* If workout is running, we show a button to Log Sets */}
                            {activeWorkout && (
                              <button
                                onClick={() => handleSelectExerciseToLog(ex, selectedCategory.name)}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                                  isLogged 
                                    ? "bg-green-500 text-black shadow-[0_2px_8px_rgba(34,197,94,0.2)]" 
                                    : "bg-[#1a1a1a] text-gray-300 hover:bg-[#222]"
                                }`}
                              >
                                {isLogged ? "Записано" : "+ Записать"}
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveExerciseFromCategory(ex)}
                              className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg transition-all"
                              title="Удалить упражнение"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add new exercise form (Always active!) */}
                <div className="pt-4 border-t border-[#141414] space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Новое упражнение</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Название упражнения..."
                      value={newExerciseName}
                      onChange={(e) => setNewExerciseName(e.target.value)}
                      className="bg-[#121212] border border-[#222] rounded-xl px-3 py-2.5 text-sm w-full text-white focus:outline-none focus:border-green-500 transition-all placeholder:text-gray-600"
                    />
                    <button
                      onClick={handleAddExerciseToCategory}
                      className="bg-green-500 text-black px-4 rounded-xl font-bold flex items-center justify-center hover:bg-green-600 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVE EXERCISE SETS LOGGING MODAL/CARD OVERLAY */}
            <AnimatePresence>
              {loggingExercise && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 15 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 15 }}
                    className="bg-[#0b0b0b] border border-[#1c1c1c] rounded-2xl w-full max-w-sm p-5 space-y-5 shadow-2xl"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          {loggingExercise.category}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1.5">{loggingExercise.name}</h3>
                      </div>
                      <button
                        onClick={() => setLoggingExercise(null)}
                        className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Previous Performances History block */}
                    {(() => {
                      const hist = getExerciseHistory(loggingExercise.name);
                      if (hist.length === 0) {
                        return (
                          <div className="bg-[#121212]/50 border border-[#1c1c1c] rounded-xl p-3 text-center text-[11px] text-gray-500 italic">
                            🏆 Первое выполнение этого упражнения! Начните историю рекордов.
                          </div>
                        );
                      }
                      const chartData = hist.map(h => {
                        const maxWeight = Math.max(...h.sets.map(s => s.weight));
                        return {
                          date: h.date,
                          "Макс. вес (кг)": maxWeight
                        };
                      }).reverse();

                      return (
                        <div className="bg-[#121212] border border-[#1c1c1c] rounded-xl p-3 space-y-2 shadow-inner">
                          <div className="flex justify-between items-center pb-1 border-b border-[#1c1c1c]">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-green-500" />
                              История прогресса:
                            </span>
                            <div className="flex bg-black/40 border border-[#1c1c1c] rounded-lg p-0.5">
                              <button
                                onClick={() => setHistoryViewMode("list")}
                                className={`text-[9px] px-2 py-0.5 rounded-md font-medium transition-all ${
                                  historyViewMode === "list" 
                                    ? "bg-green-500 text-black font-semibold" 
                                    : "text-gray-400 hover:text-white"
                                }`}
                              >
                                Список
                              </button>
                              <button
                                onClick={() => setHistoryViewMode("chart")}
                                className={`text-[9px] px-2 py-0.5 rounded-md font-medium transition-all ${
                                  historyViewMode === "chart" 
                                    ? "bg-green-500 text-black font-semibold" 
                                    : "text-gray-400 hover:text-white"
                                }`}
                              >
                                График
                              </button>
                            </div>
                          </div>

                          {historyViewMode === "list" ? (
                            <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
                              {hist.map((h, hIdx) => (
                                <div key={hIdx} className="flex justify-between items-center text-[11px]">
                                  <span className="text-gray-500 font-medium">{h.date}:</span>
                                  <div className="flex flex-wrap gap-1 justify-end max-w-[70%]">
                                    {h.sets.map((s, sIdx) => (
                                      <span key={sIdx} className="bg-black/30 border border-[#242424] px-1.5 py-0.5 rounded text-[10px] text-gray-300 font-mono whitespace-nowrap">
                                        {s.weight}×{s.reps}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-[85px] w-full pt-1.5">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                                  <XAxis 
                                    dataKey="date" 
                                    tick={{ fill: '#6b7280', fontSize: 8 }} 
                                    axisLine={false} 
                                    tickLine={false} 
                                  />
                                  <YAxis 
                                    tick={{ fill: '#6b7280', fontSize: 8 }} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    domain={['auto', 'auto']}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: '#0a0a0a', 
                                      borderColor: '#1c1c1c', 
                                      borderRadius: '8px',
                                      fontSize: '9px',
                                      color: '#fff'
                                    }}
                                    labelStyle={{ color: '#9ca3af', fontWeight: 'bold' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="Макс. вес (кг)" 
                                    stroke="#10b981" 
                                    strokeWidth={1.5} 
                                    dot={{ fill: '#10b981', r: 3.5, strokeWidth: 0 }} 
                                    activeDot={{ r: 5 }} 
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Logging Rows */}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {currentSets.map((set, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                            set.completed 
                              ? "bg-green-500/5 border-green-500/20" 
                              : "bg-[#121212] border-[#1c1c1c]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#2c2c2c] flex items-center justify-center text-xs font-bold text-gray-400">
                              {i + 1}
                            </span>
                          </div>

                          {/* Weight adjustment */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={set.weight}
                              onChange={(e) => handleUpdateSetField(i, "weight", parseFloat(e.target.value) || 0)}
                              className="bg-[#1a1a1a] border border-[#2c2c2c] w-14 text-center py-1.5 rounded-lg text-sm text-white focus:outline-none focus:border-green-500"
                            />
                            <span className="text-xs text-gray-500">кг</span>
                          </div>

                          {/* Reps adjustment */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={set.reps}
                              onChange={(e) => handleUpdateSetField(i, "reps", parseInt(e.target.value) || 0)}
                              className="bg-[#1a1a1a] border border-[#2c2c2c] w-12 text-center py-1.5 rounded-lg text-sm text-white focus:outline-none focus:border-green-500"
                            />
                            <span className="text-xs text-gray-500">повт</span>
                          </div>

                          {/* Complete set Checkbox */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleSetCompleted(i)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                set.completed 
                                  ? "bg-green-500 text-black shadow-[0_0_8px_rgba(34,197,94,0.3)]" 
                                  : "bg-[#222] text-gray-500 border border-[#2c2c2c]"
                              }`}
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </button>
                            <button
                              onClick={() => handleRemoveSetFromCurrent(i)}
                              className="text-gray-600 hover:text-red-400 p-1"
                              disabled={currentSets.length <= 1}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddSetToCurrent}
                        className="flex-1 border border-dashed border-[#2c2c2c] hover:border-gray-500 text-gray-400 text-xs py-2.5 rounded-xl transition-all"
                      >
                        + Новый подход
                      </button>
                    </div>

                    <button
                      onClick={handleSaveExerciseToWorkout}
                      className="w-full bg-green-500 text-black py-3 rounded-xl font-bold hover:bg-green-600 transition-all"
                    >
                      Сохранить упражнение
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* TAB 3: BODY MEASUREMENTS (Fully polished with detailed history and delta analysis) */}
        {tab === "body" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-lg font-bold">Личные замеры</h2>
              <p className="text-xs text-gray-400 mt-0.5">Отслеживайте прогресс тела во времени</p>
            </div>

            {/* Metrics cards showcasing deltas dynamically (Requirement 4) */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Вес (кг)", key: "Вес", emoji: "⚖️" },
                { label: "Бицепс (см)", key: "Бицепс", emoji: "💪" },
                { label: "Талия (см)", key: "Талия", emoji: "📏" },
                { label: "Грудь (см)", key: "Грудь", emoji: "🛡️" }
              ].map((item) => {
                const delta = deltas[item.key];
                const hasValue = delta && delta.current > 0;
                const change = delta?.diff || 0;

                return (
                  <div key={item.key} className="bg-[#0b0b0b] border border-[#141414] p-4 rounded-2xl space-y-2 relative overflow-hidden">
                    <span className="absolute top-2 right-2 text-sm">{item.emoji}</span>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{item.label}</p>
                    <p className="text-2xl font-black text-white">
                      {hasValue ? `${delta.current}` : "--"}
                    </p>
                    
                    <div className="flex items-center gap-1.5">
                      {hasValue && change !== 0 ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                          change > 0 
                            ? (item.key === "Талия" ? "bg-amber-500/10 text-amber-500" : "bg-green-500/10 text-green-400") 
                            : (item.key === "Талия" ? "bg-green-500/10 text-green-400" : "bg-rose-500/10 text-rose-400")
                        }`}>
                          <TrendingUp className="w-3 h-3" />
                          {change > 0 ? `+${change}` : change}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600">Без изменений</span>
                      )}
                    </div>

                    {/* Sparkline simulation (Visual History Bars) */}
                    {hasValue && delta.history && delta.history.length > 0 && (
                      <div className="flex gap-0.5 items-end h-6 pt-2">
                        {[...delta.history].reverse().slice(-6).map((h, i) => {
                          const maxVal = Math.max(...delta.history.map(x => x.value)) || 1;
                          const percent = Math.max(10, Math.round((h.value / maxVal) * 100));
                          return (
                            <div
                              key={i}
                              style={{ height: `${percent}%` }}
                              className="bg-green-500/20 hover:bg-green-500/50 rounded-sm w-full transition-all"
                              title={`${h.value} (${new Date(h.date).toLocaleDateString("ru")})`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Measurement Log Entry Form */}
            <form onSubmit={handleSaveMeasurements} className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-green-500" />
                <span>Записать новые замеры</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {[
                  { label: "Вес (кг)", key: "Вес", placeholder: "например, 82.5" },
                  { label: "Талия (см)", key: "Талия", placeholder: "например, 88" },
                  { label: "Бицепс (см)", key: "Бицепс", placeholder: "например, 40.5" },
                  { label: "Грудь (см)", key: "Грудь", placeholder: "например, 110" }
                ].map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400">{field.label}</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={field.placeholder}
                      value={inputMeasurements[field.key]}
                      onChange={(e) => setInputMeasurements({ ...inputMeasurements, [field.key]: e.target.value })}
                      className="bg-[#121212] border border-[#222] rounded-xl px-3 py-2.5 text-sm w-full text-white focus:outline-none focus:border-green-500 transition-all placeholder:text-gray-700"
                    />
                  </div>
                ))}
              </div>

              {measurementMessage && (
                <p className="text-xs font-semibold text-center text-green-400 py-1 transition-all">
                  {measurementMessage}
                </p>
              )}

              <button
                type="submit"
                className="w-full bg-green-500 hover:bg-green-600 text-black py-3 rounded-xl font-bold transition-all text-sm mt-2"
              >
                Сохранить все замеры
              </button>
            </form>

            {/* Detailed Measurements Timeline */}
            <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">История изменений за последнее время</h3>
              <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                {Object.keys(deltas).length === 0 || !Object.values(deltas).some(v => {
                  const item = v as MeasurementDelta;
                  return item && item.history && item.history.length > 0;
                }) ? (
                  <p className="text-xs text-gray-500 text-center py-6">Здесь будут отображаться даты ваших изменений</p>
                ) : (
                  // Compile a chronological flat array of all measurement logs
                  (() => {
                    const logs: { id?: string; key: string; value: number; date: string }[] = [];
                    Object.entries(deltas).forEach(([key, d]) => {
                      const delta = d as MeasurementDelta;
                      if (delta && delta.history) {
                        delta.history.forEach((h) => {
                          logs.push({ id: h.id, key, value: h.value, date: h.date });
                        });
                      }
                    });
                    // Sort descending
                    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    return logs.slice(0, 12).map((log, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-[#121212] p-2.5 rounded-lg border border-[#1c1c1c]">
                        <span className="font-semibold text-gray-300">{log.key}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-bold">{log.value} {log.key === "Вес" ? "кг" : "см"}</span>
                          <span className="text-[10px] text-gray-500">
                            {new Date(log.date).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                          </span>
                          <button
                            onClick={() => {
                              setDeleteConfirmModal({
                                show: true,
                                type: "measurement",
                                id: log.id || "",
                                label: `замер "${log.key}: ${log.value}" от ${new Date(log.date).toLocaleDateString("ru", { month: "long", day: "numeric" })}`
                              });
                            }}
                            className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                            title="Удалить замер"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 4: WORKOUTS HISTORY DIARY (Requirement 6) */}
        {tab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-lg font-bold">Дневник тренировок</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ваша история по датам и упражнениям</p>
            </div>

            {workoutHistory.length === 0 ? (
              <div className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-8 text-center text-gray-500 space-y-2">
                <Calendar className="w-8 h-8 mx-auto text-gray-600 animate-pulse" />
                <p className="text-xs">Вы еще не завершили ни одной тренировки.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {workoutHistory.map((workout) => {
                  const isExpanded = expandedWorkoutId === workout.id;
                  const dateString = new Date(workout.end_time || workout.start_time).toLocaleDateString("ru", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  });
                  const duration = workout.end_time 
                    ? Math.round((new Date(workout.end_time).getTime() - new Date(workout.start_time).getTime()) / 60000)
                    : 0;

                  return (
                    <div
                      key={workout.id}
                      className="bg-[#0b0b0b] border border-[#141414] rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:bg-[#0f0f0f]"
                      onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
                    >
                      {/* Workout Meta summary card */}
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-xs text-green-400 font-bold uppercase tracking-wider">
                            {workout.muscle_groups.join(" + ")}
                          </p>
                          <p className="text-[11px] text-gray-500">{dateString}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-[#1a1a1a] text-gray-400 px-2 py-1 rounded-md border border-[#222]">
                            ⏱ {duration} мин
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmModal({
                                show: true,
                                type: "workout",
                                id: workout.id,
                                label: `тренировку от ${dateString} (${workout.muscle_groups.join(" + ")})`
                              });
                            }}
                            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all border border-transparent"
                            title="Удалить тренировку"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Dropdown details of logged exercises inside this specific workout */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-3 border-t border-[#141414] space-y-3 overflow-hidden text-xs"
                        >
                          {workout.exercises && workout.exercises.length > 0 ? (
                            workout.exercises.map((ex, exIdx) => (
                              <div key={exIdx} className="bg-[#121212] p-3 rounded-xl space-y-1.5 border border-[#1c1c1c]">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-white text-xs">{ex.name}</span>
                                  <span className="text-[10px] text-gray-500 uppercase">{ex.category}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center text-gray-400 text-[10px]">
                                  {ex.sets.map((set, setIdx) => (
                                    <div key={setIdx} className="bg-[#181818] py-1 px-2 rounded border border-[#242424]">
                                      <span className="text-gray-500 mr-1">{setIdx + 1}п:</span>
                                      <span className="font-semibold text-white">{set.weight}кг</span> × <span className="font-semibold text-white">{set.reps}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-[10px] text-gray-500 italic text-center py-2">Записи подходов отсутствуют</p>
                          )}
                        </motion.div>
                      )}

                      {!isExpanded && (
                        <p className="text-[10px] text-gray-500 text-right">Посмотреть детали упражнений ↓</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

      </main>

      {/* CONFIRMATION POPUP MODAL (Requirement 7) */}
      <AnimatePresence>
        {confirmModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0b0b0b] border border-[#1c1c1c] rounded-2xl w-full max-w-sm p-6 space-y-6 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">
                  {confirmModal.type === "start" ? "Начать тренировку?" : "Завершить тренировку?"}
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed px-2">
                  {confirmModal.type === "start" 
                    ? "Вы собираетесь запустить новую тренировочную сессию. Все предыдущие активные сессии будут автоматически сохранены."
                    : "Вы уверены, что хотите закончить тренировку? Все ваши подходы и упражнения будут окончательно сохранены в дневник тренировок."}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 bg-[#1a1a1a] border border-[#2c2c2c] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#222] transition-all"
                >
                  {confirmModal.type === "start" ? "Отмена" : "Продолжить"}
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-black py-3 rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(34,197,94,0.25)] transition-all"
                >
                  {confirmModal.type === "start" ? "Да, начать" : "Да, завершить"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION POPUP MODAL */}
      <AnimatePresence>
        {deleteConfirmModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0b0b0b] border border-[#1c1c1c] rounded-2xl w-full max-w-sm p-6 space-y-6 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto animate-pulse">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">
                  Удалить {deleteConfirmModal.type === "workout" ? "тренировку" : "замер"}?
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed px-2">
                  Вы действительно хотите окончательно удалить {deleteConfirmModal.label}? Это действие нельзя отменить.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 bg-[#1a1a1a] border border-[#2c2c2c] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#222] transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(239,68,68,0.25)] transition-all"
                >
                  Да, удалить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER TAB NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#080808]/90 backdrop-blur-md border-t border-[#141414] p-3 flex justify-around items-center z-40 rounded-t-2xl shadow-xl">
        <button 
          onClick={() => { setTab("home"); setSelectedCategory(null); }} 
          className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${tab === "home" ? "text-green-500 font-bold" : "text-gray-500 hover:text-gray-300"}`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px]">Главная</span>
        </button>

        <button 
          onClick={() => { setTab("library"); setSelectedCategory(null); }} 
          className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${tab === "library" ? "text-green-500 font-bold" : "text-gray-500 hover:text-gray-300"}`}
        >
          <Dumbbell className="w-5 h-5" />
          <span className="text-[10px]">Категории</span>
        </button>

        <button 
          onClick={() => { setTab("body"); setSelectedCategory(null); }} 
          className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${tab === "body" ? "text-green-500 font-bold" : "text-gray-500 hover:text-gray-300"}`}
        >
          <Scale className="w-5 h-5" />
          <span className="text-[10px]">Замеры</span>
        </button>

        <button 
          onClick={() => { setTab("history"); setSelectedCategory(null); }} 
          className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${tab === "history" ? "text-green-500 font-bold" : "text-gray-500 hover:text-gray-300"}`}
        >
          <HistoryIcon className="w-5 h-5" />
          <span className="text-[10px]">История</span>
        </button>
      </nav>

    </div>
  );
}
