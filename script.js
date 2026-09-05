/* =========================================================
   Canopy — personal budgeting app
   All state lives in localStorage. No frameworks, no backend.
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "canopyBudgetData";

  const CATEGORIES = {
    income: [
      { id: "salary", label: "Salary", icon: "💼" },
      { id: "freelance", label: "Freelance", icon: "🧑‍💻" },
      { id: "gift", label: "Gift", icon: "🎁" },
      { id: "other", label: "Other", icon: "✨" },
    ],
    spending: [
      { id: "food", label: "Food", icon: "🍽️" },
      { id: "transport", label: "Transport", icon: "🚗" },
      { id: "housing", label: "Housing", icon: "🏠" },
      { id: "entertainment", label: "Entertainment", icon: "🎬" },
      { id: "utilities", label: "Utilities", icon: "💡" },
      { id: "health", label: "Health", icon: "🩺" },
      { id: "shopping", label: "Shopping", icon: "🛍️" },
      { id: "other", label: "Other", icon: "✨" },
    ],
  };

  const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", CAD: "$", JPY: "¥" };
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const DEFAULT_STATE = {
    transactions: [],
    settings: { savingsPercent: 25, currency: "USD", savingsGoal: 500, theme: "dark" },
  };

  /* ---------------------------------------------------------
     State persistence
  --------------------------------------------------------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneSafe(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings || {}),
      };
    } catch (e) {
      console.warn("Canopy: couldn't read saved data, starting fresh.", e);
      return structuredCloneSafe(DEFAULT_STATE);
    }
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  /* ---------------------------------------------------------
     Date / month helpers
  --------------------------------------------------------- */
  function pad2(n) { return String(n).padStart(2, "0"); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function monthKeyOf(isoDate) {
    return isoDate.slice(0, 7); // "YYYY-MM"
  }

  function currentRealMonthKey() {
    return monthKeyOf(todayISO());
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    const name = MONTH_NAMES[m - 1];
    const nowYear = new Date().getFullYear();
    return y === nowYear ? name : `${name} ${y}`;
  }

  function allMonthKeys() {
    const set = new Set(state.transactions.map((t) => monthKeyOf(t.date)));
    set.add(currentRealMonthKey());
    return Array.from(set).sort(); // ISO-ish strings sort chronologically
  }

  function shiftMonthKey(key, delta) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  /* ---------------------------------------------------------
     Money helpers
  --------------------------------------------------------- */
  function currencySymbol() {
    return CURRENCY_SYMBOLS[state.settings.currency] || "$";
  }

  function formatMoney(amount) {
    const symbol = currencySymbol();
    const decimals = state.settings.currency === "JPY" ? 0 : 2;
    const sign = amount < 0 ? "-" : "";
    const value = Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${sign}${symbol}${value}`;
  }

  /* ---------------------------------------------------------
     Core budgeting calculations
  --------------------------------------------------------- */
  function transactionsForMonth(key) {
    return state.transactions.filter((t) => monthKeyOf(t.date) === key);
  }

  function roundMoney(amount) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function computeSummary(key) {
    const txs = transactionsForMonth(key);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const spending = txs.filter((t) => t.type === "spending").reduce((s, t) => s + t.amount, 0);
    const moneyLeft = roundMoney(income - spending);
    const rate = state.settings.savingsPercent / 100;
    // Round the projected savings to the nearest cent first, then derive the
    // remainder from that rounded figure so the numbers on screen always add up.
    const projectedSavings = moneyLeft > 0 ? roundMoney(moneyLeft * rate) : 0;
    const remaining = roundMoney(moneyLeft - projectedSavings);
    return { income: roundMoney(income), spending: roundMoney(spending), moneyLeft, projectedSavings, remaining };
  }

  function totalSavings() {
    return allMonthKeys().reduce((sum, key) => sum + computeSummary(key).projectedSavings, 0);
  }

  /* ---------------------------------------------------------
     App / view state
  --------------------------------------------------------- */
  let viewMonth = currentRealMonthKey();
  let historyFilter = "all";
  let pendingTxType = "spending";

  /* ---------------------------------------------------------
     DOM references
  --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    screens: $$(".screen"),
    navItems: $$(".nav-item, .bn-item"),
    screenLinks: $$("[data-screen-link]"),

    monthTitle: $("#dashTitle"),
    prevMonth: $("#prevMonth"),
    nextMonth: $("#nextMonth"),
    statusBanner: $("#statusBanner"),
    statusDot: $("#statusDot"),
    statusMessage: $("#statusMessage"),
    statIncome: $("#statIncome"),
    statSpent: $("#statSpent"),
    statSavings: $("#statSavings"),
    statSafe: $("#statSafe"),
    rateDisplay: $("#rateDisplay"),
    trendChart: $("#trendChart"),
    recentTxList: $("#recentTxList"),

    historySubMonth: $("#historySubMonth"),
    filterRow: $("#filterRow"),
    historyTxList: $("#historyTxList"),
    historyEmpty: $("#historyEmpty"),

    totalSavingsValue: $("#totalSavingsValue"),
    thisMonthSavingsSub: $("#thisMonthSavingsSub"),
    goalCurrent: $("#goalCurrent"),
    goalTarget: $("#goalTarget"),
    goalProgressFill: $("#goalProgressFill"),
    growthChart: $("#growthChart"),
    savingsHistoryList: $("#savingsHistoryList"),

    savingsPercentInput: $("#savingsPercentInput"),
    savingsPercentValue: $("#savingsPercentValue"),
    currencyInput: $("#currencyInput"),
    goalInput: $("#goalInput"),
    goalPrefix: $("#goalPrefix"),
    clearDataBtn: $("#clearDataBtn"),

    modalOverlay: $("#modalOverlay"),
    modalClose: $("#modalClose"),
    txForm: $("#txForm"),
    txAmount: $("#txAmount"),
    txCurrencyPrefix: $("#txCurrencyPrefix"),
    txDescription: $("#txDescription"),
    txCategory: $("#txCategory"),
    txDate: $("#txDate"),
    typeOptions: $$(".type-option"),

    confirmOverlay: $("#confirmOverlay"),
    cancelClear: $("#cancelClear"),
    confirmClear: $("#confirmClear"),

    toast: $("#toast"),

    sideAddBtn: $("#sideAddBtn"),
    mobileAddBtn: $("#mobileAddBtn"),
  };

  /* ---------------------------------------------------------
     Screen navigation
  --------------------------------------------------------- */
  function switchScreen(name) {
    els.screens.forEach((s) => s.classList.toggle("is-active", s.id === `screen-${name}`));
    els.navItems.forEach((n) => n.classList.toggle("is-active", n.dataset.screen === name));
    if (name === "history") renderHistory();
    if (name === "savings") renderSavings();
    if (name === "settings") renderSettings();
    if (name === "dashboard") renderDashboard();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  els.navItems.forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.screen));
  });
  els.screenLinks.forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.screenLink));
  });

  /* ---------------------------------------------------------
     Dashboard rendering
  --------------------------------------------------------- */
  function renderDashboard() {
    const months = allMonthKeys();
    const idx = months.indexOf(viewMonth);
    els.prevMonth.disabled = idx <= 0;
    els.nextMonth.disabled = idx >= months.length - 1;

    els.monthTitle.textContent = monthLabel(viewMonth).toUpperCase();

    const { income, spending, projectedSavings, remaining } = computeSummary(viewMonth);
    els.statIncome.textContent = formatMoney(income);
    els.statSpent.textContent = formatMoney(spending);
    els.statSavings.textContent = formatMoney(projectedSavings);
    els.statSafe.textContent = formatMoney(remaining);
    els.rateDisplay.textContent = `${state.settings.savingsPercent}%`;

    renderStatus(income, spending);
    renderTrendChart();
    renderRecentActivity();
  }

  function renderStatus(income, spending) {
    els.statusDot.classList.remove("is-warn", "is-bad");
    if (income === 0 && spending === 0) {
      els.statusMessage.textContent = "Add a transaction to see how your month is shaping up.";
      return;
    }
    if (spending > income) {
      els.statusDot.classList.add("is-bad");
      els.statusMessage.textContent = "⚠️ You've spent more than you've made this month.";
      return;
    }
    const ratio = income > 0 ? spending / income : 0;
    if (ratio >= 0.75) {
      els.statusDot.classList.add("is-warn");
      els.statusMessage.textContent = "🍂 Watch your spending — you're getting close to your limit.";
    } else if (ratio >= 0.5) {
      els.statusMessage.textContent = "🌱 You're on track this month.";
    } else {
      els.statusMessage.textContent = "🌿 Great start! You're spending much less than you're making.";
    }
  }

  function renderRecentActivity() {
    const recent = [...state.transactions]
      .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
      .slice(0, 5);

    els.recentTxList.innerHTML = "";
    if (recent.length === 0) {
      els.recentTxList.innerHTML = `<li class="empty-state" style="padding:24px 4px;">
        <div class="empty-icon">🍃</div><p>Nothing logged yet.</p></li>`;
      return;
    }
    recent.forEach((t) => els.recentTxList.appendChild(txRow(t)));
  }

  /* ---------------------------------------------------------
     History rendering
  --------------------------------------------------------- */
  function renderHistory() {
    els.historySubMonth.textContent = monthLabel(viewMonth);
    let txs = transactionsForMonth(viewMonth);
    if (historyFilter !== "all") txs = txs.filter((t) => t.type === historyFilter);
    txs = [...txs].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

    els.historyTxList.innerHTML = "";
    if (txs.length === 0) {
      els.historyEmpty.hidden = false;
    } else {
      els.historyEmpty.hidden = true;
      txs.forEach((t) => els.historyTxList.appendChild(txRow(t)));
    }
  }

  $$(".filter-chip", els.filterRow).forEach((chip) => {
    chip.addEventListener("click", () => {
      historyFilter = chip.dataset.filter;
      $$(".filter-chip", els.filterRow).forEach((c) => c.classList.toggle("is-active", c === chip));
      renderHistory();
    });
  });

  function txRow(t) {
    const cat = (CATEGORIES[t.type] || []).find((c) => c.id === t.category) || { icon: "✨", label: t.category || "Other" };
    const li = document.createElement("li");
    li.className = `tx-row ${t.type === "income" ? "is-income" : "is-spending"}`;
    const dateObj = new Date(t.date + "T00:00:00");
    const dateStr = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    li.innerHTML = `
      <div class="tx-icon">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escapeHTML(t.description)}</div>
        <div class="tx-meta">${escapeHTML(cat.label)} · ${dateStr}</div>
      </div>
      <div class="tx-amount">${t.type === "income" ? "+" : "-"}${formatMoney(t.amount)}</div>
      <button class="tx-delete" aria-label="Delete transaction" data-id="${t.id}">✕</button>
    `;
    li.querySelector(".tx-delete").addEventListener("click", () => deleteTransaction(t.id));
    return li;
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function deleteTransaction(id) {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    saveState();
    renderDashboard();
    renderHistory();
    renderSavings();
    showToast("Transaction deleted");
  }

  /* ---------------------------------------------------------
     Month navigation
  --------------------------------------------------------- */
  els.prevMonth.addEventListener("click", () => {
    const months = allMonthKeys();
    const idx = months.indexOf(viewMonth);
    if (idx > 0) { viewMonth = months[idx - 1]; renderDashboard(); }
  });
  els.nextMonth.addEventListener("click", () => {
    const months = allMonthKeys();
    const idx = months.indexOf(viewMonth);
    if (idx < months.length - 1) { viewMonth = months[idx + 1]; renderDashboard(); }
  });

  /* ---------------------------------------------------------
     Savings screen
  --------------------------------------------------------- */
  function renderSavings() {
    const total = totalSavings();
    els.totalSavingsValue.textContent = formatMoney(total);
    const thisMonth = computeSummary(currentRealMonthKey()).projectedSavings;
    els.thisMonthSavingsSub.textContent = `+${formatMoney(thisMonth)} projected this month`;

    const goal = Number(state.settings.savingsGoal) || 0;
    els.goalCurrent.textContent = formatMoney(total);
    els.goalTarget.textContent = formatMoney(goal);
    const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
    els.goalProgressFill.style.width = `${pct}%`;

    renderGrowthChart();

    const months = allMonthKeys().slice().reverse(); // newest first
    els.savingsHistoryList.innerHTML = "";
    const withData = months.filter((m) => transactionsForMonth(m).length > 0);
    if (withData.length === 0) {
      els.savingsHistoryList.innerHTML = `<li style="border:none; justify-content:center; color: var(--text-faint);">No savings history yet.</li>`;
    } else {
      withData.forEach((key) => {
        const amt = computeSummary(key).projectedSavings;
        const li = document.createElement("li");
        li.innerHTML = `<span class="sh-month">${monthLabel(key)}</span><span class="sh-amount">+${formatMoney(amt)}</span>`;
        els.savingsHistoryList.appendChild(li);
      });
    }
  }

  /* ---------------------------------------------------------
     Settings screen
  --------------------------------------------------------- */
  function renderSettings() {
    els.savingsPercentInput.value = state.settings.savingsPercent;
    els.savingsPercentValue.textContent = `${state.settings.savingsPercent}%`;
    els.currencyInput.value = state.settings.currency;
    els.goalInput.value = state.settings.savingsGoal;
    els.goalPrefix.textContent = currencySymbol();
    $$(".toggle-option").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.theme === state.settings.theme));
  }

  els.savingsPercentInput.addEventListener("input", () => {
    const val = Number(els.savingsPercentInput.value);
    els.savingsPercentValue.textContent = `${val}%`;
    state.settings.savingsPercent = val;
    saveState();
    renderDashboard();
  });

  els.currencyInput.addEventListener("change", () => {
    state.settings.currency = els.currencyInput.value;
    saveState();
    els.goalPrefix.textContent = currencySymbol();
    els.txCurrencyPrefix.textContent = currencySymbol();
    renderDashboard();
    renderSavings();
  });

  els.goalInput.addEventListener("input", () => {
    state.settings.savingsGoal = Number(els.goalInput.value) || 0;
    saveState();
    renderSavings();
  });

  $$(".toggle-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.theme = btn.dataset.theme;
      saveState();
      applyTheme();
      renderSettings();
    });
  });

  function applyTheme() {
    document.body.classList.toggle("theme-dark", state.settings.theme !== "light");
    document.body.classList.toggle("theme-light", state.settings.theme === "light");
    const meta = document.getElementById("themeColorMeta");
    if (meta) {
      meta.setAttribute("content", state.settings.theme === "light" ? "#F6F2E4" : "#0B1E14");
    }
  }

  els.clearDataBtn.addEventListener("click", () => { els.confirmOverlay.hidden = false; });
  els.cancelClear.addEventListener("click", () => { els.confirmOverlay.hidden = true; });
  els.confirmClear.addEventListener("click", () => {
    state = structuredCloneSafe(DEFAULT_STATE);
    saveState();
    viewMonth = currentRealMonthKey();
    applyTheme();
    els.confirmOverlay.hidden = true;
    switchScreen("dashboard");
    showToast("All data cleared");
  });

  /* ---------------------------------------------------------
     Add-transaction modal
  --------------------------------------------------------- */
  function populateCategoryOptions() {
    const list = CATEGORIES[pendingTxType];
    els.txCategory.innerHTML = list.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
  }

  function openModal() {
    pendingTxType = "spending";
    els.typeOptions.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.type === "spending"));
    populateCategoryOptions();
    els.txAmount.value = "";
    els.txDescription.value = "";
    els.txDate.value = todayISO();
    els.txCurrencyPrefix.textContent = currencySymbol();
    els.modalOverlay.hidden = false;
    setTimeout(() => els.txAmount.focus(), 50);
  }

  function closeModal() { els.modalOverlay.hidden = true; }

  els.sideAddBtn.addEventListener("click", openModal);
  els.mobileAddBtn.addEventListener("click", openModal);
  els.modalClose.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (e) => { if (e.target === els.modalOverlay) closeModal(); });

  els.typeOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingTxType = btn.dataset.type;
      els.typeOptions.forEach((b) => b.classList.toggle("is-active", b === btn));
      populateCategoryOptions();
    });
  });

  els.txForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Math.round(Number(els.txAmount.value) * 100) / 100;
    if (!amount || amount <= 0) { showToast("Enter an amount greater than zero"); return; }
    const description = els.txDescription.value.trim() || "Untitled";
    const category = els.txCategory.value;
    const date = els.txDate.value || todayISO();

    const tx = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: pendingTxType,
      amount,
      description,
      category,
      date,
    };
    state.transactions.push(tx);
    saveState();
    closeModal();

    // jump the dashboard view to the month the new transaction belongs to
    viewMonth = monthKeyOf(date);
    renderDashboard();
    renderHistory();
    renderSavings();
    showToast(pendingTxType === "income" ? "Income added" : "Expense added");
  });

  /* ---------------------------------------------------------
     Toast
  --------------------------------------------------------- */
  let toastTimer = null;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("is-visible");
      setTimeout(() => { els.toast.hidden = true; }, 260);
    }, 2200);
  }

  /* ---------------------------------------------------------
     Charts — hand-built SVG, no dependencies
  --------------------------------------------------------- */
  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function renderTrendChart() {
    const months = allMonthKeys().slice(-6);
    const hasAny = months.some((m) => transactionsForMonth(m).length > 0);
    els.trendChart.innerHTML = "";
    if (!hasAny) {
      els.trendChart.innerHTML = `<div class="chart-empty">Your income vs. spending trend will appear here once you log a few transactions.</div>`;
      return;
    }

    const W = 600, H = 200, padBottom = 26, padTop = 10;
    const groupW = W / months.length;
    const barW = Math.min(20, groupW / 3.4);

    const maxVal = Math.max(1, ...months.map((m) => {
      const s = computeSummary(m);
      return Math.max(s.income, s.spending);
    }));

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Income versus spending by month" });
    const styleGreen = getComputedStyle(document.body).getPropertyValue("--moss").trim();
    const styleCoral = getComputedStyle(document.body).getPropertyValue("--coral").trim();
    const styleFaint = getComputedStyle(document.body).getPropertyValue("--text-faint").trim();

    months.forEach((m, i) => {
      const s = computeSummary(m);
      const cx = groupW * i + groupW / 2;
      const usableH = H - padBottom - padTop;

      const incomeH = (s.income / maxVal) * usableH;
      const spendH = (s.spending / maxVal) * usableH;

      svg.appendChild(svgEl("rect", {
        x: cx - barW - 2, y: H - padBottom - incomeH, width: barW, height: Math.max(incomeH, 1),
        rx: 4, fill: styleGreen,
      }));
      svg.appendChild(svgEl("rect", {
        x: cx + 2, y: H - padBottom - spendH, width: barW, height: Math.max(spendH, 1),
        rx: 4, fill: styleCoral,
      }));

      const label = svgEl("text", {
        x: cx, y: H - 6, "text-anchor": "middle", "font-size": "11", fill: styleFaint, "font-family": "var(--font-body)",
      });
      label.textContent = monthLabel(m).slice(0, 3);
      svg.appendChild(label);
    });

    els.trendChart.appendChild(svg);
    appendLegend(els.trendChart, [
      { color: styleGreen, label: "Income" },
      { color: styleCoral, label: "Spending" },
    ]);
  }

  function renderGrowthChart() {
    const months = allMonthKeys();
    const withData = months.filter((m) => transactionsForMonth(m).length > 0);
    els.growthChart.innerHTML = "";
    if (withData.length === 0) {
      els.growthChart.innerHTML = `<div class="chart-empty">Your savings growth will appear here once you log a few months of activity.</div>`;
      return;
    }

    let cumulative = 0;
    const points = withData.map((m) => {
      cumulative += computeSummary(m).projectedSavings;
      return { key: m, value: cumulative };
    });

    const W = 600, H = 200, padBottom = 26, padTop = 16, padSide = 8;
    const maxVal = Math.max(1, ...points.map((p) => p.value));
    const stepX = points.length > 1 ? (W - padSide * 2) / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const x = padSide + stepX * i;
      const y = H - padBottom - (p.value / maxVal) * (H - padBottom - padTop);
      return { x, y, ...p };
    });

    const gold = getComputedStyle(document.body).getPropertyValue("--gold").trim();
    const goldDeep = getComputedStyle(document.body).getPropertyValue("--gold-deep").trim();
    const faint = getComputedStyle(document.body).getPropertyValue("--text-faint").trim();

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cumulative savings growth over time" });

    const gradId = "growthFill";
    const defs = svgEl("defs", {});
    const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    const stop1 = svgEl("stop", { offset: "0%", "stop-color": gold, "stop-opacity": "0.35" });
    const stop2 = svgEl("stop", { offset: "100%", "stop-color": gold, "stop-opacity": "0" });
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    coords.slice(1).forEach((c) => { linePath += ` L ${c.x} ${c.y}`; });

    let areaPath = linePath + ` L ${coords[coords.length - 1].x} ${H - padBottom} L ${coords[0].x} ${H - padBottom} Z`;

    svg.appendChild(svgEl("path", { d: areaPath, fill: `url(#${gradId})`, stroke: "none" }));
    svg.appendChild(svgEl("path", { d: linePath, fill: "none", stroke: goldDeep, "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" }));

    coords.forEach((c, i) => {
      svg.appendChild(svgEl("circle", { cx: c.x, cy: c.y, r: 4, fill: gold }));
      if (i === 0 || i === coords.length - 1 || coords.length <= 6) {
        const label = svgEl("text", {
          x: c.x, y: H - 6, "text-anchor": i === 0 ? "start" : (i === coords.length - 1 ? "end" : "middle"),
          "font-size": "11", fill: faint,
        });
        label.textContent = monthLabel(c.key).slice(0, 3);
        svg.appendChild(label);
      }
    });

    els.growthChart.appendChild(svg);
  }

  function appendLegend(container, items) {
    const legend = document.createElement("div");
    legend.style.display = "flex";
    legend.style.gap = "16px";
    legend.style.marginTop = "10px";
    legend.style.justifyContent = "center";
    items.forEach((item) => {
      const el = document.createElement("span");
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.gap = "6px";
      el.style.fontSize = "0.78rem";
      el.style.color = "var(--text-lo)";
      el.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${item.color};display:inline-block;"></span>${item.label}`;
      legend.appendChild(el);
    });
    container.appendChild(legend);
  }

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  function registerServiceWorker() {
    // Requires the app to be served over HTTPS (or localhost) — file:// pages skip this quietly.
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Canopy: service worker registration failed.", e));
    }
  }

  function init() {
    applyTheme();
    els.txDate.value = todayISO();
    renderDashboard();
    renderSettings();
    registerServiceWorker();
  }

  init();
})();
