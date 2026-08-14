# neovand.github.io

Personal homepage — a gallery of interactive demos, simulations, and tools.

**Live site:** https://neovand.github.io

![The homepage: an animated grove of L-system trees beside a short bio, above the demo gallery](media/screenshot.png)

## Structure

```
/               ← gallery homepage
/media/         ← thumbnails, and the moon behind the grove
/media/fonts/   ← Inter, self-hosted (SIL Open Font License, see OFL.txt)
/media/legacy/  ← figures for the older projects, shown in their modals
/media/mit/     ← Media Lab project thumbnails, local copies
/media/papers/  ← first five pages of each paper, rendered for the deck fans
/papers/        ← the PDFs themselves
/archive/       ← original Three.js network visualization (preserved)
```

Every image the page loads is served from this repo. Nothing hotlinks, and
nothing on the critical path comes from a third-party origin.

## The grove

The header is a canvas of five L-system trees over a thicket of smaller ones,
each grammar giving a different silhouette. They bend under a shared wind field
built from layered value noise, sampled a little later at each branching level
so a gust travels up the plant instead of swinging every part at once. Moving
the pointer pushes them aside; pressing a tree makes it withdraw into itself,
twigs first, and releasing grows it back. Fireflies perch on one tree's twig
ends and cross to another when their tree is disturbed.

The moon is the CC0 "full moon" drawing by gnokii (Open Clipart, via Wikimedia
Commons), which requires no attribution.

## The section flourishes

The dividers between sections are one calligraphic ornament, split into its
seventeen component strokes. Each is pivoted on the end that joins the middle
and delayed by how far out it sits, so when the divider scrolls into view the
flourish unrolls from the centre and the terminal spirals arrive last.

The ornament is from a text-divider set by Vecteezy. **Free Vecteezy downloads
require attribution** — check the licence on the original download and add the
credit it asks for, or swap in an asset that does not need one.
