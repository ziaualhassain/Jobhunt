const PDFDocument = require('pdfkit');

// Strip control characters that would corrupt the PDF
function clean(text) {
  return (text || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

/**
 * Generates an ATS-friendly, text-based PDF resume using pdfkit.
 * Jake's Resume layout: single column, standard fonts, no images/colors.
 * The resulting PDF is fully text-selectable so ATS scanners can parse it.
 */
function generateResumePdf(resume) {
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

    const PW = doc.page.width;   // 612 (LETTER)
    const ML = 54;               // left margin
    const MR = 54;               // right margin
    const CW = PW - ML - MR;     // content width = 504

    // ── Helpers ──────────────────────────────────────────────────────────────

    function sectionHeader(title) {
      doc.moveDown(0.65);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
         .text(title, ML, doc.y);
      doc.moveDown(0.1);
      doc.moveTo(ML, doc.y)
         .lineTo(PW - MR, doc.y)
         .lineWidth(0.6)
         .stroke('#000000');
      doc.moveDown(0.3);
    }

    // Two-column line: bold title left, lighter text right (e.g. date)
    function twoColBold(left, right) {
      const startY = doc.y;
      doc.font('Helvetica').fontSize(9.5);
      const rw = right ? Math.ceil(doc.widthOfString(right)) + 6 : 0;

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
         .text(left || '', ML, startY, { width: CW - rw - 4 });
      const afterLeft = doc.y;

      if (right) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#555555')
           .text(right, PW - MR - rw, startY, { width: rw, align: 'right' });
      }

      doc.y = Math.max(afterLeft, doc.y);
    }

    // Italic subtitle line (company, institution, etc.)
    function subline(text) {
      if (!text) return;
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#333333')
         .text(text, ML, doc.y, { width: CW });
    }

    function bullet(text) {
      doc.font('Helvetica').fontSize(10).fillColor('#111111')
         .text('•  ' + clean(text), ML + 12, doc.y, { width: CW - 12 });
    }

    // ── Name ─────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000')
       .text(clean(resume.name || 'Your Name'), { align: 'center' });

    // ── Contact line ──────────────────────────────────────────────────────────
    const c = resume.contact || {};
    const contactParts = [
      c.phone, c.email, c.location, c.linkedin, c.github, c.website,
    ].filter(Boolean).map(clean);

    if (contactParts.length) {
      doc.moveDown(0.2)
         .font('Helvetica').fontSize(9.5).fillColor('#222222')
         .text(contactParts.join('  |  '), { align: 'center' });
    }

    // ── Professional Summary ──────────────────────────────────────────────────
    if (resume.summary) {
      sectionHeader('PROFESSIONAL SUMMARY');
      doc.font('Helvetica').fontSize(10).fillColor('#111111')
         .text(clean(resume.summary), ML, doc.y, { width: CW });
    }

    // ── Experience ────────────────────────────────────────────────────────────
    if (resume.experience?.length) {
      sectionHeader('EXPERIENCE');
      for (const exp of resume.experience) {
        twoColBold(clean(exp.title), clean(exp.period));
        const sub = [exp.company, exp.location].filter(Boolean).map(clean).join(', ');
        subline(sub);
        doc.moveDown(0.15);
        for (const b of (exp.bullets || [])) {
          bullet(b);
        }
        doc.moveDown(0.4);
      }
    }

    // ── Technical Skills ──────────────────────────────────────────────────────
    if (resume.skills?.length) {
      sectionHeader('TECHNICAL SKILLS');
      const skills = resume.skills.map(clean);
      // Rows of 8 skills separated by bullets
      for (let i = 0; i < skills.length; i += 8) {
        doc.font('Helvetica').fontSize(10).fillColor('#111111')
           .text(skills.slice(i, i + 8).join('  •  '), ML, doc.y, { width: CW });
      }
    }

    // ── Projects ──────────────────────────────────────────────────────────────
    if (resume.projects?.length) {
      sectionHeader('PROJECTS');
      for (const proj of resume.projects) {
        const label = proj.tech
          ? clean(proj.name) + '  |  ' + clean(proj.tech)
          : clean(proj.name);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
           .text(label, ML, doc.y, { width: CW });
        if (proj.description) bullet(proj.description);
        doc.moveDown(0.35);
      }
    }

    // ── Education ─────────────────────────────────────────────────────────────
    if (resume.education?.length) {
      sectionHeader('EDUCATION');
      for (const ed of resume.education) {
        twoColBold(clean(ed.degree), clean(ed.year));
        subline(clean(ed.institution));
        doc.moveDown(0.35);
      }
    }

    // ── Certifications ────────────────────────────────────────────────────────
    if (resume.certifications?.length) {
      sectionHeader('CERTIFICATIONS');
      for (const cert of resume.certifications) {
        bullet(cert);
      }
    }

    doc.end();
  });
}

module.exports = { generateResumePdf };
