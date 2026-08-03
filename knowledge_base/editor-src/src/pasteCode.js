// Paste-time code detection. Intercepts pastes into the editor before
// BlockNote's own importer and, when the pasted text is clearly a code
// snippet (markdown fenced block or an indented / token-heavy fragment),
// turns it into a real code block — with the fence's language when one is
// given, otherwise Python (this app's default for interactive execution).
// Returns { code, language } or null (null = let BlockNote handle it).

const LANG_ALIASES = {
  py: "python",
  python3: "python",
  python2: "python",
  js: "javascript",
  ts: "typescript",
  bash: "shell",
  sh: "shell",
  shellscript: "shell",
  yml: "yaml",
  md: "markdown",
  cpp: "cpp",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  htm: "html",
};

export function normalizeCodeLanguage(lang) {
  const l = (lang || "").trim().toLowerCase();
  if (!l) return "python";
  return LANG_ALIASES[l] || l;
}

// Whole-paste markdown fenced block: "```lang\n...\n```" (also ~~~ and $$).
const FENCED_RE = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+.#-]*)\s*\n([\s\S]*?)\s*\1\s*$/;

export function detectFencedBlock(text) {
  const m = FENCED_RE.exec(text);
  if (!m) return null;
  return {
    code: m[3].replace(/\n+$/, ""),
    language: normalizeCodeLanguage(m[2]),
  };
}

// Lines that are unmistakably source code rather than prose.
const CODE_LINE_RE =
  /^\s*(?:def\b|class\b|import\b|from\b|return\b|if\b|elif\b|else\b|for\b|while\b|print\s*\(|async\b|await\b|lambda\b|try\b|except\b|finally\b|with\b|yield\b|pass\b|#|@|\/\/|\/\*|<\?php|<script|<\/script>|const\b|let\b|var\b|function\b|echo\b|System\.out)/;

// A single line is worth converting on its own only when it starts with a
// clear programming construct (so "print(2**10)" becomes runnable, but a
// prose sentence never does).
const SINGLE_LINE_RE =
  /^\s*(?:print\s*\(|def\s+\w+|class\s+\w+|import\s+\w+|from\s+\w+\s+import\b|[A-Za-z_][\w.]*\s*=\s*["'[({0-9])/;

// Assignment / call / operator-heavy lines that still smell like code when
// they show up in a block with other strong signals.
const CODE_SIGNAL_RE = /^(?:[A-Za-z_][\w.]*\s*(?:=|\[|\(|\.)\b|[A-Za-z_][\w.]*\s*=)|[;{}]\s*$/;

export function looksLikeCode(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");

  if (nonEmpty.length < 2) {
    // Single-line fragment: only when it unmistakably starts a construct.
    return nonEmpty.length === 1 && SINGLE_LINE_RE.test(nonEmpty[0]);
  }

  let indented = 0;
  let codeTokens = 0;
  for (const l of nonEmpty) {
    const t = l.trim();
    if (/^[ \t]{2,}/.test(l)) indented++;
    if (CODE_LINE_RE.test(t)) codeTokens++;
    else if (CODE_SIGNAL_RE.test(t)) codeTokens++;
  }

  // Indented block of 2+ lines = pasted code (Python snippets are indented).
  if (indented >= 2 && indented >= nonEmpty.length * 0.5) return true;
  // Two or more clear code lines in a multi-line paste.
  return codeTokens >= 2 && nonEmpty.length >= 2;
}

export function detectPastedCode(text) {
  if (!text || !text.trim()) return null;

  const fenced = detectFencedBlock(text);
  if (fenced) return fenced;

  if (looksLikeCode(text)) {
    return {
      code: text.replace(/\r\n?/g, "\n").replace(/\n+$/, ""),
      language: "python",
    };
  }
  return null;
}
