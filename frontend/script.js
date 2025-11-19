const API_BASE = "http://127.0.0.1:8000";

const form = document.getElementById("analysis-form");
const queryInput = document.getElementById("query");
const taskInput = document.getElementById("task");
const loadingIndicator = document.getElementById("loading-indicator");
const resultText = document.getElementById("result-text");
const sourcesContainer = document.getElementById("sources-container");
const taskPill = document.getElementById("task-pill");
const snapshotTask = document.getElementById("snapshot-task");
const snapshotDocs = document.getElementById("snapshot-docs");
const snapshotLatency = document.getElementById("snapshot-latency");
const insightsSources = document.getElementById("insights-sources");
const insightsScore = document.getElementById("insights-score");
const insightsHint = document.getElementById("insights-hint");

const setLoading = (state) => {
    loadingIndicator.style.display = state ? "flex" : "none";
};

document.addEventListener("DOMContentLoaded", () => {
    refreshDataFootnote();

    const taskButtons = document.querySelectorAll(".task-toggle-pill");
    taskButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            taskButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const value = btn.getAttribute("data-task");
            if (value && taskInput) {
                taskInput.value = value;
            }
        });
    });
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!queryInput.value || queryInput.value.length < 10) {
        form.classList.add("was-validated");
        return;
    }
    await runAnalysis();
});

form.addEventListener("reset", () => {
    form.classList.remove("was-validated");
    resultText.textContent = "Submit a question to see FinGPT's answer here.";
    sourcesContainer.innerHTML =
        '<div class="text-body-secondary small">No sources yet.</div>';
    taskPill.textContent = "—";
});

const runAnalysis = async () => {
    setLoading(true);
    resultText.textContent = "Generating answer…";
    const startedAt = performance.now();
    try {
        const response = await fetch(`${API_BASE}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: queryInput.value.trim(),
                task: taskInput.value,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Backend error");
        }

        const data = await response.json();
        const latencyMs = performance.now() - startedAt;

        const sources = data.sources || [];

        // Snapshot bar
        const activeTaskButton = document.querySelector(".task-toggle-pill.active");
        const taskLabel = activeTaskButton ? activeTaskButton.textContent.trim() : taskInput.value;
        taskPill.textContent = taskLabel;
        snapshotTask.textContent = taskLabel;
        snapshotDocs.textContent = String(sources.length);
        snapshotLatency.textContent = `${Math.round(latencyMs)} ms`;

        resultText.textContent = data.result || "No response from FinGPT.";
        renderSources(sources);
        renderInsights(sources);
    } catch (error) {
        resultText.textContent = `⚠️ ${error.message}`;
    } finally {
        setLoading(false);
    }
};

const renderSources = (sources) => {
    if (!sources.length) {
        sourcesContainer.innerHTML =
            '<div class="text-body-secondary small">Model response did not use stored context.</div>';
        return;
    }

    sourcesContainer.innerHTML = "";
    sources.forEach((source, index) => {
        const sourceType = (source.source || "data").toLowerCase();
        const label = (sourceType || "data").toUpperCase();
        const badgeClass =
            sourceType === "news"
                ? "source-badge source-badge-news"
                : sourceType === "stocks"
                ? "source-badge source-badge-stocks"
                : sourceType === "reports"
                ? "source-badge source-badge-reports"
                : "source-badge source-badge-default";

        const accordionItem = document.createElement("div");
        accordionItem.className = "accordion-item";
        const headerId = `source-${index}`;

        accordionItem.innerHTML = `
      <h2 class="accordion-header" id="heading-${headerId}">
        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
          data-bs-target="#collapse-${headerId}" aria-expanded="false" aria-controls="collapse-${headerId}">
          <span class="${badgeClass}">${label}</span>
          <span class="ms-1">${source.id}</span>
        </button>
      </h2>
      <div id="collapse-${headerId}" class="accordion-collapse collapse" aria-labelledby="heading-${headerId}"
        data-bs-parent="#sources-container">
        <div class="accordion-body">
          ${source.snippet}
          <div class="small mt-2 text-body-secondary">Score: ${source.score?.toFixed(3) || "N/A"}</div>
        </div>
      </div>
    `;
        sourcesContainer.appendChild(accordionItem);
    });
};

const renderInsights = (sources) => {
    if (!insightsSources || !insightsScore || !insightsHint) return;

    if (!sources.length) {
        insightsSources.innerHTML = "";
        insightsScore.textContent = "—";
        insightsHint.textContent = "Run an analysis to see structured insight here.";
        return;
    }

    const counts = { news: 0, stocks: 0, reports: 0, other: 0 };
    let scoreSum = 0;
    let scoreCount = 0;

    sources.forEach((s) => {
        const type = (s.source || "other").toLowerCase();
        if (type === "news") counts.news += 1;
        else if (type === "stocks") counts.stocks += 1;
        else if (type === "reports") counts.reports += 1;
        else counts.other += 1;

        if (typeof s.score === "number") {
            scoreSum += s.score;
            scoreCount += 1;
        }
    });

    const total = counts.news + counts.stocks + counts.reports + counts.other;

    const rows = [];
    const makeRow = (label, value) => {
        if (!value) return;
        const pct = total ? Math.round((value / total) * 100) : 0;
        rows.push(`
      <div class="metric-bar-row">
        <span class="metric-bar-label">${label}</span>
        <div class="metric-bar-track">
          <div class="metric-bar-fill" style="width: ${pct}%;"></div>
        </div>
        <span class="text-body-secondary small">${value}</span>
      </div>
    `);
    };

    makeRow("NEWS", counts.news);
    makeRow("STOCKS", counts.stocks);
    makeRow("REPORTS", counts.reports);
    makeRow("OTHER", counts.other);

    insightsSources.innerHTML = rows.join("");

    if (scoreCount) {
        const avg = scoreSum / scoreCount;
        insightsScore.textContent = avg.toFixed(3);
    } else {
        insightsScore.textContent = "N/A";
    }

    insightsHint.textContent = "Snapshot based on current retrieved context.";
};

const refreshDataFootnote = async () => {
    const docCountEl = document.getElementById("data-doc-count");
    if (!docCountEl) return;
    try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.documents_indexed === "number") {
            docCountEl.textContent = String(data.documents_indexed);
        }
    } catch {
        // silent
    }
};

