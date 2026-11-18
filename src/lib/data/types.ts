export interface ProfileLink {
	label: string;
	href: string;
	icon: string;
}

export type ProjectSectionId =
	| 'ai-ml-research'
	| 'physics-research'
	| 'artificial-life-research'
	| 'ai-engineering'
	| 'ai-ml-education'
	| 'math-and-physics'
	| 'software-development'
	| 'music-and-art';

export interface ProjectSection {
	id: ProjectSectionId;
	title: string;
	description: string;
}

export interface Project {
	title: string;
	section: ProjectSectionId;
	href: string;
	repo: string | null;
	/** Plain-text description, rendered without HTML. */
	desc: string;
	/** Exact phrases in the description to emphasize. */
	highlights?: string[];
	/** Search keywords; not displayed as tags. */
	tags: string[];
	status?: 'In progress';
	accent: string | null;
	/** a CSS gradient that stands in while the thumbnail loads */
	ground: string | null;
	img: string | null;
	video: string | null;
	/** Additional resources alongside the project's main destination. */
	links?: { label: string; href: string }[];
}

export interface Paper {
	slug: string;
	title: string;
	venue: string;
	pdf: string;
	arxiv?: string;
	pages: number;
	authors: string;
	abstract: string;
}

export interface MediaItem {
	href: string;
	title: string;
	short: string;
	source: string;
	img: string;
	video: boolean;
}

export interface EarlierDetail {
	title: string;
	year: string;
	/** paragraphs, each may carry inline markup */
	body: string[];
	link: { label: string; href: string } | null;
	images: string[];
}

export interface Earlier {
	title: string;
	desc: string;
	img: string;
	grey: boolean;
	href?: string;
	key?: string;
	detail?: EarlierDetail;
}

export interface ResumeEntry {
	id: string | null;
	org: string;
	when: string;
	roles: string[];
	/** markup: positions, notes */
	body: string | null;
}

export interface Resume {
	pdf: string;
	experience: ResumeEntry[];
	education: ResumeEntry[];
	honours: { year: string; html: string }[];
	skills: { label: string; icon: string; text: string }[];
}
