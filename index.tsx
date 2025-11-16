import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { auth, db } from "./firebase";
import Auth from "./Auth";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

/* ---------------- TYPES (unchanged) ---------------- */

interface Resident {
  id: string;
  unitNumber: string;
  ownerName: string;
  previousDue: number;
  payments: { [monthIndex: number]: number };
  email: string;
  password: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
}

interface MaintenanceSettings {
  flatMonthlyFee: number;
  shopMonthlyFee: number;
}

type CurrentUser =
  | { role: "admin" }
  | { role: "resident"; resident: Resident }
  | null;

/* ---------------- INITIAL RESIDENTS (unchanged) ---------------- */

const generateInitialResidents = (): Resident[] => {
  const residents: Resident[] = [];
  for (let floor = 1; floor <= 4; floor++) {
    for (let flat = 1; flat <= 3; flat++) {
      const unitNumber = `${floor}0${flat}`;
      residents.push({
        id: `flat-${unitNumber}`,
        unitNumber: `Flat ${unitNumber}`,
        ownerName: "",
        previousDue: 0,
        payments: {},
        email: `flat${unitNumber}@email.com`,
        password: "password",
      });
    }
  }
  for (let i = 1; i <= 6; i++) {
    residents.push({
      id: `shop-S${i}`,
      unitNumber: `Shop S${i}`,
      ownerName: "",
      previousDue: 0,
      payments: {},
      email: `shop${i}@email.com`,
      password: "password",
    });
  }
  return residents;
};

/* ---------------- LOCALSTORAGE HOOK (kept for fallback & initial state) ---------------- */

const usePersistentState = <T,>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
};

/* ---------------- HELPER (unchanged) ---------------- */

const getResidentCalculations = (
  resident: Resident,
  settings: MaintenanceSettings
) => {
  const isFlat = resident.id.startsWith("flat");
  const decidedMaintenance = isFlat
    ? settings.flatMonthlyFee
    : settings.shopMonthlyFee;

  const totalPaid = Object.values(resident.payments).reduce(
    (sum, amount) => sum + (amount || 0),
    0
  );

  const currentMonthIndex = new Date().getMonth();
  let currentYearDue = 0;
  for (let i = 0; i <= currentMonthIndex; i++) {
    const paid = resident.payments[i] || 0;
    if (paid < decidedMaintenance) {
      currentYearDue += decidedMaintenance - paid;
    }
  }

  const totalDue = resident.previousDue + currentYearDue;

  return { decidedMaintenance, totalPaid, totalDue };
};

/* ---------------- LOGIN PAGE (UI unchanged) ---------------- */

const LoginPage = ({ onLogin }: { onLogin: (e: string, p: string) => Promise<void> | void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err?.message || "Invalid credentials");
    }
  };

  return (
    <div className="login-page">
      <h1>Shree Ganesh Divine</h1>
      <form onSubmit={handleSubmit}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
};

/* ---------------- RESIDENT CARD (unchanged) ---------------- */

interface ResidentCardProps {
  resident: Resident;
  settings: MaintenanceSettings;
  editable: boolean;
  onChange: (r: Resident) => void;
}

const ResidentCard: React.FC<ResidentCardProps> = ({
  resident,
  settings,
  editable,
  onChange,
}) => {
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const { totalPaid, totalDue } = getResidentCalculations(resident, settings);

  const handlePaymentChange = (index: number, value: number) => {
    onChange({
      ...resident,
      payments: { ...resident.payments, [index]: value },
    });
  };

  const resetCredentials = () => {
    const newPass = "password";
    const newEmail = resident.email;
    onChange({ ...resident, email: newEmail, password: newPass });
    alert(`${resident.unitNumber} credentials reset.`);
  };

  return (
    <div className="resident-card">
      <h3>{resident.unitNumber}</h3>

      <label>Owner:</label>
      <input
        value={resident.ownerName}
        onChange={(e) => editable && onChange({ ...resident, ownerName: e.target.value })}
        disabled={!editable}
      />

      <label>Previous Due:</label>
      <input
        type="number"
        value={resident.previousDue}
        onChange={(e) =>
          editable && onChange({ ...resident, previousDue: parseFloat(e.target.value) || 0 })
        }
        disabled={!editable}
      />

      <div className="month-section">
        <label>
          <b>Month-wise Payments (Current Year):</b>
        </label>
        <div className="month-grid">
          {months.map((m, i) => (
            <div key={i} className="month-cell">
              <label>{m}</label>
              <input
                type="number"
                value={resident.payments[i] || ""}
                onChange={(e) =>
                  editable && handlePaymentChange(i, parseFloat(e.target.value) || 0)
                }
                disabled={!editable}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ONLY ADMIN CAN SEE EMAIL, PASSWORD, RESET BUTTON */}
      {editable && (
        <>
          <label>Email:</label>
          <div className="readonly">{resident.email}</div>

          <label>Password:</label>
          <div className="readonly password">{resident.password}</div>

          <button className="reset-btn" onClick={resetCredentials}>
            Reset Credentials
          </button>
        </>
      )}

      <div className="totals">
        <p><b>Total Paid:</b> ₹{totalPaid}</p>
        <p><b>Total Due:</b> ₹{totalDue}</p>
      </div>
    </div>
  );
};

/* ---------------- DASHBOARD (unchanged) ---------------- */

const Dashboard = ({
  currentUser,
  residents,
  setResidents,
  expenses,
  setExpenses,
  maintenanceSettings,
  onLogout,
}: {
  currentUser: NonNullable<CurrentUser>;
  residents: Resident[];
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  maintenanceSettings: MaintenanceSettings;
  onLogout: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<"residents" | "expenses">("residents");
  const isAdmin = currentUser.role === "admin";
  const handleUpdateResident = (r: Resident) =>
    setResidents((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  const totalCollected = residents.reduce(
    (sum, r) => sum + Object.values(r.payments).reduce((s, p) => s + (p || 0), 0),
    0
  );
  const totalDue = residents.reduce(
    (sum, r) => sum + getResidentCalculations(r, maintenanceSettings).totalDue,
    0
  );
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
  });

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    setExpenses([
      ...expenses,
      {
        id: Date.now().toString(),
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        date: newExpense.date,
      },
    ]);
    setNewExpense({ description: "", amount: "", date: new Date().toISOString().split("T")[0] });
  };

  const handleDeleteExpense = (id: string) => {
    if (!isAdmin) return;
    setExpenses(expenses.filter((e) => e.id !== id));
  };

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Shree Ganesh Divine</h1>
        <div className="user-info">
          <span className="badge">{isAdmin ? "Admin" : "Resident"}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={activeTab === "residents" ? "active" : ""}
          onClick={() => setActiveTab("residents")}
        >
          Residents
        </button>
        <button
          className={activeTab === "expenses" ? "active" : ""}
          onClick={() => setActiveTab("expenses")}
        >
          Expenses
        </button>
      </div>

      {activeTab === "residents" ? (
        <div className="residents-grid">
          {residents.map((r) => (
            <ResidentCard
              key={r.id}
              resident={r}
              settings={maintenanceSettings}
              editable={isAdmin}
              onChange={handleUpdateResident}
            />
          ))}
        </div>
      ) : (
        <div className="expenses-tab">
          {isAdmin && (
            <form onSubmit={handleAddExpense} className="expense-form">
              <input
                placeholder="Description"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
              />
              <input
                type="number"
                placeholder="Amount"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              />
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
              />
              <button type="submit">Add Expense</button>
            </form>
          )}
          <table className="expense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{e.description}</td>
                  <td>₹{e.amount}</td>
                  {isAdmin && (
                    <td>
                      <button onClick={() => handleDeleteExpense(e.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="expense-summary">
            <p><b>Total Collected:</b> ₹{totalCollected}</p>
            <p><b>Total Expenses:</b> ₹{totalExpenses}</p>
            <p><b>Total Due:</b> ₹{totalDue}</p>
            <p><b>Cash on Hand:</b> ₹{totalCollected - totalExpenses}</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- MAIN APP with Firebase integration ---------------- */

const App = () => {
  // Local persistent state as fallback + initial values
  const [localResidents, setLocalResidents] = usePersistentState(
    "residents_v2",
    generateInitialResidents()
  );
  const [localExpenses, setLocalExpenses] = usePersistentState<Expense[]>("expenses_v2", []);
  const [localSettings] = usePersistentState<MaintenanceSettings>("settings_v2", {
    flatMonthlyFee: 1000,
    shopMonthlyFee: 200,
  });

  // These will be the "live" states shown in UI.
  const [residents, setResidents] = useState<Resident[]>(localResidents);
  const [expenses, setExpenses] = useState<Expense[]>(localExpenses);
  const [settings, setSettings] = useState<MaintenanceSettings>(localSettings);

  // Auth + Firestore link
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);

  // keep a ref for debounce timer to avoid too many writes
  const saveTimerRef = useRef<number | null>(null);

  // Listen for Firebase auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        // if admin email in Firebase (optional), treat as admin
        if (user.email === "admin@sbdivine.com") {
          setCurrentUser({ role: "admin" });
        } else {
          // set resident role if local match exists (will be replaced by remote doc if present)
          const found = residents.find((r) => r.email === user.email);
          if (found) setCurrentUser({ role: "resident", resident: found });
          else setCurrentUser(null);
        }
      } else {
        setUid(null);
        setCurrentUser(null);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When uid becomes available, subscribe to Firestore user doc
  useEffect(() => {
    if (!uid) return;
    setLoadingRemote(true);
    const ref = doc(db, "users", uid);

    // realtime listener - prefer remote data when available
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setResidents(data.residents || generateInitialResidents());
          setExpenses(data.expenses || []);
          setSettings(
            data.settings || { flatMonthlyFee: 1000, shopMonthlyFee: 200 }
          );
        } else {
          // create doc using current local state as initial
          setDoc(ref, {
            residents: localResidents,
            expenses: localExpenses,
            settings: localSettings,
            createdAt: serverTimestamp()
          }).catch((err) => {
            console.error("Error creating user doc:", err);
          });
        }
        setLoadingRemote(false);
      },
      (err) => {
        console.error("Firestore snapshot error:", err);
        setLoadingRemote(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Whenever residents/expenses/settings change and we have a uid, write to Firestore (debounced)
  useEffect(() => {
    if (!uid) {
      // no uid — keep local storage updated (fallback)
      setLocalResidents(residents);
      setLocalExpenses(expenses);
      return;
    }

    const ref = doc(db, "users", uid);

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      // prefer updateDoc but fallback to setDoc to create if not present
      (async () => {
        try {
          // try updateDoc
          await updateDoc(ref, {
            residents,
            expenses,
            settings
          });
        } catch (err: any) {
          // if update fails because doc doesn't exist, set it
          try {
            await setDoc(ref, {
              residents,
              expenses,
              settings,
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (e) {
            console.error("Error saving to Firestore:", e);
          }
        }
      })();
    }, 700); // 700ms debounce

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residents, expenses, settings, uid]);

  // Login handler: try Firebase auth first, fallback to local check (so your existing users continue to work)
  const handleLogin = async (email: string, password: string) => {
    // admin shortcut (keeps original behavior)
    if (email === "admin@sbdivine.com" && password === "admin123") {
      setCurrentUser({ role: "admin" });
      return;
    }

    try {
      // attempt Firebase sign in
      await signInWithEmailAndPassword(auth, email, password);
      // firebase onAuthStateChanged will set uid and currentUser once signed in
      return;
    } catch (err) {
      // Firebase sign-in failed — try local fallback
      const r = residents.find((res) => res.email === email && res.password === password);
      if (r) {
        setCurrentUser({ role: "resident", resident: r });
        return;
      }
      // if not found locally, throw an error to show invalid credentials
      throw new Error("Invalid credentials");
    }
  };

  // Logout: sign out from Firebase if logged in there, and clear current user
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore firebase signout errors; still clear local state
    }
    setUid(null);
    setCurrentUser(null);
  };

  // If no logged-in user, show login page (UI preserved)
  if (!currentUser) return <Auth onLogin={handleLogin} />;
  if (loadingRemote) return <div>Loading...</div>;

  return (
    <Dashboard
      currentUser={currentUser}
      residents={residents}
      setResidents={setResidents}
      expenses={expenses}
      setExpenses={setExpenses}
      maintenanceSettings={settings}
      onLogout={handleLogout}
    />
  );
};

/* ---------------- STYLE (unchanged) ---------------- */

const style = document.createElement("style");
style.textContent = `
body {
  font-family: 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #f5f7fa, #e4e9f2);
  margin: 0;
  padding: 0;
}
.login-page {
  max-width: 400px;
  margin: 100px auto;
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  text-align: center;
}
.login-page input {
  width: 100%;
  margin: 8px 0;
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}
.login-page button {
  width: 100%;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
}
.dashboard {
  max-width: 1300px;
  margin: 2rem auto;
  padding: 1rem;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 1rem 1.5rem;
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
}
.header h1 {
  margin: 0;
  color: #1a237e;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.badge {
  background: #e3f2fd;
  color: #1976d2;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  font-weight: 600;
}
.tabs {
  margin-top: 1rem;
  display: flex;
  gap: 1rem;
}
.tabs button {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 8px;
  background: #e3f2fd;
  color: #1976d2;
  font-weight: 500;
  cursor: pointer;
}
.tabs button.active {
  background: #1976d2;
  color: white;
}
.residents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}
.resident-card {
  background: white;
  padding: 1.25rem;
  border-radius: 12px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.1);
}
.resident-card input {
  width: 100%;
  padding: 0.4rem;
  margin: 3px 0 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 1rem;
}
.reset-btn {
  background: #fbc02d;
  color: black;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.readonly {
  background: #f7f7f7;
  padding: 0.4rem;
  border-radius: 6px;
  margin-bottom: 8px;
}
.password {
  color: green;
  font-weight: 600;
}
.totals {
  border-top: 1px solid #eee;
  margin-top: 10px;
  padding-top: 6px;
}
.expenses-tab {
  background: white;
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
  margin-top: 1rem;
}
.expense-form {
  display: flex;
  gap: 10px;
  margin-bottom: 1rem;
}
.expense-form input, .expense-form button {
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ccc;
}
.expense-table {
  width: 100%;
  border-collapse: collapse;
}
.expense-table th, .expense-table td {
  border: 1px solid #eee;
  padding: 0.5rem;
}
.expense-summary {
  margin-top: 1rem;
  border-top: 1px solid #ddd;
  padding-top: 0.5rem;
  font-weight: 500;
}
`;
document.head.appendChild(style);

/* ---------------- MOUNT ---------------- */

createRoot(document.getElementById("root")!).render(<App />);
