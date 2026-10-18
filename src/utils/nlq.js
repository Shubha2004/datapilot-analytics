/**
 * nlq.js — natural-language to chart/table for DataPilot Analytics.
 *
 * parseNLQ(question, dataset) interprets a plain-English question against the
 * LIVE dataset's column names and inferred types (numeric / categorical /
 * date), not against any hardcoded schema.
 *
 * How dynamic matching works:
 *  1. Column metadata comes from dataset.columns ({ name, type }).
 *  2. A synonym map (METRIC_CONCEPTS, DIMENSION_CONCEPTS) expands common
 *     words ("sales", "earnings", "area", "items"...) into concept groups.
 *     A concept resolves to an actual column when one of its words matches a
 *     column-name token (exact, plural-tolerant, prefix or small-edit fuzzy).
 *  3. If a term or concept resolves to more than one column, the result is a
 *     `clarification` with clickable option queries instead of a guess.
 *  4. If nothing numeric matches an explicit metric word, the result is an
 *     explanatory error naming the available columns — never invented data.
 *
 * Result shape:
 *   { sql, chartConfig, table, interpretation, clarification, error, suggestions }
 * - interpretation: { plain, columns: [{name,type,role}], calculation }
 * - clarification:  { prompt, options: [{label, query}] }
 */
import { buildChartData } from './chartData';
import { isMissing } from './dataTypes';

export const NLQ_EXAMPLES = [
  'Show monthly revenue by region',
  'Top 5 products by revenue',
  'Average order value by channel',
  'Total quantity sold per category',
  'Revenue trend over time',
  'Bottom 3 categories by revenue',
  'Orders by customer segment',
  'Monthly quantity by channel',
  'Top 10 products by quantity',
  'Average unit price by category',
  'Revenue by region',
  'Count of orders per month',
];

/* ------------------------------------------------------------------ */
/* Synonym concepts                                                     */
/* ------------------------------------------------------------------ */

/** Metric concepts resolve against NUMERIC columns. */
const METRIC_CONCEPTS = [
  {
    id: 'sales',
    label: 'sales',
    words: [
      'revenue', 'revenues', 'sales', 'income', 'earnings', 'turnover',
      'amount', 'amounts', 'gross', 'takings', 'value', 'values', 'money',
    ],
  },
  {
    id: 'quantity',
    label: 'quantity',
    words: [
      'quantity', 'quantities', 'qty', 'units', 'items', 'volume', 'sold',
    ],
  },
  {
    id: 'price',
    label: 'price',
    words: ['price', 'prices', 'cost', 'costs', 'rate', 'rates', 'unit price'],
  },
];

/** Row-count concept: "orders", "records", ... -> COUNT(*). */
const COUNT_WORDS = [
  'order', 'orders', 'record', 'records', 'row', 'rows',
  'transaction', 'transactions', 'purchase', 'purchases',
];

/** Dimension concepts resolve against CATEGORICAL (or date) columns. */
const DIMENSION_CONCEPTS = [
  {
    id: 'product',
    label: 'product',
    words: ['product', 'products', 'item', 'items', 'goods', 'merchandise', 'sku', 'skus'],
  },
  {
    id: 'category',
    label: 'category',
    words: ['category', 'categories', 'department', 'departments', 'group', 'groups', 'type', 'types', 'class'],
  },
  {
    id: 'region',
    label: 'region',
    words: ['region', 'regions', 'area', 'areas', 'territory', 'territories', 'zone', 'zones', 'location', 'geography'],
  },
  {
    id: 'customer',
    label: 'customer',
    words: ['customer', 'customers', 'client', 'clients', 'segment', 'segments', 'buyer', 'buyers', 'customer segment'],
  },
  {
    id: 'channel',
    label: 'channel',
    words: ['channel', 'channels', 'store', 'stores', 'outlet', 'outlets', 'medium', 'platform', 'platforms'],
  },
  {
    id: 'date',
    label: 'date',
    words: ['date', 'dates', 'day', 'days', 'month', 'months', 'year', 'years', 'time', 'week', 'weeks', 'quarter', 'quarters', 'period', 'when'],
  },
];

/** Words that never carry metric intent (used for "why unanswerable" hints). */
const STOPWORDS = new Set(
  ('a,an,the,of,by,per,for,with,without,and,or,to,in,on,at,from,as,is,are,was,were,' +
    'be,been,show,me,display,plot,chart,graph,please,give,list,what,which,how,many,' +
    'much,does,do,there,their,across,over,each,every,all,any,top,bottom,highest,' +
    'lowest,maximum,minimum,largest,smallest,least,most,first,last,total,average,' +
    'avg,mean,sum,summed,count,trend,trends,monthly,weekly,yearly,quarterly,annual,' +
    'distribution,breakdown,compare,comparison,versus,vs,between,missing,blank,null,' +
    'empty,values,present,having,has,have,than,into,out,up,down,my,data,dataset').split(',')
);

const GRAINS = [
  { re: /quarterly|\bquarters?\b/, grain: 'quarterly', title: 'Quarterly', trunc: 'quarter', alias: 'quarter' },
  { re: /weekly|\bweeks?\b/, grain: 'weekly', title: 'Weekly', trunc: 'week', alias: 'week' },
  { re: /yearly|\byearly\b|\bannual(?:ly)?\b/, grain: 'yearly', title: 'Yearly', trunc: 'year', alias: 'year' },
  { re: /monthly|\bmonths?\b/, grain: 'monthly', title: 'Monthly', trunc: 'month', alias: 'month' },
];

const AGG_FNS = { sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX' };
const AGG_WORDS = { sum: 'Total', avg: 'Average', count: 'Count of', min: 'Minimum', max: 'Maximum' };

/* ------------------------------------------------------------------ */
/* Text helpers                                                         */
/* ------------------------------------------------------------------ */

function cap(s) {
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pretty(s) {
  return String(s).replace(/_/g, ' ');
}

/** Split a column name into lowercase tokens: "unit_price" -> ["unit","price"]. */
function tokensOf(name) {
  return String(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[lb];
}

/** Score how well word `w` matches column token `t`. 0 = no match. */
function tokenScore(w, t) {
  if (w === t) return 3;
  if (w.length >= 4 && t.length >= 4) {
    if (t.startsWith(w) || w.startsWith(t)) return 2;
    if (levenshtein(w, t) <= (Math.min(w.length, t.length) >= 6 ? 2 : 1)) return 1;
  }
  return 0;
}

/** Does the question mention this column by name (underscore/space/plural tolerant)? */
function mentionsQuestion(q, name) {
  const n = String(name).toLowerCase();
  const variants = [n, n.replace(/_/g, ' ')];
  for (const v of variants) {
    if (q.includes(v)) return v;
    const plural = v.endsWith('y') ? v.slice(0, -1) + 'ies' : v + 's';
    if (q.includes(plural)) return plural;
    const singular = v.endsWith('s') ? v.slice(0, -1) : null;
    if (singular && singular.length > 3 && q.includes(singular)) return singular;
  }
  return null;
}

/** Best column-token score for a concept word against a column's tokens. */
function conceptWordScore(word, colTokens) {
  let best = 0;
  for (const t of colTokens) {
    best = Math.max(best, tokenScore(word, t));
  }
  return best;
}

/**
 * Resolve a concept (list of synonym words) against candidate columns.
 * The concept is "active" when any of its words appears in the question;
 * columns are then scored against ALL words of the group so that a synonym
 * like "sales" or "earnings" resolves to a column named "revenue".
 * Returns { best: [cols tied on top score], score } or null when no concept
 * word appears in the question at all.
 */
function resolveConcept(q, concept, candidateCols) {
  const activeWords = concept.words.filter((w) => q.includes(w));
  if (activeWords.length === 0) return null;
  let bestScore = 0;
  let best = [];
  for (const col of candidateCols) {
    const colTokens = tokensOf(col.name);
    // multi-word synonym vs full column name ("unit price" vs "unit_price")
    let score = 0;
    for (const w of concept.words) {
      if (w.includes(' ') && activeWords.includes(w) && mentionsQuestion(q, w)) {
        const joined = col.name.toLowerCase().replace(/_/g, ' ');
        if (joined === w || joined.includes(w) || w.includes(joined)) {
          score = Math.max(score, 3);
        }
      }
      score = Math.max(score, conceptWordScore(w, colTokens));
    }
    if (score > bestScore) {
      bestScore = score;
      best = [col];
    } else if (score === bestScore && score > 0) {
      best.push(col);
    }
  }
  if (bestScore === 0) return null;
  return { best, score: bestScore, words: activeWords };
}

/* ------------------------------------------------------------------ */
/* Period derivation                                                    */
/* ------------------------------------------------------------------ */

function periodKey(dateVal, grain) {
  const d = new Date(dateVal);
  if (Number.isNaN(+d)) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  switch (grain) {
    case 'yearly':
      return `${y}`;
    case 'quarterly':
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case 'weekly': {
      const tmp = new Date(Date.UTC(y, m, day));
      const dayNum = (tmp.getUTCDay() + 6) % 7; // Monday = 0
      tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3); // shift to Thursday
      const isoYear = tmp.getUTCFullYear();
      const jan4 = new Date(Date.UTC(isoYear, 0, 4));
      const jan4Day = (jan4.getUTCDay() + 6) % 7;
      jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
      const week = 1 + Math.round((tmp - jan4) / 604800000);
      return `${isoYear}-W${pad(week)}`;
    }
    default:
      return `${y}-${pad(m + 1)}`;
  }
}

/** Shallow-copied dataset with a derived '__period' categorical column. */
function withPeriod(dataset, dateColName, grain) {
  const rows = (dataset.rows || [])
    .map((r) => ({ ...r, __period: periodKey(r[dateColName], grain) }))
    .filter((r) => r.__period !== null);
  return {
    ...dataset,
    columns: [...dataset.columns, { name: '__period', type: 'categorical' }],
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* SQL (illustrative only)                                              */
/* ------------------------------------------------------------------ */

function buildSQL({ datasetName, xExpr, xAlias, groupKey, yKey, aggregation, sortDir, topN }) {
  const table =
    String(datasetName || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'dataset';
  const aggFn = AGG_FNS[aggregation] || 'SUM';
  const metricAlias = `${aggregation}_${yKey || 'rows'}`;
  const metricExpr =
    aggregation === 'count' ? (yKey ? `COUNT(${yKey})` : 'COUNT(*)') : `${aggFn}(${yKey})`;
  const selectCols = [`${xExpr} AS ${xAlias}`];
  if (groupKey) selectCols.push(groupKey);
  selectCols.push(`${metricExpr} AS ${metricAlias}`);

  const lines = ['-- Illustrative SQL (not executed; computed in-browser)'];
  lines.push(`SELECT ${selectCols.join(', ')}`);
  lines.push(`FROM ${table}`);
  lines.push(groupKey ? 'GROUP BY 1, 2' : 'GROUP BY 1');
  if (topN) {
    lines.push(`ORDER BY ${metricAlias} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`);
  } else {
    lines.push(groupKey ? 'ORDER BY 1, 2' : 'ORDER BY 1');
  }
  if (topN) lines.push(`LIMIT ${topN}`);
  return lines.join('\n') + ';';
}

function buildMissingSQL(datasetName, columns) {
  const table =
    String(datasetName || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'dataset';
  const lines = ['-- Illustrative SQL (not executed; computed in-browser)'];
  lines.push(
    columns
      .map(
        (c) =>
          `SELECT '${c.name}' AS column_name, COUNT(*) FILTER (WHERE ${c.name} IS NULL) AS missing_count FROM ${table}`
      )
      .join('\nUNION ALL\n')
  );
  lines.push('ORDER BY missing_count DESC;');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Result helpers                                                       */
/* ------------------------------------------------------------------ */

function noMatch() {
  return {
    sql: null,
    chartConfig: null,
    table: null,
    interpretation: null,
    clarification: null,
    error: "I couldn't map that to the dataset. Try naming one of its columns.",
    suggestions: NLQ_EXAMPLES.slice(0, 3),
  };
}

function clarify(prompt, options) {
  return {
    sql: null,
    chartConfig: null,
    table: null,
    interpretation: null,
    clarification: { prompt, options },
    error: null,
    suggestions: [],
  };
}

function unanswerable(message, suggestions) {
  return {
    sql: null,
    chartConfig: null,
    table: null,
    interpretation: null,
    clarification: null,
    error: message,
    suggestions: suggestions && suggestions.length ? suggestions : NLQ_EXAMPLES.slice(0, 3),
  };
}

function metricTotal(row, seriesKeys) {
  let total = 0;
  let any = false;
  for (const k of seriesKeys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

/* ------------------------------------------------------------------ */
/* Metric resolution                                                    */
/* ------------------------------------------------------------------ */

/** Words that carry no matching intent on their own. */
const KNOWN_WORDS = (() => {
  const s = new Set(STOPWORDS);
  for (const c of [...METRIC_CONCEPTS, ...DIMENSION_CONCEPTS]) {
    for (const w of c.words) {
      s.add(w);
      for (const part of w.split(' ')) s.add(part);
    }
  }
  for (const w of COUNT_WORDS) s.add(w);
  return s;
})();

/**
 * Gentle typo tolerance: exact handled elsewhere; allow a small prefix
 * difference ("regio" -> "region") or a single edit ("revenu" -> "revenue"),
 * but not unrelated longer words ("ordered" must not match "order").
 */
function gentleFuzzy(word, token) {
  const w = String(word).toLowerCase();
  const t = String(token).toLowerCase();
  if (w === t) return true;
  if (Math.min(w.length, t.length) < 4) return false;
  if (Math.abs(w.length - t.length) <= 2 && (w.startsWith(t) || t.startsWith(w))) return true;
  return levenshtein(w, t) <= 1;
}

/** Content words in the question that match no column, concept or keyword. */
function findUnknownWords(q, cols) {
  const isKnown = (w) => {
    if (KNOWN_WORDS.has(w)) return true;
    return cols.some((c) => {
      if (c.name.toLowerCase().replace(/_/g, ' ') === w) return true;
      return tokensOf(c.name).some((t) => tokenScore(w, t) > 0);
    });
  };
  return String(q)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 2 && !isKnown(w));
}

/**
 * Resolve the question's metric against the dataset's NUMERIC columns.
 * Returns { kind:'column', col, via, phrase } | { kind:'count' } |
 * { needsMetricChoice:true } | { unanswerable } | { clarification }.
 * `dims` (resolved earlier) is used to build complete clarification queries.
 */
function resolveMetric(q, cols, aggregation, dims) {
  const numericCols = cols.filter((c) => c.type === 'numeric');

  // Special phrase: "order value" / "aov" = revenue-style metric, not row count.
  const hasOrderValue = /order value|\baov\b/.test(q);

  // 1. Direct numeric column name mentions (strongest signal), with a gentle
  //    fuzzy fallback for typos ("revenu" -> "revenue").
  const nameHits = [];
  const qwords = String(q)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 4 && !KNOWN_WORDS.has(w));
  for (const col of numericCols) {
    const phrase = mentionsQuestion(q, col.name);
    if (phrase) {
      nameHits.push({ col, phrase, via: 'name' });
      continue;
    }
    const tokens = tokensOf(col.name);
    const fw = qwords.find((w) => tokens.some((t) => gentleFuzzy(w, t)));
    if (fw) nameHits.push({ col, phrase: fw, via: 'fuzzy' });
  }

  // 2. Concept matches (synonyms -> numeric columns).
  const conceptHits = []; // { col, concept, phrase, via:'concept' }
  const ambiguousConcepts = []; // concept matched 2+ columns
  for (const concept of METRIC_CONCEPTS) {
    const res = resolveConcept(q, concept, numericCols);
    if (!res) continue;
    if (res.best.length > 1) {
      ambiguousConcepts.push({ concept, cols: res.best, words: res.words });
    } else {
      conceptHits.push({ col: res.best[0], concept, phrase: res.words[0], via: 'concept' });
    }
  }

  // 3. Row-count words ("orders", "records", ...).
  const hasCountWord =
    !hasOrderValue && COUNT_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(q));

  // Collect distinct candidate columns (name hits win over concept hits per column).
  const byCol = new Map();
  for (const h of [...nameHits, ...conceptHits]) {
    if (!byCol.has(h.col.name) || h.via === 'name') byCol.set(h.col.name, h);
  }
  const candidates = [...byCol.values()];

  if (hasCountWord) candidates.push({ col: null, phrase: 'orders', via: 'count' });

  const distinctCols = [...new Set(candidates.map((c) => (c.col ? c.col.name : null)))];

  // Dimension suffix for clarification option queries — never one of the
  // candidate metric columns themselves.
  const dimName =
    dims && dims.length > 0
      ? (dims.find((d) => !distinctCols.includes(d.name)) || {}).name
      : null;
  const dimSuffix = dimName ? ` by ${pretty(dimName)}` : '';
  const aggWord = (AGG_WORDS[aggregation] || 'Total').toLowerCase();

  // Ambiguity: one concept matched several columns.
  if (ambiguousConcepts.length > 0) {
    const { words, cols: tied } = ambiguousConcepts[0];
    const word = words[0];
    const aggLabel = AGG_WORDS[aggregation] || 'Total';
    return {
      clarification: clarify(
        `“${word}” could mean more than one numeric column. Which one did you mean?`,
        tied.map((c) => {
          const prettyName = pretty(c.name);
          const label = prettyName.toLowerCase().startsWith(aggLabel.toLowerCase())
            ? cap(prettyName)
            : `${aggLabel} ${prettyName}`;
          return { label, query: `${aggWord} ${prettyName}${dimSuffix}` };
        })
      ),
    };
  }

  // Multiple different metrics mentioned -> ask which one.
  if (distinctCols.length > 1) {
    const options = distinctCols.map((name) => {
      if (name === null) {
        return { label: 'Count of records (row count)', query: `count of records${dimSuffix}` };
      }
      return {
        label: `${AGG_WORDS[aggregation] || 'Total'} ${pretty(name)}`,
        query: `${aggWord} ${pretty(name)}${dimSuffix}`,
      };
    });
    return {
      clarification: clarify(
        'Your question mentions more than one metric. Which one should I use?',
        options
      ),
    };
  }

  if (candidates.length === 1) {
    const only = candidates[0];
    return only.col ? { kind: 'column', col: only.col, via: only.via, phrase: only.phrase }
                    : { kind: 'count' };
  }

  // No metric detected.
  if (aggregation === 'count' || hasCountWord) return { kind: 'count' };

  // The user named something we cannot map -> explain why (never invent).
  const unknown = findUnknownWords(q, cols);
  if (unknown.length > 0) {
    return { unanswerable: explainUnknownMetric(unknown[0], cols, dims) };
  }

  if (numericCols.length === 0) {
    return {
      unanswerable: unanswerable(
        'This dataset has no numeric columns to aggregate.',
        NLQ_EXAMPLES.slice(0, 3)
      ),
    };
  }
  if (numericCols.length === 1) {
    return { kind: 'column', col: numericCols[0], via: 'fallback', phrase: null };
  }
  // Several numeric columns and no metric word -> ask (handled by caller so the
  // dimension suffix is complete).
  return { needsMetricChoice: true };
}

/** Explain an unanswerable metric word, naming available columns. */
function explainUnknownMetric(unknown, cols, dims) {
  const numericCols = cols.filter((c) => c.type === 'numeric');
  const numericList =
    numericCols.length > 0
      ? numericCols.map((c) => c.name).join(', ')
      : '(none — this dataset has no numeric columns)';
  const suggestions = [];
  if (numericCols.length > 0) {
    const dimPart = dims && dims.length > 0 ? ` by ${pretty(dims[0].name)}` : '';
    suggestions.push(`Total ${pretty(numericCols[0].name)}${dimPart}`);
  }
  return unanswerable(
    `No numeric column matched “${unknown}” — available numeric columns are: ${numericList}.`,
    [...suggestions, ...NLQ_EXAMPLES.slice(0, 2)]
  );
}

/* ------------------------------------------------------------------ */
/* Dimension resolution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve grouping dimensions against categorical/date columns.
 * Returns { dims: [cols in question order], ambiguous }.
 */
function resolveDimensions(q, cols) {
  const dimCols = cols.filter((c) => c.type === 'categorical' || c.type === 'date');
  const hits = []; // { col, pos, via }
  const seen = new Set();

  const addHit = (col, pos, via) => {
    if (seen.has(col.name)) return;
    seen.add(col.name);
    hits.push({ col, pos, via });
  };

  // 1. Direct column-name mentions (any type usable as a dimension), with a
  //    gentle fuzzy fallback for typos ("regio" -> "region").
  const qwords = String(q)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 4 && !KNOWN_WORDS.has(w));
  for (const col of cols) {
    const phrase = mentionsQuestion(q, col.name);
    if (phrase) {
      addHit(col, q.indexOf(phrase), 'name');
      continue;
    }
    const tokens = tokensOf(col.name);
    const fw = qwords.find((w) => tokens.some((t) => gentleFuzzy(w, t)));
    if (fw) addHit(col, q.indexOf(fw), 'fuzzy');
  }

  // 2. Concept matches.
  const ambiguous = [];
  for (const concept of DIMENSION_CONCEPTS) {
    const res = resolveConcept(q, concept, dimCols);
    if (!res) continue;
    if (res.best.length > 1) {
      ambiguous.push({ concept, cols: res.best, words: res.words });
    } else {
      const col = res.best[0];
      const pos = Math.min(
        ...res.words.map((w) => q.indexOf(w)).filter((i) => i >= 0)
      );
      addHit(col, Number.isFinite(pos) ? pos : Infinity, 'concept');
    }
  }

  hits.sort((a, b) => a.pos - b.pos);
  return { dims: hits.map((h) => h.col), ambiguous };
}

/* ------------------------------------------------------------------ */
/* Missing-values answer                                                */
/* ------------------------------------------------------------------ */

function missingAnswer(dataset) {
  const rows = dataset.rows || [];
  const total = rows.length;
  const perCol = dataset.columns.map((c) => {
    const missing = rows.filter((r) => isMissing(r[c.name])).length;
    return {
      column: c.name,
      missing_count: missing,
      missing_pct: total ? Math.round((missing / total) * 1000) / 10 : 0,
      type: c.type,
    };
  });
  perCol.sort((a, b) => b.missing_count - a.missing_count);
  const totalMissing = perCol.reduce((s, r) => s + r.missing_count, 0);

  const table = {
    columns: ['column', 'missing_count', 'missing_pct'],
    rows: perCol.map(({ column, missing_count, missing_pct }) => ({
      column,
      missing_count,
      missing_pct,
    })),
  };
  const chartConfig = {
    id: 'nlq-chart',
    title: 'Missing values by column',
    type: 'bar',
    xKey: 'column',
    yKey: 'missing_count',
    aggregation: 'sum',
    groupKey: null,
    sort: 'none',
    filters: [],
  };
  return {
    sql: buildMissingSQL(dataset.name, dataset.columns),
    chartConfig,
    table,
    interpretation: {
      plain: `Missing-value counts for every column (${totalMissing.toLocaleString('en-US')} missing cells across ${total.toLocaleString('en-US')} rows).`,
      columns: dataset.columns.map((c) => ({
        name: c.name,
        type: c.type,
        role: 'Checked for missing values',
      })),
      calculation:
        'Counted null, empty-string and whitespace-only cells per column; missing_pct = missing / total rows × 100.',
    },
    clarification: null,
    error: null,
    suggestions: [],
  };
}

/* ------------------------------------------------------------------ */
/* Distribution (pie) answer — needs no metric resolution                */
/* ------------------------------------------------------------------ */

function distributionAnswer(dataset, target) {
  const title = `${cap(pretty(target.name))} breakdown`;
  const chartConfig = {
    id: 'nlq-chart',
    title,
    type: 'pie',
    xKey: target.name,
    yKey: null,
    aggregation: 'count',
    groupKey: null,
    sort: 'none',
    filters: [],
  };
  const sql = buildSQL({
    datasetName: dataset.name,
    xExpr: target.name,
    xAlias: target.name,
    groupKey: null,
    yKey: null,
    aggregation: 'count',
    sortDir: 'none',
    topN: null,
  });
  const built = buildChartData(dataset, chartConfig);
  if (built.error) {
    return {
      sql,
      chartConfig: null,
      table: null,
      interpretation: null,
      clarification: null,
      error: `I couldn't build that chart: ${built.error}`,
      suggestions: NLQ_EXAMPLES.slice(0, 3),
    };
  }
  return {
    sql,
    chartConfig,
    table: { columns: ['x', ...built.seriesKeys], rows: built.data },
    interpretation: {
      plain: title,
      columns: [{ name: target.name, type: target.type, role: 'Broken down' }],
      calculation: `COUNT(*) per ${target.name}; shown as share of total.`,
    },
    clarification: null,
    error: null,
    suggestions: [],
  };
}

/* ------------------------------------------------------------------ */
/* parseNLQ                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse a natural-language question into { sql, chartConfig, table,
 * interpretation, clarification }.
 * On no match: { error, suggestions } with sql/chartConfig/table null.
 * On ambiguity: { clarification } with clickable option queries.
 */
export function parseNLQ(question, dataset) {
  const q = String(question === null || question === undefined ? '' : question)
    .toLowerCase()
    .trim();
  if (!q || !dataset || !Array.isArray(dataset.columns) || dataset.columns.length === 0) {
    return noMatch();
  }
  const cols = dataset.columns;

  // 0. Missing-values special case --------------------------------------
  if (
    /\bmissing\b|\bnull\b|\bblank\b|\bempty\b/.test(q) &&
    /\bvalu|\bdata\b|\brow|\bfield|\bcolumn|\bpresent\b/.test(q)
  ) {
    return missingAnswer(dataset);
  }

  // 1. Aggregation -------------------------------------------------------
  let aggregation = null;
  let superlative = null; // 'top' | 'bottom'
  if (/\baverage\b|\bavg\b|\bmean\b/.test(q)) aggregation = 'avg';
  else if (/\btotal\b|\bsum\b|\bsummed\b/.test(q)) aggregation = 'sum';
  else if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(q)) aggregation = 'count';
  if (/\bhighest\b|\bmaximum\b|\bmax\b|\blargest\b|\bgreatest\b|\btop\b/.test(q)) superlative = 'top';
  else if (/\blowest\b|\bminimum\b|\bmin\b|\bsmallest\b|\bleast\b|\bbottom\b/.test(q)) superlative = 'bottom';

  // 2. Dimensions (resolved before the metric so the metric column itself
  //    is never mistaken for a grouping dimension) ---------------------------
  const { dims: rawDims, ambiguous } = resolveDimensions(q, cols);
  if (ambiguous.length > 0) {
    const { concept, cols: tied, words } = ambiguous[0];
    return clarify(
      `“${words[0]}” could refer to more than one column. Which one did you mean?`,
      tied.map((c) => ({
        label: `${cap(concept.label)} → ${pretty(c.name)}`,
        query: `${(AGG_WORDS[aggregation] || 'Total').toLowerCase()} by ${pretty(c.name)}`,
      }))
    );
  }

  // 2b. "Distribution / breakdown of X" -> pie of record counts. Handled
  //     before metric resolution: it needs no metric at all.
  const distM = q.match(/(?:distribution|breakdown) of (?:the )?([a-z][a-z_ ]*)/);
  if (distM) {
    const phrase = distM[1];
    const distDims = rawDims.filter((d) => d.type === 'categorical');
    const target =
      distDims.find(
        (c) => phrase.includes(c.name.toLowerCase()) || mentionsQuestion(phrase, c.name)
      ) || distDims[0];
    if (!target) return noMatch();
    return distributionAnswer(dataset, target);
  }

  // 3. Metric ------------------------------------------------------------------
  const metricRes = resolveMetric(q, cols, aggregation || 'sum', rawDims);
  if (metricRes.clarification) return metricRes.clarification;
  if (metricRes.unanswerable) return metricRes.unanswerable;

  // Metric was requested (avg/sum/...) but no metric word matched anything
  // known -> ask which numeric column, keeping the requested dimension.
  if (metricRes.needsMetricChoice) {
    const numericCols = cols.filter((c) => c.type === 'numeric');
    const reqAgg = aggregation || 'sum';
    const aggWord = (AGG_WORDS[reqAgg] || 'Total').toLowerCase();
    const dimCol = rawDims.find((d) => d.type === 'categorical') || rawDims[0];
    const dimSuffix = dimCol ? ` by ${pretty(dimCol.name)}` : '';
    return clarify(
      `Which numeric column should I ${reqAgg === 'avg' ? 'average' : reqAgg}?`,
      numericCols.map((c) => ({
        label: `${cap(aggWord)} ${pretty(c.name)}${dimSuffix}`,
        query: `${aggWord} ${pretty(c.name)}${dimSuffix}`,
      }))
    );
  }

  let yKey = null;
  let metricCol = null;
  let metricLabel = 'records';
  if (metricRes.kind === 'column') {
    metricCol = metricRes.col;
    yKey = metricCol.name;
    metricLabel = pretty(metricCol.name);
    if (metricRes.via === 'concept' && metricRes.phrase) {
      metricLabel = `${pretty(metricCol.name)} (matched “${metricRes.phrase}”)`;
    }
  }
  if (!aggregation) {
    aggregation = metricCol ? 'sum' : 'count';
  }

  // A column cannot be both the metric and a grouping dimension.
  const dims = metricCol ? rawDims.filter((d) => d.name !== metricCol.name) : rawDims;

  // 4. Time grain + date column --------------------------------------------
  const dateCol =
    cols.find((c) => c.type === 'date' && mentionsQuestion(q, c.name)) ||
    cols.find((c) => c.type === 'date');
  let grainInfo = null;
  for (const g of GRAINS) {
    if (g.re.test(q)) {
      grainInfo = g;
      break;
    }
  }

  // 4. (dimensions already resolved in step 2; date-typed ones route to
  //    the trend path)
  // Dimensions that are date columns route to the trend path.
  const dateDims = dims.filter((d) => d.type === 'date');
  const catDims = dims.filter((d) => d.type !== 'date');

  // 5. Patterns ----------------------------------------------------------------
  const topM = q.match(/\btop (\d+)\b/);
  const botM = q.match(/\bbottom (\d+)\b/);
  let topN = topM ? parseInt(topM[1], 10) : botM ? parseInt(botM[1], 10) : null;
  let sortDir = topM ? 'desc' : botM ? 'asc' : 'none';
  if (topN === null && superlative) {
    topN = 1;
    sortDir = superlative === 'top' ? 'desc' : 'asc';
  }
  const isTrend = /\btrend\b|over time/.test(q);
  const isCompare = /\bcompare\b|\bcomparison\b|\bversus\b|\bvs\b/.test(q);

  let type = null;
  let xKey = null;
  let groupKey = null;
  let workingDataset = dataset;
  let periodGrain = null;
  let interpretationCols = [];
  let calculation = '';

  const aggWord = AGG_WORDS[aggregation] || 'Total';
  const metricExprSQL =
    aggregation === 'count' ? (yKey ? `COUNT(${yKey})` : 'COUNT(*)') : `${AGG_FNS[aggregation]}(${yKey})`;

  // (distribution / breakdown questions are answered earlier via
  // distributionAnswer — they need no metric.)
  if (isTrend || grainInfo || dateDims.length > 0) {
    if (!dateCol) return noMatch();
    type = 'line';
    if (!grainInfo && dateDims.length > 0) {
      // "revenue by date" -> default to monthly buckets for readability
      grainInfo = GRAINS.find((g) => g.grain === 'monthly');
    }
    if (grainInfo) {
      workingDataset = withPeriod(dataset, dateCol.name, grainInfo.grain);
      xKey = '__period';
      periodGrain = grainInfo;
      interpretationCols = [
        { name: dateCol.name, type: 'date', role: `Time bucket (${grainInfo.grain})` },
      ];
    } else {
      xKey = dateCol.name;
      interpretationCols = [{ name: dateCol.name, type: 'date', role: 'Time axis' }];
    }
    if (catDims.length > 0) {
      groupKey = catDims[0].name;
      interpretationCols.push({
        name: groupKey,
        type: cols.find((c) => c.name === groupKey).type,
        role: 'Series split',
      });
    }
    if (metricCol) {
      interpretationCols.unshift({
        name: metricCol.name,
        type: 'numeric',
        role: `Metric (${AGG_FNS[aggregation]})`,
      });
    }
    calculation = metricCol
      ? `${metricExprSQL} per ${periodGrain ? periodGrain.grain + ' period' : 'date'}${groupKey ? `, split by ${groupKey}` : ''}; chronological order.`
      : `COUNT(*) per ${periodGrain ? periodGrain.grain + ' period' : 'date'}${groupKey ? `, split by ${groupKey}` : ''}; chronological order.`;
  } else if (catDims.length > 0) {
    type = 'bar';
    xKey = catDims[0].name;
    if (catDims.length > 1) groupKey = catDims[1].name;
    if (metricCol) {
      interpretationCols.push({
        name: metricCol.name,
        type: 'numeric',
        role: `Metric (${AGG_FNS[aggregation]})`,
      });
    }
    interpretationCols.push({ name: xKey, type: cols.find((c) => c.name === xKey).type, role: 'Grouped by' });
    if (groupKey) {
      interpretationCols.push({
        name: groupKey,
        type: cols.find((c) => c.name === groupKey).type,
        role: 'Series split',
      });
    }
    calculation = metricCol
      ? `${metricExprSQL} per ${xKey}${groupKey ? `, split by ${groupKey}` : ''}${topN ? `; sorted ${sortDir === 'desc' ? 'high → low' : 'low → high'}, top ${topN} shown` : ''}.`
      : `COUNT(*) per ${xKey}${groupKey ? `, split by ${groupKey}` : ''}${topN ? `; sorted ${sortDir === 'desc' ? 'high → low' : 'low → high'}, top ${topN} shown` : ''}.`;
  } else if (isCompare && metricCol) {
    // "compare ..." with a metric but no dimension -> ask for the dimension
    const catColumns = cols.filter((c) => c.type === 'categorical');
    if (catColumns.length === 0) return noMatch();
    return clarify(
      `What should I compare ${aggWord.toLowerCase()} ${pretty(metricCol.name)} across?`,
      catColumns.map((c) => ({
        label: `${aggWord} ${pretty(metricCol.name)} by ${pretty(c.name)}`,
        query: `${aggWord.toLowerCase()} ${pretty(metricCol.name)} by ${pretty(c.name)}`,
      }))
    );
  } else {
    // Metric (or nothing) but no usable dimension.
    const catColumns = cols.filter((c) => c.type === 'categorical');
    if (metricCol && catColumns.length > 0) {
      return clarify(
        `How should I break down ${aggWord.toLowerCase()} ${pretty(metricCol.name)}?`,
        catColumns.slice(0, 6).map((c) => ({
          label: `By ${pretty(c.name)}`,
          query: `${aggWord.toLowerCase()} ${pretty(metricCol.name)} by ${pretty(c.name)}`,
        }))
      );
    }
    return noMatch();
  }

  // 6. Title ---------------------------------------------------------------------
  let title;
  if (type === 'line') {
    title = periodGrain
      ? `${periodGrain.title} ${metricLabel}${groupKey ? ' by ' + pretty(groupKey) : ''}`
      : `${cap(metricLabel)} trend over time`;
  } else if (topN === 1 && superlative) {
    title = `${superlative === 'top' ? 'Highest' : 'Lowest'} ${metricLabel} by ${pretty(xKey)}`;
  } else {
    title = `${aggWord} ${metricLabel} by ${pretty(xKey)}`;
  }
  if (topN && topN > 1 && type === 'bar') {
    title = `${sortDir === 'desc' ? 'Top' : 'Bottom'} ${topN} ${pretty(xKey)} by ${metricLabel}`;
  }

  const chartConfig = {
    id: 'nlq-chart',
    title,
    type,
    xKey,
    yKey,
    aggregation,
    groupKey,
    sort: sortDir !== 'none' ? sortDir : type === 'line' ? 'asc' : 'none',
    filters: [],
  };

  // 7. Illustrative SQL ------------------------------------------------------------
  const sql = buildSQL({
    datasetName: dataset.name,
    xExpr: periodGrain ? `DATE_TRUNC('${periodGrain.trunc}', ${dateCol.name})` : xKey,
    xAlias: periodGrain ? periodGrain.alias : xKey,
    groupKey,
    yKey,
    aggregation,
    sortDir,
    topN,
  });

  // 8. Compute in-browser -----------------------------------------------------------
  const built = buildChartData(workingDataset, chartConfig);
  if (built.error) {
    return {
      sql,
      chartConfig: null,
      table: null,
      interpretation: null,
      clarification: null,
      error: `I couldn't build that chart: ${built.error}`,
      suggestions: NLQ_EXAMPLES.slice(0, 3),
    };
  }

  let data = built.data;
  if (topN) {
    const dir = sortDir === 'asc' ? 1 : -1;
    data = [...data]
      .sort((a, b) => {
        const va = metricTotal(a, built.seriesKeys);
        const vb = metricTotal(b, built.seriesKeys);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return dir * (va - vb);
      })
      .slice(0, topN);
  }

  const interpretation = {
    plain: title,
    columns: interpretationCols,
    calculation,
  };

  return {
    sql,
    chartConfig,
    table: { columns: ['x', ...built.seriesKeys], rows: data },
    interpretation,
    clarification: null,
    error: null,
    suggestions: [],
  };
}
