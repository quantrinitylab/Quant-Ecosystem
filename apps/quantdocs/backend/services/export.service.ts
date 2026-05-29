export interface DocContent {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class ExportService {
  exportToMarkdown(doc: DocContent): string {
    const lines: string[] = [];
    lines.push(`# ${doc.title}`);
    lines.push('');

    // Convert basic HTML content to markdown
    let content = doc.content;
    content = content.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    content = content.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    content = content.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    content = content.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    content = content.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    content = content.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    content = content.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    content = content.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    content = content.replace(/<[^>]+>/g, '');
    content = content.replace(/&amp;/g, '&');
    content = content.replace(/&lt;/g, '<');
    content = content.replace(/&gt;/g, '>');
    content = content.replace(/&quot;/g, '"');

    lines.push(content.trim());
    return lines.join('\n');
  }

  exportToHtml(doc: DocContent): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'">
  <title>${this.escapeHtml(doc.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(doc.title)}</h1>
  ${doc.content}
</body>
</html>`;
    return html;
  }

  exportToPdf(doc: DocContent): Buffer {
    // Generate a minimal PDF representation
    const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${50 + doc.title.length} >>
stream
BT
/F1 18 Tf
72 720 Td
(${this.escapePdfText(doc.title)}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
%%EOF`;
    return Buffer.from(content, 'utf-8');
  }

  exportToDocx(doc: DocContent): Buffer {
    // Generate a minimal DOCX-like XML representation
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>${this.escapeXml(doc.title)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>${this.escapeXml(this.stripHtml(doc.content))}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
    return Buffer.from(xml, 'utf-8');
  }

  exportToLatex(doc: DocContent): string {
    const plainContent = this.stripHtml(doc.content);
    const latex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\title{${this.escapeLatex(doc.title)}}
\\date{}

\\begin{document}
\\maketitle

${this.escapeLatex(plainContent)}

\\end{document}`;
    return latex;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapePdfText(text: string): string {
    return text.replace(/[()\\]/g, '\\$&');
  }

  private escapeLatex(text: string): string {
    return text.replace(/\\/g, '\\textbackslash{}').replace(/[&%$#_{}~^]/g, '\\$&');
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .trim();
  }
}
