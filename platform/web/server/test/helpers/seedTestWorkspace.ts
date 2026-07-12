import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// A minimal git-backed workspace for route-level tests: two approved stages with
// output, a shared/ file, and no lock. Not the real seedRealWorkspace (Task 5) —
// route tests shouldn't depend on this repo's actual stages/examples content.
export function seedTestWorkspace(workspaceRoot: string): void {
  mkdirSync(join(workspaceRoot, 'shared'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '02_analysis', 'output'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '03_report', 'output'), { recursive: true });
  writeFileSync(join(workspaceRoot, 'shared', 'client-brief.md'), '# Client Brief\n\nMeridian.\n');
  writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n');
  writeFileSync(join(workspaceRoot, 'stages', '02_analysis', 'output', 'insights.md'), '# Insights\n');

  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, '.runner', 'state.json'),
    JSON.stringify(
      {
        stages: {
          '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
          '02_analysis': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        },
      },
      null,
      2
    )
  );

  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: workspaceRoot });
}
