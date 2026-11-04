// What an agent reports, and the check on it (docs/architecture-v3.md section 15.2): no number from a
// model, only from a tool it called or a link the brief holds. A finding that breaks this is removed
// and the person is told. This holds the agent to the rule rather than asking it nicely.

export type FindingKind = "measured" | "sourced" | "assumed" | "question";

export interface Finding {
  claim: string; kind: FindingKind;
  /** The link for a sourced finding: one of those the tools returned. */
  source?: string;
  /** The stay this bears on, and what the agent suggests. It's a suggestion: a stakeholder decides. */
  about?: string; suggests?: "keep" | "change";
}

export interface Report { summary: string; findings: Finding[] }
export interface CheckedReport extends Report { removed: { claim: string; why: string }[] }

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const toNumbers = (text: string) => (text.match(NUMBER) ?? []).map((s) => Number(s.replace(/,/g, ""))).filter(Number.isFinite);

/** Every number and link anywhere in what the tools returned, as a model could read them. */
export function evidenceOf(results: unknown[]): { numbers: number[]; links: Set<string> } {
  const numbers: number[] = [], links = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") numbers.push(Math.abs(v));
    else if (typeof v === "string") {
      if (/^https?:\/\//.test(v)) links.add(v);
      else numbers.push(...toNumbers(v));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  results.forEach(walk);
  return { numbers, links };
}

/** A number in prose matches the evidence as written, or rounded to as many places as it shows. */
function backed(text: string, numbers: number[]): number | null {
  for (const raw of text.match(NUMBER) ?? []) {
    const clean = raw.replace(/,/g, ""), v = Number(clean);
    const places = clean.includes(".") ? clean.length - clean.indexOf(".") - 1 : 0, f = 10 ** places;
    if (!numbers.some((r) => Math.round(r * f) / f === v)) return v;
  }
  return null;
}

export function readReport(raw: unknown): Report | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { summary?: unknown; findings?: unknown };
  if (typeof r.summary !== "string" || !Array.isArray(r.findings)) return null;
  const findings: Finding[] = [];
  for (const f of r.findings as Record<string, unknown>[]) {
    if (typeof f?.claim !== "string" || !["measured", "sourced", "assumed", "question"].includes(f.kind as string)) return null;
    findings.push({ claim: f.claim, kind: f.kind as FindingKind,
      ...(typeof f.source === "string" ? { source: f.source } : {}),
      ...(typeof f.about === "string" ? { about: f.about } : {}),
      ...(f.suggests === "keep" || f.suggests === "change" ? { suggests: f.suggests } : {}) });
  }
  return { summary: r.summary, findings };
}

export function checkReport(report: Report, results: unknown[], stayIds: string[]): CheckedReport {
  const { numbers, links } = evidenceOf(results);
  const removed: CheckedReport["removed"] = [];
  const findings = report.findings.flatMap((f): Finding[] => {
    const out: Finding = { ...f };
    if (out.about && !stayIds.includes(out.about)) { delete out.about; delete out.suggests; }
    if (!out.about) delete out.suggests;
    if (f.kind === "sourced" && (!f.source || !links.has(f.source))) {
      removed.push({ claim: f.claim, why: "It names a source that isn't on record for this place." });
      return [];
    }
    if (f.kind === "assumed" && toNumbers(f.claim).length) {
      removed.push({ claim: f.claim, why: "An assumption can't carry a number." });
      return [];
    }
    const wild = backed(f.claim, numbers);
    if (wild !== null) {
      removed.push({ claim: f.claim, why: `No tool returned the number ${wild}.` });
      return [];
    }
    return [out];
  });
  // The summary is held to the same rule; a summary that fails is replaced rather than shown.
  const wild = backed(report.summary, numbers);
  if (wild !== null) removed.push({ claim: report.summary, why: `No tool returned the number ${wild}.` });
  return { summary: wild === null ? report.summary : "See the findings below.", findings, removed };
}
