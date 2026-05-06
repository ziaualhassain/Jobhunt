const PDFDocument = require('pdfkit');

// Strip control characters that corrupt PDF streams
function clean(text) {
  return (text || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

// ── Template configurations ───────────────────────────────────────────────────

const TEMPLATES = {
  jake: {
    label: 'Jake Classic',
    font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique',
    nameSize: 20, nameAlign: 'center',
    contactSize: 9.5, contactAlign: 'center',
    secSize: 11, secUnderline: true,
    bodySize: 10, smallSize: 9.5,
    entryStyle: 'two-col',
    bullet: '•  ',
    sectionSpacing: 0.65,
    entrySpacing: 0.4,
    sectionOrder: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications'],
  },
  traditional: {
    label: 'Corporate Pro',
    font: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic',
    nameSize: 20, nameAlign: 'left',
    contactSize: 10, contactAlign: 'left',
    secSize: 12, secUnderline: true,
    bodySize: 11, smallSize: 10,
    entryStyle: 'two-col',
    bullet: '-  ',
    sectionSpacing: 0.6,
    entrySpacing: 0.35,
    sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'],
  },
  clean: {
    label: 'Modern Clean',
    font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique',
    nameSize: 22, nameAlign: 'left',
    contactSize: 9.5, contactAlign: 'left',
    secSize: 10.5, secUnderline: false,
    bodySize: 10, smallSize: 9.5,
    entryStyle: 'stacked',
    bullet: '•  ',
    sectionSpacing: 0.8,
    entrySpacing: 0.5,
    sectionOrder: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications'],
  },
  technical: {
    label: 'Tech Focus',
    font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique',
    nameSize: 20, nameAlign: 'center',
    contactSize: 9.5, contactAlign: 'center',
    secSize: 11, secUnderline: true,
    bodySize: 10, smallSize: 9.5,
    entryStyle: 'two-col',
    bullet: '•  ',
    sectionSpacing: 0.65,
    entrySpacing: 0.4,
    sectionOrder: ['skills', 'projects', 'experience', 'education', 'certifications'],
  },
  compact: {
    label: 'Compact Plus',
    font: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique',
    nameSize: 17, nameAlign: 'center',
    contactSize: 8.5, contactAlign: 'center',
    secSize: 10, secUnderline: true,
    bodySize: 9, smallSize: 8.5,
    entryStyle: 'two-col',
    bullet: '•  ',
    sectionSpacing: 0.5,
    entrySpacing: 0.3,
    sectionOrder: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications'],
  },
};

// Export template metadata for the frontend to display
const TEMPLATE_LIST = Object.entries(TEMPLATES).map(([id, t]) => ({
  id,
  label: t.label,
}));

// ── Renderer factory ──────────────────────────────────────────────────────────

function makeRenderer(doc, ML, MR, PW, cfg) {
  const CW = PW - ML - MR;

  function sectionHeader(title) {
    doc.moveDown(cfg.sectionSpacing);
    doc.font(cfg.bold).fontSize(cfg.secSize).fillColor('#000000')
       .text(title.toUpperCase(), ML, doc.y);
    if (cfg.secUnderline) {
      doc.moveDown(0.1);
      doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).lineWidth(0.6).stroke('#000000');
    }
    doc.moveDown(0.3);
  }

  function twoColLine(left, leftFont, leftSize, right, rightFont, rightSize) {
    const startY = doc.y;
    doc.font(rightFont).fontSize(rightSize);
    const rw = right ? Math.ceil(doc.widthOfString(right)) + 6 : 0;
    doc.font(leftFont).fontSize(leftSize).fillColor('#000000')
       .text(left || '', ML, startY, { width: CW - rw - 4 });
    const afterLeft = doc.y;
    if (right) {
      doc.font(rightFont).fontSize(rightSize).fillColor('#555555')
         .text(right, PW - MR - rw, startY, { width: rw, align: 'right' });
    }
    doc.y = Math.max(afterLeft, doc.y);
  }

  function subline(text) {
    if (!text) return;
    doc.font(cfg.italic).fontSize(cfg.bodySize).fillColor('#333333')
       .text(text, ML, doc.y, { width: CW });
  }

  function bullet(text) {
    doc.font(cfg.font).fontSize(cfg.bodySize).fillColor('#111111')
       .text(cfg.bullet + clean(text), ML + 12, doc.y, { width: CW - 12 });
  }

  function renderName(name) {
    doc.font(cfg.bold).fontSize(cfg.nameSize).fillColor('#000000')
       .text(clean(name || 'Your Name'), { align: cfg.nameAlign });
  }

  function renderContact(contact) {
    const parts = [
      contact.phone, contact.email, contact.location,
      contact.linkedin, contact.github, contact.website,
    ].filter(Boolean).map(clean);
    if (!parts.length) return;
    doc.moveDown(0.2)
       .font(cfg.font).fontSize(cfg.contactSize).fillColor('#222222')
       .text(parts.join('  |  '), { align: cfg.contactAlign });
  }

  function renderSummary(summary) {
    if (!summary) return;
    sectionHeader('Professional Summary');
    doc.font(cfg.font).fontSize(cfg.bodySize).fillColor('#111111')
       .text(clean(summary), ML, doc.y, { width: CW });
  }

  function renderExperience(experience) {
    if (!experience?.length) return;
    sectionHeader('Experience');
    for (const exp of experience) {
      if (cfg.entryStyle === 'two-col') {
        twoColLine(clean(exp.title), cfg.bold, cfg.bodySize + 0.5, clean(exp.period), cfg.font, cfg.smallSize);
        const sub = [exp.company, exp.location].filter(Boolean).map(clean).join(', ');
        subline(sub);
      } else {
        // stacked: title then company+date below
        doc.font(cfg.bold).fontSize(cfg.bodySize + 0.5).fillColor('#000000')
           .text(clean(exp.title), ML, doc.y, { width: CW });
        const subParts = [exp.company, exp.location].filter(Boolean).map(clean).join(', ');
        const subLine = [subParts, exp.period].filter(Boolean).join('  —  ');
        doc.font(cfg.italic).fontSize(cfg.smallSize).fillColor('#444444')
           .text(subLine, ML, doc.y, { width: CW });
      }
      doc.moveDown(0.15);
      for (const b of (exp.bullets || [])) bullet(b);
      doc.moveDown(cfg.entrySpacing);
    }
  }

  function renderSkills(skills) {
    if (!skills?.length) return;
    sectionHeader('Technical Skills');
    const items = skills.map(clean);
    for (let i = 0; i < items.length; i += 8) {
      doc.font(cfg.font).fontSize(cfg.bodySize).fillColor('#111111')
         .text(items.slice(i, i + 8).join('  •  '), ML, doc.y, { width: CW });
    }
  }

  function renderProjects(projects) {
    if (!projects?.length) return;
    sectionHeader('Projects');
    for (const proj of projects) {
      const label = proj.tech
        ? clean(proj.name) + '  |  ' + clean(proj.tech)
        : clean(proj.name);
      doc.font(cfg.bold).fontSize(cfg.bodySize + 0.5).fillColor('#000000')
         .text(label, ML, doc.y, { width: CW });
      if (proj.description) bullet(proj.description);
      doc.moveDown(cfg.entrySpacing - 0.1);
    }
  }

  function renderEducation(education) {
    if (!education?.length) return;
    sectionHeader('Education');
    for (const ed of education) {
      if (cfg.entryStyle === 'two-col') {
        twoColLine(clean(ed.degree), cfg.bold, cfg.bodySize + 0.5, clean(ed.year), cfg.font, cfg.smallSize);
        subline(clean(ed.institution));
      } else {
        doc.font(cfg.bold).fontSize(cfg.bodySize + 0.5).fillColor('#000000')
           .text(clean(ed.degree), ML, doc.y, { width: CW });
        doc.font(cfg.italic).fontSize(cfg.smallSize).fillColor('#444444')
           .text([ed.institution, ed.year].filter(Boolean).map(clean).join(', '), ML, doc.y, { width: CW });
      }
      doc.moveDown(cfg.entrySpacing);
    }
  }

  function renderCertifications(certs) {
    if (!certs?.length) return;
    sectionHeader('Certifications');
    for (const cert of certs) bullet(cert);
  }

  return { renderName, renderContact, renderSummary, renderExperience, renderSkills, renderProjects, renderEducation, renderCertifications };
}

// ── Main export ───────────────────────────────────────────────────────────────

function generateResumePdf(resume, templateId = 'jake') {
  const cfg = TEMPLATES[templateId] || TEMPLATES.jake;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      size: 'LETTER',
      info: {
        Title: clean(resume.name || 'Resume'),
        Author: clean(resume.name || ''),
        Subject: 'Resume',
        Keywords: (resume.skills || []).slice(0, 10).map(clean).join(', '),
      },
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;
    const ML = 54, MR = 54;
    const r = makeRenderer(doc, ML, MR, PW, cfg);

    r.renderName(resume.name);
    r.renderContact(resume.contact || {});

    // Draw a thin separator line after contact for the 'traditional' and 'clean' templates
    if (cfg.nameAlign === 'left') {
      doc.moveDown(0.3);
      doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).lineWidth(0.4).stroke('#888888');
    }

    const SECTION_MAP = {
      summary:        () => r.renderSummary(resume.summary),
      experience:     () => r.renderExperience(resume.experience),
      skills:         () => r.renderSkills(resume.skills),
      projects:       () => r.renderProjects(resume.projects),
      education:      () => r.renderEducation(resume.education),
      certifications: () => r.renderCertifications(resume.certifications),
    };

    for (const sec of cfg.sectionOrder) {
      SECTION_MAP[sec]?.();
    }

    doc.end();
  });
}

module.exports = { generateResumePdf, TEMPLATE_LIST };
