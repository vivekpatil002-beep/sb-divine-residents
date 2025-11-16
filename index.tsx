import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

/* ------------------------------------------------------------------
   TYPES
-------------------------------------------------------------------*/
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

/* ------------------------------------------------------------------
   Generate Initial Residents
-------------------------------------------------------------------*/
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
        password: "password"
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
      password: "password"
    });
  }
  return residents;
};

/* ------------------------------------------------------------------
   Helper: Calculate Payments / Due
-------------------------------------------------------------------*/
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

/* ------------------------------------------------------------------
   Auth Component
-------------------------------------------------------------------*/
const Auth = ({ onLogin }: { onLogin: (e: string, p: string) => void }) => {
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

/* ------------------------------------------------------------------
   Resident Card
-------------------------------------------------------------------*/
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
  onChange
}) => {

  const months = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const { totalPaid, totalDue } = getResidentCalculations(resident, settings);

  const handlePaymentChange = (index: number, value: number) => {
    onChange({
      ...resident,
      payments: { ...resident.payments, [index]: value }
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
        onChange={(e) =>
          editable &&
          onChange({ ...resident, ownerName: e.target.value })
        }
        disabled={!editable}
      />

      <label>Previous Due:</label>
      <input
        type="number"
        value={resident.previousDue}
        onChange={(e) =>
          editable &&
          onChange({
            ...resident,
            previousDue: parseFloat(e.target.value) || 0
          })
        }
        disabled={!editable}
      />

      <div className="month-section">
        <label><b>Month-wise Payments (Current Year):</b></label>
        <div className="month-grid">
          {months.map((m, i) => (
            <div key={i} className="month-cell">
              <label>{m}</label>
              <input
                type="number"
                value={resident.payments[i] || ""}
                onChange={(e) =>
                  editable &&
                  handlePaymentChange(i, parseFloat(e.target.value) || 0)
                }
                disabled={!editable}
              />
            </div>
          ))}
        </div>
      </div>

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

/* ------------------------------------------------------------------
   Dashboard
-------------------------------------------------------------------*/
const Dashboard = ({
  currentUser,
  residents,
  setResidents,
  expenses,
  setExpenses,
  maintenanceSettings,
  onLogout,
  onSave
}: {
  currentUser: NonNullable<CurrentUser>;
  residents: Resident[];
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  maintenanceSettings: MaintenanceSettings;
  onLogout: () => void;
  onSave: () => void;
}) => {
  const isAdmin = currentUser.role === "admin";
  const [activeTab, setActiveTab] = useState<"residents" | "expenses">(
    "residents"
  );

  const handleUpdateResident = (r: Resident) =>
    setResidents((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  const totalCollected = residents.reduce(
    (sum, r) =>
      sum +
      Object.values(r.payments).reduce((s, p) => s + (p || 0), 0),
    0
  );

  const totalDue = residents.reduce(
    (sum, r) => sum + getResidentCalculations(r, maintenanceSettings).totalDue,
    0
  );

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

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
              onChange={handleUpdateResident}
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

/* ------------------------------------------------------------------
  MAIN APP WITH FIRESTORE + SAVE BUTTON
-------------------------------------------------------------------*/
const App = () => {
  const [residents, setResidents] = useState<Resident[]>(generateInitialResidents());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<MaintenanceSettings>({
    flatMonthlyFee: 1000,
    shopMonthlyFee: 200
  });

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
        }
      } else {
        setUid(null);
        setCurrentUser(null);
      }
    });
    return () => unsub();
  }, []);

  // FIRESTORE LOADER
  useEffect(() => {
    if (!uid) return;

    setLoadingRemote(true);
    const ref = doc(db, "users", uid);

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;

        setResidents(data.residents || generateInitialResidents());
        setExpenses(data.expenses || []);
        setSettings(
          data.settings || { flatMonthlyFee: 1000, shopMonthlyFee: 200 }
        );
      } else {
        setDoc(ref, {
          residents: generateInitialResidents(),
          expenses: [],
          settings: { flatMonthlyFee: 1000, shopMonthlyFee: 200 },
          createdAt: serverTimestamp()
        });
      }

      setLoadingRemote(false);
    });

    return () => unsub();
  }, [uid]);

  // LOGIN
  const handleLogin = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  // LOGOUT
  const handleLogout = () => signOut(auth);

  // SAVE BUTTON HANDLER
  const handleSave = async () => {
    if (!uid) return;

    const ref = doc(db, "users", uid);

    try {
      await updateDoc(ref, {
        residents,
        expenses,
        settings,
        updatedAt: serverTimestamp()
      });
      alert("Data saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Error saving data.");
    }
  };

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
      onSave={handleSave}
    />
  );
};

/* ------------------------------------------------------------------
  STYLES
-------------------------------------------------------------------*/
const style = document.createElement("style");
style.textContent = `
/* UPDATED CSS INCLUDING SAVE BUTTON */

.save-btn {
  background: #4caf50;
  color: white;
  padding: 0.6rem 1.2rem;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-right: 12px;
}
.save-btn:hover {
  background: #43a047;
}

/* Rest of your existing CSS… keep everything below as it was */
body {
  font-family: 'Segoe UI', sans-serif;
  background: #eef1f6;
  margin: 0;
  padding: 0;
}

/* all your existing CSS from previous file goes here */
`;
document.head.appendChild(style);

/* ------------------------------------------------------------------
  RENDER APP
-------------------------------------------------------------------*/
createRoot(document.getElementById("root")!).render(<App />);
