// Escape special LaTeX characters in user-supplied text
function esc(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

// ── Shared section content builders ──────────────────────────────────────────
// These build the content (not the heading style) shared by all templates.

function contactLine(c) {
  return [
    c.phone ? esc(c.phone) : null,
    c.email ? `\\href{mailto:${esc(c.email)}}{\\underline{${esc(c.email)}}}` : null,
    c.location ? esc(c.location) : null,
    c.linkedin ? `\\href{${esc(c.linkedin)}}{\\underline{LinkedIn}}` : null,
    c.github ? `\\href{${esc(c.github)}}{\\underline{GitHub}}` : null,
    c.website ? `\\href{${esc(c.website)}}{\\underline{Portfolio}}` : null,
  ].filter(Boolean).join(' $|$ ');
}

// ── Template 1: Jake's Resume (the standard) ──────────────────────────────────

function templateJake(resume) {
  const c = resume.contact || {};

  function expSection() {
    if (!resume.experience?.length) return '';
    const entries = resume.experience.map(e => {
      const bullets = (e.bullets || []).map(b => `        \\resumeItem{${esc(b)}}`).join('\n');
      return `    \\resumeSubheading{${esc(e.title)}}{${esc(e.period)}}{${esc(e.company)}}{${esc(e.location)}}\n      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n%-----------EXPERIENCE-----------\n\\section{Experience}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function skillsSection() {
    if (!resume.skills?.length) return '';
    const rows = [];
    for (let i = 0; i < resume.skills.length; i += 10) {
      rows.push(resume.skills.slice(i, i + 10).map(esc).join(', '));
    }
    return `\n%-----------SKILLS-----------\n\\section{Technical Skills}\n  \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\\textbf{Skills}{: ${rows.join('; ')}}}}\n  \\end{itemize}\n`;
  }

  function projectsSection() {
    if (!resume.projects?.length) return '';
    const entries = resume.projects.map(p => {
      const heading = p.tech ? `\\textbf{${esc(p.name)}} $|$ \\emph{\\small{${esc(p.tech)}}}` : `\\textbf{${esc(p.name)}}`;
      return `    \\resumeProjectHeading{${heading}}{}\n      \\resumeItemListStart\n        \\resumeItem{${esc(p.description)}}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n%-----------PROJECTS-----------\n\\section{Projects}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function educationSection() {
    if (!resume.education?.length) return '';
    const entries = resume.education.map(e =>
      `    \\resumeSubheading{${esc(e.institution)}}{${esc(e.year)}}{${esc(e.degree)}}{}`
    ).join('\n\n');
    return `\n%-----------EDUCATION-----------\n\\section{Education}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function certsSection() {
    if (!resume.certifications?.length) return '';
    const items = resume.certifications.map(c => `      \\resumeItem{${esc(c)}}`).join('\n');
    return `\n%-----------CERTIFICATIONS-----------\n\\section{Certifications}\n  \\resumeSubHeadingListStart\n    \\item\n    \\resumeItemListStart\n${items}\n    \\resumeItemListEnd\n  \\resumeSubHeadingListEnd\n`;
  }

  function summarySection() {
    if (!resume.summary) return '';
    return `\n%-----------SUMMARY-----------\n\\section{Professional Summary}\n  \\small{${esc(resume.summary)}}\n`;
  }

  return `%% Jake's Resume Template — ATS-Friendly
%% Compile: pdflatex resume.tex  OR  upload to https://overleaf.com
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\pagestyle{fancy}\\fancyhf{}\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}\\addtolength{\\topmargin}{-.5in}\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}\\raggedbottom\\raggedright\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{#1 \\vspace{-2pt}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\\\textit{\\small#3} & \\textit{\\small #4} \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\\\end{tabular*}\\vspace{-7pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\begin{document}
\\begin{center}
  {\\Huge \\scshape ${esc(resume.name || 'Your Name')}} \\\\[4pt]
  \\small ${contactLine(c)}
\\end{center}
${summarySection()}${expSection()}${skillsSection()}${projectsSection()}${educationSection()}${certsSection()}
\\end{document}
`;
}

// ── Template 2: Professional / Corporate ─────────────────────────────────────
// Bold section headers with ruled underline, left-aligned name block,
// experience before education, conservative serif font via package option.

function templateProfessional(resume) {
  const c = resume.contact || {};

  function secHeading(title) {
    return `\\noindent{\\large\\textbf{${title}}}\\vspace{1pt}\\hrule\\vspace{4pt}`;
  }

  function expSection() {
    if (!resume.experience?.length) return '';
    const entries = resume.experience.map(e => {
      const bullets = (e.bullets || []).map(b => `  \\item ${esc(b)}`).join('\n');
      return `\\noindent\\textbf{${esc(e.title)}}\\hfill ${esc(e.period)}\\\\
\\textit{${esc(e.company)}${e.location ? `, ${esc(e.location)}` : ''}}\\\\[-4pt]
\\begin{itemize}[leftmargin=*, topsep=2pt, itemsep=0pt, parsep=0pt]
${bullets}
\\end{itemize}\\vspace{4pt}`;
    }).join('\n');
    return `\\vspace{6pt}\n${secHeading('PROFESSIONAL EXPERIENCE')}\n${entries}`;
  }

  function educationSection() {
    if (!resume.education?.length) return '';
    const entries = resume.education.map(e =>
      `\\noindent\\textbf{${esc(e.degree)}}\\hfill ${esc(e.year)}\\\\\n\\textit{${esc(e.institution)}}\\\\[2pt]`
    ).join('\n');
    return `\\vspace{6pt}\n${secHeading('EDUCATION')}\n${entries}`;
  }

  function skillsSection() {
    if (!resume.skills?.length) return '';
    return `\\vspace{6pt}\n${secHeading('TECHNICAL SKILLS')}\n\\noindent ${resume.skills.map(esc).join(' \\textbullet\\ ')}\\\\[2pt]`;
  }

  function projectsSection() {
    if (!resume.projects?.length) return '';
    const entries = resume.projects.map(p =>
      `\\noindent\\textbf{${esc(p.name)}}${p.tech ? ` --- \\textit{${esc(p.tech)}}` : ''}\\\\\n${esc(p.description)}\\\\[4pt]`
    ).join('\n');
    return `\\vspace{6pt}\n${secHeading('PROJECTS')}\n${entries}`;
  }

  function certsSection() {
    if (!resume.certifications?.length) return '';
    const items = resume.certifications.map(c => `  \\item ${esc(c)}`).join('\n');
    return `\\vspace{6pt}\n${secHeading('CERTIFICATIONS')}\n\\begin{itemize}[leftmargin=*, topsep=2pt, itemsep=0pt]\n${items}\n\\end{itemize}`;
  }

  function summarySection() {
    if (!resume.summary) return '';
    return `\\vspace{6pt}\n${secHeading('PROFESSIONAL SUMMARY')}\n\\noindent ${esc(resume.summary)}\\\\[4pt]`;
  }

  const contactParts = [c.phone, c.email, c.location, c.linkedin, c.github].filter(Boolean).map(esc);

  return `%% Professional/Corporate Resume Template — ATS-Friendly
%% Compile: pdflatex resume.tex  OR  upload to https://overleaf.com
\\documentclass[11pt,letterpaper]{article}
\\usepackage[top=0.6in,bottom=0.6in,left=0.75in,right=0.75in]{geometry}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{parskip}
\\input{glyphtounicode}
\\pdfgentounicode=1
\\setlength{\\parindent}{0pt}
\\begin{document}
\\begin{center}
  {\\LARGE\\textbf{${esc(resume.name || 'Your Name')}}}\\\\[4pt]
  ${contactParts.join(' $\\cdot$ ')}
\\end{center}
\\vspace{-6pt}\\noindent\\rule{\\linewidth}{0.6pt}\\vspace{-4pt}
${summarySection()}${expSection()}${educationSection()}${skillsSection()}${projectsSection()}${certsSection()}
\\end{document}
`;
}

// ── Template 3: Compact (10pt, tighter spacing) ───────────────────────────────
// Jake's macros with 10pt font and reduced vspace for 1-page dense resumes.

function templateCompact(resume) {
  const c = resume.contact || {};

  function expSection() {
    if (!resume.experience?.length) return '';
    const entries = resume.experience.map(e => {
      const bullets = (e.bullets || []).map(b => `        \\resumeItem{${esc(b)}}`).join('\n');
      return `    \\resumeSubheading{${esc(e.title)}}{${esc(e.period)}}{${esc(e.company)}}{${esc(e.location)}}\n      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n\\section{Experience}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function skillsSection() {
    if (!resume.skills?.length) return '';
    const rows = [];
    for (let i = 0; i < resume.skills.length; i += 12) {
      rows.push(resume.skills.slice(i, i + 12).map(esc).join(', '));
    }
    return `\n\\section{Technical Skills}\n  \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\\textbf{Skills}{: ${rows.join('; ')}}}}\n  \\end{itemize}\n`;
  }

  function projectsSection() {
    if (!resume.projects?.length) return '';
    const entries = resume.projects.map(p => {
      const heading = p.tech ? `\\textbf{${esc(p.name)}} $|$ \\emph{\\small{${esc(p.tech)}}}` : `\\textbf{${esc(p.name)}}`;
      return `    \\resumeProjectHeading{${heading}}{}\n      \\resumeItemListStart\n        \\resumeItem{${esc(p.description)}}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n\\section{Projects}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function educationSection() {
    if (!resume.education?.length) return '';
    const entries = resume.education.map(e =>
      `    \\resumeSubheading{${esc(e.institution)}}{${esc(e.year)}}{${esc(e.degree)}}{}`
    ).join('\n\n');
    return `\n\\section{Education}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function certsSection() {
    if (!resume.certifications?.length) return '';
    const items = resume.certifications.map(c => `      \\resumeItem{${esc(c)}}`).join('\n');
    return `\n\\section{Certifications}\n  \\resumeSubHeadingListStart\n    \\item\n    \\resumeItemListStart\n${items}\n    \\resumeItemListEnd\n  \\resumeSubHeadingListEnd\n`;
  }

  return `%% Compact Resume Template (10pt) — ATS-Friendly
%% Compile: pdflatex resume.tex  OR  upload to https://overleaf.com
\\documentclass[letterpaper,10pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\pagestyle{fancy}\\fancyhf{}\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.55in}\\addtolength{\\evensidemargin}{-0.55in}
\\addtolength{\\textwidth}{1.1in}\\addtolength{\\topmargin}{-.6in}\\addtolength{\\textheight}{1.2in}
\\urlstyle{same}\\raggedbottom\\raggedright\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-5pt}\\scshape\\raggedright\\normalsize}{}{0em}{}[\\color{black}\\titlerule \\vspace{-4pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{#1 \\vspace{-3pt}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{\\small#1} & \\small#2 \\\\\\textit{\\footnotesize#3} & \\textit{\\footnotesize #4} \\\\\\end{tabular*}\\vspace{-6pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\\\end{tabular*}\\vspace{-6pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.12in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[topsep=1pt]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-4pt}}
\\begin{document}
\\begin{center}
  {\\Large\\scshape\\textbf{${esc(resume.name || 'Your Name')}}} \\\\[2pt]
  \\small ${contactLine(c)}
\\end{center}
${expSection()}${skillsSection()}${projectsSection()}${educationSection()}${certsSection()}
\\end{document}
`;
}

// ── Template 4: Tech Focus (skills & projects first) ─────────────────────────

function templateTechnical(resume) {
  const c = resume.contact || {};

  function secHead(title) {
    return `\\section{${title}}`;
  }

  function skillsSection() {
    if (!resume.skills?.length) return '';
    const rows = [];
    for (let i = 0; i < resume.skills.length; i += 10) {
      rows.push(resume.skills.slice(i, i + 10).map(esc).join(', '));
    }
    return `\n${secHead('Technical Skills')}\n  \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\\textbf{Languages/Frameworks}{: ${rows.join('; ')}}}}\n  \\end{itemize}\n`;
  }

  function projectsSection() {
    if (!resume.projects?.length) return '';
    const entries = resume.projects.map(p => {
      const heading = p.tech ? `\\textbf{${esc(p.name)}} $|$ \\emph{\\small{${esc(p.tech)}}}` : `\\textbf{${esc(p.name)}}`;
      return `    \\resumeProjectHeading{${heading}}{}\n      \\resumeItemListStart\n        \\resumeItem{${esc(p.description)}}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n${secHead('Projects')}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function expSection() {
    if (!resume.experience?.length) return '';
    const entries = resume.experience.map(e => {
      const bullets = (e.bullets || []).map(b => `        \\resumeItem{${esc(b)}}`).join('\n');
      return `    \\resumeSubheading{${esc(e.title)}}{${esc(e.period)}}{${esc(e.company)}}{${esc(e.location)}}\n      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd`;
    }).join('\n\n');
    return `\n${secHead('Work Experience')}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function educationSection() {
    if (!resume.education?.length) return '';
    const entries = resume.education.map(e =>
      `    \\resumeSubheading{${esc(e.institution)}}{${esc(e.year)}}{${esc(e.degree)}}{}`
    ).join('\n\n');
    return `\n${secHead('Education')}\n  \\resumeSubHeadingListStart\n${entries}\n  \\resumeSubHeadingListEnd\n`;
  }

  function certsSection() {
    if (!resume.certifications?.length) return '';
    const items = resume.certifications.map(c => `      \\resumeItem{${esc(c)}}`).join('\n');
    return `\n${secHead('Certifications')}\n  \\resumeSubHeadingListStart\n    \\item\n    \\resumeItemListStart\n${items}\n    \\resumeItemListEnd\n  \\resumeSubHeadingListEnd\n`;
  }

  return `%% Tech Focus Resume Template — ATS-Friendly (Skills & Projects First)
%% Compile: pdflatex resume.tex  OR  upload to https://overleaf.com
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\pagestyle{fancy}\\fancyhf{}\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}\\addtolength{\\topmargin}{-.5in}\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}\\raggedbottom\\raggedright\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{#1 \\vspace{-2pt}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\\\textit{\\small#3} & \\textit{\\small #4} \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\\\end{tabular*}\\vspace{-7pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\begin{document}
\\begin{center}
  {\\Huge\\scshape ${esc(resume.name || 'Your Name')}} \\\\[4pt]
  \\small ${contactLine(c)}
\\end{center}
${skillsSection()}${projectsSection()}${expSection()}${educationSection()}${certsSection()}
\\end{document}
`;
}

// ── Template 5: Minimal ATS (no extra packages, guaranteed parseable) ─────────
// Uses only geometry + hyperref. No titlesec, no tabularx, no fancyhdr.
// Maximum compatibility with old/strict ATS parsers.

function templateMinimal(resume) {
  const c = resume.contact || {};
  const contactParts = [c.phone, c.email, c.location, c.linkedin, c.github].filter(Boolean).map(esc);

  function secHead(title) {
    return `\\vspace{8pt}\\noindent{\\large\\textbf{${title.toUpperCase()}}}\\\\[-2pt]\n\\hrule\\vspace{4pt}`;
  }

  function expSection() {
    if (!resume.experience?.length) return '';
    const entries = resume.experience.map(e => {
      const bullets = (e.bullets || []).map(b => `  \\item ${esc(b)}`).join('\n');
      return `\\noindent\\textbf{${esc(e.title)}}, \\textit{${esc(e.company)}}\\hfill ${esc(e.period)}\\\\\n${e.location ? `${esc(e.location)}\\\\[2pt]\n` : '\\vspace{2pt}\n'}\\begin{itemize}[leftmargin=1em, topsep=0pt, itemsep=0pt]\n${bullets}\n\\end{itemize}\\vspace{4pt}`;
    }).join('\n');
    return `\n${secHead('Experience')}\n${entries}`;
  }

  function educationSection() {
    if (!resume.education?.length) return '';
    const entries = resume.education.map(e =>
      `\\noindent\\textbf{${esc(e.degree)}}\\hfill ${esc(e.year)}\\\\\n\\textit{${esc(e.institution)}}\\\\[4pt]`
    ).join('\n');
    return `\n${secHead('Education')}\n${entries}`;
  }

  function skillsSection() {
    if (!resume.skills?.length) return '';
    return `\n${secHead('Skills')}\n\\noindent ${resume.skills.map(esc).join(' \\textbullet\\ ')}\\\\[4pt]`;
  }

  function projectsSection() {
    if (!resume.projects?.length) return '';
    const entries = resume.projects.map(p =>
      `\\noindent\\textbf{${esc(p.name)}}${p.tech ? ` --- \\textit{${esc(p.tech)}}` : ''}\\\\\n${esc(p.description)}\\\\[4pt]`
    ).join('\n');
    return `\n${secHead('Projects')}\n${entries}`;
  }

  function certsSection() {
    if (!resume.certifications?.length) return '';
    const items = resume.certifications.map(c => `  \\item ${esc(c)}`).join('\n');
    return `\n${secHead('Certifications')}\n\\begin{itemize}[leftmargin=1em, topsep=0pt, itemsep=0pt]\n${items}\n\\end{itemize}`;
  }

  function summarySection() {
    if (!resume.summary) return '';
    return `\n${secHead('Summary')}\n\\noindent ${esc(resume.summary)}\\\\[4pt]`;
  }

  return `%% Minimal ATS Resume — Maximum parser compatibility
%% Only requires: geometry, hyperref, enumitem
%% Compile: pdflatex resume.tex  OR  upload to https://overleaf.com
\\documentclass[11pt, letterpaper]{article}
\\usepackage[top=0.65in, bottom=0.65in, left=0.75in, right=0.75in]{geometry}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\setlength{\\parindent}{0pt}
\\begin{document}
\\begin{center}
  {\\LARGE\\textbf{${esc(resume.name || 'Your Name')}}}\\\\[4pt]
  ${contactParts.join(' $\\cdot$ ')}
\\end{center}
${summarySection()}${expSection()}${educationSection()}${skillsSection()}${projectsSection()}${certsSection()}
\\end{document}
`;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const LATEX_TEMPLATES = {
  jake:         { fn: templateJake,        label: "Jake's Resume" },
  professional: { fn: templateProfessional, label: 'Professional' },
  compact:      { fn: templateCompact,     label: 'Compact 10pt' },
  technical:    { fn: templateTechnical,   label: 'Tech Focus' },
  minimal:      { fn: templateMinimal,     label: 'Minimal ATS' },
};

const LATEX_TEMPLATE_LIST = Object.entries(LATEX_TEMPLATES).map(([id, t]) => ({ id, label: t.label }));

function generateResumeLatex(resume, templateId = 'jake') {
  const tpl = LATEX_TEMPLATES[templateId] || LATEX_TEMPLATES.jake;
  return tpl.fn(resume);
}

module.exports = { generateResumeLatex, LATEX_TEMPLATE_LIST };
