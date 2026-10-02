const $ = id => document.getElementById(id);

const auth = firebase.auth();
const db = firebase.firestore();

let tx = [];
let kind = "income";
let hidden = false;
let period = "day";
let currentUser = null;

const LOCAL_KEY = "jma_tx_v1";

const money = n =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(n) || 0);

function dayStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inPeriod(ds, p) {
  const d = new Date(ds);
  const n = new Date();

  if (p === "day") return d >= dayStart(n);

  if (p === "week") {
    const s = dayStart(n);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    return d >= s;
  }

  return d >= new Date(n.getFullYear(), n.getMonth(), 1);
}

function totals(p = null) {
  const list = p ? tx.filter(t => inPeriod(t.date, p)) : tx;

  let income = 0;
  let expense = 0;

  list.forEach(t => {
    if (t.kind === "income") income += Number(t.amount);
    else expense += Number(t.amount);
  });

  return { income, expense, balance: income - expense };
}

function render() {
  const all = totals();

  $("incomeTotal").textContent = money(all.income);
  $("expenseTotal").textContent = money(all.expense);
  $("balanceTotal").textContent = hidden ? "••••" : money(all.balance);

  const summary = totals(period);

  $("summaryIncome").textContent = money(summary.income);
  $("summaryExpense").textContent = money(summary.expense);
  $("summaryBalance").textContent = money(summary.balance);

  $("summaryTitle").textContent =
    period === "day" ? "Today Summary" :
    period === "week" ? "This Week" :
    "This Month";

  const week = totals("week");
  const month = totals("month");

  $("weekIncome").textContent = money(week.income);
  $("weekExpense").textContent = money(week.expense);
  $("weekBalance").textContent = money(week.balance);

  $("monthIncome").textContent = money(month.income);
  $("monthExpense").textContent = money(month.expense);
  $("monthBalance").textContent = money(month.balance);

  renderHistory();
}

function userTransactions() {
  return db
    .collection("users")
    .doc(currentUser.uid)
    .collection("transactions");
}

async function loadCloudData() {
  if (!currentUser) return;

  try {
    const snapshot = await userTransactions()
      .orderBy("date", "desc")
      .get();

    tx = [];

    snapshot.forEach(doc => {
      tx.push({
        id: doc.id,
        ...doc.data()
      });
    });

    if (tx.length === 0) {
      const oldData = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");

      if (oldData.length > 0) {
        const batch = db.batch();

        oldData.forEach(item => {
          const id = item.id || crypto.randomUUID();
          const ref = userTransactions().doc(id);

          batch.set(ref, {
            kind: item.kind,
            amount: Number(item.amount),
            category: item.category || item.kind,
            note: item.note || "",
            date: item.date || new Date().toISOString()
          });
        });

        await batch.commit();
        localStorage.removeItem(LOCAL_KEY);

        return loadCloudData();
      }
    }

    render();
  } catch (error) {
    console.error(error);
    alert("Could not load cloud data.");
  }
}

async function addTransaction() {
  const amount = parseFloat($("amountInput").value);

  if (!amount || amount <= 0) {
    alert("Enter a valid amount");
    return;
  }

  if (!currentUser) return;

  try {
    await userTransactions().add({
      kind,
      amount,
      category: $("categoryInput").value.trim() || kind,
      note: $("noteInput").value.trim(),
      date: new Date().toISOString()
    });

    $("amountInput").value = "";
    $("categoryInput").value = "";
    $("noteInput").value = "";

    $("modal").classList.add("hidden");

    await loadCloudData();
  } catch (error) {
    console.error(error);
    alert("Could not save transaction.");
  }
}

async function deleteTransaction(id) {
  if (!currentUser) return;

  try {
    await userTransactions().doc(id).delete();
    await loadCloudData();
  } catch (error) {
    console.error(error);
  }
}

function renderHistory() {
  const historyList = $("historyList");

  historyList.innerHTML = "";

  if (!tx.length) {
    historyList.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  tx.forEach(t => {
    const row = document.createElement("div");

    row.className = "history-item";

    row.innerHTML = `
      <div>${t.kind === "income" ? "🟢" : "🔴"}</div>

      <div class="info">
        <b>${t.category}</b><br>
        <small>${new Date(t.date).toLocaleString()}</small>
      </div>

      <b style="color:${t.kind === "income" ? "#00ef55" : "#ff2424"}">
        ${t.kind === "income" ? "+" : "-"}${money(t.amount)}
      </b>

      <button data-id="${t.id}">🗑️</button>
    `;

    row.querySelector("button").onclick = () => deleteTransaction(t.id);

    historyList.appendChild(row);
  });
}

function openModal(type) {
  kind = type;

  $("modalTitle").textContent =
    type === "income" ? "Add Income" : "Add Expense";

  $("modal").classList.remove("hidden");
}

function view(name) {
  $("historyView").classList.add("hidden-view");
  $("settingsView").classList.add("hidden-view");

  if (name === "history") {
    $("historyView").classList.remove("hidden-view");
  }

  if (name === "settings") {
    $("settingsView").classList.remove("hidden-view");
  }
}

$("addIncome").onclick = () => openModal("income");
$("addExpense").onclick = () => openModal("expense");

$("modalClose").onclick = () => {
  $("modal").classList.add("hidden");
};

$("saveTransaction").onclick = addTransaction;

document.querySelectorAll(".period").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".period").forEach(x => {
      x.classList.remove("active");
    });

    button.classList.add("active");

    period = button.dataset.period;

    render();
  };
});

$("toggleBalance").onclick = () => {
  hidden = !hidden;
  render();
};

document.querySelectorAll(".nav-item").forEach(button => {
  button.onclick = () => view(button.dataset.nav);
});

$("closeHistory").onclick = () => view("home");
$("closeSettings").onclick = () => view("home");

$("menuBtn").onclick = () => view("settings");
$("profileBtn").onclick = () => view("settings");

$("exportData").onclick = () => {
  const blob = new Blob(
    [JSON.stringify(tx, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = "jma-finance-data.json";
  a.click();

  URL.revokeObjectURL(a.href);
};

$("resetData").onclick = async () => {
  if (!currentUser) return;

  if (!confirm("Delete all finance data?")) return;

  try {
    const snapshot = await userTransactions().get();

    const batch = db.batch();

    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    tx = [];

    render();
  } catch (error) {
    console.error(error);
    alert("Could not reset data.");
  }
};

$("loginBtn").onclick = async () => {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  $("authError").textContent = "";

  if (!email || !password) {
    $("authError").textContent = "Enter your email and password.";
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error(error);
    $("authError").textContent =
      "Login failed. Check your email and password.";
  }
};

$("createAccountBtn").onclick = async () => {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  $("authError").textContent = "";

  if (!email || !password) {
    $("authError").textContent =
      "Enter an email and password first.";
    return;
  }

  if (password.length < 6) {
    $("authError").textContent =
      "Password must be at least 6 characters.";
    return;
  }

  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (error) {
    console.error(error);

    if (error.code === "auth/email-already-in-use") {
      $("authError").textContent =
        "This email already has an account. Tap Login.";
    } else if (error.code === "auth/invalid-email") {
      $("authError").textContent =
        "Enter a valid email address.";
    } else {
      $("authError").textContent =
        error.message || "Could not create account.";
    }
  }
};

$("logoutBtn").onclick = async () => {
  await auth.signOut();
};

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;

    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");

    await loadCloudData();
  } else {
    currentUser = null;
    tx = [];

    $("app").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}
