import type { AgentResponse, AgentDataMap } from "../lib/ai/schemas";
const rubric = [
  "Campaign relevance",
  "Persona alignment",
  "Originality",
  "Premise distinction from other candidates",
  "Evidence traceability",
  "Requested refinement intent",
  "Clarity",
  "Strategic usefulness",
  "Brand compliance",
  "User-control responsiveness",
];
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function renderEvaluation(
  agent: string,
  runs: { label: string; response: AgentResponse<AgentDataMap["humor"]> }[],
) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XC review · ${escape(agent)}</title><style>body{font:16px/1.6 system-ui;max-width:960px;margin:40px auto;padding:0 24px;background:#faf9fc;color:#1d2139}h1{color:#6242c7}article{background:white;border:1px solid #ddd;border-radius:16px;margin:24px 0;padding:24px}blockquote{font-size:23px;margin:12px 0}label{display:block;margin:10px 0}select{margin-left:12px}textarea{width:96%;min-height:70px}button{padding:12px;background:#6242c7;color:white;border:0;border-radius:6px}details,small{color:#62697c}</style><h1>XC creative review · ${escape(agent)}</h1><p>Fictional campaign. Live generated suggestions, not verified research. Creative approval remains with Kevin.</p><p>Score each dimension 1–5: 1 = misses the brief; 2 = substantial revision; 3 = usable with revision; 4 = strong; 5 = exceptional for this brief. Originality, humor and cultural relevance require human judgment. Do not approve a candidate with unsupported claims, regardless of its other scores.</p><button id="save">Download review scores</button>${runs.map(({ label, response }, index) => `<article data-run="${index}"><h2>${escape(label)}</h2><small>${escape(response.model || "")} · ${escape(response.generation!.promptVersion)} · ${response.generation!.personality.primary}/10 · ${escape(response.generatedAt)}</small><blockquote>${escape(response.data.options[0].brief_line)}</blockquote><p>${escape(response.data.options[0].tension)}</p><p>Steering: ${escape(response.generation!.steeringText || "None")}</p><details><summary>Score this candidate</summary>${rubric.map((name) => `<label>${name}<select data-dimension="${name}"><option value="">Unscored</option>${[1, 2, 3, 4, 5].map((score) => `<option>${score}</option>`).join("")}</select></label>`).join("")}<label>Kevin's decision<select data-decision><option>Pending review</option><option>Accept</option><option>Reject</option><option>Refine</option></select></label><label>Notes / next steering<textarea></textarea></label></details></article>`).join("")}<script>document.getElementById('save').onclick=()=>{const reviews=[...document.querySelectorAll('article')].map(a=>({candidate:a.querySelector('blockquote').textContent,label:a.querySelector('h2').textContent,scores:Object.fromEntries([...a.querySelectorAll('[data-dimension]')].map(s=>[s.dataset.dimension,s.value?Number(s.value):null])),decision:a.querySelector('[data-decision]').value,notes:a.querySelector('textarea').value}));const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(reviews,null,2)],{type:'application/json'}));link.download='xc-creative-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};</script></html>`;
}
