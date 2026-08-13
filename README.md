# neovand.github.io

Personal homepage — a gallery of interactive demos, simulations, and tools.

**Live site:** https://neovand.github.io

![The homepage: an animated grove of L-system trees beside a short bio, above the demo gallery](media/screenshot.png)

## Structure

```
/             ← gallery homepage
/media/       ← thumbnails, and the moon behind the grove
/archive/     ← original Three.js network visualization (preserved)
```

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
