"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  BarChart3,
  Settings,
  LogOut,
  ArrowRight,
  Lock,
  CheckCircle2,
  Clock,
  FileQuestion,
  GraduationCap,
  ChevronRight,
  Sparkles,
  CalendarDays,
  X,
  ShieldCheck,
  Info,
  Loader2,
} from "lucide-react";
import { configured, supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  role: "student" | "teacher";
  first_name: string;
  last_name: string;
};
type Assignment = {
  id: string;
  chapter_id: number;
  is_active: boolean;
  question_count: number;
  time_limit_minutes: number;
};
type Score = {
  id: string;
  student_id: string;
  quiz_id: string;
  chapter_id: number;
  score: number;
  correct_count: number;
  question_count: number;
  created_at: string;
};
type Attempt = {
  id: string;
  chapter_id: number;
  deadline: string;
  server_now: string;
  answers: Record<string, number>;
  questions: { id: number; prompt: string; options: string[] }[];
};
const chapters = [
  ["Un monde à part", "La solitude, Dar Chouafa et les premiers souvenirs."],
  ["Au-delà des ruelles", "Le Msid et la visite à Sidi Ali Boughaleb."],
  ["Petites lumières", "La lampe à pétrole et la disparition de Zineb."],
  ["Les liens du quotidien", "Le printemps et les confidences de Lalla Aïcha."],
  ["Récits et souvenirs", "Le monde des adultes et la découverte du deuil."],
  ["Les préparatifs", "La joie et les préparatifs de l’Achoura."],
  ["Un jour de fête", "L’Achoura, ses lumières et ses traditions."],
  ["Les jours fragiles", "Les bijoux, la dispute et la maladie."],
  ["L’absence du père", "Le départ de Maâlem Abdeslam et l’inquiétude."],
  ["Paroles et présages", "La visite chez le voyant Sidi El Arafi."],
  [
    "Confidences de femmes",
    "Les récits de Salama et les nouvelles de Moulay Larbi.",
  ],
  ["Le retour", "Les retrouvailles et le refuge de la boîte."],
];
const preview: Assignment[] = chapters.map((_, i) => ({
  id: `preview-${i}`,
  chapter_id: i + 1,
  is_active: i < 3,
  question_count: 10,
  time_limit_minutes: 15,
}));

export default function Home() {
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => {
    const updateDate = () =>
      setDateLabel(
        new Date().toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Africa/Casablanca",
        }),
      );
    const initial = setTimeout(updateDate, 0);
    const interval = setInterval(updateDate, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);
  const [profile, setProfile] = useState<Profile | null>(null),
    [students, setStudents] = useState<Profile[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [scores, setScores] = useState<Score[]>([]);
  const [view, setView] = useState("chapters"),
    [filter, setFilter] = useState("all"),
    [auth, setAuth] = useState<"student" | "teacher" | null>(null),
    [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [result, setResult] = useState<Score | null>(null),
    [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(configured),
    [saving, setSaving] = useState(false);
  const savingQueue = useRef(Promise.resolve()),
    submitting = useRef(false),
    clockOffset = useRef(0);
  const pendingSaves = useRef(0);
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!auth) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setAuth(null);
      if (event.key !== "Tab") return;
      const elements = modalRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      );
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [auth, busy]);
  const refresh = useCallback(async (p: Profile) => {
    const [q, s, u] = await Promise.all([
      supabase.from("assigned_quizzes").select("*").order("chapter_id"),
      supabase
        .from("scores")
        .select("*")
        .order("created_at", { ascending: false }),
      p.role === "teacher"
        ? supabase.from("users").select("*").eq("role", "student")
        : Promise.resolve({ data: [], error: null }),
    ]);
    const e = q.error || s.error || u.error;
    if (e) throw e;
    setAssignments(q.data || []);
    setScores(s.data || []);
    setStudents(u.data || []);
  }, []);
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const load = async (id?: string) => {
      try {
        if (!id) {
          setProfile(null);
          setAssignments([]);
          setScores([]);
          return;
        }
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        if (alive) {
          setProfile(data);
          await refresh(data);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Impossible de charger votre profil.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (alive) void load(session?.user.id);
      }, 0);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [refresh]);
  const submit = useCallback(async () => {
    if (!attempt || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await savingQueue.current;
      const { data, error } = await supabase.rpc("submit_quiz", {
        p_attempt_id: attempt.id,
      });
      if (error) throw error;
      setResult(data);
      setAttempt(null);
      if (profile) await refresh(profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }, [attempt, profile, refresh]);
  useEffect(() => {
    if (!attempt) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil(
          (Date.parse(attempt.deadline) - (Date.now() + clockOffset.current)) /
            1000,
        ),
      );
      setRemaining(seconds);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [attempt]);
  useEffect(() => {
    if (!attempt || remaining > 0 || busy) return;
    const id = setTimeout(() => void submit(), 1000);
    return () => clearTimeout(id);
  }, [remaining, attempt, busy, submit]);
  useEffect(() => {
    if (!attempt) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [attempt]);
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!configured)
        throw new Error("Supabase doit être configuré pour vous connecter.");
      const form = new FormData(event.currentTarget),
        password = String(form.get("password"));
      if (auth === "teacher") {
        const { error } = await supabase.auth.signInWithPassword({
          email: String(form.get("email")),
          password,
        });
        if (error) throw error;
      } else {
        const response = await fetch("/api/student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: signup ? "signup" : "login",
            first_name: form.get("first_name"),
            last_name: form.get("last_name"),
            password,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const { error } = await supabase.auth.setSession(data.session);
        if (error) throw error;
      }
      setAuth(null);
      setMessage(
        signup ? "Votre compte a été créé. Bienvenue !" : "Connexion réussie.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function handleStartQuiz(q: Assignment) {
    if (!profile) {
      setSignup(false);
      setAuth("student");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("start_quiz", {
        p_quiz_id: q.id,
      });
      if (error) throw error;
      // This clock read runs only in the asynchronous quiz-start click handler.
      // eslint-disable-next-line react-hooks/purity
      clockOffset.current = Date.parse(data.server_now) - Date.now();
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(data.deadline) - Date.parse(data.server_now)) / 1000,
          ),
        ),
      );
      setAttempt(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossible de démarrer ce quiz.",
      );
    } finally {
      setBusy(false);
    }
  }
  function answer(id: number, value: number) {
    if (!attempt || remaining <= 0 || busy) return;
    const attemptId = attempt.id;
    setAttempt({ ...attempt, answers: { ...attempt.answers, [id]: value } });
    pendingSaves.current += 1;
    setSaving(true);
    savingQueue.current = savingQueue.current
      .then(async () => {
        const { error } = await supabase.rpc("save_answer", {
          p_attempt_id: attemptId,
          p_question_id: id,
          p_answer: value,
        });
        if (error)
          setError(
            `Réponse non enregistrée : ${error.message}. Sélectionnez-la à nouveau.`,
          );
      })
      .catch(() =>
        setError("Connexion perdue. Sélectionnez à nouveau votre réponse."),
      )
      .finally(() => {
        pendingSaves.current -= 1;
        setSaving(pendingSaves.current > 0);
      });
  }
  async function save(q: Assignment) {
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("assigned_quizzes")
      .update({
        is_active: q.is_active,
        question_count: q.question_count,
        time_limit_minutes: q.time_limit_minutes,
      })
      .eq("id", q.id);
    if (error) setError(error.message);
    else
      setMessage(
        `Les paramètres du chapitre ${q.chapter_id} ont été enregistrés.`,
      );
    setBusy(false);
  }
  const teacher = profile?.role === "teacher",
    list = profile ? assignments : preview;
  const completed = new Set(
    scores.filter((s) => s.student_id === profile?.id).map((s) => s.quiz_id),
  );
  const visible = chapters
    .map((c, i) => ({
      c,
      q: list.find((q) => q.chapter_id === i + 1) || {
        id: `locked-${i}`,
        chapter_id: i + 1,
        is_active: false,
        question_count: 10,
        time_limit_minutes: 15,
      },
    }))
    .filter(
      ({ q }) =>
        filter === "all" ||
        (filter === "available" && q.is_active && !completed.has(q.id)) ||
        (filter === "done" && completed.has(q.id)),
    );
  const average = scores.length
    ? Math.round(
        scores.reduce((sum, s) => sum + Number(s.score), 0) / scores.length,
      )
    : 0;
  function navigate(next: string) {
    setView(next);
    setResult(null);
    setError("");
    setMessage("");
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={23} />
          </div>
          <div>
            merveille<span className="brand-dot">.</span>
            <small>LIRE · COMPRENDRE · GRANDIR</small>
          </div>
        </div>
        <p className="nav-label">
          MON ESPACE {teacher ? "ENSEIGNANT" : "ÉLÈVE"}
        </p>
        <nav className="nav">
          <button
            className={view === "chapters" ? "active" : ""}
            disabled={!!attempt}
            onClick={() => navigate("chapters")}
          >
            <LayoutDashboard size={18} />
            {teacher ? "Vue d’ensemble" : "Mes chapitres"}
          </button>
          <button
            className={view === "scores" ? "active" : ""}
            disabled={!!attempt}
            onClick={() => navigate("scores")}
          >
            <BarChart3 size={18} />
            {teacher ? "Résultats des élèves" : "Mes résultats"}
          </button>
          {teacher ? (
            <button
              className={view === "settings" ? "active" : ""}
              disabled={!!attempt}
              onClick={() => navigate("settings")}
            >
              <Settings size={18} />
              Gérer les quiz
            </button>
          ) : (
            <button
              onClick={() => {
                setAuth("teacher");
                setSignup(false);
              }}
              disabled={!!attempt}
            >
              <GraduationCap size={18} />
              Espace enseignant
            </button>
          )}
        </nav>
        <div className="sidebar-note">
          <Sparkles size={22} />
          <strong>Chaque page est une aventure.</strong>Prenez le temps de lire,
          de réfléchir et de vous émerveiller.
          <div className="note-line" />
          Ahmed Sefrioui · 1954
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Mon espace <ChevronRight size={12} />
            <b>
              {view === "scores"
                ? "Résultats"
                : view === "settings"
                  ? "Paramètres"
                  : "Mes chapitres"}
            </b>
          </div>
          <div className="account">
            {profile ? (
              <>
                <span className="avatar">
                  {profile.first_name[0]}
                  {profile.last_name[0]}
                </span>
                <div>
                  <strong>
                    {profile.first_name} {profile.last_name}
                  </strong>
                  <small>
                    {teacher ? "Enseignant" : "Élève · 1ère année Bac"}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Se déconnecter"
                  disabled={!!attempt}
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("chapters");
                  }}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    setSignup(false);
                    setAuth("student");
                  }}
                >
                  Se connecter
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setSignup(true);
                    setAuth("student");
                  }}
                >
                  Créer mon compte <ArrowRight size={13} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="notice">
              {message}
            </div>
          )}
          {!configured && (
            <div className="notice">
              <Info size={14} /> Aperçu de la plateforme · Configurez Supabase
              pour activer les comptes, les quiz et les résultats.
            </div>
          )}
          {loading ? (
            <div className="empty">
              <Loader2 className="spin" />
              Chargement de votre espace…
            </div>
          ) : attempt ? (
            <section className="quiz-panel">
              <div className="quiz-head">
                <div>
                  <div className="eyebrow">Votre quiz</div>
                  <h2>Chapitre {attempt.chapter_id}</h2>
                  <p>
                    {Object.keys(attempt.answers).length} /{" "}
                    {attempt.questions.length} réponses
                  </p>
                </div>
                <div className="timer" role="timer" aria-label="Temps restant">
                  <Clock size={17} />
                  {Math.floor(remaining / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(remaining % 60).toString().padStart(2, "0")}
                </div>
              </div>
              <div className="notice">
                Vos réponses sont enregistrées au fur et à mesure. Le quiz sera
                envoyé automatiquement à la fin du temps imparti.
              </div>
              {attempt.questions.map((q, i) => (
                <fieldset
                  className="question"
                  key={q.id}
                  disabled={busy || remaining <= 0}
                >
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((option, index) => (
                    <label key={index} className="option">
                      <input
                        type="radio"
                        name={`question-${q.id}`}
                        checked={attempt.answers[q.id] === index}
                        onChange={() => answer(q.id, index)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button
                className="primary"
                disabled={busy || saving}
                onClick={() => void submit()}
              >
                {busy
                  ? "Envoi en cours…"
                  : saving
                    ? "Enregistrement…"
                    : "Terminer et envoyer"}
                <ArrowRight size={14} />
              </button>
            </section>
          ) : result ? (
            <section className="quiz-panel result">
              <CheckCircle2 size={40} />
              <h2>Quiz terminé !</h2>
              <p>Une nouvelle étape dans votre lecture.</p>
              <strong>
                {Math.round(result.score)}
                <small>%</small>
              </strong>
              <p>
                {result.correct_count} bonnes réponses sur{" "}
                {result.question_count}
              </p>
              <button
                className="primary"
                onClick={() => {
                  setResult(null);
                  navigate("scores");
                }}
              >
                Voir mes résultats <ArrowRight size={14} />
              </button>
            </section>
          ) : (
            <>
              <div className="welcome">
                <div>
                  <div className="eyebrow">LA LECTURE OUVRE DES MONDES</div>
                  <h1>
                    {teacher
                      ? "Votre classe, en un regard."
                      : `Bonjour${profile ? `, ${profile.first_name}` : ""} ${teacher ? "" : "☀"}`}
                  </h1>
                  <p>
                    {teacher
                      ? "Accompagnez vos élèves, un chapitre à la fois."
                      : "Prêt à poursuivre votre voyage dans l’univers d’Ahmed Sefrioui ?"}
                  </p>
                </div>
                <div className="date">
                  <CalendarDays size={14} />
                  {dateLabel || "Votre espace de lecture"}
                </div>
              </div>
              {view === "chapters" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="pill">
                        <BookOpen size={11} /> AU FIL DES CHAPITRES
                      </span>
                      <h2>La Boîte à Merveilles</h2>
                      <p>
                        Entrez dans les souvenirs de Sidi Mohamed, entre les
                        ruelles de Fès, les rêves d’enfance et les petits
                        trésors du quotidien.
                      </p>
                      <div className="hero-meta">
                        <span>
                          <BookOpen size={13} />
                          12 chapitres à explorer
                        </span>
                        <span>
                          <GraduationCap size={14} />
                          1ère année Baccalauréat
                        </span>
                      </div>
                    </div>
                    <div className="book-art" aria-hidden="true">
                      <span className="spark" style={{ top: 0, right: 25 }}>
                        ✧
                      </span>
                      <span className="spark" style={{ bottom: 0, left: 5 }}>
                        ✦
                      </span>
                      <div className="book">
                        <span>AHMED SEFRIOUI</span>
                        <b>
                          La Boîte
                          <br />à Merveilles
                        </b>
                        <Sparkles size={23} />
                      </div>
                    </div>
                  </section>
                  <div className="stats">
                    <div className="stat">
                      <div className="stat-icon">
                        <BookOpen size={21} />
                      </div>
                      <div>
                        <strong>
                          {teacher ? students.length : completed.size}
                        </strong>
                        <small>{teacher ? "élèves" : "/ 12"}</small>
                        <p>
                          {teacher ? "Élèves inscrits" : "Chapitres terminés"}
                        </p>
                      </div>
                    </div>
                    <div className="stat">
                      <div className="stat-icon">
                        <CheckCircle2 size={21} />
                      </div>
                      <div>
                        <strong>
                          {profile
                            ? list.filter(
                                (q) => q.is_active && !completed.has(q.id),
                              ).length
                            : "—"}
                        </strong>
                        <p>Quiz disponibles</p>
                      </div>
                    </div>
                    <div className="stat">
                      <div className="stat-icon">
                        <BarChart3 size={21} />
                      </div>
                      <div>
                        <strong>{scores.length ? `${average}%` : "—"}</strong>
                        <p>
                          {teacher
                            ? "Moyenne de la classe"
                            : "Ma moyenne générale"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="section-head">
                    <div>
                      <h2>Vos chapitres</h2>
                      <p>
                        À chaque chapitre, un nouveau regard sur l’histoire.
                      </p>
                    </div>
                    <div
                      className="filters"
                      role="group"
                      aria-label="Filtrer les chapitres"
                    >
                      {[
                        ["all", "Tous les chapitres"],
                        ["available", "Disponibles"],
                        ["done", "Terminés"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={filter === key ? "selected" : ""}
                          onClick={() => setFilter(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="chapters">
                    {visible.map(({ c, q }) => {
                      const done = completed.has(q.id);
                      return (
                        <article className="chapter" key={q.chapter_id}>
                          <div className="chapter-top">
                            <div className="chapter-number">
                              {String(q.chapter_id).padStart(2, "0")}
                            </div>
                            <span
                              className={`badge ${done ? "done" : q.is_active ? "" : "locked"}`}
                            >
                              {done ? (
                                <CheckCircle2 size={10} />
                              ) : q.is_active ? (
                                <span>●</span>
                              ) : (
                                <Lock size={10} />
                              )}{" "}
                              {done
                                ? "Terminé"
                                : q.is_active
                                  ? "Disponible"
                                  : "Verrouillé"}
                            </span>
                          </div>
                          <div className="chapter-body">
                            <div className="chapter-label">
                              CHAPITRE {q.chapter_id}
                            </div>
                            <h3>{c[0]}</h3>
                            <p>{c[1]}</p>
                            <div className="chapter-meta">
                              <span>
                                <FileQuestion size={12} />
                                {q.is_active
                                  ? `${q.question_count} questions`
                                  : "À venir"}
                              </span>
                              <span>
                                <Clock size={12} />
                                {q.is_active
                                  ? `${q.time_limit_minutes} min`
                                  : "—"}
                              </span>
                            </div>
                            {teacher ? (
                              <button
                                className="secondary"
                                onClick={() => navigate("settings")}
                              >
                                Configurer le quiz <Settings size={12} />
                              </button>
                            ) : done ? (
                              <button
                                className="secondary"
                                onClick={() => navigate("scores")}
                              >
                                Voir mon résultat <BarChart3 size={13} />
                              </button>
                            ) : q.is_active ? (
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => void handleStartQuiz(q)}
                              >
                                Commencer le quiz <ArrowRight size={13} />
                              </button>
                            ) : (
                              <button className="secondary" disabled>
                                <Lock size={12} />
                                En attente de votre enseignant
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {visible.length === 0 && (
                    <div className="empty">
                      Aucun chapitre dans cette catégorie.
                    </div>
                  )}
                  <p className="footnote">
                    <ShieldCheck size={13} />
                    Les quiz sont débloqués par votre enseignant, au rythme de
                    votre classe.
                  </p>
                </>
              )}
              {view === "scores" && (
                <>
                  <div className="section-head">
                    <div>
                      <h2>
                        {teacher ? "Résultats de la classe" : "Mes résultats"}
                      </h2>
                      <p>
                        {teacher
                          ? "Tous les élèves, y compris ceux qui n’ont pas encore passé de quiz."
                          : "Retrouvez votre progression et vos scores enregistrés."}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        profile
                          ? refresh(profile).catch((e) => setError(e.message))
                          : setAuth("student")
                      }
                    >
                      Actualiser
                    </button>
                  </div>
                  {!profile ? (
                    <div className="empty">
                      Connectez-vous pour retrouver vos résultats.
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {teacher && <th>Élève</th>}
                            <th>Chapitre</th>
                            <th>Bonnes réponses</th>
                            <th>Score</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scores.map((s) => {
                            const student = students.find(
                              (p) => p.id === s.student_id,
                            );
                            return (
                              <tr key={s.id}>
                                {teacher && (
                                  <td>
                                    {student
                                      ? `${student.first_name} ${student.last_name}`
                                      : "Élève"}
                                  </td>
                                )}
                                <td>Chapitre {s.chapter_id}</td>
                                <td>
                                  {s.correct_count} / {s.question_count}
                                </td>
                                <td>
                                  <span className="badge done">{s.score}%</span>
                                </td>
                                <td>
                                  {new Date(s.created_at).toLocaleDateString(
                                    "fr-FR",
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {teacher &&
                            students
                              .filter(
                                (p) =>
                                  !scores.some((s) => s.student_id === p.id),
                              )
                              .map((p) => (
                                <tr key={p.id}>
                                  <td>
                                    {p.first_name} {p.last_name}
                                  </td>
                                  <td colSpan={4}>Aucun quiz terminé</td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                      {!scores.length && !students.length && (
                        <div className="empty">
                          Les résultats apparaîtront ici après un premier quiz.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {view === "settings" && teacher && (
                <>
                  <div className="section-head">
                    <div>
                      <h2>Un parcours à votre rythme</h2>
                      <p>
                        Activez un chapitre et définissez le nombre exact de
                        questions et la durée.
                      </p>
                    </div>
                  </div>
                  <div className="notice">
                    Les paramètres s’appliquent aux nouvelles tentatives. Une
                    tentative commencée conserve ses questions et son échéance.
                  </div>
                  {assignments.map((q) => (
                    <div className="setting-row" key={q.id}>
                      <h3>
                        Chapitre {q.chapter_id}
                        <small>{chapters[q.chapter_id - 1][0]}</small>
                      </h3>
                      <label>
                        Nombre de questions
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={q.question_count}
                          onChange={(e) =>
                            setAssignments(
                              assignments.map((a) =>
                                a.id === q.id
                                  ? {
                                      ...a,
                                      question_count: Number(e.target.value),
                                    }
                                  : a,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Durée (minutes)
                        <input
                          type="number"
                          min={1}
                          max={180}
                          value={q.time_limit_minutes}
                          onChange={(e) =>
                            setAssignments(
                              assignments.map((a) =>
                                a.id === q.id
                                  ? {
                                      ...a,
                                      time_limit_minutes: Number(
                                        e.target.value,
                                      ),
                                    }
                                  : a,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Disponible
                        <input
                          type="checkbox"
                          checked={q.is_active}
                          onChange={(e) =>
                            setAssignments(
                              assignments.map((a) =>
                                a.id === q.id
                                  ? { ...a, is_active: e.target.checked }
                                  : a,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          !Number.isInteger(q.question_count) ||
                          !Number.isInteger(q.time_limit_minutes) ||
                          q.question_count < 1 ||
                          q.time_limit_minutes < 1
                        }
                        onClick={() => void save(q)}
                      >
                        Enregistrer
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </main>
      {auth && (
        <div className="overlay">
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            className="modal"
          >
            <div className="modal-head">
              <span className="pill">
                {auth === "teacher" ? (
                  <GraduationCap size={14} />
                ) : (
                  <BookOpen size={14} />
                )}{" "}
                {auth === "teacher" ? "ESPACE ENSEIGNANT" : "ESPACE ÉLÈVE"}
              </span>
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => {
                  setAuth(null);
                  setError("");
                }}
              >
                <X size={19} />
              </button>
            </div>
            <h2 id="auth-title">
              {signup
                ? "Votre aventure commence ici."
                : "Heureux de vous retrouver."}
            </h2>
            <p>
              {auth === "teacher"
                ? "Connectez-vous avec votre compte enseignant."
                : "Votre prénom, votre nom et un mot de passe suffisent."}
            </p>
            {error && (
              <div role="alert" className="notice error">
                {error}
              </div>
            )}
            <form className="form" onSubmit={authenticate}>
              {auth === "teacher" ? (
                <label>
                  Adresse e-mail
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="username"
                    autoFocus
                  />
                </label>
              ) : (
                <>
                  <label>
                    Prénom
                    <input
                      name="first_name"
                      required
                      maxLength={60}
                      autoComplete="given-name"
                      autoFocus
                    />
                  </label>
                  <label>
                    Nom
                    <input
                      name="last_name"
                      required
                      maxLength={60}
                      autoComplete="family-name"
                    />
                  </label>
                </>
              )}
              <label>
                Mot de passe
                <input
                  type="password"
                  name="password"
                  required
                  minLength={auth === "student" ? 10 : 6}
                  maxLength={128}
                  autoComplete={signup ? "new-password" : "current-password"}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Un instant…"
                  : signup
                    ? "Créer mon compte"
                    : "Se connecter"}
                <ArrowRight size={14} />
              </button>
            </form>
            {auth === "student" && (
              <button
                className="text-button"
                onClick={() => setSignup(!signup)}
              >
                {signup
                  ? "Déjà inscrit ? Se connecter"
                  : "Première visite ? Créer un compte"}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
