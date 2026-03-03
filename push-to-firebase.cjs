/**
 * Push clean local data to Firebase Firestore.
 * Run once: node push-to-firebase.cjs
 */
const fs = require("fs");
const path = require("path");

const PROJECT_ID = "sirion-persona-stage";
const API_KEY = "AIzaSyCbZIwkEHKy8r3HSxmLNFau6lnD-VeG_Q8";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function toFsVal(val, depth = 0) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val.length > 8000 ? val.substring(0, 8000) : val };
  if (depth >= 2) return { stringValue: JSON.stringify(val).substring(0, 50000) };
  if (Array.isArray(val)) {
    if (val.length > 500) return { stringValue: JSON.stringify(val) };
    return { arrayValue: { values: val.map(v => toFsVal(v, depth + 1)) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) { fields[k] = toFsVal(v, depth + 1); }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function saveDoc(collection, docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) { fields[k] = toFsVal(v, 0); }
  const url = `${FS_BASE}/${collection}/${docId}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err.substring(0, 200)}`);
  }
  return true;
}

async function main() {
  console.log("=== Pushing clean data to Firebase ===\n");

  // 1. Push pipeline document
  console.log("1. Pushing pipeline (local_master.json)...");
  const pipeline = JSON.parse(fs.readFileSync("data/pipelines/local_master.json", "utf8"));
  pipeline.updated_at = new Date().toISOString();
  await saveDoc("pipelines", "local_master", pipeline);
  console.log(`   OK: ${pipeline.m1.questions.length} questions, ${pipeline.m1.personas.length} personas, ${pipeline.m1.clusters.length} clusters`);

  // 2. Push persona profiles
  console.log("\n2. Pushing persona profiles...");
  const personaDir = "data/m1_personas";
  const personaFiles = fs.readdirSync(personaDir).filter(f => f.endsWith(".json"));
  for (const file of personaFiles) {
    const persona = JSON.parse(fs.readFileSync(path.join(personaDir, file), "utf8"));
    const docId = persona.id || file.replace(".json", "");
    await saveDoc("m1_personas", docId, persona);
    console.log(`   OK: ${persona.name} (${persona.personaType}) at ${persona.company}`);
  }

  // 3. Push scan data if it exists
  const scanDir = "data/m2_scans";
  if (fs.existsSync(scanDir)) {
    const scanFiles = fs.readdirSync(scanDir).filter(f => f.endsWith(".json"));
    if (scanFiles.length > 0) {
      console.log("\n3. Pushing scan data...");
      for (const file of scanFiles) {
        const scan = JSON.parse(fs.readFileSync(path.join(scanDir, file), "utf8"));
        const docId = file.replace(".json", "");
        await saveDoc("m2_scans", docId, scan);
        console.log(`   OK: ${docId} (${scan.status || "unknown"})`);
      }
    }
  }

  console.log("\n=== Done! Firebase is populated with clean data. ===");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
