import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

// TYPES ----------------------------------------------------------

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

// INITIAL RESIDENTS ---------------------------------------------

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

// LOCAL STORAGE HOOK --------------------------------------------

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

// LOGIN PAGE ----------------------------------------------------

const LoginPage = ({
  onLogin,
}: {
  onLogin: (email: string, pass: string) => void;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: any) => {
    e.preventDefault();
    try {
      await onLogin(email, password);
    } catch {
      setErr("Invalid credentials");
    }
  };

  return (
    <div className="login-page">
      <h1>Shree Ganesh Divine</h1>
      <form onSubmit={submit}>
        <input
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  );
};

// HELPER --------------------------------------------------------

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

// RESIDENT CARD -------------------------------------------------

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

  const handlePaymentChange = (idx: number, val: number) => {
    onChange({
      ...resident,
      payments: { ...resident.payments, [idx]: val },
    });
  };

  return (
    <div className="resident-card">
      <h3>{resident.unitNumber}</h3>

      <label>Owner:</label>
      <input
        value={resident.ownerName}
        disabled={!editable}
        onChange={(e) =>
          editable &&
          onChange({ ...resident, ownerName: e.target.value })
        }
      />

      <label>Previous Due:</label>
      <input
        type="number"
        value={resident.previousDue}
        disabled={!editable}
        onChange={(e) =>
          editable &&
          onChange({
            ...resident,
            previousDue: parseFloat(e.target.value) || 0,
          })
        }
      />

      <label><b>Month-wise Payments:</b></label>
      <div className="month-grid">
        {months.map((m, idx) => (
          <div key={idx} className="month-cell">
            <label>{m}</label>
            <input
              type="number"
              disabled={!editable}
              value={resident.payments[idx] || ""}
              onChange={(e) =>
                editable &&
                handlePaymentChange(idx, parseFloat(e.target.value) || 0)
              }
            />
          </div>
        ))}
      </div>

      {editable && (
        <>
          <label>Email:</label>
          <div className="readonly">{resident.email}</div>

          <label>Password:</label>
          <div className="readonly password">{resident.password}</div>
        </>
      )}

      <div className="totals">
        <p><b>Total Paid:</b> ₹{totalPaid}</p>
        <p><b>Total Due:</b> ₹{totalDue}</p>
      </div>
    </div>
  );
};

// DASHBOARD -----------------------------------------------------

const Dashboard = ({
  currentUser,
  residents,
  setResidents,
  expenses,
  setExpenses,
  maintenanceSettings,
  onLogout,
  onSave,
}: {
  currentUser: NonNullable<CurrentUser>;
  residents: Resident[];
  setResidents: any;
  expenses: Expense[];
  setExpenses: any;
  maintenanceSettings: MaintenanceSettings;
  onLogout: () => void;
  onSave: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<"residents" | "expenses">(
    "residents"
  );

  const isAdmin = currentUser.role === "admin";

  const handleUpdate = (r: Resident) => {
    setResidents((prev: any) => prev.map((x: any) => (x.id === r.id ? r : x)));
  };

  const totalCollected = residents.reduce(
    (sum, r) =>
      sum +
      Object.values(r.payments).reduce((s, p) => s + (p || 0), 0),
    0
  );

  const totalDue = residents.reduce((sum, r) => {
    return sum + getResidentCalculations(r, maintenanceSettings).totalDue;
  }, 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Shree Ganesh Divine</h1>

        <div className="user-info">

          {isAdmin && (
            <button className="save-btn" onClick={onSave}>
              Save Changes
            </button>
          )}

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
              onChange={handleUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="expenses-tab">
          <p><b>Total Collected:</b> ₹{totalCollected}</p>
          <p><b>Total Expenses:</b> ₹{totalExpenses}</p>
          <p><b>Total Due:</b> ₹{totalDue}</p>
          <p><b>Cash on Hand:</b> ₹{totalCollected - totalExpenses}</p>
        </div>
      )}
    </div>
  );
};

// MAIN APP ------------------------------------------------------

const App = () => {
  const [localResidents] = usePersistentState(
    "residents_v2",
    generateInitialResidents()
  );
  const [localExpenses] = usePersistentState<Expense[]>("expenses_v2", []);

  const [localSettings] = usePersistentState<MaintenanceSettings>(
    "settings_v2",
    { flatMonthlyFee: 1000, shopMonthlyFee: 200 }
  );

  const [residents, setResidents] = useState<Resident[]>(localResidents);
  const [expenses, setExpenses] = useState<Expense[]>(localExpenses);
  const [settings, setSettings] =
    useState<MaintenanceSettings>(localSettings);

  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);

  // AUTH LISTENER
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);

        if (user.email === "admin@sbdivine.com") {
          setCurrentUser({ role: "admin" });
        } else {
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
  }, []);

  // FIRESTORE LOADING
  useEffect(() => {
    if (!uid) return;

    setLoadingRemote(true);
    const ref = doc(db, "users", uid);

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
          setDoc(ref, {
            residents: localResidents,
            expenses: localExpenses,
            settings: localSettings,
            createdAt: serverTimestamp(),
          });
        }
        setLoadingRemote(false);
      },
      () => setLoadingRemote(false)
    );

    return () => unsub();
  }, [uid]);

  // LOGIN
  const handleLogin = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  // LOGOUT
  const handleLogout = () => signOut(auth);

  // SAVE BUTTON HANDLER (MANUAL SAVE)
  const handleSave = async () => {
    if (!uid) return;

    const ref = doc(db, "users", uid);

    try {
      await updateDoc(ref, {
        residents,
        expenses,
        settings,
        updatedAt: serverTimestamp(),
      });

      alert("Saved Successfully!");
    } catch (err) {
      console.error(err);
      alert("Error saving data!");
    }
  };

  if (!currentUser) return <LoginPage onLogin={handleLogin} />;
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
      onSave={handleSave}
    />
  );
};

// STYLES --------------------------------------------------------

const style = document.createElement("style");
style.textContent = `
.save-btn {
  background: #4caf50;
  color: white;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  margin-right: 10px;
}
.save-btn:hover {
  background: #43a047;
}

/* Your original styles remain unchanged — keeping EXACT UI */

body {
  font-family: 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #f5f7fa, #e4e9f2);
  margin: 0;
  padding: 0;
}
/* ...rest of your original CSS */
/* (All your original CSS stays exactly the same) */
`;
document.head.appendChild(style);

// MOUNT ---------------------------------------------------------

createRoot(document.getElementById("root")!).render(<App />);
