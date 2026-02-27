/* ═══════════════════════════════════════════════════════════
   questionDB.js — IndexedDB Knowledge Base for M1 Questions & Personas
   Xtrusio Growth Engine · Persistent local storage
   ═══════════════════════════════════════════════════════════ */

const DB_NAME = "xtrusio-m1";
const DB_VERSION = 2;

// ── Open / Create Database ──────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Store: AI-generated questions
      if (!db.objectStoreNames.contains("questions")) {
        const qs = db.createObjectStore("questions", { keyPath: "id" });
        qs.createIndex("company", "company", { unique: false });
        qs.createIndex("persona", "persona", { unique: false });
        qs.createIndex("stage", "stage", { unique: false });
        qs.createIndex("classification", "classification", { unique: false });
        qs.createIndex("generatedAt", "generatedAt", { unique: false });
      }
      // Store: Company research cache
      if (!db.objectStoreNames.contains("companyIntel")) {
        db.createObjectStore("companyIntel", { keyPath: "companyKey" });
      }
      // Store: Macro question bank (industry-wide, seen across companies)
      if (!db.objectStoreNames.contains("macroBank")) {
        const mb = db.createObjectStore("macroBank", { keyPath: "dedupHash" });
        mb.createIndex("timesGenerated", "timesGenerated", { unique: false });
      }
      // Store: Persona profiles (v2) — decision maker profiles for research & M4 bridge
      if (!db.objectStoreNames.contains("personas")) {
        const ps = db.createObjectStore("personas", { keyPath: "id" });
        ps.createIndex("company", "company", { unique: false });
        ps.createIndex("personaType", "personaType", { unique: false });
        ps.createIndex("name", "name", { unique: false });
        ps.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Question Hash (for deduplication) ───────────────────
export function questionHash(text) {
  const normalized = text.toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

// ── Save Questions (batch) ──────────────────────────────
export async function saveQuestions(questions) {
  try {
    const db = await openDB();
    const tx = db.transaction("questions", "readwrite");
    const store = tx.objectStore("questions");
    for (const q of questions) {
      store.put(q);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: saveQuestions failed:", e);
    return false;
  }
}

// ── Get Questions for Company ───────────────────────────
export async function getQuestionsForCompany(company) {
  try {
    const db = await openDB();
    const tx = db.transaction("questions", "readonly");
    const store = tx.objectStore("questions");
    const idx = store.index("company");
    const req = idx.getAll(company);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getQuestionsForCompany failed:", e);
    return [];
  }
}

// ── Save Macro Question ─────────────────────────────────
export async function saveMacro(question) {
  try {
    const db = await openDB();
    const tx = db.transaction("macroBank", "readwrite");
    const store = tx.objectStore("macroBank");
    const hash = question.dedupHash || questionHash(question.query);

    // Try to get existing entry first
    const existing = await new Promise((res) => {
      const r = store.get(hash);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });

    const entry = existing || {
      dedupHash: hash,
      query: question.query,
      persona: question.persona,
      stage: question.stage,
      cluster: question.cluster,
      seenForCompanies: [],
      firstSeenAt: new Date().toISOString(),
      timesGenerated: 0,
    };

    // Update tracking
    entry.lastSeenAt = new Date().toISOString();
    entry.timesGenerated += 1;
    if (question.company && !entry.seenForCompanies.includes(question.company)) {
      entry.seenForCompanies.push(question.company);
    }

    store.put(entry);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: saveMacro failed:", e);
    return false;
  }
}

// ── Get All Macros ──────────────────────────────────────
export async function getAllMacros() {
  try {
    const db = await openDB();
    const tx = db.transaction("macroBank", "readonly");
    const store = tx.objectStore("macroBank");
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getAllMacros failed:", e);
    return [];
  }
}

// ── Save Company Intel ──────────────────────────────────
export async function saveCompanyIntel(intel) {
  try {
    const db = await openDB();
    const tx = db.transaction("companyIntel", "readwrite");
    tx.objectStore("companyIntel").put(intel);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: saveCompanyIntel failed:", e);
    return false;
  }
}

// ── Get Company Intel ───────────────────────────────────
export async function getCompanyIntel(company) {
  try {
    const key = company.toLowerCase().replace(/\s+/g, "-");
    const db = await openDB();
    const tx = db.transaction("companyIntel", "readonly");
    const req = tx.objectStore("companyIntel").get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getCompanyIntel failed:", e);
    return null;
  }
}

// ── Knowledge Base Stats ────────────────────────────────
export async function getKnowledgeBaseStats() {
  try {
    const db = await openDB();
    const tx = db.transaction(["questions", "macroBank", "companyIntel", "personas"], "readonly");

    const qCount = await new Promise((res) => {
      const r = tx.objectStore("questions").count();
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(0);
    });

    const mCount = await new Promise((res) => {
      const r = tx.objectStore("macroBank").count();
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(0);
    });

    const cCount = await new Promise((res) => {
      const r = tx.objectStore("companyIntel").count();
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(0);
    });

    const pCount = await new Promise((res) => {
      const r = tx.objectStore("personas").count();
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(0);
    });

    db.close();
    return { totalQuestions: qCount, totalMacros: mCount, companiesResearched: cCount, totalPersonas: pCount };
  } catch (e) {
    console.warn("questionDB: getKnowledgeBaseStats failed:", e);
    return { totalQuestions: 0, totalMacros: 0, companiesResearched: 0, totalPersonas: 0 };
  }
}

// ── Get All Questions (across all companies) ─────────────
export async function getAllQuestions() {
  try {
    const d = await openDB();
    const tx = d.transaction("questions", "readonly");
    const req = tx.objectStore("questions").getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { d.close(); resolve(req.result || []); };
      req.onerror = () => { d.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getAllQuestions failed:", e);
    return [];
  }
}

// ── Get All Company Intel ─────────────────────────────────
export async function getAllCompanyIntel() {
  try {
    const d = await openDB();
    const tx = d.transaction("companyIntel", "readonly");
    const req = tx.objectStore("companyIntel").getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { d.close(); resolve(req.result || []); };
      req.onerror = () => { d.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getAllCompanyIntel failed:", e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// FIREBASE HYDRATION — merge cloud data into IndexedDB
// ═══════════════════════════════════════════════════════════

export async function hydrateQuestions(fbQuestions) {
  if (!fbQuestions?.length) return 0;
  try {
    const d = await openDB();
    const tx = d.transaction("questions", "readwrite");
    const store = tx.objectStore("questions");
    const existing = await new Promise(res => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
    const hashMap = new Map(existing.map(q => [q.dedupHash, q]));
    let added = 0;
    for (const fbQ of fbQuestions) {
      if (!fbQ.dedupHash) continue;
      const local = hashMap.get(fbQ.dedupHash);
      if (!local || (fbQ.generatedAt && fbQ.generatedAt > (local.generatedAt || ""))) {
        store.put(fbQ);
        added++;
      }
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { d.close(); resolve(added); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: hydrateQuestions failed:", e);
    return 0;
  }
}

export async function hydrateMacros(fbMacros) {
  if (!fbMacros?.length) return 0;
  try {
    const d = await openDB();
    const tx = d.transaction("macroBank", "readwrite");
    const store = tx.objectStore("macroBank");
    const existing = await new Promise(res => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
    const hashMap = new Map(existing.map(m => [m.dedupHash, m]));
    let added = 0;
    for (const fbM of fbMacros) {
      if (!fbM.dedupHash) continue;
      const local = hashMap.get(fbM.dedupHash);
      if (!local) {
        store.put(fbM);
        added++;
      } else {
        // Merge: max timesGenerated, union seenForCompanies, earliest first, latest last
        const merged = { ...local };
        merged.timesGenerated = Math.max(local.timesGenerated || 0, fbM.timesGenerated || 0);
        const localCos = local.seenForCompanies || [];
        const fbCos = fbM.seenForCompanies || [];
        merged.seenForCompanies = [...new Set([...localCos, ...fbCos])];
        if (fbM.firstSeenAt && (!local.firstSeenAt || fbM.firstSeenAt < local.firstSeenAt)) {
          merged.firstSeenAt = fbM.firstSeenAt;
        }
        if (fbM.lastSeenAt && (!local.lastSeenAt || fbM.lastSeenAt > local.lastSeenAt)) {
          merged.lastSeenAt = fbM.lastSeenAt;
        }
        store.put(merged);
        added++;
      }
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { d.close(); resolve(added); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: hydrateMacros failed:", e);
    return 0;
  }
}

export async function hydrateCompanyIntel(fbIntel) {
  if (!fbIntel?.length) return 0;
  try {
    const d = await openDB();
    const tx = d.transaction("companyIntel", "readwrite");
    const store = tx.objectStore("companyIntel");
    const existing = await new Promise(res => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
    const keyMap = new Map(existing.map(c => [c.companyKey, c]));
    let added = 0;
    for (const fbC of fbIntel) {
      if (!fbC.companyKey) continue;
      const local = keyMap.get(fbC.companyKey);
      if (!local || (fbC.lastResearchedAt && fbC.lastResearchedAt > (local.lastResearchedAt || ""))) {
        store.put(fbC);
        added++;
      }
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { d.close(); resolve(added); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: hydrateCompanyIntel failed:", e);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════
// PERSONA CRUD OPERATIONS (v2)
// ═══════════════════════════════════════════════════════════

// ── Save Single Persona ─────────────────────────────────
export async function savePersona(persona) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readwrite");
    tx.objectStore("personas").put(persona);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: savePersona failed:", e);
    return false;
  }
}

// ── Save Personas (batch — for CSV import) ──────────────
export async function savePersonas(personas) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readwrite");
    const store = tx.objectStore("personas");
    for (const p of personas) {
      store.put(p);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: savePersonas failed:", e);
    return false;
  }
}

// ── Get Personas for Company ────────────────────────────
export async function getPersonasForCompany(company) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readonly");
    const idx = tx.objectStore("personas").index("company");
    const req = idx.getAll(company);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getPersonasForCompany failed:", e);
    return [];
  }
}

// ── Get All Personas ────────────────────────────────────
export async function getAllPersonas() {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readonly");
    const req = tx.objectStore("personas").getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getAllPersonas failed:", e);
    return [];
  }
}

// ── Get Persona by ID ───────────────────────────────────
export async function getPersonaById(id) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readonly");
    const req = tx.objectStore("personas").get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn("questionDB: getPersonaById failed:", e);
    return null;
  }
}

// ── Update Persona (partial merge) ──────────────────────
export async function updatePersona(id, updates) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readwrite");
    const store = tx.objectStore("personas");

    const existing = await new Promise((res) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });

    if (!existing) { db.close(); return false; }

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    store.put(merged);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: updatePersona failed:", e);
    return false;
  }
}

// ── Delete Persona ──────────────────────────────────────
export async function deletePersona(id) {
  try {
    const db = await openDB();
    const tx = db.transaction("personas", "readwrite");
    tx.objectStore("personas").delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn("questionDB: deletePersona failed:", e);
    return false;
  }
}
