import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export interface AdrFile {
  filename: string;   // e.g. "001-use-nextjs.md"
  title: string;      // first H1 from file
  status: string;     // from frontmatter Status field
  date: string;       // from frontmatter Date field
  content: string;    // full markdown
}

export interface BugEntry {
  status: string;     // OPEN | FIXED | WORKAROUND | WONT-FIX
  title: string;
  date: string;
  severity: string;
  content: string;    // full block
}

export interface ProjectDocsResponse {
  progress: string | null;          // raw markdown of docs/progress.md
  adrs: AdrFile[];                  // parsed docs/adr/*.md
  bugs: BugEntry[];                 // parsed docs/buglist.md
  hasProgress: boolean;
  hasAdrs: boolean;
  hasBugs: boolean;
  adrCount: number;
}

function parseAdrFile(filepath: string): AdrFile {
  const content = fs.readFileSync(filepath, 'utf-8');
  const filename = path.basename(filepath);

  // Extract title from first H1
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : filename;

  // Extract frontmatter-style fields (** Date:** or **Date:**)
  const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/i);

  return {
    filename,
    title,
    status: statusMatch ? statusMatch[1].trim() : 'accepted',
    date: dateMatch ? dateMatch[1].trim() : '',
    content,
  };
}

function parseBugList(content: string): BugEntry[] {
  // Split by H2 sections
  const sections = content.split(/^## /m).filter(Boolean);
  const entries: BugEntry[] = [];

  for (const section of sections) {
    // Skip the header "Bug Tracker" section
    if (section.trim().startsWith('Bug Tracker')) continue;

    // Match [STATUS] Title pattern
    const headerMatch = section.match(/^\[([^\]]+)\]\s*(.+)/);
    if (!headerMatch) continue;

    const status = headerMatch[1].trim();
    const title = headerMatch[2].split('\n')[0].trim();

    const dateMatch = section.match(/\*\*Date:\*\*\s*(.+)/i);
    const severityMatch = section.match(/\*\*Severity:\*\*\s*(.+)/i);

    entries.push({
      status,
      title,
      date: dateMatch ? dateMatch[1].trim() : '',
      severity: severityMatch ? severityMatch[1].trim() : 'medium',
      content: '## ' + section,
    });
  }

  return entries;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const docsDir = path.join(project.path, 'docs');
  const adrDir = path.join(docsDir, 'adr');

  // Read progress.md
  const progressPath = path.join(docsDir, 'progress.md');
  let progress: string | null = null;
  if (fs.existsSync(progressPath)) {
    progress = fs.readFileSync(progressPath, 'utf-8');
  }

  // Read ADR files
  let adrs: AdrFile[] = [];
  if (fs.existsSync(adrDir)) {
    const adrFiles = fs
      .readdirSync(adrDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    adrs = adrFiles.map((f) => parseAdrFile(path.join(adrDir, f)));
  }

  // Read buglist.md
  const buglistPath = path.join(docsDir, 'buglist.md');
  let bugs: BugEntry[] = [];
  if (fs.existsSync(buglistPath)) {
    const bugContent = fs.readFileSync(buglistPath, 'utf-8');
    bugs = parseBugList(bugContent);
  }

  const response: ProjectDocsResponse = {
    progress,
    adrs,
    bugs,
    hasProgress: progress !== null,
    hasAdrs: adrs.length > 0,
    hasBugs: bugs.length > 0,
    adrCount: adrs.length,
  };

  return NextResponse.json(response);
}
