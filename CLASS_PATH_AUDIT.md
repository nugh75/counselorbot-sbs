# Class Path Teacher UI Audit

## Issue: Teacher class page shows only a list, no builder interface

### What the current `ClassPathsTab` renders on `/docente/classi/{id}`:
- A section titled "Class Paths"
- A list of paths with `status`, `title`, `mode`, `publishedAt`, `archivedAt`
- Each item shows: `id`, `title`, mode indicator, path status, and publish/archive date
- No "add new path" + button (the ASCII art shows one: [`+ New path`])
- No click-to-open/edit UI
- No editor for drafting a path (the `ClassPathsBuilder` component exists but is only used in the student-facing page, not here)
- No progress preview or student completion data in the list
- No publish/archive toggle visible to teachers beyond the date info

### What's missing vs. the plan (section 8.2):
1. **`+ New path` button** to create a new draft path  
2. **Path editor** (title, description, mode `recommended/strict`, ordered steps)  
3. **Add/remove/reorder steps** (drag or arrow buttons)  
4. **Publish/Archive toggle** with confirmation  
5. **Progress preview** showing how many students completed each step  
6. **`/profili/percorso` link** in the teacher area

### What exists:
- `ClassPathsTab.tsx` — renders the list only (no builder)  
- `ClassPathHeroCard.tsx` — student-side hero card, uses the active class's paths  
- `StudentClassPathsPage.tsx` — student browse page, not teacher  
- `ClassPathProgress.tsx` — teacher progress table (shows completion grid)  

### Next steps:
The teacher needs a builder interface. This should be a dedicated `ClassPathsBuilder` page (or modal) that the teacher opens from the list. The current state is: list + read-only view; no creation, edit, or publish actions.

```typescript
// Current ClassPathsTab only renders:
// <div>Class Paths</div>
// <div className="flex flex-wrap gap-3">  // status pill
//   <span>status</span> <span>{path.status}</span>
// </div>
```
