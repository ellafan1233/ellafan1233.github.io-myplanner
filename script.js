// CONFIG — school year range (limits navigation)
const SCHOOL_START = new Date("2026-09-01");
const SCHOOL_END = new Date("2027-05-31");

// LocalStorage key (versioned)
const STORAGE_KEY = "assignmentTasks_v1";

// DOM
const calendarEl = document.getElementById("calendar");
const monthLabel = document.getElementById("monthLabel");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");
const openAddModalBtn = document.getElementById("openAddModal");
const modal = document.getElementById("modal");
const overlay = document.getElementById("overlay");
const closeModalBtn = document.getElementById("closeModal");
const cancelModalBtn = document.getElementById("cancelModal");
const taskForm = document.getElementById("taskForm");
const taskIdInput = document.getElementById("taskId");
const nameInput = document.getElementById("taskName");
const dateInput = document.getElementById("taskDate");
const deadlineInput = document.getElementById("taskDeadline");
const notesInput = document.getElementById("taskNotes");
const modalTitle = document.getElementById("modalTitle");
const searchInput = document.getElementById("searchInput");

// State
let tasks = loadTasks(); // object map id -> task
let viewDate = new Date(); // current month shown

// Utilities
function toDateId(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return copy.toISOString().split("T")[0];
}
function todayId() { return toDateId(new Date()); }
function clamp(v, a=0, b=100){ return Math.max(a, Math.min(b, v)); }
function generateId(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + Math.floor(Math.random()*1000000);
}

function loadTasks(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load tasks:", e);
    return {};
  }
}

function saveTasks(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// Carry unfinished past tasks to today (run once)
function carryOverPastTasksToToday(){
  const today = new Date();
  const tId = toDateId(today);
  let changed = false;

  Object.values(tasks).forEach(task => {
    if (!task.date) return;
    if (task.completed) return;
    const taskDate = new Date(task.date + "T00:00:00");
    // Only move tasks with date strictly before today
    if (taskDate < new Date(tId + "T00:00:00")) {
      task.date = tId;
      changed = true;
    }
  });

  if (changed) saveTasks();
}

// Task operations
function addTask({ id, name, date, deadline, notes }){
  const task = {
    id: id || generateId(),
    name: name || "Untitled",
    date: date || todayId(),
    deadline: deadline || "",
    notes: notes || "",
    completed: false,
    createdAt: new Date().toISOString()
  };
  tasks[task.id] = task;
  saveTasks();
  return task;
}

function updateTask(id, patch){
  if (!tasks[id]) return;
  tasks[id] = {...tasks[id], ...patch};
  saveTasks();
}

function deleteTask(id){
  delete tasks[id];
  saveTasks();
}

// Render
function renderCalendar(date = new Date(), filter = ""){
  calendarEl.innerHTML = "";

  const year = date.getFullYear();
  const month = date.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const daysInMonth = new Date(year, month+1, 0).getDate();

  // Header row: weekdays
  const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let wd of weekdays){
    const w = document.createElement("div");
    w.className = "weekday";
    w.textContent = wd;
    calendarEl.appendChild(w);
  }

  // Fill leading blanks
  for (let i=0;i<startDay;i++){
    const blank = document.createElement("div");
    blank.className = "day other-month";
    calendarEl.appendChild(blank);
  }

  // Per-day cells
  for (let d=1; d<=daysInMonth; d++){
    const current = new Date(year, month, d);
    const dateId = toDateId(current);
    const dayCard = document.createElement("div");
    dayCard.className = "day";
    if (current.getMonth() !== month) dayCard.classList.add("other-month");

    const isToday = dateId === todayId();

    dayCard.innerHTML = `
      <div class="date">
        <div>${d}${isToday ? " • Today" : ""}</div>
        <div style="font-size:12px;color:#486a80">${current.toDateString().slice(0,3)}</div>
      </div>
      <div class="tasks" data-date="${dateId}"></div>
      <div style="margin-top:6px;">
        <button class="small-btn primary add-inline" data-date="${dateId}">Add</button>
      </div>
    `;

    calendarEl.appendChild(dayCard);

    // Populate tasks for this date (apply search filter)
    const tasksDiv = dayCard.querySelector(".tasks");
    const dayTasks = Object.values(tasks).filter(t => (t.date || "") === dateId);

    const filtered = filter.trim() ? dayTasks.filter(t => {
      const q = filter.toLowerCase();
      return (t.name && t.name.toLowerCase().includes(q)) ||
             (t.notes && t.notes.toLowerCase().includes(q));
    }) : dayTasks;

    // sort: not completed first, then by deadline nearest
    filtered.sort((a,b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const da = a.deadline ? new Date(a.deadline+"T00:00:00").getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline+"T00:00:00").getTime() : Infinity;
      return da - db;
    });

    filtered.forEach(task => {
      const tEl = document.createElement("div");
      tEl.className = "task";
      if (task.completed) tEl.classList.add("completed");

      const msPerDay = 1000*60*60*24;
      let percent = 0;
      let dueText = task.deadline || "No deadline";

      if (task.deadline) {
        const dd = new Date(task.deadline + "T00:00:00");
        if (!isNaN(dd.getTime())) {
          const daysRemaining = Math.round((dd - new Date())/msPerDay);
          // When due today or past -> 100%, further away reduces percentage
          percent = clamp(Math.round((30 - daysRemaining)/30*100), 0, 100);
          dueText = task.deadline;
        } else {
          dueText = "Invalid date";
        }
      }

      tEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:600">${escapeHtml(task.name)}</div>
          <div style="font-size:12px;color:#486a80">${escapeHtml(dueText)}</div>
        </div>
        <div class="deadline-bar" aria-hidden="true">
          <div class="deadline-fill" style="width:${percent}%"></div>
        </div>
        <div class="meta" style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12px;color:#486a80">${task.notes ? escapeHtml(task.notes.slice(0,60)) : ""}</div>
          <div class="controls">
            <button class="small-btn done-btn" data-id="${task.id}">${task.completed ? "Completed" : "Done"}</button>
            <button class="small-btn edit-btn" data-id="${task.id}">Edit</button>
            <button class="small-btn delete-btn" data-id="${task.id}">Delete</button>
          </div>
        </div>
      `;
      tasksDiv.appendChild(tEl);
    });
  }

  // Update month label and disable nav if out of range
  monthLabel.textContent = date.toLocaleString(undefined, { month: "long", year: "numeric" });

  // Prev/next month constraints
  const firstOfThisView = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const prevMonthDate = new Date(firstOfThisView); prevMonthDate.setMonth(prevMonthDate.getMonth()-1);
  const nextMonthDate = new Date(firstOfThisView); nextMonthDate.setMonth(nextMonthDate.getMonth()+1);

  prevBtn.disabled = prevMonthDate < new Date(SCHOOL_START.getFullYear(), SCHOOL_START.getMonth(), 1);
  nextBtn.disabled = nextMonthDate > new Date(SCHOOL_END.getFullYear(), SCHOOL_END.getMonth(), 1);
}

// Escape helper
function escapeHtml(str){
  if (str === undefined || str === null) return "";
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'", "&#039;");
}

// Modal controls
function openModal(mode = "add", task = null, prefillDate = "") {
  modal.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
  modalTitle.textContent = mode === "add" ? "Add Task" : "Edit Task";
  if (mode === "add") {
    taskIdInput.value = "";
    nameInput.value = "";
    dateInput.value = prefillDate || todayId();
    deadlineInput.value = "";
    notesInput.value = "";
  } else if (task) {
    taskIdInput.value = task.id;
    nameInput.value = task.name || "";
    dateInput.value = task.date || todayId();
    deadlineInput.value = task.deadline || "";
    notesInput.value = task.notes || "";
  }
  nameInput.focus();
}

function closeModal(){
  modal.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
}

// Event listeners
prevBtn.addEventListener("click", () => {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar(viewDate, searchInput.value);
});

nextBtn.addEventListener("click", () => {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar(viewDate, searchInput.value);
});

openAddModalBtn.addEventListener("click", () => openModal("add", null, toDateId(viewDate)));
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", closeModal);

taskForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const id = taskIdInput.value;
  const payload = {
    name: nameInput.value.trim(),
    date: dateInput.value || todayId(),
    deadline: deadlineInput.value || "",
    notes: notesInput.value.trim()
  };
  if (id) {
    updateTask(id, payload);
  } else {
    addTask(payload);
  }
  closeModal();
  renderCalendar(viewDate, searchInput.value);
});

// Delegated clicks for inline add + task controls
calendarEl.addEventListener("click", (ev) => {
  const addBtn = ev.target.closest(".add-inline");
  if (addBtn) {
    const date = addBtn.dataset.date;
    openModal("add", null, date);
    return;
  }
  const doneBtn = ev.target.closest(".done-btn");
  if (doneBtn) {
    const id = doneBtn.dataset.id;
    if (!id || !tasks[id]) return;
    updateTask(id, { completed: true });
    renderCalendar(viewDate, searchInput.value);
    return;
  }
  const editBtn = ev.target.closest(".edit-btn");
  if (editBtn) {
    const id = editBtn.dataset.id;
    if (!id || !tasks[id]) return;
    openModal("edit", tasks[id], "");
    return;
  }
  const delBtn = ev.target.closest(".delete-btn");
  if (delBtn) {
    const id = delBtn.dataset.id;
    if (!id || !tasks[id]) return;
    if (confirm(`Delete "${tasks[id].name}"?`)) {
      deleteTask(id);
      renderCalendar(viewDate, searchInput.value);
    }
    return;
  }
});

// Search
searchInput.addEventListener("input", () => {
  renderCalendar(viewDate, searchInput.value);
});

// Keyboard escape to close modal
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeModal();
});

// Init
(function init(){
  // Keep viewDate within school range if desired
  if (viewDate < SCHOOL_START) viewDate = new Date(SCHOOL_START);
  if (viewDate > SCHOOL_END) viewDate = new Date(SCHOOL_END);

  // carry over unfinished past tasks to today (one-time)
  carryOverPastTasksToToday();

  renderCalendar(viewDate);
})();
