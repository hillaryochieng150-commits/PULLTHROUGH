
(() => {
  const $ = id => document.getElementById(id);
  let activeUser = null;
  let enquiries = [];
  let toastTimer;

  const today = () => new Date().toISOString().slice(0, 10);
  const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])
  );

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function openModal(id) {
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    $(id).classList.remove("open");
    $(id).setAttribute("aria-hidden", "true");
  }

  function showDashboard() {
    $("dashboardView").hidden = false;
    document.body.classList.add("dashboard-active");
    window.scrollTo(0, 0);
    renderDashboard();
  }

  function hideDashboard() {
    $("dashboardView").hidden = true;
    document.body.classList.remove("dashboard-active");
    window.scrollTo(0, 0);
  }

  function beginAuth(mode = "signup") {
    $("userName").value = "";
    $("userEmail").value = "";
    $("businessName").value = "";
    $("userPassword").value = "";
    $("authMode").value = mode;
    updateAuthFields();
    openModal("authModal");
  }

  function updateAuthFields() {
    const signup = $("authMode").value === "signup";
    $("userName").required = signup;
    $("userName").hidden = !signup;
    $("userName").previousElementSibling.hidden = !signup;
    $("businessName").hidden = !signup;
    $("businessName").previousElementSibling.hidden = !signup;
    $("userPassword").autocomplete = signup ? "new-password" : "current-password";
    $("modalTitle").textContent = signup
      ? "Create your PULLTHROUGH account"
      : "Sign in to PULLTHROUGH";
    $("authForm").querySelector('button[type="submit"]').textContent =
      signup ? "Create account ↗" : "Sign in ↗";
  }

  ["openLogin", "openSignup", "heroStart", "featureStart", "bottomStart"]
    .forEach(id => $(id)?.addEventListener("click", () =>
      beginAuth(id === "openLogin" ? "login" : "signup")
    ));

  $("closeAuth")?.addEventListener("click", () => closeModal("authModal"));
  $("authModal")?.addEventListener("click", e => {
    if (e.target === $("authModal")) closeModal("authModal");
  });
  $("authMode")?.addEventListener("change", updateAuthFields);
  $("mobileMenu")?.addEventListener("click", () =>
    document.querySelector(".nav-links")?.classList.toggle("mobile-open")
  );

  document.querySelectorAll(".nav-links a").forEach(a =>
    a.addEventListener("click", () =>
      document.querySelector(".nav-links")?.classList.remove("mobile-open")
    )
  );

  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();

    const name = $("userName").value.trim();
    const email = $("userEmail").value.trim();
    const business = $("businessName").value.trim() || "My business";
    const password = $("userPassword").value;
    const mode = $("authMode").value;
    const submit = $("authForm").querySelector('button[type="submit"]');

    if (typeof supabaseClient === "undefined") {
      toast("Supabase is not configured. Check supabase-config.js.");
      return;
    }

    if (!email || !password || (mode === "signup" && !name)) {
      toast("Please complete the required fields.");
      return;
    }

    submit.disabled = true;
    const oldText = submit.textContent;
    submit.textContent = "Please wait…";

    try {
      if (mode === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, business_name: business }
          }
        });

        if (error) throw error;

        if (data.session && data.user) {
          activeUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || name,
            business: data.user.user_metadata?.business_name || business
          };
          await loadEnquiries();
          closeModal("authModal");
          showDashboard();
          toast("Account created and signed in.");
        } else {
          closeModal("authModal");
          toast("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { data, error } =
          await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) throw error;

        activeUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email.split("@")[0],
          business: data.user.user_metadata?.business_name || "My business"
        };

        await loadEnquiries();
        closeModal("authModal");
        showDashboard();
        toast("Signed in successfully.");
      }
    } catch (error) {
      console.error("Authentication error:", error);
      toast(error.message || "Authentication failed. Please try again.");
    } finally {
      submit.disabled = false;
      submit.textContent = oldText;
    }
  });

  async function loadEnquiries() {
    const { data, error } = await supabaseClient
      .from("enquiries")
      .select("*")
      .order("follow_up_date", { ascending: true });

    if (error) throw error;

    enquiries = (data || []).map(row => ({
      id: String(row.id),
      name: row.customer_name || "",
      interest: row.product_interest || row.message || "",
      lastContact: row.last_contact || "",
      followUp: row.follow_up_date || "",
      status: row.status || "open",
      notes: row.notes || ""
    }));
  }

  $("exitDashboard").addEventListener("click", async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      activeUser = null;
      enquiries = [];
      hideDashboard();
      toast("You have signed out.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not sign out.");
    }
  });

  $("resetDemo")?.addEventListener("click", async () => {
    if (!activeUser || !confirm("Delete all your enquiries? This cannot be undone.")) return;
    try {
      const { error } = await supabaseClient
        .from("enquiries")
        .delete()
        .eq("user_id", activeUser.id);

      if (error) throw error;
      enquiries = [];
      renderDashboard();
      toast("Your enquiries have been deleted.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not delete enquiries.");
    }
  });

  document.querySelectorAll("[data-tab]").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );
  document.querySelectorAll("[data-jump]").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.jump))
  );

  function switchTab(tab) {
    document.querySelectorAll("[data-tab]").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab)
    );
    $("overviewPanel").hidden = tab !== "overview";
    $("enquiriesPanel").hidden = tab !== "enquiries";
    $("insightsPanel").hidden = tab !== "insights";
    renderDashboard();
  }

  function renderDashboard() {
    if (!activeUser) return;

    const items = enquiries;
    const open = items.filter(x => x.status === "open");
    const won = items.filter(x => x.status === "won");
    const lost = items.filter(x => x.status === "lost");
    const closed = won.length + lost.length;

    $("dashUserName").textContent = activeUser.name;
    $("dashBusinessName").textContent = activeUser.business;
    $("userInitial").textContent = (activeUser.name[0] || "Y").toUpperCase();
    $("dashHeading").textContent =
      `Good to see you, ${activeUser.name.split(" ")[0]}.`;

    $("metricTotal").textContent = items.length;
    $("metricDue").textContent =
      open.filter(x => x.followUp && x.followUp <= today()).length;
    $("metricWon").textContent = won.length;
    $("metricRate").textContent =
      closed ? Math.round(won.length / closed * 100) + "%" : "—";

    $("insightOpen").textContent = open.length;
    $("insightWon").textContent = won.length;
    $("insightLost").textContent = lost.length;

    const due = open.slice().sort((a, b) =>
      (a.followUp || "").localeCompare(b.followUp || "")
    );

    $("actionList").innerHTML = due.length
      ? due.slice(0, 5).map(itemHTML).join("")
      : emptyHTML("You're all caught up", "Add an enquiry to start your follow-up list.");

    $("allEnquiries").innerHTML = items.length
      ? items.slice().sort((a, b) =>
          (a.followUp || "").localeCompare(b.followUp || "")
        ).map(itemHTML).join("")
      : emptyHTML("No enquiries yet", "Add your first enquiry to begin.");

    document.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => editEnquiry(b.dataset.edit))
    );
    document.querySelectorAll("[data-delete]").forEach(b =>
      b.addEventListener("click", () => deleteEnquiry(b.dataset.delete))
    );
    document.querySelectorAll("[data-copy]").forEach(b =>
      b.addEventListener("click", () => copyDraft(b.dataset.copy))
    );
  }

  function emptyHTML(title, sub) {
    return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(sub)}</div>`;
  }

  function itemHTML(x) {
    const initials = x.name.split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
    return `<div class="enquiry-row">
      <div class="enquiry-avatar">${escapeHTML(initials)}</div>
      <div class="enquiry-details">
        <strong>${escapeHTML(x.name)} · ${escapeHTML(x.interest)}</strong>
        <span>Follow-up: ${escapeHTML(x.followUp || "Not set")} ${x.notes ? "· " + escapeHTML(x.notes) : ""}</span>
      </div>
      <span class="status-pill status-${escapeHTML(x.status)}">${escapeHTML(x.status)}</span>
      <div class="row-actions">
        <button data-copy="${escapeHTML(x.id)}">Draft</button>
        <button data-edit="${escapeHTML(x.id)}">Edit</button>
        <button data-delete="${escapeHTML(x.id)}">Delete</button>
      </div>
    </div>`;
  }

  $("addEnquiry").addEventListener("click", () => openEnquiryForm());
  $("addEnquiry2").addEventListener("click", () => openEnquiryForm());

  function openEnquiryForm(item = null) {
    $("enquiryForm").reset();
    $("enquiryId").value = item?.id || "";
    $("enquiryModalTitle").textContent = item ? "Edit enquiry" : "Add an enquiry";
    $("customerName").value = item?.name || "";
    $("productInterest").value = item?.interest || "";
    $("lastContact").value = item?.lastContact || today();
    $("followUpDate").value = item?.followUp || today();
    $("enquiryStatus").value = item?.status || "open";
    $("enquiryNotes").value = item?.notes || "";
    openModal("enquiryModal");
  }

  $("closeEnquiry").addEventListener("click", () => closeModal("enquiryModal"));
  $("enquiryModal").addEventListener("click", e => {
    if (e.target === $("enquiryModal")) closeModal("enquiryModal");
  });

  $("enquiryForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!activeUser) {
      toast("Please sign in first.");
      return;
    }

    const id = $("enquiryId").value;
    const item = {
      customer_name: $("customerName").value.trim(),
      product_interest: $("productInterest").value.trim(),
      last_contact: $("lastContact").value || null,
      follow_up_date: $("followUpDate").value || null,
      status: $("enquiryStatus").value,
      notes: $("enquiryNotes").value.trim() || null,
      user_id: activeUser.id
    };

    if (!item.customer_name || !item.product_interest) {
      toast("Add a customer and their interest.");
      return;
    }

    const submit = $("enquiryForm").querySelector('button[type="submit"]');
    submit.disabled = true;
    const oldText = submit.textContent;
    submit.textContent = "Saving…";

    try {
      const result = id
        ? await supabaseClient.from("enquiries").update(item)
            .eq("id", id).eq("user_id", activeUser.id)
        : await supabaseClient.from("enquiries").insert(item);

      if (result.error) throw result.error;

      await loadEnquiries();
      closeModal("enquiryModal");
      renderDashboard();
      toast(id ? "Enquiry updated online." : "Enquiry saved online.");
    } catch (error) {
      console.error("Save enquiry error:", error);
      toast(error.message || "Could not save enquiry.");
    } finally {
      submit.disabled = false;
      submit.textContent = oldText;
    }
  });

  function editEnquiry(id) {
    const item = enquiries.find(x => x.id === id);
    if (item) openEnquiryForm(item);
  }

  async function deleteEnquiry(id) {
    if (!activeUser || !confirm("Delete this enquiry? This cannot be undone.")) return;

    try {
      const { error } = await supabaseClient.from("enquiries")
        .delete().eq("id", id).eq("user_id", activeUser.id);

      if (error) throw error;
      await loadEnquiries();
      renderDashboard();
      toast("Enquiry deleted.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not delete enquiry.");
    }
  }

  function copyDraft(id) {
    const x = enquiries.find(i => i.id === id);
    if (!x) return;
    const msg = `Hi ${x.name.split(" ")[0]}, just checking in about ${x.interest}. If you have any questions or would like to go ahead, I'm happy to help. No pressure — let me know what works for you.`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg)
        .then(() => toast("Follow-up draft copied. Review before sending."))
        .catch(() => window.prompt("Copy this follow-up draft:", msg));
    } else {
      window.prompt("Copy this follow-up draft:", msg);
    }
  }

  async function restoreSession() {
    if (typeof supabaseClient === "undefined") {
      console.error("Supabase client missing. Check supabase-config.js.");
      return;
    }

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      const user = data.session?.user;
      if (!user) return;

      activeUser = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email.split("@")[0],
        business: user.user_metadata?.business_name || "My business"
      };

      await loadEnquiries();
      showDashboard();
    } catch (error) {
      console.error("Session restore error:", error);
      toast("Could not restore your session. Please sign in again.");
    }
  }

  $("year").textContent = new Date().getFullYear();
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal("authModal");
      closeModal("enquiryModal");
    }
  });

  restoreSession();
})();
