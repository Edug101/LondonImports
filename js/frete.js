// Frete por região a partir do CEP da loja. Usado na loja e no painel.
// O endereço do cliente vem do ViaCEP (grátis); o preço vem da tabela salva no painel.
const FRETE = (() => {
  const ZONES = [
    ["same", "Mesmo estado da loja"],
    ["SE", "Sudeste"],
    ["S", "Sul"],
    ["CO", "Centro-Oeste"],
    ["NE", "Nordeste"],
    ["N", "Norte"],
  ];
  // valores de partida (pacote pequeno saindo de SP); a loja ajusta no painel
  const DEFAULT = {
    same: { pac: 21.9, pac_d: 5, sedex: 29.9, sedex_d: 2 },
    SE: { pac: 28.9, pac_d: 6, sedex: 44.9, sedex_d: 3 },
    S: { pac: 32.9, pac_d: 7, sedex: 54.9, sedex_d: 3 },
    CO: { pac: 36.9, pac_d: 8, sedex: 64.9, sedex_d: 4 },
    NE: { pac: 44.9, pac_d: 11, sedex: 84.9, sedex_d: 5 },
    N: { pac: 52.9, pac_d: 13, sedex: 99.9, sedex_d: 7 },
  };
  const REGION = {
    SP: "SE", RJ: "SE", MG: "SE", ES: "SE", PR: "S", SC: "S", RS: "S",
    DF: "CO", GO: "CO", MT: "CO", MS: "CO",
    BA: "NE", SE: "NE", AL: "NE", PE: "NE", PB: "NE", RN: "NE", CE: "NE", PI: "NE", MA: "NE",
    PA: "N", AP: "N", AM: "N", RR: "N", AC: "N", RO: "N", TO: "N",
  };
  const cep = (s) => String(s ?? "").replace(/\D/g, "").slice(0, 8);
  const fmt = (c) => (c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
  // junta o que veio do banco com os valores de partida, sempre com números válidos
  function rates(saved) {
    const out = {};
    ZONES.forEach(([k]) => {
      const s = (saved && saved[k]) || {}, d = DEFAULT[k];
      out[k] = {
        pac: num(s.pac ?? d.pac, 10000), pac_d: Math.round(num(s.pac_d ?? d.pac_d, 90)),
        sedex: num(s.sedex ?? d.sedex, 10000), sedex_d: Math.round(num(s.sedex_d ?? d.sedex_d, 90)),
      };
    });
    return out;
  }
  async function lookup(c) {
    const r = await fetch(`https://viacep.com.br/ws/${cep(c)}/json/`);
    if (!r.ok) throw new Error("cep");
    const d = await r.json();
    if (d.erro || !REGION[d.uf]) throw new Error("cep");
    return { cep: cep(c), city: d.localidade, uf: d.uf };
  }
  const zoneOf = (uf, originUf) => (originUf && uf === originUf ? "same" : REGION[uf]);
  return { ZONES, DEFAULT, REGION, cep, fmt, rates, lookup, zoneOf };
})();
