import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Load Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

// Initialize Supabase Client
let supabase: any = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
}

// Local Database File Path (Self-healing fallback)
const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to initialize local DB structure
function initLocalDB() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDB = {
      workouts: [],
      measurements: [],
      categories: [
        { id: "back", name: "Спина", icon: "🏔️", exercises: ["Подтягивания", "Тяга верхнего блока", "Тяга штанги в наклоне", "Гиперэкстензия"] },
        { id: "chest", name: "Грудь", icon: "🐃", exercises: ["Жим штанги лежа", "Жим гантелей под углом", "Отжимания", "Разведение гантелей"] },
        { id: "legs", name: "Ноги", icon: "🦿", exercises: ["Приседания со штангой", "Жим ногами", "Выпады", "Разгибание ног в тренажере"] },
        { id: "shoulders", name: "Плечи", icon: "🏛️", exercises: ["Армейский жим", "Махи гантелями в стороны", "Подъем гантелей перед собой"] },
        { id: "biceps", name: "Бицепс", icon: "💪", exercises: ["Подъем штанги на бицепс", "Молотковые сгибания", "Концентрированный подъем"] },
        { id: "triceps", name: "Трицепс", icon: "⚡", exercises: ["Жим лежа узким хватом", "Разгибание рук на блоке", "Французский жим"] }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf8");
  }
}

initLocalDB();

let memoryDB: any = null;

// Read/Write Local DB Helpers
function readLocalDB() {
  initLocalDB();
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    if (!data || data.trim() === "") {
      throw new Error("Empty database file");
    }
    const parsed = JSON.parse(data);
    memoryDB = parsed;
    return parsed;
  } catch (err) {
    console.error("Error reading local db, returning memory cache or default:", err);
    if (memoryDB) {
      return memoryDB;
    }
    const defaultDB = {
      workouts: [],
      measurements: [],
      categories: [
        { id: "back", name: "Спина", icon: "🏔️", exercises: ["Подтягивания", "Тяга верхнего блока", "Тяга штанги в наклоне", "Гиперэкстензия"] },
        { id: "chest", name: "Грудь", icon: "🐃", exercises: ["Жим штанги лежа", "Жим гантелей под углом", "Отжимания", "Разведение гантелей"] },
        { id: "legs", name: "Ноги", icon: "🦿", exercises: ["Приседания со штангой", "Жим ногами", "Выпады", "Разгибание ног в тренажере"] },
        { id: "shoulders", name: "Плечи", icon: "🏛️", exercises: ["Армейский жим", "Махи гантелями в стороны", "Подъем гантелей перед собой"] },
        { id: "biceps", name: "Бицепс", icon: "💪", exercises: ["Подъем штанги на бицепс", "Молотковые сгибания", "Концентрированный подъем"] },
        { id: "triceps", name: "Трицепс", icon: "⚡", exercises: ["Жим лежа узким хватом", "Разгибание рук на блоке", "Французский жим"] }
      ]
    };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf8");
    } catch (writeErr) {
      console.error("Failed to recover DB file:", writeErr);
    }
    return defaultDB;
  }
}

function writeLocalDB(data: any) {
  try {
    memoryDB = data;
    const tempFile = DB_FILE + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Error writing to local db:", err);
  }
}

// Telegram Notification Helper
async function sendTelegramNotification(userId: string | number, message: string) {
  if (!BOT_TOKEN || !userId || String(userId) === "1") return;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(userId),
        text: message,
        parse_mode: "HTML"
      })
    });
    if (!res.ok) {
      console.warn("Telegram API returned non-ok status:", res.status);
    }
  } catch (err) {
    console.error("Failed to send Telegram notification:", err);
  }
}

// API Routes

// 1. GET User Statistics
app.get("/api/user-stats/:userId", async (req, res) => {
  const userId = req.params.userId;
  const localDB = readLocalDB();

  // Filter workouts for the last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let workouts = [];
  if (supabase) {
    try {
      const parsedUserId = /^\d+$/.test(String(userId)) ? parseInt(String(userId)) : userId;
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", parsedUserId)
        .order("start_time", { ascending: false });

      if (error) throw error;
      const supWorkouts = (data || []).map((supW: any) => {
        const localW = localDB.workouts.find((lw: any) => String(lw.id) === String(supW.id));
        return {
          ...supW,
          exercises: supW.exercises || (localW ? localW.exercises : [])
        };
      });
      const supIds = new Set(supWorkouts.map((w: any) => String(w.id)));
      const localOnly = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId) && !supIds.has(String(w.id)));
      workouts = [...supWorkouts, ...localOnly];
    } catch (err) {
      console.warn("Supabase fetch stats failed, using local fallback", err);
      workouts = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId));
    }
  } else {
    workouts = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId));
  }

  // Activity list: array of ISO strings for the completed workouts in last 30 days
  const thirtyDaysWorkouts = workouts.filter((w: any) => {
    if (!w.end_time || w.status !== "finished") return false;
    const wDate = new Date(w.end_time);
    return wDate >= thirtyDaysAgo;
  });

  const activity = thirtyDaysWorkouts.map((w: any) => w.end_time || w.start_time);

  // Find last completed workout
  const completedWorkouts = workouts.filter((w: any) => w.status === "finished");
  let lastWorkout: any = null;
  if (completedWorkouts.length > 0) {
    const sorted = [...completedWorkouts].sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());
    const latest = sorted[0];

    // Compute total volume
    let volume = 0;
    if (latest.exercises && Array.isArray(latest.exercises)) {
      latest.exercises.forEach((ex: any) => {
        if (ex.sets && Array.isArray(ex.sets)) {
          ex.sets.forEach((s: any) => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps) || 0;
            volume += w * r;
          });
        }
      });
    }

    // Compute duration in minutes
    const start = new Date(latest.start_time).getTime();
    const end = new Date(latest.end_time).getTime();
    const duration = Math.round((end - start) / 60000) || 1;

    lastWorkout = {
      id: latest.id,
      name: latest.muscle_groups ? latest.muscle_groups.join(" + ") : "Тренировка",
      duration,
      volume,
      date: latest.end_time
    };
  }

  // Check if there is an active workout
  const activeWorkout = workouts.find((w: any) => w.status === "active") || null;

  res.json({
    activity,
    last_workout: lastWorkout,
    active_workout: activeWorkout,
    total_30_days: thirtyDaysWorkouts.length
  });
});

// 2. GET Categories
app.get("/api/categories", async (req, res) => {
  const localDB = readLocalDB();
  if (supabase) {
    try {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      if (data && data.length > 0) {
        const merged = data.map((supCat: any) => {
          const localCat = localDB.categories.find((lc: any) => String(lc.id) === String(supCat.id));
          return {
            ...supCat,
            exercises: supCat.exercises || (localCat ? localCat.exercises : [])
          };
        });
        return res.json(merged);
      }
    } catch (err) {
      console.warn("Supabase fetch categories failed, using local fallback", err);
    }
  }
  res.json(localDB.categories);
});

// 3. POST Add/Remove Exercise from Muscle Category
app.post("/api/categories/exercise", async (req, res) => {
  const { categoryId, exerciseName, action } = req.body; // action: 'add' | 'remove'
  const localDB = readLocalDB();
  let category: any = null;

  // 1. Try to find the category in Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("id", categoryId)
        .maybeSingle();
      if (!error && data) {
        category = data;
      }
    } catch (err) {
      console.warn("Failed to fetch category from Supabase, falling back to local:", err);
    }
  }

  // 2. Fall back to local DB if not found in Supabase
  if (!category) {
    category = localDB.categories.find((c: any) => String(c.id) === String(categoryId));
  }

  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  // 3. Extract and sanitize exercises array
  let exercises = Array.isArray(category.exercises) ? category.exercises : [];

  if (action === "add") {
    if (!exercises.includes(exerciseName)) {
      exercises.push(exerciseName);
    }
  } else if (action === "remove") {
    exercises = exercises.filter((ex: string) => ex !== exerciseName);
  }

  category.exercises = exercises;

  // 4. Update local DB
  const localIndex = localDB.categories.findIndex((c: any) => String(c.id) === String(category.id));
  if (localIndex >= 0) {
    localDB.categories[localIndex] = { ...localDB.categories[localIndex], exercises };
  } else {
    localDB.categories.push({ id: category.id, name: category.name, icon: category.icon, exercises });
  }
  writeLocalDB(localDB);

  // 5. Update Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from("categories")
        .upsert({ id: category.id, name: category.name, icon: category.icon, exercises });
      if (error) throw error;
    } catch (err: any) {
      console.warn("Supabase upsert category failed during exercise update, retrying without exercises column:", err);
      if (err?.message?.includes("exercises") || err?.code === "PGRST204") {
        try {
          await supabase
            .from("categories")
            .upsert({ id: category.id, name: category.name, icon: category.icon });
          console.log("Supabase upsert category retry (without exercises) succeeded!");
        } catch (retryErr) {
          console.error("Supabase upsert category retry failed:", retryErr);
        }
      }
    }
  }

  res.json(category);
});

// 3b. POST Create entire custom muscle category
app.post("/api/categories/create", async (req, res) => {
  const { name, icon } = req.body;
  if (!name || !icon) {
    return res.status(400).json({ error: "Name and icon are required" });
  }

  const localDB = readLocalDB();
  const newId = `cat_${Date.now()}`;
  const newCategory = {
    id: newId,
    name,
    icon,
    exercises: []
  };

  localDB.categories.push(newCategory);
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const { error } = await supabase
        .from("categories")
        .insert(newCategory);
      if (error) throw error;
    } catch (err: any) {
      console.warn("Supabase category insert failed, retrying without exercises column:", err);
      if (err?.message?.includes("exercises") || err?.code === "PGRST204") {
        try {
          await supabase
            .from("categories")
            .insert({ id: newCategory.id, name: newCategory.name, icon: newCategory.icon });
          console.log("Supabase category insert retry (without exercises) succeeded!");
        } catch (retryErr) {
          console.error("Supabase category insert retry failed:", retryErr);
        }
      }
    }
  }

  res.json(newCategory);
});

// 3c. POST Delete entire custom muscle category
app.post("/api/categories/delete", async (req, res) => {
  const { categoryId } = req.body;
  if (!categoryId) {
    return res.status(400).json({ error: "categoryId is required" });
  }

  const localDB = readLocalDB();
  localDB.categories = localDB.categories.filter((c: any) => String(c.id) !== String(categoryId));
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);
      if (error) throw error;
    } catch (err) {
      console.warn("Supabase category delete failed", err);
    }
  }

  res.json({ success: true });
});

// 4. POST Start Workout
app.post("/api/workouts/start/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { muscleGroups } = req.body; // array of strings (e.g. ["Грудь", "Трицепс"])

  const newWorkout = {
    id: String(Date.now()),
    user_id: userId,
    start_time: new Date().toISOString(),
    end_time: null,
    status: "active",
    muscle_groups: muscleGroups || [],
    exercises: [] // empty list of logged exercises
  };

  const localDB = readLocalDB();
  
  // Set all other active workouts for this user to cancelled/finished just in case
  localDB.workouts.forEach((w: any) => {
    if (String(w.user_id) === String(userId) && w.status === "active") {
      w.status = "cancelled";
      w.end_time = new Date().toISOString();
    }
  });

  localDB.workouts.push(newWorkout);
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const parsedUserId = /^\d+$/.test(String(userId)) ? parseInt(String(userId)) : userId;
      // First cancel existing active
      await supabase
        .from("workouts")
        .update({ status: "cancelled", end_time: new Date().toISOString() })
        .eq("user_id", parsedUserId)
        .eq("status", "active");

      const { data, error } = await supabase
        .from("workouts")
        .insert({
          id: newWorkout.id,
          user_id: parsedUserId,
          start_time: newWorkout.start_time,
          status: newWorkout.status,
          muscle_groups: newWorkout.muscle_groups,
          exercises: newWorkout.exercises
        });

      if (error) throw error;
    } catch (err: any) {
      console.warn("Supabase insert workout failed, retrying without exercises column:", err);
      try {
        const parsedUserId = /^\d+$/.test(String(userId)) ? parseInt(String(userId)) : userId;
        await supabase
          .from("workouts")
          .insert({
            id: newWorkout.id,
            user_id: parsedUserId,
            start_time: newWorkout.start_time,
            status: newWorkout.status,
            muscle_groups: newWorkout.muscle_groups
          });
        console.log("Supabase insert workout retry (without exercises) succeeded!");
      } catch (retryErr) {
        console.error("Supabase insert workout retry failed:", retryErr);
      }
    }
  }

  // Send Telegram Notification
  const muscles = muscleGroups && muscleGroups.length > 0 ? muscleGroups.join(", ") : "Тренировка";
  await sendTelegramNotification(userId, `🚀 <b>Тренировка началась!</b>\nГруппа мышц: <b>${muscles}</b>\nЖелаем продуктивной тренировки! 💪🔥`);

  res.json(newWorkout);
});

// 5. POST Save Active Workout State (autosave exercises list during active training)
app.post("/api/workouts/save/:workoutId", async (req, res) => {
  const workoutId = req.params.workoutId;
  const { exercises } = req.body; // array of exercises with sets

  const localDB = readLocalDB();
  const workout = localDB.workouts.find((w: any) => String(w.id) === String(workoutId));
  if (!workout) {
    return res.status(404).json({ error: "Workout not found" });
  }

  workout.exercises = exercises;
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const { error } = await supabase
        .from("workouts")
        .update({ exercises })
        .eq("id", workoutId);
      if (error) throw error;
    } catch (err) {
      console.warn("Supabase save exercises failed", err);
    }
  }

  res.json(workout);
});

// 6. POST Finish Workout
app.post("/api/workouts/finish/:workoutId", async (req, res) => {
  const workoutId = req.params.workoutId;
  const { exercises } = req.body; // final exercise array
  const endTime = new Date().toISOString();

  const localDB = readLocalDB();
  const workout = localDB.workouts.find((w: any) => String(w.id) === String(workoutId));
  if (!workout) {
    return res.status(404).json({ error: "Workout not found" });
  }

  workout.status = "finished";
  workout.end_time = endTime;
  if (exercises) {
    workout.exercises = exercises;
  }
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const { error } = await supabase
        .from("workouts")
        .update({
          status: "finished",
          end_time: endTime,
          exercises: workout.exercises
        })
        .eq("id", workoutId);
      if (error) throw error;
    } catch (err: any) {
      console.warn("Supabase finish workout failed, retrying without exercises column:", err);
      if (err?.message?.includes("exercises") || err?.code === "PGRST204") {
        try {
          await supabase
            .from("workouts")
            .update({
              status: "finished",
              end_time: endTime
            })
            .eq("id", workoutId);
          console.log("Supabase finish workout retry (without exercises) succeeded!");
        } catch (retryErr) {
          console.error("Supabase finish workout retry failed:", retryErr);
        }
      }
    }
  }

  // Compute stats for notification
  let totalSets = 0;
  let totalVolume = 0;
  if (workout.exercises) {
    workout.exercises.forEach((ex: any) => {
      if (ex.sets) {
        totalSets += ex.sets.length;
        ex.sets.forEach((s: any) => {
          totalVolume += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        });
      }
    });
  }

  const durationMin = Math.round((new Date(endTime).getTime() - new Date(workout.start_time).getTime()) / 60000) || 1;
  const muscles = workout.muscle_groups && workout.muscle_groups.length > 0 ? workout.muscle_groups.join(", ") : "Тренировка";

  await sendTelegramNotification(
    workout.user_id,
    `✅ <b>Тренировка завершена!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💪 Направление: <b>${muscles}</b>\n` +
    `⏱ Длительность: <b>${durationMin} мин</b>\n` +
    `🏋️ Общий объем: <b>${totalVolume} кг</b>\n` +
    `🔢 Подходов выполнено: <b>${totalSets}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Отличная работа! Продолжай в том же духе! 👑🏆`
  );

  res.json(workout);
});

// 7. GET Workouts List (History)
app.get("/api/workouts/:userId", async (req, res) => {
  const userId = req.params.userId;
  const localDB = readLocalDB();

  let workouts = [];
  if (supabase) {
    try {
      const parsedUserId = /^\d+$/.test(String(userId)) ? parseInt(String(userId)) : userId;
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", parsedUserId)
        .order("start_time", { ascending: false });

      if (error) throw error;
      const supWorkouts = (data || []).map((supW: any) => {
        const localW = localDB.workouts.find((lw: any) => String(lw.id) === String(supW.id));
        return {
          ...supW,
          exercises: supW.exercises || (localW ? localW.exercises : [])
        };
      });
      const supIds = new Set(supWorkouts.map((w: any) => String(w.id)));
      const localOnly = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId) && !supIds.has(String(w.id)));
      workouts = [...supWorkouts, ...localOnly];
    } catch (err) {
      console.warn("Supabase fetch workouts failed, using local", err);
      workouts = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId));
    }
  } else {
    workouts = localDB.workouts.filter((w: any) => String(w.user_id) === String(userId));
  }

  // Sort history: finished first, descending by start_time
  const history = workouts
    .filter((w: any) => w.status === "finished")
    .sort((a: any, b: any) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

  res.json(history);
});

// 8. GET Measurement Deltas and Statistics
app.get("/api/measurements/delta/:userId", async (req, res) => {
  const userId = req.params.userId;
  const localDB = readLocalDB();

  let measurements = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("measurements")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      measurements = (data || []).map((m: any) => ({
        id: String(m.id),
        user_id: String(m.user_id),
        type_name: m.type_name,
        value: m.value,
        date: m.date || m.measured_at
      }));
    } catch (err) {
      console.warn("Supabase fetch measurements failed, using local", err);
      measurements = localDB.measurements.filter((m: any) => String(m.user_id) === String(userId));
    }
  } else {
    measurements = localDB.measurements.filter((m: any) => String(m.user_id) === String(userId));
  }

  // Sort by date descending
  measurements.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Types to map
  const types = ["Вес", "Бицепс", "Талия", "Грудь"];
  const deltas: any = {};

  types.forEach((type) => {
    const records = measurements.filter((m: any) => m.type_name === type);
    if (records.length === 0) {
      deltas[type] = { current: 0, diff: 0, history: [] };
    } else if (records.length === 1) {
      deltas[type] = {
        current: records[0].value,
        diff: 0,
        history: records.map((r: any) => ({ id: r.id, value: r.value, date: r.date }))
      };
    } else {
      const current = records[0].value;
      const prev = records[1].value;
      const diff = parseFloat((current - prev).toFixed(2));
      deltas[type] = {
        current,
        diff,
        history: records.map((r: any) => ({ id: r.id, value: r.value, date: r.date }))
      };
    }
  });

  res.json(deltas);
});

// 9. POST Save New Measurement
app.post("/api/measurements", async (req, res) => {
  const { user_id, type_name, value } = req.body;

  const newRecord = {
    id: String(Date.now()),
    user_id: String(user_id),
    type_name,
    value: parseFloat(value),
    date: new Date().toISOString()
  };

  const localDB = readLocalDB();
  localDB.measurements.push(newRecord);
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const payload: any = {
        user_id: parseInt(user_id) || null,
        type_name,
        value: parseFloat(value),
        measured_at: newRecord.date
      };

      const { data, error } = await supabase
        .from("measurements")
        .insert(payload)
        .select();

      if (error) throw error;
      if (data && data[0]) {
        newRecord.id = String(data[0].id);
        const idx = localDB.measurements.findIndex((m: any) => m.id === String(Date.now()));
        if (idx !== -1) {
          localDB.measurements[idx].id = String(data[0].id);
          writeLocalDB(localDB);
        }
      }
    } catch (err) {
      console.warn("Supabase save measurement failed", err);
    }
  }

  res.json(newRecord);
});

// 10. DELETE Workout
app.delete("/api/workouts/:id", async (req, res) => {
  const workoutId = req.params.id;
  const localDB = readLocalDB();
  
  localDB.workouts = localDB.workouts.filter((w: any) => String(w.id) !== String(workoutId));
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", workoutId);
      if (error) throw error;
    } catch (err) {
      console.warn("Supabase delete workout failed", err);
    }
  }

  res.json({ success: true });
});

// 11. DELETE Measurement
app.delete("/api/measurements/:id", async (req, res) => {
  const measurementId = req.params.id;
  const localDB = readLocalDB();

  localDB.measurements = localDB.measurements.filter((m: any) => String(m.id) !== String(measurementId));
  writeLocalDB(localDB);

  if (supabase) {
    try {
      const isInt = /^\d+$/.test(measurementId);
      const query = supabase.from("measurements").delete();
      if (isInt) {
        query.eq("id", parseInt(measurementId));
      } else {
        query.eq("id", measurementId);
      }
      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.warn("Supabase delete measurement failed", err);
    }
  }

  res.json({ success: true });
});


// Serve static Vite files in production and start the listener
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist"));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
