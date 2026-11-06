import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FlaskConical,
  LockKeyhole,
  Monitor,
  Moon,
  Play,
  RotateCcw,
  Sun,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import { ArtifactCharts } from "./Visuals";
import Visuals from "./Lab";
import { isPassed, layers, status } from "./types";
import type { Category, Paper, Problem, Report } from "./types";
import { PaperDetail, PaperLibrary, paperModules } from "./PaperViews";
import { collectionIdFromRoute, paperCollections, papersInCollection } from "./paperCollections";
import CollectionDetail from "./CollectionDetail";
import { parseReport } from "./reports";
import { useLocalJudge } from "./useLocalJudge";
import { jobErrorText } from "./judgeJobs";
import { localRequest } from "./localApi";
import { useLocalHealth } from "./useLocalHealth";
import { navigateToProblem, resolveAppLocation } from "./navigation";
import { LocaleProvider, useI18n } from "./i18n";
import { usePracticeWorkspace } from "./PracticeWorkspace";
import Brand from "./Brand";
import RepositoryLink from "./RepositoryLink";
import ResizableSplit from "./ResizableSplit";

const difficulty = (d: string) =>
  ({ E: "Easy", M: "Medium", H: "Hard" })[d] || d;
const editorFontSizes = [13, 14, 15, 16, 17, 18, 20];
type Theme = "light" | "dark";
type ThemePreference = Theme | "system";
function initialThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem("paperleet.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Browser storage can be unavailable in private or embedded contexts.
  }
  return "system";
}
function darkSchemeQuery() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return undefined;
  }
}
function systemTheme(): Theme {
  return darkSchemeQuery()?.matches ? "dark" : "light";
}
function initialEditorFontSize() {
  try {
    const saved = Number(localStorage.getItem("paperleet.editor.fontSize"));
    if (editorFontSizes.includes(saved)) return saved;
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
  return 15;
}
function getId() {
  const { route, canonicalUrl } = resolveAppLocation(location);
  if (canonicalUrl) history.replaceState(null, "", canonicalUrl);
  return route;
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function Highlight({
  code,
  lang = "python",
}: {
  code: string;
  lang?: string;
}) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let active = true;
    import("./highlight")
      .then(({ highlight }) => highlight(code, lang))
      .then((h) => {
        if (active) setHtml(h);
      })
      .catch(() => {
        if (active) setHtml("");
      });
    return () => {
      active = false;
    };
  }, [code, lang]);
  return html ? (
    <div className="highlight" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className="highlight">
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
export function Prose({
  content,
  problemId,
  onViz,
}: {
  content: string;
  problemId?: string;
  onViz?: () => void;
}) {
  const { t } = useI18n();
  const processed = content.replace(
    /<viz\s+id=["']([^"']+)["']\s*\/>/g,
    `[${t("打开交互实验", "Open interactive lab")}](#viz-$1)`,
  );
  function Link({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) {
    if (href?.startsWith("#viz-"))
      return (
        <button className="text-button inline-lab-link" onClick={onViz}>
          <FlaskConical size={13} />
          {children}
        </button>
      );
    if (href && /^https?:/.test(href))
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    if (href?.includes("README.md") && problemId) {
      const resolved = new URL(
        href,
        `http://localhost/problems/${problemId}/README.md`,
      ).pathname;
      const match = /\/problems\/([a-z_]+)\/([^/]+)\/README(?:\.en)?\.md$/.exec(
        resolved,
      );
      if (match) return <a href={`#/${match[1]}/${match[2]}`}>{children}</a>;
    }
    return <a href={href}>{children}</a>;
  }
  return (
    <div className="prose">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: Link,
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            return lang ? (
              <Highlight
                code={String(children).replace(/\n$/, "")}
                lang={lang}
              />
            ) : (
              <code {...props} className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {processed}
      </Markdown>
    </div>
  );
}
function ReportView({
  report,
  problem,
}: {
  report?: Report;
  problem: Problem;
}) {
  const { t, locale } = useI18n();
  const labels = t(
    "接口契约|参考对齐|数学性质|真实行为",
    "Contract|Reference|Properties|Behavior",
  ).split("|");
  if (!report)
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <FlaskConical size={28} />
        </div>
        <h3>{t("用测试验证你的实现", "Validate your implementation")}</h3>
        <p>
          {t(
            "在右侧编写代码，然后点击「运行全部测试」。",
            "Write your code on the right, then select Run all tests.",
          )}
          <br />
          {t(
            "测试结果和失败原因会直接显示在这里。",
            "Results and failure details will appear here.",
          )}
        </p>
      </div>
    );
  const passed = report.tests.filter((test) => test.passed).length,
    total = report.tests.length,
    allPassed = !report.error && total > 0 && passed === total;
  return (
    <div className="report-view">
      <div className={`result-head ${allPassed ? "success" : "failure"}`}>
        <div>
          {allPassed ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
          <h3>
            {report.error
              ? t("判题未完成", "Run incomplete")
              : isPassed(problem, report)
                ? "Accepted"
                : allPassed
                  ? t("所选测试通过", "Selected tests passed")
                  : t("需要再检查一下", "Tests need attention")}
          </h3>
        </div>
        <span>
          {passed} / {total} {t("项通过", "tests passed")}
        </span>
      </div>
      {report.error && <pre className="failure-message">{report.error}</pre>}
      <div className="report-meta">
        <span>{t("最近一次运行", "Latest run")}</span>
        <span>
          {report.created_at
            ? new Date(report.created_at).toLocaleString(
                locale === "zh" ? "zh-CN" : "en-US",
              )
            : ""}
        </span>
      </div>
      <div className="test-layers">
        {layers.map((l, i) => {
          const [a, b] = report.summary[l] || [0, 0];
          return (
            <div key={l}>
              <div>
                <b>{l}</b>
                <span>
                  {a}/{b}
                </span>
              </div>
              <small>{labels[i]}</small>
              <div className="mini-progress">
                <i style={{ width: `${b ? (a / b) * 100 : 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {report.tests.map((test, i) => (
        <details
          key={`${test.nodeid || test.id}-${i}`}
          className={`test-detail ${test.passed ? "passed" : "failed"}`}
          open={!test.passed}
        >
          <summary>
            {test.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <span>{test.id}</span>
            <b>{test.layer}</b>
            <small>{(test.duration_s || 0).toFixed(2)}s</small>
          </summary>
          <div className="test-body">
            <p className="test-why">
              <b>{t("为什么检查这个性质", "Why this property matters")}</b>
              {test.why ||
                t("见本题测试说明。", "See the problem's test specification.")}
            </p>
            {test.message && (
              <pre className="failure-message">{test.message}</pre>
            )}
            {test.artifacts && Object.keys(test.artifacts).length > 0 && (
              <ArtifactCharts data={test.artifacts} />
            )}
          </div>
        </details>
      ))}
      {report.mutation && (
        <section className="mutation">
          <h4>{t("错误变体检查", "Mutation checks")}</h4>
          {Object.entries(report.mutation).map(([id, caught]) => (
            <div key={id}>
              <b>
                {caught.length ? "✓" : "×"} {id}
              </b>
              <span>
                {caught.length
                  ? caught.join(", ")
                  : t("当前测试未捕获", "Not caught by current tests")}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
export default function App() {
  return (
    <LocaleProvider>
      <Workspace />
    </LocaleProvider>
  );
}
function Workspace() {
  const { locale, setLocale, t } = useI18n();
  const practice = usePracticeWorkspace();
  const { saved, update } = practice;
  const { online, refresh: refreshHealth } = useLocalHealth();
  const [problems, setProblems] = useState<Problem[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [papers, setPapers] = useState<Paper[]>([]),
    [loadError, setLoadError] = useState(""),
    [id, setId] = useState(getId),
    [tab, setTab] = useState("description"),
    [rightTab, setRightTab] = useState("code"),
    [toast, setToast] = useState(""),
    [font, setFont] = useState(initialEditorFontSize),
    [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference),
    [preferredSystemTheme, setPreferredSystemTheme] = useState<Theme>(systemTheme);
  const theme = themePreference === "system" ? preferredSystemTheme : themePreference;
  const sourceProblem = problems.find(
    (p) => p.id === id || String(p.number) === id,
  );
  const localize = (p: Problem): Problem =>
    locale === "en" && p.translations?.en ? { ...p, ...p.translations.en } : p;
  const problem = sourceProblem ? localize(sourceProblem) : undefined;
  const activeProblem = useRef(problem?.id);
  activeProblem.current = problem?.id;
  const collectionId = collectionIdFromRoute(id);
  const selectedCollection = paperCollections.find((collection) => collection.id === collectionId);
  useEffect(() => {
    document.title = selectedCollection
      ? `${t(selectedCollection.name, selectedCollection.name_en)} - PaperLeet Offline`
      : collectionId !== undefined ? `${t("合集未找到", "Collection not found")} - PaperLeet Offline` : "PaperLeet Offline";
  }, [collectionId, selectedCollection, locale]);
  const collectionModules = selectedCollection
    ? papersInCollection(papers, selectedCollection).flatMap((paper) => paperModules(paper, problems))
    : [];
  const current = problem ? saved[problem.id] || {} : {};
  const selectedPaper = papers.find((paper) =>
    problem ? paper.id === problem.paper_id : id === `papers/${paper.id}`,
  );
  const siblingModules = selectedPaper
    ? paperModules(selectedPaper, problems)
    : sourceProblem
      ? [sourceProblem]
      : [];
  const moduleIndex = siblingModules.findIndex((p) => p.id === problem?.id);
  function loadCatalog() {
    return fetch(
      `${import.meta.env.BASE_URL}data/catalog.json?v=${Date.now()}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            t(
              "无法加载本机题库。请运行 make dev 或重新导出题库。",
              "The local catalog is unavailable. Run make dev or export the catalog again.",
            ),
          );
        return r.json();
      })
      .then((data) => {
        setProblems(Array.isArray(data) ? data : data.problems);
        const loadedPapers: Paper[] = Array.isArray(data.papers) ? [...data.papers] : [];
        // Shuffle on catalog load, keeping the order stable during browsing and filtering.
        for (let i = loadedPapers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [loadedPapers[i], loadedPapers[j]] = [loadedPapers[j], loadedPapers[i]];
        }
        setPapers(loadedPapers);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message));
  }
  useEffect(() => {
    void loadCatalog();
    const h = () => {
      setId(getId());
      setTab("description");
      setRightTab("code");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#1a1a1a" : "#ffffff",
    );
  }, [theme]);
  useEffect(() => {
    if (themePreference !== "system") return;
    // Follow live OS appearance changes, such as scheduled dark mode at sunset.
    const media = darkSchemeQuery();
    if (!media) return;
    const sync = () => setPreferredSystemTheme(media.matches ? "dark" : "light");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [themePreference]);
  function selectTheme(nextTheme: ThemePreference) {
    setThemePreference(nextTheme);
    try {
      if (nextTheme === "system") localStorage.removeItem("paperleet.theme");
      else localStorage.setItem("paperleet.theme", nextTheme);
    } catch {
      // Theme selection still works for this session without browser storage.
    }
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const judge = useLocalJudge((report) => {
    const tested = problems.find((item) => item.id === report.problem);
    if (!tested) return;
    practice.applyReport(tested, report);
    if (tested.id === problem?.id) setTab("tests");
    setToast(t("本机测试已完成", "Local run complete"));
  }, problems.length > 0);
  const running = judge.active;
  async function run() {
    if (!problem || running || !online) return;
    // Preserve the exact editor snapshot before handing it to local Python.
    const code = current.code ?? problem.starter;
    update(problem.id, { code });
    await judge.submit(problem.id, code);
  }
  async function loadLocalFile() {
    if (!problem) return;
    try {
      const data = await localRequest(`/api/workspace?problem=${encodeURIComponent(problem.id)}`, { signal: AbortSignal.timeout(10000) }) as { problem: string; code: string | null; report: unknown };
      if (activeProblem.current !== problem.id) return;
      if (data.problem !== problem.id || (data.code !== null && typeof data.code !== "string")) throw Error("Invalid workspace response");
      if (data.code === null) {
        setToast(t("这道题还没有本机文件。运行测试会保存文件。", "No local file exists for this module yet. Running tests saves one."));
        return;
      }
      if (data.code !== (practice.getSaved(problem.id).code ?? problem.starter) && !window.confirm(t("用本机 workspace 文件替换当前编辑器草稿？如需保留当前代码，请先下载。", "Replace this editor draft with the local workspace file? Download the current code first if you want to keep it."))) return;
      update(problem.id, { code: data.code });
      if (data.report) {
        try {
          const report = parseReport(data.report);
          if (report.problem === problem.id) practice.applyReport(problem, report);
        } catch { /* A malformed report must never prevent loading the source. */ }
      }
      setToast(t("已载入本机文件", "Local file loaded"));
    } catch {
      setToast(t("无法读取本机文件，请确认本机服务正在运行。当前草稿未改变。", "Could not read the local file. Check that the local service is running. Your draft is unchanged."));
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(t("已复制", "Copied"));
    } catch {
      setToast(
        t(
          "剪贴板不可用，请手动复制。",
          "Clipboard unavailable. Please copy manually.",
        ),
      );
    }
  }
  const tabs = [
    ["description", t("题目", "Description")],
    ["explanation", t("讲解", "Explanation")],
    ["lab", t("实验", "Lab")],
    ["tests", t("测试", "Tests")],
    ["notes", t("坑点", "Notes")],
    ["solution", t("参考解", "Solution")],
  ];
  const webReadme = problem?.readme.replace(
    /##\s*6[.、．]?\s*(?:怎么运行|编写与运行|Write and run|Running)[^\n]*\n[\s\S]*?(?=\n##\s*7|$)/,
    `## 6. ${t("编写与运行", "Write and run")}\n\n${t("在右侧完成实现，点击「运行全部测试」，由本机 Python / PyTorch 使用 CPU 执行。草稿、最近结果和通过状态保存在当前浏览器；运行时的代码与报告也会写入本机文件。", "Implement the module and select Run all tests to execute Python / PyTorch on your own CPU. Drafts, latest results and completion are saved in this browser; each run also writes its source and report to local files.")}\n`,
  );
  return (
    <div className={`app ${problem ? "workspace-view" : ""}`}>
      <header className="topbar">
        <div className="nav-inner">
          <Brand />
          <nav>
            <a
              className={!problem ? "active" : ""}
              href="/"
            >
              {t("论文题库", "Papers")}
            </a>
            <button
              className={`continue-link ${problem ? "active" : ""}`}
              disabled={!problem && (!practice.ready || practice.loading || !problems.length || (collectionId !== undefined && !selectedCollection))}
              onClick={() => {
                if (!problem && practice.ready && !practice.loading) {
                  const next = collectionId !== undefined
                    ? collectionModules.find((p) => status(p, saved[p.id]) !== "done") || collectionModules[0]
                    : selectedPaper
                    ? siblingModules.find((p) => !p.module.optional && status(p, saved[p.id]) !== "done") || siblingModules[0]
                    : problems.filter((p) => status(p, saved[p.id]) === "started")
                        .sort((a, b) => (saved[b.id]?.updated || "").localeCompare(saved[a.id]?.updated || ""))[0]
                      || problems[0];
                  if (next) navigateToProblem(next.number);
                }
              }}
            >
              {problem ? t("工作区", "Workspace") : t("继续练习", "Continue")}
            </button>
          </nav>
          <div className="nav-actions">
            <RepositoryLink />
            <button
              className="language-toggle"
              aria-label={t("切换到英文", "Switch to Chinese")}
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            >
              <span className={locale === "zh" ? "selected" : ""}>中</span>
              <i>/</i>
              <span className={locale === "en" ? "selected" : ""}>EN</span>
            </button>
            <div
              className="theme-switcher"
              role="group"
              aria-label={t("外观", "Appearance")}
            >
              <button
                type="button"
                className={themePreference === "light" ? "selected" : ""}
                aria-label={t("浅色主题", "Light theme")}
                aria-pressed={themePreference === "light"}
                title={t("浅色主题", "Light theme")}
                onClick={() => selectTheme("light")}
              >
                <Sun size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={themePreference === "dark" ? "selected" : ""}
                aria-label={t("深色主题", "Dark theme")}
                aria-pressed={themePreference === "dark"}
                title={t("深色主题", "Dark theme")}
                onClick={() => selectTheme("dark")}
              >
                <Moon size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={themePreference === "system" ? "selected" : ""}
                aria-label={t("跟随系统", "Match system")}
                aria-pressed={themePreference === "system"}
                title={t("跟随系统", "Match system")}
                onClick={() => selectTheme("system")}
              >
                <Monitor size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>
      {judge.active && <p className="local-job-notice" role="status">{judge.reconnecting
        ? t("正在重新连接本机任务…", "Reconnecting to the local run…")
        : judge.job?.status === "queued"
          ? t(`正在等待本机 CPU，前面还有 ${judge.job.ahead} 个任务。`, `Waiting for the local CPU: ${judge.job.ahead} job(s) ahead.`)
          : t("本机 CPU 正在运行测试；可以继续编辑，结果对应点击运行时的代码。", "Your CPU is running tests. You can keep editing; results belong to the code you ran.")}</p>}
      {loadError ? (
        <main className="load-error">
          <Terminal size={35} />
          <h2>{t("题库暂时不可用", "Catalog unavailable")}</h2>
          <p>{loadError}</p>
          <button className="button" onClick={loadCatalog}>
            {t("重新加载", "Reload")}
          </button>
        </main>
      ) : !problems.length ? (
        <main className="loading">
          <span className="spinner" />
          {t("正在加载论文题库…", "Loading papers…")}
        </main>
      ) : !problem ? (
        selectedPaper ? (
          <PaperDetail
            paper={selectedPaper}
            problems={problems}
            saved={saved}
          />
        ) : collectionId !== undefined ? (
          <CollectionDetail
            key={collectionId}
            collectionId={collectionId}
            progressReady={practice.ready && !practice.loading}
            papers={papers}
            problems={problems}
            saved={saved}
          />
        ) : (
          <PaperLibrary
            progressReady={practice.ready && !practice.loading}
            categories={categories}
            papers={papers}
            problems={problems}
            saved={saved}
          />
        )
      ) : (
        <>
          <div className="workspace-toolbar">
            <a
              className="back-link"
              href={selectedPaper ? `#/papers/${selectedPaper.id}` : "#"}
            >
              <ArrowLeft size={15} />
              {selectedPaper
                ? `${selectedPaper.number}. ${selectedPaper.short_title}`
                : t("论文题库", "Papers")}
            </a>
            <span className="toolbar-divider" />
            <b>
              {problem.number}. {problem.title}
            </b>
            <div className="problem-navigation">
              <button
                className="icon-button"
                aria-label={t("上一个模块", "Previous module")}
                disabled={moduleIndex <= 0}
                onClick={() =>
                  (location.hash = `/${siblingModules[moduleIndex - 1].number}`)
                }
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                {moduleIndex + 1} / {siblingModules.length}
              </span>
              <button
                className="icon-button"
                aria-label={t("下一个模块", "Next module")}
                disabled={moduleIndex >= siblingModules.length - 1}
                onClick={() =>
                  (location.hash = `/${siblingModules[moduleIndex + 1].number}`)
                }
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <ResizableSplit
            as="main"
            className="workspace"
            axis="horizontal"
            storageKey="paperleet.layout.workspace.v1"
            initial={0.5}
            minFirst={320}
            minSecond={360}
            collapseAt={850}
            label={t("调整题面与代码区宽度", "Resize description and code panels")}
            resetLabel={t("拖动或使用方向键调整，双击或按 Enter 恢复默认", "Drag or use arrow keys to resize; double-click or press Enter to reset")}
            firstId="problem-description-panel"
            secondId="problem-editor-panel"
          >
            <section className="description-pane" id="problem-description-panel">
              <div className="pane-tabs">
                {tabs.map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? "selected" : ""}
                    onClick={() => setTab(key)}
                  >
                    {key === "description" ? (
                      <FileCode2 size={14} />
                    ) : key === "lab" ? (
                      <FlaskConical size={14} />
                    ) : key === "notes" &&
                      status(problem, current) !== "done" ? (
                      <LockKeyhole size={12} />
                    ) : null}
                    {label}
                    {key === "tests" && current.report && (
                      <i
                        className={
                          isPassed(problem, current.report)
                            ? "green-dot"
                            : "yellow-dot"
                        }
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="description-scroll" key={problem.id}>
                {tab === "tests" ? (
                  <ReportView report={current.report} problem={problem} />
                ) : tab === "lab" ? (
                  <Visuals key={problem.id} problem={problem} report={current.report} />
                ) : tab === "notes" ? (
                  status(problem, current) !== "done" ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <LockKeyhole size={25} />
                      </div>
                      <h3>
                        {t(
                          "通过测试后解锁坑点",
                          "Pass the tests to unlock notes",
                        )}
                      </h3>
                      <p>
                        {t(
                          "完成全部测试后，查看论文与常见实现之间的细节差异。",
                          "Complete every test to explore subtle differences between the paper and common implementations.",
                        )}
                      </p>
                      <button
                        className="button"
                        onClick={() => setTab("tests")}
                      >
                        {t("查看测试进度", "View test progress")}{" "}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <Prose
                      content={problem.notes}
                      problemId={problem.id}
                      onViz={() => setTab("lab")}
                    />
                  )
                ) : tab === "solution" ? (
                  <section className="solution-panel">
                    <h2>{t("参考实现", "Reference implementation")}</h2>
                    <p>
                      {t(
                        "建议先用测试结果定位问题，再对照参考解。",
                        "Use test results to find the issue before checking the reference.",
                      )}
                    </p>
                    <details>
                      <summary>
                        <BookOpen size={16} />
                        {t(
                          "展开参考解（包含答案）",
                          "Reveal reference solution (spoilers)",
                        )}
                      </summary>
                      {problem.solution ? (
                        <Highlight code={problem.solution} />
                      ) : (
                        <div className="notice">
                          {t(
                            "参考实现尚未提供。",
                            "No reference implementation is available yet.",
                          )}
                        </div>
                      )}
                    </details>
                  </section>
                ) : (
                  <>
                    <div className="problem-heading">
                      <div className="heading-kicker">
                        <FileCode2 size={18} />
                        <span>
                          {t("模块", "MODULE")} {problem.number}
                        </span>
                        {status(problem, current) === "done" && (
                          <span className="accepted">
                            <CheckCircle2 size={14} />
                            {t("已通过", "Solved")}
                          </span>
                        )}
                      </div>
                      <h1>
                        {problem.number}. {problem.title}
                      </h1>
                      <div className="heading-tags">
                        <span className={`difficulty ${problem.difficulty}`}>
                          {difficulty(problem.difficulty)}
                        </span>
                        <span>PyTorch</span>
                        <span>{problem.estimated_minutes || 25} min</span>
                        {problem.parent && (
                          <a
                            href={`#/${problems.find((p) => p.id === problem.parent)?.number || problem.parent}`}
                          >
                            {t("前置题", "Prerequisite")}:{" "}
                            {problems.find((p) => p.id === problem.parent)
                              ?.number || "—"}
                          </a>
                        )}
                      </div>
                    </div>
                    <a
                      className="paper-card"
                      href={
                        problem.paper?.url ||
                        `https://arxiv.org/abs/${problem.paper?.arxiv}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <BookOpen size={19} />
                      <div>
                        <small>
                          {t("阅读论文", "READ THE PAPER")}{" "}
                          <span>{problem.paper?.venue}</span>
                        </small>
                        <strong>{problem.paper?.title}</strong>
                        <p>
                          {Array.isArray(problem.paper?.authors)
                            ? problem.paper.authors.join(", ")
                            : problem.paper?.authors}
                        </p>
                      </div>
                      <ExternalLink size={14} />
                    </a>
                    {problem.module && (
                      <section className="module-scope-card">
                        <h3>{t("本模块的目标", "Your implementation goal")}</h3>
                        <p>{t(problem.module.goal, problem.module.goal_en)}</p>
                        <p className="module-scope-detail">
                          {t(problem.module.scope, problem.module.scope_en)}
                        </p>
                        <div className="module-functions">
                          <span>{t("需要实现", "Implement")}</span>
                          {problem.module.required_functions.map((name) => (
                            <code key={name}>{name}</code>
                          ))}
                        </div>
                        {!!problem.module.provided_functions.length && (
                          <div className="module-functions provided-functions">
                            <span>{t("已提供", "Provided")}</span>
                            {problem.module.provided_functions.map((name) => (
                              <code key={name}>{name}</code>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                    {tab === "explanation" && (
                      <Visuals key={problem.id} problem={problem} report={current.report} />
                    )}
                    {locale === "en" && !problem.translations?.en && (
                      <div className="notice">
                        English problem content is not available yet. The
                        original text appears below.
                      </div>
                    )}
                    <Prose
                      content={webReadme || ""}
                      problemId={problem.id}
                      onViz={() => setTab("lab")}
                    />
                    {tab === "description" && (
                      <button
                        className="lab-callout"
                        onClick={() => setTab("lab")}
                      >
                        <FlaskConical size={21} />
                        <span>
                          <b>{problem.vizData?.kind === "toy_experiment" ? t("查看核心算法实验", "Explore the core experiment") : t("把公式放进实验台", "Explore the formulas")}</b>
                          <small>
                            {problem.vizData?.kind === "toy_experiment" ? t("对比参考实现与自己的运行结果", "Compare the reference with your run results") : t(
                              "调整参数，观察结果怎样变化",
                              "Adjust parameters and see what changes",
                            )}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="editor-pane" id="problem-editor-panel">
              <div className="pane-tabs editor-tabs">
                <button
                  className={rightTab === "code" ? "selected" : ""}
                  onClick={() => setRightTab("code")}
                >
                  <Code2 size={15} />
                  {t("代码", "Code")}
                </button>
                <button
                  className={rightTab === "lab" ? "selected" : ""}
                  onClick={() => setRightTab("lab")}
                >
                  <FlaskConical size={14} />
                  {t("实验台", "Lab")}
                </button>
                <span className="editor-language">Python 3 · PyTorch</span>
              </div>
              {rightTab === "lab" ? (
                <div className="editor-lab">
                  <Visuals key={problem.id} problem={problem} report={current.report} />
                </div>
              ) : (
                <>
                  <ResizableSplit
                    className="editor-split"
                    axis="vertical"
                    storageKey="paperleet.layout.editor.v1"
                    initial={0.72}
                    minFirst={180}
                    minSecond={100}
                    label={t("调整代码与测试结果区高度", "Resize code and test results panels")}
                    resetLabel={t("拖动或使用方向键调整，双击或按 Enter 恢复默认", "Drag or use arrow keys to resize; double-click or press Enter to reset")}
                    firstId="problem-code-panel"
                    secondId="problem-results-panel"
                  >
                  <div className="editor-code-panel" id="problem-code-panel">
                  <div className="editor-tools">
                    <span>
                      <FileCode2 size={13} />
                      solution.py
                    </span>
                    <div>
                      <button className="text-button" disabled={!online} onClick={loadLocalFile} title={t("读取 workspace 中的本机文件", "Read the workspace file on this computer")}>
                        {t("载入本机文件", "Load local file")}
                      </button>
                      <label className="editor-font-size">
                        <span aria-hidden="true">Aa</span>
                        <select
                          className="editor-font-size-select"
                          value={font}
                          title={t("代码字号", "Code font size")}
                          aria-label={t("代码字号", "Code font size")}
                          onChange={(event) => {
                            const size = Number(event.target.value);
                            setFont(size);
                            try {
                              localStorage.setItem(
                                "paperleet.editor.fontSize",
                                String(size),
                              );
                            } catch {
                              // Keep the selected size for this session.
                            }
                          }}
                        >
                          {editorFontSizes.map((size) => (
                            <option key={size} value={size}>{size} px</option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="icon-button"
                        title={t("复制代码", "Copy code")}
                        aria-label={t("复制代码", "Copy code")}
                        onClick={() => copy(current.code ?? problem.starter)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title={t("下载实现", "Download code")}
                        aria-label={t("下载实现", "Download code")}
                        onClick={() =>
                          download(
                            `problem-${problem.number}.py`,
                            current.code ?? problem.starter,
                          )
                        }
                      >
                        <ArrowDownToLine size={14} />
                      </button>
                      <button
                        className="icon-button"
                        title={t("恢复初始代码", "Restore starter")}
                        aria-label={t("恢复初始代码", "Restore starter")}
                        onClick={() => {
                          if ((current.code ?? problem.starter) !== problem.starter && !window.confirm(t("恢复初始代码会替换当前草稿。已通过状态和最近测试结果会保留。继续？", "Restore the starter and replace this draft? Completion and the latest test results will be kept."))) return;
                          update(problem.id, { code: problem.starter });
                          setToast(t("已恢复初始代码", "Starter restored"));
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="code-editor">
                    <CodeMirror
                      key={problem.id}
                      readOnly={!practice.ready}
                      value={current.code ?? problem.starter}
                      height="100%"
                      theme={theme === "dark" ? "dark" : "light"}
                      extensions={[python()]}
                      onChange={(value) => update(problem.id, { code: value })}
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: true,
                        highlightActiveLine: true,
                        autocompletion: true,
                      }}
                      style={{ fontSize: font }}
                      aria-label={`${problem.title} ${t("Python 代码编辑器", "Python code editor")}`}
                    />
                  </div>
                  <div className={`editor-status ${practice.error ? "error" : ""}`} title={t("草稿和通过状态保存在当前浏览器；不同浏览器或端口相互独立。清除浏览器数据会移除记录。运行时的代码与报告另存本机文件。", "Drafts and completion stay in this browser, separately for each browser and port. Clearing browser data removes them. Each run also saves local source and report files.")}>
                    <span>
                      <Check size={12} />
                      {practice.error
                        ? t("未能保存到浏览器，请下载代码", "Browser save failed · download your code")
                        : current.code !== undefined
                          ? t("已自动保存在此浏览器", "Saved automatically in this browser")
                          : t("初始代码 · 本机 CPU", "Starter code · local CPU")}
                    </span>
                    <span>
                      UTF-8 <i>·</i> Python
                    </span>
                  </div>
                  </div>
                  <div className="editor-results-panel" id="problem-results-panel">
                  {(practice.error || judge.error || !online) && (
                    <div className="practice-notice" role="status">
                      <span>{practice.error
                        ? t("浏览器存储不可用或已满。代码仍在当前页面，请下载代码后再关闭或刷新。", "Browser storage is unavailable or full. Your code is still on this page. Download it before closing or refreshing.")
                        : judge.error ? jobErrorText(judge.error, locale)
                        : t("请启动本机服务（make dev），然后重试连接。草稿可以继续编辑。", "Start the local service (make dev), then retry the connection. You can keep editing your draft.")}</span>
                      <button onClick={practice.error ? practice.retry : refreshHealth}>{t("重试", "Retry")}</button>
                    </div>
                  )}
                  {judge.reconnecting && <div className="practice-notice" role="status">{t("连接中断，正在重新获取本机任务状态；不会重复运行代码。", "Reconnecting to the local job; your code will not run twice.")}</div>}
                  {current.report?.workspace_preserved && <div className="practice-notice" role="status">
                    {t("本机 workspace 文件在排队期间发生了修改，已保留该文件；本次测试使用的代码已另存到本机。", "The local workspace file changed while this run was queued. That file was kept, and the tested code was saved separately on this computer.")}
                  </div>}
                  <div className="console">
                    <div className="console-header">
                      <span>
                        <Terminal size={14} />
                        {t("测试结果", "Test results")}
                      </span>
                      {current.report && (
                        <button
                          className="text-button"
                          onClick={() => setTab("tests")}
                        >
                          {t("查看详情", "View details")}{" "}
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                    <p>
                      {running
                        ? t(
                            "本机 CPU 正在执行测试，结果将自动显示。",
                            "Your CPU is running the tests. Results will appear automatically.",
                          )
                        : current.report
                          ? `${current.report.tests.filter((test) => test.passed).length} / ${current.report.tests.length} ${t("项测试通过。修改代码后可再次运行。", "tests passed. Edit your code and run again.")}`
                          : t(
                              "完成实现后，点击下方按钮运行测试。",
                              "Complete the implementation, then run the tests below.",
                            )}
                    </p>
                  </div>
                  </div>
                  </ResizableSplit>
                  <div className="editor-bottom">
                    {judge.job?.status === "queued" && <button className="text-button" onClick={() => void judge.cancel()}>{t("取消排队", "Cancel queued run")}</button>}
                    <span className="editor-run-status" role="status">
                      {running ? (
                        <>
                          <span className="spinner" />
                          {t("正在判题…", "Running tests…")}
                        </>
                      ) : online ? (
                        <>
                          <i className="green-dot" />
                          {t("本机 CPU 已连接", "Local CPU ready")}
                        </>
                      ) : (
                        <>
                          <i className="yellow-dot" />
                          {t("本机服务未连接", "Local service offline")}
                        </>
                      )}
                    </span>
                    <button
                      className="button run-button"
                      disabled={running || !online}
                      onClick={run}
                    >
                      <Play size={15} fill="currentColor" />
                      {running
                        ? t("运行中", "Running")
                        : t("运行全部测试", "Run all tests")}
                    </button>
                  </div>
                </>
              )}
            </section>
          </ResizableSplit>
        </>
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label={t("关闭提示", "Dismiss notification")}
            onClick={() => setToast("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
