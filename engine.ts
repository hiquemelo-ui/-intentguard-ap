export type Decision = "GO" | "FIX" | "ASK";

export interface IntentRequest {
  user_request: string;
  agent_plan: string;
  reference_notes?: string[];
}

export interface IntentResult {
  decision: Decision;
  score: number;
  missing: string[];
  contradictions: string[];
  unnecessary_additions: string[];
  corrected_plan?: string;
  question?: string;
}

const negations = ["sem ", "não ", "nao ", "no ", "without ", "avoid "];
const minimalWords = ["minimalista", "minimal", "clean", "simples", "simple", "pouca informação", "pouca informacao"];
const textWords = ["texto", "headline", "slogan", "copy", "título", "titulo", "price", "preço", "preco"];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokens(s: string) {
  return new Set(norm(s).split(/[^a-z0-9%$]+/).filter(x => x.length > 2));
}

export function checkIntent(input: IntentRequest): IntentResult {
  const user = norm(input.user_request);
  const plan = norm(input.agent_plan);
  const u = tokens(user);
  const p = tokens(plan);

  const missing: string[] = [];
  const contradictions: string[] = [];
  const unnecessary: string[] = [];

  // Preserve explicit hard constraints.
  for (const n of negations) {
    const idx = user.indexOf(n);
    if (idx >= 0) {
      const fragment = user.slice(idx, idx + 60).split(/[.,;\n]/)[0];
      const object = fragment.replace(n, "").trim();
      if (object && plan.includes(object.split(" ")[0])) {
        contradictions.push(`O plano parece contrariar a restrição: "${fragment.trim()}".`);
      }
    }
  }

  // Minimal request vs busy plan.
  if (minimalWords.some(w => user.includes(norm(w)))) {
    const punctuationDensity = (input.agent_plan.match(/[,;:]/g) || []).length;
    if (input.agent_plan.length > 360 || punctuationDensity > 8) {
      contradictions.push("O usuário pediu simplicidade/minimalismo, mas o plano está visualmente ou informacionalmente denso.");
    }
  }

  // Detect potentially invented additions from a small visual-risk vocabulary.
  const riskyAdds = ["skyline", "pessoas", "modelo", "celebridade", "logo", "selo", "mapa", "cidade", "carro", "animal", "texto", "slogan"];
  for (const item of riskyAdds) {
    if (plan.includes(item) && !user.includes(item)) unnecessary.push(item);
  }

  // Check salient user tokens omitted from plan.
  const salient = [...u].filter(t => /\d/.test(t) || t.includes("suite") || t.includes("entrada") || t.includes("parcela") || t.includes("fundo") || t.includes("rosto") || t.includes("cor") || t.includes("sem"));
  for (const t of salient) {
    if (!p.has(t)) missing.push(t);
  }

  // Ambiguity that truly needs a question: demonstratives with multiple candidate nouns.
  const ambiguous = /\b(esse|essa|aquele|aquela|that|this)\b/.test(user) && /(dois|duas|2 |multiple|varios|varias)/.test(user + " " + plan);

  let score = 1;
  score -= Math.min(0.12 * contradictions.length, 0.48);
  score -= Math.min(0.07 * unnecessary.length, 0.28);
  score -= Math.min(0.06 * missing.length, 0.24);
  score = Math.max(0, Math.round(score * 100) / 100);

  if (ambiguous) {
    return {
      decision: "ASK",
      score,
      missing,
      contradictions,
      unnecessary_additions: unnecessary,
      question: "Há mais de um elemento possível para a alteração. Qual deles deve ser modificado?"
    };
  }

  if (contradictions.length || missing.length || unnecessary.length >= 2) {
    const corrected = [
      `Objetivo do usuário: ${input.user_request.trim()}`,
      "Executar somente o necessário para cumprir o pedido.",
      unnecessary.length ? `Remover adições não solicitadas: ${unnecessary.join(", ")}.` : "",
      missing.length ? `Garantir explicitamente estes pontos: ${missing.join(", ")}.` : "",
      "Não inventar elementos visuais, texto, pessoas, objetos ou contexto que não tenham sido pedidos ou inferidos com alta confiança.",
      "Preservar a prioridade e a hierarquia definidas pelo usuário."
    ].filter(Boolean).join(" ");

    return { decision: "FIX", score, missing, contradictions, unnecessary_additions: unnecessary, corrected_plan: corrected };
  }

  return { decision: "GO", score, missing, contradictions, unnecessary_additions: unnecessary };
}
