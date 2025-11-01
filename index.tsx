import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
type Reminder = {
  id: string;
  name: string;
  duration: number; // minutes
  active: boolean;
  createdAt: number;
  lastTriggered: number;
  type: 'recurring' | 'once';
  interval?: number; // minutes, for recurring
  triggerTime?: string; // HH:mm, for once
};
type Stats = {
  completed: number;
  streak: number;
  lastCompletionDate: string | null;
};
type ActiveBreak = {
  id: string;
  name: string;
  startedAt: number; // timestamp ms when break started
  durationSeconds: number; // total duration in seconds
};

// Vite env typings (augment minimal for this file)
// Lightweight env access helper for Vite
// (TS config can be extended later with a global declaration file)

// --- HOOKS ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (value) => {
      try {
        // Use functional updater to avoid capturing/stale closure on `storedValue`.
        setStoredValue(prev => {
          const valueToStore = value instanceof Function ? (value as (prev: T) => T)(prev) : value;
          try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } catch (e) {
            // ignore storage errors but still update state
            console.error('Failed to write to localStorage', e);
          }
          return valueToStore;
        });
      } catch (error) {
        console.error(error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}


// --- API ---
const QUOTE_FALLBACK = "The journey of a thousand miles begins with a single step.";
const QUOTE_CACHE_KEY = "dailyQuote";
const QUOTE_CACHE_DATE_KEY = "dailyQuoteDate";

const fetchQuote = async (): Promise<string> => {
  // Daily caching: if stored and same date, reuse
  try {
    const today = new Date().toISOString().split('T')[0];
    const cachedDate = localStorage.getItem(QUOTE_CACHE_DATE_KEY);
    const cachedQuote = localStorage.getItem(QUOTE_CACHE_KEY);
    if (cachedDate === today && cachedQuote) {
      return cachedQuote;
    }

  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API key missing (VITE_GEMINI_API_KEY). Using fallback quote.");
      localStorage.setItem(QUOTE_CACHE_KEY, QUOTE_FALLBACK);
      localStorage.setItem(QUOTE_CACHE_DATE_KEY, today);
      return QUOTE_FALLBACK;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Generate one short, impactful, inspirational quote about personal growth or success. Only return the quote text.",
      config: { temperature: 0.9 }
    });

  const rawText: string = (response as any)?.text || '';
  const cleaned = rawText
      .replace(/"/g, '')
      .replace(/^\s+|\s+$/g, '')
      .replace(/—.*$/, '')
      .trim();

    const finalQuote = cleaned || QUOTE_FALLBACK;
    localStorage.setItem(QUOTE_CACHE_KEY, finalQuote);
    localStorage.setItem(QUOTE_CACHE_DATE_KEY, today);
    return finalQuote;
  } catch (error) {
    console.error("Failed to fetch quote:", error);
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(QUOTE_CACHE_KEY, QUOTE_FALLBACK);
    localStorage.setItem(QUOTE_CACHE_DATE_KEY, today);
    return QUOTE_FALLBACK;
  }
};


// --- UI COMPONENTS ---

const CountdownTimer = ({ reminder, isSessionActive, activeBreaks }: { reminder: Reminder, isSessionActive: boolean, activeBreaks: ActiveBreak[] }) => {
  // Derive a stable primitive key for activeBreaks membership checks
  const activeBreakIdsKey = useMemo(() => activeBreaks.map(b => b.id).sort().join('|'), [activeBreaks]);

  const { id, type, lastTriggered, interval, triggerTime, active } = reminder;

  const calculateTimeLeft = useCallback(() => {
    // quick membership check
    if (activeBreakIdsKey.includes(id)) return 'In Progress';

    const now = new Date();

    if (type === 'recurring') {
      if (!isSessionActive && active) return 'Paused';
      if (lastTriggered === 0) return 'Paused';
      const dueTime = lastTriggered + (interval || 0) * 60 * 1000;
      const diff = dueTime - now.getTime();
      if (diff <= 0) return 'Now!';

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) return `${hours}h ${minutes}m`;
      if (minutes > 0) return `${minutes}m ${seconds}s`;
      return `${seconds}s`;
    }

    if (type === 'once' && triggerTime) {
      const [hours, minutes] = triggerTime.split(':').map(Number);
      const targetTime = new Date();
      targetTime.setHours(hours, minutes, 0, 0);

      const lastTriggerDate = new Date(lastTriggered);
      const sameDayTrigger = lastTriggered !== 0 && lastTriggerDate.toDateString() === targetTime.toDateString();

      if (sameDayTrigger) return 'Done';

      const diff = targetTime.getTime() - now.getTime();
      if (diff <= 0) return 'Now!';

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      if (h > 0) return `in ${h}h ${m}m`;
      if (m > 0) return `in ${m}m ${s}s`;
      return `in ${s}s`;
    }

    return '';
  }, [id, type, lastTriggered, interval, triggerTime, active, isSessionActive, activeBreakIdsKey]);

  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft());

  useEffect(() => {
    if (!active) {
      setTimeLeft('');
      return;
    }

    // update immediately and then every second
    setTimeLeft(calculateTimeLeft());
    const timerId = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timerId);
  }, [calculateTimeLeft, active]);

  if (!active) return <div className="reminder-countdown-placeholder"></div>;

  return <div className="reminder-countdown">{timeLeft}</div>;
};

const WelcomeScreen = ({ onNameSubmit }: { onNameSubmit: (name: string) => void }) => {
  const [name, setName] = useState('');
  return (
    <div className="welcome-screen">
      <h1>Mindful Moments</h1>
      <p>Your personal space to build healthy habits. What should we call you?</p>
      <form onSubmit={(e) => { e.preventDefault(); if (name) onNameSubmit(name); }} className="input-group">
        <input
          type="text"
          placeholder="Enter your name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Enter your name"
        />
        <button type="submit" disabled={!name}>Continue</button>
      </form>
    </div>
  );
};

const ParticleAnimation = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const themeColors = ['#33ff99', '#9f70fd'];

    class Particle {
      x: number; y: number; size: number; speedX: number; speedY: number; color: string;

      constructor(canvasWidth: number, canvasHeight: number) {
        this.x = Math.random() * canvasWidth;
        this.y = Math.random() * canvasHeight;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.color = themeColors[Math.floor(Math.random() * themeColors.length)];
      }

      update(canvasWidth: number, canvasHeight: number) {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvasWidth) this.speedX *= -1;
        if (this.y < 0 || this.y > canvasHeight) this.speedY *= -1;
      }

      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
      }
    }

    const init = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      particles = [];
      const numberOfParticles = Math.floor((canvas.width * canvas.height) / 12000);
      for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle(canvas.width, canvas.height));
      }
    };

    const connect = () => {
      for (let a = 0; a < particles.length; a++) {
        for (let b = a; b < particles.length; b++) {
          const dx = particles[a].x - particles[b].x;
          const dy = particles[a].y - particles[b].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 110) {
            const opacity = 1 - distance / 110;
            ctx.strokeStyle = `rgba(159, 112, 253, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.update(canvas.width, canvas.height);
        p.draw(ctx);
      }
      connect();
      animationFrameId = requestAnimationFrame(animate);
    };

    init();
    animate();

    const handleResize = () => init();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef}></canvas>;
};

const formatTime = (seconds: number) => {
  if (seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const getRemaining = (startedAt: number, durationSeconds: number) => {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  return durationSeconds - elapsed;
};

const FocusScreen = ({ activeBreak, onEnd, onClose }: { activeBreak: ActiveBreak; onEnd: (id: string) => void; onClose: () => void; }) => {
  // derive remaining deterministically then keep a local ticking state to render every second
  const initialRemaining = getRemaining(activeBreak.startedAt, activeBreak.durationSeconds);
  const [remainingState, setRemainingState] = useState<number>(initialRemaining);

  // Update local remaining each second for visual ticker; still call onEnd when <= 0
  useEffect(() => {
    setRemainingState(getRemaining(activeBreak.startedAt, activeBreak.durationSeconds));
    if (initialRemaining <= 0) {
      onEnd(activeBreak.id);
      return;
    }
    const idTick = setInterval(() => {
      const r = getRemaining(activeBreak.startedAt, activeBreak.durationSeconds);
      setRemainingState(r);
      if (r <= 0) {
        clearInterval(idTick);
        onEnd(activeBreak.id);
      }
    }, 1000);
    return () => clearInterval(idTick);
  }, [activeBreak.startedAt, activeBreak.durationSeconds, activeBreak.id, onEnd]);

  // Escape / background close handler
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="focus-screen" onClick={onClose}>
      <div className="focus-animation-bg">
        <ParticleAnimation />
      </div>
      <div className="focus-content" onClick={e => e.stopPropagation()}>
        <h1 className="focus-title">{activeBreak.name}</h1>
            <div className="focus-timer">{formatTime(remainingState)}</div>
        <button onClick={() => onEnd(activeBreak.id)} className="focus-end-btn">End Break</button>
        <div className="focus-close-hint">Press ESC or click background to exit</div>
      </div>
    </div>
  );
};

// New Timer Cards
const ActiveTimerCard = ({ activeBreak, onFinish, onFocus }: { activeBreak: ActiveBreak; onFinish: (id: string) => void; onFocus: (id: string) => void; }) => {
  const initialRemaining = getRemaining(activeBreak.startedAt, activeBreak.durationSeconds);
  const [remainingState, setRemainingState] = useState<number>(initialRemaining);

  useEffect(() => {
    setRemainingState(getRemaining(activeBreak.startedAt, activeBreak.durationSeconds));
    if (initialRemaining <= 0) {
      onFinish(activeBreak.id);
      return;
    }
    const idTick = setInterval(() => {
      const r = getRemaining(activeBreak.startedAt, activeBreak.durationSeconds);
      setRemainingState(r);
      if (r <= 0) {
        clearInterval(idTick);
        onFinish(activeBreak.id);
      }
    }, 1000);
    return () => clearInterval(idTick);
  }, [activeBreak.startedAt, activeBreak.durationSeconds, activeBreak.id, onFinish]);

  return (
    <div className="active-timer-card">
      <div className="timer-card-content">
        <div className="timer-card-info">
          <div className="timer-card-title">{`${activeBreak.name}: ${formatTime(remainingState)}`}</div>
        </div>
        <div className="timer-card-buttons">
          <button onClick={() => onFocus(activeBreak.id)} className="timer-card-focus" aria-label="Focus">✨</button>
          <button onClick={() => onFinish(activeBreak.id)} className="timer-card-action">End</button>
        </div>
      </div>
    </div>
  );
};

const PendingBreakCard = ({ reminder, onStart, onSkip, onSnooze }: {
    reminder: Reminder;
    onStart: (id: string) => void;
    onSkip: (id: string) => void;
    onSnooze: (id: string, minutes: number) => void;
}) => {
    const [showSnooze, setShowSnooze] = useState(false);
    
    return (
        <div className="pending-break-card">
            <div className="timer-card-info">
                <span>Time for <strong>{reminder.name}</strong></span>
            </div>
            {showSnooze ? (
                <div className="timer-card-actions snooze-options">
                    <button onClick={() => onSnooze(reminder.id, 5)}>5m</button>
                    <button onClick={() => onSnooze(reminder.id, 15)}>15m</button>
                    <button onClick={() => onSnooze(reminder.id, 30)}>30m</button>
                    <button onClick={() => setShowSnooze(false)} className="cancel-snooze">✕</button>
                </div>
            ) : (
                <div className="timer-card-actions">
                    <button onClick={() => onStart(reminder.id)} className="start-action">Start</button>
                    <button onClick={() => setShowSnooze(true)}>Snooze</button>
                    <button onClick={() => onSkip(reminder.id)}>Skip</button>
                </div>
            )}
        </div>
    );
};

interface ActiveTimersContainerProps {
  pendingBreaks: Reminder[];
  activeBreaks: ActiveBreak[];
  onStart: (id: string) => void;
  onSkip: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onFinish: (id: string) => void;
  onFocus: (id: string | null) => void;
}
const ActiveTimersContainer = ({ pendingBreaks, activeBreaks, onStart, onSkip, onSnooze, onFinish, onFocus }: ActiveTimersContainerProps) => {
    if (pendingBreaks.length === 0 && activeBreaks.length === 0) return null;

    return (
        <div className="active-timers-container">
      {activeBreaks.map((b: ActiveBreak) => (
                <ActiveTimerCard key={b.id} activeBreak={b} onFinish={onFinish} onFocus={onFocus} />
            ))}
            {pendingBreaks.map((p: Reminder) => (
                <PendingBreakCard key={p.id} reminder={p} onStart={onStart} onSkip={onSkip} onSnooze={onSnooze} />
            ))}
        </div>
    );
};


interface DashboardProps {
  userName: string;
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  stats: Stats;
  setStats: React.Dispatch<React.SetStateAction<Stats>>;
  quote: string;
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  theme: 'light' | 'dark';
  isSessionActive: boolean;
  setIsSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  activeBreaks: ActiveBreak[];
}
const Dashboard = ({
  userName,
  reminders,
  setReminders,
  stats,
  setStats,
  quote,
  setTheme,
  theme,
  isSessionActive,
  setIsSessionActive,
  activeBreaks,
}: DashboardProps) => {
  const [newName, setNewName] = useState('');
  // reference setStats to avoid "declared but its value is never read" TS warning
  // it's intentionally kept for future use (e.g., exporting stats UI hooks)
  void setStats;
  const [newType, setNewType] = useState<'recurring' | 'once'>('recurring');
  const [newInterval, setNewInterval] = useState(40);
  const [newDuration, setNewDuration] = useState(2);
  const [newTime, setNewTime] = useState('13:00');

  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 3;

  const [mobileTab, setMobileTab] = useState<'new' | 'dash'>('new');


  const paginatedReminders = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return reminders.slice(start, start + itemsPerPage);
  }, [reminders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(reminders.length / itemsPerPage);

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || newDuration <= 0) return;

    let newReminder: Reminder;
    const now = Date.now();
    
    if (newType === 'recurring') {
      if (newInterval <= 0) return;
      newReminder = {
        id: now.toString(), name: newName, duration: newDuration, active: true, createdAt: now, lastTriggered: isSessionActive ? now : 0,
        type: 'recurring', interval: newInterval,
      };
    } else {
      if (!newTime) return;
      newReminder = {
        id: now.toString(), name: newName, duration: newDuration, active: true, createdAt: now, lastTriggered: 0,
        type: 'once', triggerTime: newTime,
      };
    }

    setReminders(prev => [newReminder, ...prev].sort((a, b) => b.createdAt - a.createdAt));
    setNewName('');
    setNewInterval(40);
    setNewDuration(2);
    setNewTime('13:00');
  };
  
  const handleDelete = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  }
  
  const toggleActive = (id: string) => {
    setReminders(prev => prev.map(r => {
      if (r.id === id) {
        const becomingActive = !r.active;
        let newLastTriggered = r.lastTriggered;
        if (becomingActive && r.type === 'recurring' && isSessionActive) {
          newLastTriggered = Date.now();
        }
        return { ...r, active: becomingActive, lastTriggered: newLastTriggered };
      }
      return r;
    }));
  }

  return (
    <div className="dashboard">
      <header>
        <h2>Welcome, {userName}</h2>
        <div className="header-actions">
           <button onClick={() => setIsSessionActive(s => !s)} className={`session-toggle ${isSessionActive ? 'active' : ''}`}>
             {isSessionActive ? 'End Day' : 'Start Day'}
           </button>
           <button className="theme-toggle" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
           </button>
        </div>
      </header>

      <div className="mobile-tabs">
        <button className={mobileTab === 'new' ? 'active' : ''} onClick={() => setMobileTab('new')}>New Reminder</button>
        <button className={mobileTab === 'dash' ? 'active' : ''} onClick={() => setMobileTab('dash')}>Dashboard</button>
      </div>

      <main className={`main-content ${!isSessionActive && 'session-inactive'}`}>
        <div className={`card ${mobileTab === 'new' ? 'active-mobile' : ''}`}>
          <h3>New Reminder</h3>
          <form onSubmit={handleAddReminder} className="reminder-form">
            <div className="input-group-labeled">
              <label htmlFor="reminder-name">Activity Name</label>
              <input id="reminder-name" type="text" placeholder="e.g., Stretch" value={newName} onChange={e => setNewName(e.target.value)} required/>
            </div>
            
            <div className="input-group-labeled">
              <label>Type</label>
              <div className="type-toggle">
                <button type="button" className={newType === 'recurring' ? 'active' : ''} onClick={() => setNewType('recurring')}>Recurring</button>
                <button type="button" className={newType === 'once' ? 'active' : ''} onClick={() => setNewType('once')}>One-Time</button>
              </div>
            </div>

            {newType === 'recurring' ? (
                <div className="form-row">
                    <div className="input-group-labeled">
                        <label htmlFor="reminder-interval">Interval (min)</label>
            <input id="reminder-interval" type="number" value={newInterval} onChange={e => {
              const v = e.target.value;
              const n = v === '' ? 0 : parseInt(v, 10);
              setNewInterval(Number.isNaN(n) ? 0 : n);
            }} required min="1"/>
                    </div>
                    <div className="input-group-labeled">
                        <label htmlFor="reminder-duration">Duration (min)</label>
            <input id="reminder-duration" type="number" value={newDuration} onChange={e => {
              const v = e.target.value;
              const n = v === '' ? 0 : parseInt(v, 10);
              setNewDuration(Number.isNaN(n) ? 0 : n);
            }} required min="1"/>
                    </div>
                </div>
            ) : (
                <div className="form-row">
                    <div className="input-group-labeled">
                        <label htmlFor="reminder-time">Time</label>
                        <input id="reminder-time" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} required/>
                    </div>
                    <div className="input-group-labeled">
                        <label htmlFor="reminder-duration-once">Duration (min)</label>
            <input id="reminder-duration-once" type="number" value={newDuration} onChange={e => {
              const v = e.target.value;
              const n = v === '' ? 0 : parseInt(v, 10);
              setNewDuration(Number.isNaN(n) ? 0 : n);
            }} required min="1"/>
                    </div>
                </div>
            )}
            
            <button type="submit">Add Reminder</button>
          </form>
        </div>
        <div className={`card ${mobileTab === 'dash' ? 'active-mobile' : ''}`}>
          <h3>Dashboard</h3>
           <div className="stats-grid">
              <div className="stat-item">
                  <div className="stat-value">{stats?.completed ?? 0}</div>
                  <div className="stat-label">Sessions</div>
              </div>
              <div className="stat-item">
                  <div className="stat-value">{stats?.streak ?? 0} 🔥</div>
                  <div className="stat-label">Day Streak</div>
              </div>
          </div>
          <ul className="reminder-list">
             {paginatedReminders.map(r => (
                <li key={r.id} className="reminder-item">
                    <div className="reminder-info">
                        <div className="reminder-name" style={{opacity: r.active ? 1 : 0.5}}>
                         <span className="reminder-type-icon">{r.type === 'recurring' ? '🔁' : '⏰'}</span> {r.name}
                        </div>
                        <div className="reminder-details">
                          {r.type === 'recurring' 
                            ? `${r.duration} min break every ${r.interval} min`
                            : `${r.duration} min break at ${r.triggerTime}`
                          }
                        </div>
                    </div>
                    <CountdownTimer reminder={r} isSessionActive={isSessionActive} activeBreaks={activeBreaks} />
                    <div className="reminder-actions">
                        <button onClick={() => toggleActive(r.id)} aria-label={r.active ? 'Pause' : 'Play'}>{r.active ? '⏸️' : '▶️'}</button>
                        <button onClick={() => handleDelete(r.id)} className="delete-btn" aria-label="Delete">🗑️</button>
                    </div>
                </li>
             ))}
          </ul>
          {totalPages > 1 && (
             <div className="pagination-controls">
                <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>←</button>
                <div className="pagination-dots">
                    {[...Array(totalPages)].map((_, i) => <div key={i} className={`dot ${i === currentPage ? 'active' : ''}`}></div>)}
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>→</button>
             </div>
          )}
        </div>
      </main>
      <footer className="quote-container">
        <p>"{quote}"</p>
      </footer>
    </div>
  );
};


// --- APP ---
const App = () => {
  const [userName, setUserName] = useLocalStorage<string | null>('userName', null);
  const [reminders, setReminders] = useLocalStorage<Reminder[]>('reminders', []);
  const [stats, setStats] = useLocalStorage<Stats>('stats', { completed: 0, streak: 0, lastCompletionDate: null });

  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'dark');
  const [isSessionActive, setIsSessionActive] = useLocalStorage('isSessionActive', false);
  const [quote, setQuote] = useState("Loading your daily inspiration...");
  const hasGeminiKey = !!((import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY);

  const [pendingBreaks, setPendingBreaks] = useState<Reminder[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<ActiveBreak[]>([]);
  const [focusedBreakId, setFocusedBreakId] = useState<string | null>(null);
  // (Global clock removed – components compute remaining directly via Date.now())

  // Refs to hold the latest state for the interval, preventing stale closures.
  const remindersRef = useRef(reminders);
  const pendingBreaksRef = useRef(pendingBreaks);
  const activeBreaksRef = useRef(activeBreaks);
  const isSessionActiveRef = useRef(isSessionActive);

  useEffect(() => { remindersRef.current = reminders; }, [reminders]);
  useEffect(() => { pendingBreaksRef.current = pendingBreaks; }, [pendingBreaks]);
  useEffect(() => { activeBreaksRef.current = activeBreaks; }, [activeBreaks]);
  useEffect(() => { isSessionActiveRef.current = isSessionActive; }, [isSessionActive]);
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  // Reset session on new day & activate recurring timers if session is active
  useEffect(() => {
    if (isSessionActive) {
      setReminders(prev => prev.map(r => {
        if (r.type === 'recurring' && r.lastTriggered === 0) {
          return { ...r, lastTriggered: Date.now() };
        }
        return r;
      }));
    }
  }, [isSessionActive, setReminders]);

  useEffect(() => {
    const quoteTimer = setTimeout(() => {
        fetchQuote().then(setQuote);
    }, 1000);
    return () => clearTimeout(quoteTimer);
  }, []);

  const finishBreak = useCallback((finishedId: string) => {
    setActiveBreaks(prev => prev.filter(b => b.id !== finishedId));
    setFocusedBreakId(prevId => (prevId === finishedId ? null : prevId));
    
    // Update reminder's lastTriggered time
    setReminders(prev => prev.map(r => {
        if (r.id === finishedId) {
            return { ...r, lastTriggered: Date.now() };
        }
        return r;
    }));
    
    // Update user stats
    setStats(prev => {
        const today = new Date().toISOString().split('T')[0];
        let newStreak = prev.streak;

        if (prev.lastCompletionDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (prev.lastCompletionDate === yesterday.toISOString().split('T')[0]) {
                newStreak += 1;
            } else {
                newStreak = 1;
            }
        }
        
        return {
            completed: prev.completed + 1,
            streak: newStreak,
            lastCompletionDate: today,
        };
    });
  }, [setReminders, setStats]);

  // Removed mutable loop; each card & focus overlay manages its own countdown derived from timestamps.

  // Main checker for due reminders
  useEffect(() => {
    const checkReminders = () => {
        const now = new Date();
        const currentReminders = remindersRef.current;
        const currentPendingBreaks = pendingBreaksRef.current;
        const currentActiveBreaks = activeBreaksRef.current;
        const currentIsSessionActive = isSessionActiveRef.current;

        const currentlyManagedIds = new Set([...currentPendingBreaks.map(p => p.id), ...currentActiveBreaks.map(a => a.id)]);
        
        const dueReminders = currentReminders.filter(r => {
            if (!r.active || currentlyManagedIds.has(r.id)) return false;

            if (r.type === 'recurring' && currentIsSessionActive) {
                if (r.lastTriggered === 0) return false;
                return (now.getTime() - r.lastTriggered) >= (r.interval || 0) * 60 * 1000;
            }

            if (r.type === 'once' && r.triggerTime) {
                const [hours, minutes] = r.triggerTime.split(':').map(Number);
                const targetTime = new Date();
                targetTime.setHours(hours, minutes, 0, 0);

                const lastTriggerDate = new Date(r.lastTriggered);
                const sameDayTrigger = r.lastTriggered !== 0 && lastTriggerDate.toDateString() === targetTime.toDateString();

                return now >= targetTime && !sameDayTrigger;
            }

            return false;
        });

        if (dueReminders.length > 0) {
            setPendingBreaks(prev => {
                const newPending = dueReminders.filter(due => !prev.some(p => p.id === due.id));
                return newPending.length > 0 ? [...prev, ...newPending] : prev;
            });
            // Update lastTriggered for due reminders to start the next countdown
            setReminders(prev => prev.map(r => {
                if (dueReminders.some(d => d.id === r.id)) {
                    return { ...r, lastTriggered: Date.now() };
                }
                return r;
            }));
        }
    };
    const intervalId = setInterval(checkReminders, 1000);
    return () => clearInterval(intervalId);
  }, []);
  
  const handleStartBreak = (id: string) => {
    const reminderToStart = reminders.find(p => p.id === id);
    if (!reminderToStart) return;
    
    setActiveBreaks(prevActive => [...prevActive, {
      id: reminderToStart.id,
      name: reminderToStart.name,
      startedAt: Date.now(),
      durationSeconds: reminderToStart.duration * 60,
    }]);

    if (reminderToStart.type === 'once') {
        setReminders(prev => prev.map(r => r.id === id ? { ...r, lastTriggered: Date.now() } : r));
    }
    
    setPendingBreaks(prevPending => prevPending.filter(p => p.id !== id));
  };
  
  const handleSkipBreak = (id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, lastTriggered: Date.now() } : r));
    setPendingBreaks(prev => prev.filter(p => p.id !== id));
  };
  
  const handleSnoozeBreak = (id: string, minutesToSnooze: number) => {
      setReminders(prev => prev.map(r => {
        if (r.id === id) {
            if (r.type === 'recurring') {
                const newLastTriggered = Date.now() + (minutesToSnooze * 60 * 1000) - ((r.interval || 0) * 60 * 1000);
                return { ...r, lastTriggered: newLastTriggered };
            } else { // one-time
                const newTriggerTime = new Date(Date.now() + minutesToSnooze * 60 * 1000);
                const hours = newTriggerTime.getHours().toString().padStart(2, '0');
                const minutes = newTriggerTime.getMinutes().toString().padStart(2, '0');
                return { ...r, triggerTime: `${hours}:${minutes}`, lastTriggered: 0 };
            }
        }
        return r;
      }));
      setPendingBreaks(prev => prev.filter(p => p.id !== id));
  };

  const handleNameSubmit = (name: string) => {
    setUserName(name);
  };

  // Direct lookup each render; small list so cheap and avoids stale memo issues
  const focusedBreak = focusedBreakId ? activeBreaks.find((b: ActiveBreak) => b.id === focusedBreakId) : null;

  if (!userName) {
    return <WelcomeScreen onNameSubmit={handleNameSubmit} />;
  }
  
  return (
    <div className="app-container">
      {!hasGeminiKey && (
        <div style={{background: '#fff4e5', color: '#663c00', padding: '6px 12px', textAlign: 'center'}}>
          Gemini API key not found in environment. Add <strong>VITE_GEMINI_API_KEY</strong> to your <code>.env.local</code> and restart the dev server to enable fresh quotes.
        </div>
      )}
      <Dashboard
        userName={userName}
        reminders={reminders}
        setReminders={setReminders}
        stats={stats}
        setStats={setStats}
        quote={quote}
        setTheme={setTheme}
        theme={theme}
        isSessionActive={isSessionActive}
        setIsSessionActive={setIsSessionActive}
        activeBreaks={activeBreaks}
      />
      <ActiveTimersContainer 
        pendingBreaks={pendingBreaks}
        activeBreaks={activeBreaks}
        onStart={handleStartBreak}
        onSkip={handleSkipBreak}
        onSnooze={handleSnoozeBreak}
        onFinish={finishBreak}
        onFocus={setFocusedBreakId}
      />
      {focusedBreak && (
        <FocusScreen
          key={focusedBreak.id}
          activeBreak={focusedBreak}
          onEnd={finishBreak}
          onClose={() => setFocusedBreakId(null)}
        />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);